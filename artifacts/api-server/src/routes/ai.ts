import { Router, type IRouter } from "express";

const router: IRouter = Router();
const OPENROUTER_URL = "https://openrouter.ai/api/v1";
const OPENROUTER_DEFAULT_MODEL = "openai/gpt-4o-mini";
const OR_MODEL_CACHE_TTL = 60_000;
let orModelCache: string[] | null = null;
let orModelCacheTs = 0;

/* ---- Which providers are configured ---- */
function getAvailableProviders(): string[] {
  const hasOR = !!process.env.OPENROUTER_API_KEY;
  const out: string[] = [];
  if (hasOR) {
    out.push("anthropic", "openai", "gemini", "groq", "openrouter");
  }
  return out;
}

router.get("/providers", (_req, res) => {
  res.json({ available: getAvailableProviders() });
});

/* ---- Helpers ---- */

// Prepend a provider prefix for OpenRouter if the model id has no slash.
function orModel(provider: string, model: string): string {
  return model.includes("/") ? model : `${provider}/${model}`;
}

function normalizeOpenRouterModel(provider: string, model?: string): string {
  const requested = model && model.trim() ? model.trim() : undefined;
  switch (provider) {
    case "anthropic": return orModel("anthropic", requested || "claude-opus-4-5");
    case "openai": return orModel("openai", requested || "gpt-4o");
    case "gemini": return orModel("google", requested || "gemini-1.5-flash");
    case "groq": return orModel("xai", requested || "grok-3");
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
      list.push("xai/grok-3", "openai/gpt-4o-mini", "openai/gpt-4o");
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
  if (!res.ok) {
    throw new Error(`OpenRouter models ${res.status}: ${res.statusText}`);
  }
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

function isRecoverableOpenRouterError(err: any): boolean {
  const msg = err?.message || "";
  return /429|500|502|503|504|rate limit|unavailable|timed out|model not found|invalid model/i.test(msg);
}

function isToolUnsupportedOpenRouterError(err: any): boolean {
  const msg = err?.message || "";
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
    const err = data.error as Record<string, string> | undefined;
    throw new Error(`${res.status}: ${err?.message || err?.type || res.statusText}`);
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

/* ---- AI proxy ---- */
router.post("/chat", async (req, res) => {
  const { provider, model, system, user, tools } = req.body as {
    provider: string;
    model?: string;
    system: string;
    user: string;
    tools?: unknown[];
  };

  if (!provider || !system || !user) {
    res.status(400).json({ error: "provider, system, and user are required" });
    return;
  }

  try {
    const key = process.env.OPENROUTER_API_KEY;
    if (!key) {
      res.status(503).json({ error: "OpenRouter not configured", provider });
      return;
    }

    const supportedProviders = ["anthropic", "openai", "gemini", "groq", "openrouter"];
    if (!supportedProviders.includes(provider)) {
      res.status(400).json({ error: `Unknown provider: ${provider}`, provider });
      return;
    }

    const normalizedModel = await chooseOpenRouterModel(provider, model, key);
    const text = await tryOpenRouterChatWithFallback(key, provider, normalizedModel, system, user, tools);

    res.json({ text });
  } catch (err: unknown) {
    const msg = err instanceof Error ? err.message : String(err);
    req.log.error({ err, provider, model }, "AI proxy error");
    const status = msg.includes("401") || msg.includes("403") ? 401
      : msg.includes("429") ? 429
      : 502;
    res.status(status).json({ error: msg, provider });
  }
});

/* ---- Provider implementations ---- */

async function sendAnthropic(
  key: string,
  model: string,
  system: string,
  user: string,
  tools?: unknown[],
): Promise<string> {
  const hasWebSearch = Array.isArray(tools) && tools.some(
    (t: unknown) => typeof t === "object" && t !== null &&
      (t as Record<string, unknown>).type === "web_search_20250305",
  );

  const headers: Record<string, string> = {
    "Content-Type": "application/json",
    "x-api-key": key,
    "anthropic-version": "2023-06-01",
  };
  if (hasWebSearch) headers["anthropic-beta"] = "web-search-2025-03-05";

  const body: Record<string, unknown> = {
    model,
    max_tokens: 1000,
    system,
    messages: [{ role: "user", content: user }],
  };
  if (tools && tools.length > 0) body.tools = tools;

  const res = await fetch("https://api.anthropic.com/v1/messages", {
    method: "POST",
    headers,
    body: JSON.stringify(body),
  });

  const data = await res.json() as Record<string, unknown>;
  if (!res.ok || data.error) {
    const errObj = data.error as Record<string, string> | undefined;
    throw new Error(`Anthropic ${res.status}: ${errObj?.message || errObj?.type || res.statusText}`);
  }

  const content = data.content as Array<Record<string, unknown>> | undefined;
  const text = (content || [])
    .filter((x) => x.type === "text")
    .map((x) => x.text as string)
    .join("\n");
  if (!text) throw new Error("Empty response from Anthropic");
  return text;
}

async function sendOpenAICompat(
  url: string,
  key: string,
  model: string,
  system: string,
  user: string,
): Promise<string> {
  const res = await fetch(url, {
    method: "POST",
    headers: {
      "Content-Type": "application/json",
      "Authorization": `Bearer ${key}`,
    },
    body: JSON.stringify({
      model,
      messages: [
        { role: "system", content: system },
        { role: "user", content: user },
      ],
      max_tokens: 1000,
    }),
  });

  const data = await res.json() as Record<string, unknown>;
  if (!res.ok) {
    const err = data.error as Record<string, string> | undefined;
    throw new Error(`${res.status}: ${err?.message || res.statusText}`);
  }

  const choices = data.choices as Array<Record<string, unknown>> | undefined;
  const msg = choices?.[0]?.message as Record<string, string> | undefined;
  const text = msg?.content;
  if (!text) throw new Error("Empty response from provider");
  return text;
}

async function sendGemini(
  key: string,
  model: string,
  system: string,
  user: string,
): Promise<string> {
  const url = `https://generativelanguage.googleapis.com/v1beta/models/${model}:generateContent?key=${encodeURIComponent(key)}`;

  const res = await fetch(url, {
    method: "POST",
    headers: { "Content-Type": "application/json" },
    body: JSON.stringify({
      systemInstruction: { parts: [{ text: system }] },
      contents: [{ role: "user", parts: [{ text: user }] }],
    }),
  });

  const data = await res.json() as Record<string, unknown>;
  if (!res.ok) {
    const err = data.error as Record<string, string> | undefined;
    throw new Error(`Gemini ${res.status}: ${err?.message || res.statusText}`);
  }

  const candidates = data.candidates as Array<Record<string, unknown>> | undefined;
  const parts = (candidates?.[0]?.content as Record<string, unknown> | undefined)
    ?.parts as Array<Record<string, string>> | undefined;
  const text = (parts || []).map((p) => p.text || "").join("");
  if (!text) throw new Error("Empty response from Gemini");
  return text;
}

export default router;
