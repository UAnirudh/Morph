import { logError, logEvent } from "@/lib/log";
import { validateMorphResult, type MorphResult } from "./result";
import { PROMPT_VERSION, buildRepairMessage, buildSystemPrompt, buildUserMessage } from "./prompt";
import type { JobRole, MorphConfig } from "./config";

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
  latencyMs: number;
  inputTokens: number;
  outputTokens: number;
  warnings: string[];
}

interface ChatMessage {
  role: "system" | "user" | "assistant";
  content: string;
}

export function isProviderConfigured(): boolean {
  return Boolean(process.env.OPENAI_API_KEY?.trim());
}

export function providerModel(): string {
  return process.env.MORPH_AI_MODEL?.trim() || "gpt-4o-mini";
}

function baseUrl(): string {
  return (process.env.MORPH_AI_BASE_URL?.trim() || "https://api.openai.com/v1").replace(/\/$/, "");
}

async function callModel(
  messages: ChatMessage[],
  timeoutMs: number,
): Promise<{ content: string; inputTokens: number; outputTokens: number }> {
  const controller = new AbortController();
  const timer = setTimeout(() => controller.abort(), timeoutMs);
  try {
    const response = await fetch(`${baseUrl()}/chat/completions`, {
      method: "POST",
      headers: {
        "content-type": "application/json",
        authorization: `Bearer ${process.env.OPENAI_API_KEY}`,
      },
      body: JSON.stringify({
        model: providerModel(),
        messages,
        temperature: 0.2,
        max_tokens: 2000,
        response_format: { type: "json_object" },
      }),
      signal: controller.signal,
    });
    if (!response.ok) {
      const body = await response.text();
      throw new Error(`Provider responded ${response.status}: ${body.slice(0, 300)}`);
    }
    const payload = (await response.json()) as {
      choices?: Array<{ message?: { content?: string } }>;
      usage?: { prompt_tokens?: number; completion_tokens?: number };
    };
    const content = payload.choices?.[0]?.message?.content;
    if (!content) throw new Error("Provider returned an empty completion");
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
  const model = providerModel();
  const started = Date.now();
  const warnings: string[] = [];
  let inputTokens = 0;
  let outputTokens = 0;

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
    const first = await callModel(messages, 25_000);
    inputTokens += first.inputTokens;
    outputTokens += first.outputTokens;

    let validated = validateMorphResult(extractJson(first.content));
    if (!validated.ok) {
      warnings.push("Model output failed validation; one repair attempt was made.");
      messages.push({ role: "assistant", content: first.content.slice(0, 4000) });
      messages.push({ role: "user", content: buildRepairMessage(validated.issues, first.content) });
      const repaired = await callModel(messages, 25_000);
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
        ok: false,
        error: `The model returned an invalid transformation (${validated.issues.slice(0, 3).join("; ")})`,
        model,
        latencyMs: Date.now() - started,
        inputTokens,
        outputTokens,
        warnings,
      };
    }

    return {
      ok: true,
      result: validated.result,
      model,
      latencyMs: Date.now() - started,
      inputTokens,
      outputTokens,
      warnings,
    };
  } catch (error) {
    logError("morph.provider.failed", error, { promptVersion: PROMPT_VERSION });
    return {
      ok: false,
      error: error instanceof Error ? error.message : "Unknown provider error",
      model,
      latencyMs: Date.now() - started,
      inputTokens,
      outputTokens,
      warnings,
    };
  }
}
