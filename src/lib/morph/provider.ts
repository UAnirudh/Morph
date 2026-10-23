import { logError, logEvent } from "@/lib/log";
import { validateMorphResult, type MorphResult } from "./result";
import { PROMPT_VERSION, buildRepairMessage, buildSystemPrompt, buildUserMessage } from "./prompt";
import type { JobRole, MorphConfig } from "./config";

/**
 * One OpenAI-compatible chat-completions client, several providers.
 *
 * Groq and OpenAI speak the same wire format, so switching between them is a
 * matter of key, base URL and model — no second code path. Priority is
 * explicit (`MORPH_AI_PROVIDER`) → OpenAI → Groq, so the same build can run on
 * a free Groq key today and an OpenAI key later without a code change.
 */

export interface ProviderInput {
  prompt: string;
  config: MorphConfig;
  role: JobRole;
  goals: string[];
}

export interface ProviderOutcome {
  ok: boolean;
  result?: MorphResult;
  error?: string;
  model: string;
  provider: ProviderId;
  providerLabel: string;
  latencyMs: number;
  inputTokens: number;
  outputTokens: number;
  warnings: string[];
}

export type ProviderId = "openai" | "groq" | "custom";

interface ChatMessage {
  role: "system" | "user" | "assistant";
  content: string;
}

export interface ProviderSettings {
  id: ProviderId;
  label: string;
  apiKey: string;
  baseUrl: string;
  model: string;
  /** Groq deprecates `max_tokens`; OpenAI still accepts both. */
  maxTokensParam: "max_tokens" | "max_completion_tokens";
}

const DEFAULTS = {
  openai: { label: "OpenAI", baseUrl: "https://api.openai.com/v1", model: "gpt-4o-mini" },
  // Groq's current production text models are the open-weight GPT-OSS pair.
  groq: { label: "Groq", baseUrl: "https://api.groq.com/openai/v1", model: "openai/gpt-oss-120b" },
} as const;

export function resolveProvider(): ProviderSettings | null {
  const forced = process.env.MORPH_AI_PROVIDER?.trim().toLowerCase();
  const openaiKey = process.env.OPENAI_API_KEY?.trim();
  const groqKey = process.env.GROQ_API_KEY?.trim();
  const baseUrlOverride = process.env.MORPH_AI_BASE_URL?.trim().replace(/\/$/, "");
  const modelOverride = process.env.MORPH_AI_MODEL?.trim();

  const pick = (id: ProviderId, apiKey: string): ProviderSettings => {
    const defaults = id === "groq" ? DEFAULTS.groq : DEFAULTS.openai;
    return {
      id,
      label: defaults.label,
      apiKey,
      baseUrl: baseUrlOverride || defaults.baseUrl,
      model: modelOverride || defaults.model,
      maxTokensParam: id === "groq" ? "max_completion_tokens" : "max_tokens",
    };
  };

  if (forced === "groq" && groqKey) return pick("groq", groqKey);
  if (forced === "openai" && openaiKey) return pick("openai", openaiKey);
  if (openaiKey) return pick("openai", openaiKey);
  if (groqKey) return pick("groq", groqKey);
  return null;
}

export function isProviderConfigured(): boolean {
  return resolveProvider() !== null;
}

/** Human label shown in the UI, e.g. "Groq · openai/gpt-oss-120b". */
export function providerLabel(provider: ProviderSettings): string {
  return `${provider.label} · ${provider.model}`;
}

/**
 * What the UI calls the engine currently in use. "Local planner" is the sentinel
 * the panels look for; any provider — Groq today, OpenAI later — gets its own
 * label, so the label never claims a provider that is not configured.
 */
export function configuredEngineLabel(): string {
  const provider = resolveProvider();
  return provider ? providerLabel(provider) : "Local planner";
}

async function callModel(
  provider: ProviderSettings,
  messages: ChatMessage[],
  timeoutMs: number,
  jsonMode: boolean,
): Promise<{ content: string; inputTokens: number; outputTokens: number }> {
  const controller = new AbortController();
  const timer = setTimeout(() => controller.abort(), timeoutMs);
  try {
    const body: Record<string, unknown> = {
      model: provider.model,
      messages,
      temperature: 0.2,
      [provider.maxTokensParam]: 2000,
    };
    // JSON mode keeps the model on the schema contract. If a model rejects it,
    // planWithProvider retries once without it and relies on prompt + repair.
    if (jsonMode) body.response_format = { type: "json_object" };

    const response = await fetch(`${provider.baseUrl}/chat/completions`, {
      method: "POST",
      headers: {
        "content-type": "application/json",
        authorization: `Bearer ${provider.apiKey}`,
      },
      body: JSON.stringify(body),
      signal: controller.signal,
    });
    if (!response.ok) {
      const text = await response.text();
      const error = new Error(`${provider.label} responded ${response.status}: ${text.slice(0, 300)}`);
      (error as Error & { status?: number }).status = response.status;
      throw error;
    }
    const payload = (await response.json()) as {
      choices?: Array<{ message?: { content?: string } }>;
      usage?: { prompt_tokens?: number; completion_tokens?: number };
    };
    const content = payload.choices?.[0]?.message?.content;
    if (!content) throw new Error(`${provider.label} returned an empty completion`);
    return {
      content,
      inputTokens: payload.usage?.prompt_tokens ?? 0,
      outputTokens: payload.usage?.completion_tokens ?? 0,
    };
  } finally {
    clearTimeout(timer);
  }
}

function extractJson(raw: string): unknown {
  const trimmed = raw.trim().replace(/^```(?:json)?/i, "").replace(/```$/, "").trim();
  try {
    return JSON.parse(trimmed);
  } catch {
    const start = trimmed.indexOf("{");
    const end = trimmed.lastIndexOf("}");
    if (start !== -1 && end > start) {
      return JSON.parse(trimmed.slice(start, end + 1));
    }
    throw new Error("Model output was not valid JSON");
  }
}

export async function planWithProvider(input: ProviderInput): Promise<ProviderOutcome> {
  const provider = resolveProvider();
  const started = Date.now();
  const warnings: string[] = [];
  let inputTokens = 0;
  let outputTokens = 0;
  const base = {
    model: provider?.model ?? "",
    provider: (provider?.id ?? "custom") as ProviderId,
    providerLabel: provider ? providerLabel(provider) : "Not configured",
    latencyMs: 0,
    inputTokens: 0,
    outputTokens: 0,
    warnings,
  };

  if (!provider) {
    return { ...base, ok: false, error: "No model provider is configured" };
  }

  const messages: ChatMessage[] = [
    { role: "system", content: buildSystemPrompt() },
    {
      role: "user",
      content: buildUserMessage({
        prompt: input.prompt,
        config: input.config,
        role: input.role,
        goals: input.goals,
      }),
    },
  ];

  try {
    let first: { content: string; inputTokens: number; outputTokens: number };
    try {
      first = await callModel(provider, messages, 25_000, true);
    } catch (error) {
      const status = (error as Error & { status?: number }).status;
      // Some models reject `response_format`; retry once without it rather than
      // failing the request outright.
      if (status !== 400) throw error;
      warnings.push("The model rejected JSON mode; retried without it.");
      first = await callModel(provider, messages, 25_000, false);
    }
    inputTokens += first.inputTokens;
    outputTokens += first.outputTokens;

    let validated = validateMorphResult(extractJson(first.content));
    if (!validated.ok) {
      warnings.push("Model output failed validation; one repair attempt was made.");
      messages.push({ role: "assistant", content: first.content.slice(0, 4000) });
      messages.push({ role: "user", content: buildRepairMessage(validated.issues, first.content) });
      const repaired = await callModel(provider, messages, 25_000, false);
      inputTokens += repaired.inputTokens;
      outputTokens += repaired.outputTokens;
      validated = validateMorphResult(extractJson(repaired.content));
    }

    if (!validated.ok) {
      logEvent("warn", {
        event: "morph.provider.invalid_after_repair",
        promptVersion: PROMPT_VERSION,
        issues: validated.issues.slice(0, 6),
      });
      return {
        ...base,
        ok: false,
        error: `The model returned an invalid transformation (${validated.issues.slice(0, 3).join("; ")})`,
        latencyMs: Date.now() - started,
        inputTokens,
        outputTokens,
      };
    }

    return {
      ...base,
      ok: true,
      result: validated.result,
      latencyMs: Date.now() - started,
      inputTokens,
      outputTokens,
    };
  } catch (error) {
    logError("morph.provider.failed", error, { promptVersion: PROMPT_VERSION, provider: provider.id });
    return {
      ...base,
      ok: false,
      error: error instanceof Error ? error.message : "Unknown provider error",
      latencyMs: Date.now() - started,
      inputTokens,
      outputTokens,
    };
  }
}
