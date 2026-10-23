import { afterEach, describe, expect, it } from "vitest";
import { configuredEngineLabel, isProviderConfigured, resolveProvider } from "@/lib/morph/provider";

/**
 * Provider selection without a network call: the point is that the same build
 * runs on a Groq key today and an OpenAI key later, with no code change.
 */
const KEYS = ["GROQ_API_KEY", "OPENAI_API_KEY", "MORPH_AI_PROVIDER", "MORPH_AI_MODEL", "MORPH_AI_BASE_URL"] as const;

function clearEnv() {
  for (const key of KEYS) delete process.env[key];
}

afterEach(clearEnv);

describe("provider selection", () => {
  it("reports no provider without a key", () => {
    expect(resolveProvider()).toBeNull();
    expect(isProviderConfigured()).toBe(false);
  });

  it("uses Groq when only GROQ_API_KEY is set", () => {
    process.env.GROQ_API_KEY = "gsk_test";
    const provider = resolveProvider()!;
    expect(provider.id).toBe("groq");
    expect(provider.baseUrl).toBe("https://api.groq.com/openai/v1");
    expect(provider.model).toBe("openai/gpt-oss-120b");
    // Groq rejects the deprecated max_tokens parameter.
    expect(provider.maxTokensParam).toBe("max_completion_tokens");
  });

  it("prefers OpenAI once a funded key is added", () => {
    process.env.GROQ_API_KEY = "gsk_test";
    process.env.OPENAI_API_KEY = "sk-test";
    const provider = resolveProvider()!;
    expect(provider.id).toBe("openai");
    expect(provider.baseUrl).toBe("https://api.openai.com/v1");
    expect(provider.model).toBe("gpt-4o-mini");
  });

  it("honours an explicit MORPH_AI_PROVIDER override", () => {
    process.env.GROQ_API_KEY = "gsk_test";
    process.env.OPENAI_API_KEY = "sk-test";
    process.env.MORPH_AI_PROVIDER = "groq";
    expect(resolveProvider()!.id).toBe("groq");
  });

  it("labels the UI with the provider that is actually configured", () => {
    expect(configuredEngineLabel()).toBe("Local planner");
    process.env.GROQ_API_KEY = "gsk_test";
    expect(configuredEngineLabel()).toBe("Groq · openai/gpt-oss-120b");
    process.env.OPENAI_API_KEY = "sk-test";
    expect(configuredEngineLabel()).toBe("OpenAI · gpt-4o-mini");
  });

  it("lets MORPH_AI_MODEL and MORPH_AI_BASE_URL override the defaults", () => {
    process.env.GROQ_API_KEY = "gsk_test";
    process.env.MORPH_AI_MODEL = "openai/gpt-oss-20b";
    process.env.MORPH_AI_BASE_URL = "https://api.groq.com/openai/v1/";
    const provider = resolveProvider()!;
    expect(provider.model).toBe("openai/gpt-oss-20b");
    // Trailing slash is trimmed so the request path never double-slashes.
    expect(provider.baseUrl).toBe("https://api.groq.com/openai/v1");
  });
});
