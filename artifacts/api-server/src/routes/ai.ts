import { Router, type IRouter } from "express";

const router: IRouter = Router();

/* ---- Which providers are configured ---- */
function getAvailableProviders(): string[] {
  const out: string[] = [];
  if (process.env.ANTHROPIC_API_KEY) out.push("anthropic");
  if (process.env.OPENAI_API_KEY) out.push("openai");
  if (process.env.GEMINI_API_KEY) out.push("gemini");
  if (process.env.GROK_API_KEY) out.push("groq");   // xAI Grok (OpenAI-compat)
  if (process.env.OPENROUTER_API_KEY) out.push("openrouter");
  return out;
}

router.get("/providers", (_req, res) => {
  res.json({ available: getAvailableProviders() });
});

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
    let text: string;

    switch (provider) {
      case "anthropic": {
        const key = process.env.ANTHROPIC_API_KEY;
        if (!key) { res.status(503).json({ error: "Anthropic not configured", provider }); return; }
        text = await sendAnthropic(key, model || "claude-opus-4-5", system, user, tools);
        break;
      }
      case "openai": {
        const key = process.env.OPENAI_API_KEY;
        if (!key) { res.status(503).json({ error: "OpenAI not configured", provider }); return; }
        text = await sendOpenAICompat("https://api.openai.com/v1/chat/completions", key, model || "gpt-4o", system, user);
        break;
      }
      case "gemini": {
        const key = process.env.GEMINI_API_KEY;
        if (!key) { res.status(503).json({ error: "Gemini not configured", provider }); return; }
        text = await sendGemini(key, model || "gemini-1.5-flash", system, user);
        break;
      }
      case "groq": {
        // xAI Grok — OpenAI-compatible endpoint
        const key = process.env.GROK_API_KEY;
        if (!key) { res.status(503).json({ error: "Grok not configured", provider }); return; }
        text = await sendOpenAICompat("https://api.x.ai/v1/chat/completions", key, model || "grok-3", system, user);
        break;
      }
      case "openrouter": {
        const key = process.env.OPENROUTER_API_KEY;
        if (!key) { res.status(503).json({ error: "OpenRouter not configured", provider }); return; }
        text = await sendOpenAICompat("https://openrouter.ai/api/v1/chat/completions", key, model || "openai/gpt-4o-mini", system, user);
        break;
      }
      default:
        res.status(400).json({ error: `Unknown provider: ${provider}`, provider });
        return;
    }

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
    (t: unknown) => typeof t === "object" && t !== null && (t as Record<string, unknown>).type === "web_search_20250305"
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
