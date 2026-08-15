// Convex server-side action: replaces the Express /api/ai/chat proxy.
// OPENROUTER_API_KEY is read from process.env — never exposed to the browser.

import { action } from "./_generated/server";
import { v } from "convex/values";

const OPENROUTER_URL = "https://openrouter.ai/api/v1";
const OPENROUTER_DEFAULT_MODEL = "openai/gpt-4o-mini";
const OR_MODEL_CACHE_TTL = 60_000;
let orModelCache: string[] | null = null;
let orModelCacheTs = 0;

function orModel(provider: string, model: string): string {
  return model.includes("/") ? model : `${provider}/${model}`;
}

function normalizeOpenRouterModel(provider: string, model?: string): string {
  const requested = model && model.trim() ? model.trim() : undefined;
  switch (provider) {
    case "anthropic": return orModel("anthropic", requested || "claude-opus-4-5");
    case "openai": return orModel("openai", requested || "gpt-4o");
    case "gemini": return orModel("google", requested || "gemini-1.5-flash");
    case "groq": return orModel("x-ai", requested || "grok-4.3");
    case "openrouter": return requested || OPENROUTER_DEFAULT_MODEL;
    default: return requested || OPENROUTER_DEFAULT_MODEL;
  }
}

function fallbackModelCandidates(provider: string, requestedModel: string): string[] {
  const list: string[] = [requestedModel];
  switch (provider) {
    case "anthropic":
      list.push("anthropic/claude-opus-4-5", "anthropic/claude-3.7-sonnet", "openai/gpt-4o-mini", "openai/gpt-4o");
      break;
    case "openai":
      list.push("openai/gpt-4o", "openai/gpt-4o-mini", "anthropic/claude-opus-4-5");
      break;
    case "gemini":
      list.push("google/gemini-1.5-flash", "openai/gpt-4o-mini", "openai/gpt-4o");
      break;
    case "groq":
      list.push("x-ai/grok-4.3", "x-ai/grok-3", "openai/gpt-4o-mini", "openai/gpt-4o");
      break;
    case "openrouter":
      list.push("openai/gpt-4o-mini", "openai/gpt-4o", "anthropic/claude-opus-4-5");
      break;
    default:
      list.push("openai/gpt-4o-mini", "openai/gpt-4o");
  }
  return [...new Set(list.filter(Boolean))];
}

async function fetchOpenRouterModels(key: string): Promise<string[]> {
  if (orModelCache && Date.now() - orModelCacheTs < OR_MODEL_CACHE_TTL) return orModelCache;
  const res = await fetch(`${OPENROUTER_URL}/models`, {
    method: "GET",
    headers: { Authorization: `Bearer ${key}` },
  });
  if (!res.ok) throw new Error(`OpenRouter models ${res.status}: ${res.statusText}`);
  const data = await res.json() as { models?: Array<{ id?: string }> };
  orModelCache = Array.isArray(data.models)
    ? data.models.map((m) => String(m.id || "").trim()).filter(Boolean)
    : [];
  orModelCacheTs = Date.now();
  return orModelCache;
}

async function chooseOpenRouterModel(provider: string, model?: string, key?: string): Promise<string> {
  const requested = normalizeOpenRouterModel(provider, model);
  if (!key) return requested;
  try {
    const available = await fetchOpenRouterModels(key);
    if (available.includes(requested)) return requested;
    const candidates = fallbackModelCandidates(provider, requested);
    const match = candidates.find((m) => available.includes(m));
    return match || requested;
  } catch {
    return requested;
  }
}

function isRecoverableOpenRouterError(err: unknown): boolean {
  const msg = (err as Error)?.message || "";
  return /404|429|500|502|503|504|rate limit|unavailable|timed out|model not found|invalid model|deprecated/i.test(msg);
}

function isToolUnsupportedOpenRouterError(err: unknown): boolean {
  const msg = (err as Error)?.message || "";
  return /tool|tools|unsupported|not supported|unknown tool|unrecognized tool/i.test(msg);
}

async function sendOpenRouterChat(
  key: string,
  model: string,
  system: string,
  user: string,
  tools?: unknown[],
): Promise<string> {
  const body: Record<string, unknown> = {
    model,
    messages: [
      { role: "system", content: system },
      { role: "user", content: user },
    ],
    max_tokens: 1000,
  };
  if (tools && tools.length > 0) body.tools = tools;

  const res = await fetch(`${OPENROUTER_URL}/chat/completions`, {
    method: "POST",
    headers: {
      "Content-Type": "application/json",
      Authorization: `Bearer ${key}`,
    },
    body: JSON.stringify(body),
  });

  const data = await res.json() as Record<string, unknown>;
  if (!res.ok) {
    const errObj = data.error as Record<string, string> | undefined;
    throw new Error(`${res.status}: ${errObj?.message || errObj?.type || res.statusText}`);
  }

  const choices = data.choices as Array<Record<string, unknown>> | undefined;
  const msg = choices?.[0]?.message as Record<string, string> | undefined;
  const text = msg?.content;
  if (!text) throw new Error("Empty response from OpenRouter");
  return text;
}

async function tryOpenRouterChatWithFallback(
  key: string,
  provider: string,
  model: string,
  system: string,
  user: string,
  tools?: unknown[],
): Promise<string> {
  const candidateModels = fallbackModelCandidates(provider, model);
  let lastError: unknown;

  for (const candidate of candidateModels) {
    try {
      return await sendOpenRouterChat(key, candidate, system, user, tools);
    } catch (err: unknown) {
      lastError = err;
      if (tools && isToolUnsupportedOpenRouterError(err)) {
        try {
          return await sendOpenRouterChat(key, candidate, system, user, undefined);
        } catch (err2: unknown) {
          lastError = err2;
        }
      }
      if (!isRecoverableOpenRouterError(err)) break;
    }
  }

  throw lastError instanceof Error ? lastError : new Error(String(lastError));
}

export const chat = action({
  args: {
    provider: v.string(),
    model: v.optional(v.string()),
    system: v.string(),
    user: v.string(),
  },
  handler: async (_ctx, args): Promise<{ text: string }> => {
    const { provider, model, system, user } = args;

    const supportedProviders = ["anthropic", "openai", "gemini", "groq", "openrouter"];
    if (!supportedProviders.includes(provider)) {
      throw new Error(`Unknown provider: ${provider}`);
    }

    const key = process.env.OPENROUTER_API_KEY;
    if (!key) {
      throw new Error("OpenRouter not configured — add OPENROUTER_API_KEY in Secrets");
    }

    const normalizedModel = await chooseOpenRouterModel(provider, model, key);
    const text = await tryOpenRouterChatWithFallback(key, provider, normalizedModel, system, user);
    return { text };
  },
});

export const getProviders = action({
  args: {},
  handler: async (_ctx, _args): Promise<{ available: string[] }> => {
    const hasOR = !!process.env.OPENROUTER_API_KEY;
    const out: string[] = [];
    if (hasOR) {
      out.push("anthropic", "openai", "gemini", "groq", "openrouter");
    }
    return { available: out };
  },
});
