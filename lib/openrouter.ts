// LLM dialogue generation via any OpenAI-compatible endpoint (OpenRouter, Groq,
// Gemini's OpenAI layer, Ollama, …). Cognee stores/recalls memory; it does NOT
// generate chat, so we need a separate LLM. Configure with LLM_* env vars
// (falls back to the older OPENROUTER_* vars for compatibility).

const BASE_URL = (process.env.LLM_BASE_URL || "https://openrouter.ai/api/v1").replace(/\/+$/, "");
const ENDPOINT = `${BASE_URL}/chat/completions`;
const isOpenRouter = BASE_URL.includes("openrouter.ai");

const KEYS = (
  process.env.LLM_API_KEYS ||
  process.env.OPENROUTER_API_KEYS ||
  process.env.OPENROUTER_API_KEY ||
  ""
)
  .split(",")
  .map((k) => k.trim())
  .filter(Boolean);

// Extra free models to fall back to — OpenRouter-only slugs, so we only append
// them when actually talking to OpenRouter.
const OPENROUTER_FREE_FALLBACKS = [
  "meta-llama/llama-3.3-70b-instruct:free",
  "qwen/qwen3-next-80b-a3b-instruct:free",
  "qwen/qwen3-coder:free",
];

const configured = (process.env.LLM_MODEL || process.env.OPENROUTER_MODEL || "")
  .split(",")
  .map((m) => m.trim())
  .filter(Boolean);
const defaultModel = isOpenRouter ? "meta-llama/llama-3.3-70b-instruct:free" : "llama-3.1-8b-instant";
let MODELS = configured.length ? configured : [defaultModel];
if (isOpenRouter) MODELS = Array.from(new Set([...MODELS, ...OPENROUTER_FREE_FALLBACKS]));
MODELS = MODELS.slice(0, 3); // OpenRouter caps the model list at 3; keep it small everywhere.

let cursor = 0;
function nextKey(): string {
  const key = KEYS[cursor % KEYS.length];
  cursor += 1;
  return key;
}

export function isOpenRouterLive(): boolean {
  return KEYS.length > 0;
}

export interface ChatMessage {
  role: "system" | "user" | "assistant";
  content: string;
}

export interface Completion {
  text: string;
  /** Completion (output) tokens used — for the per-agent token budget. */
  tokens: number;
}

/** One completion against the configured OpenAI-compatible endpoint. Prefers the
 * per-agent `modelOverride` when given, then falls through the shared MODELS pool
 * — so if an agent's model is down/rate-limited, another still answers. Handles
 * proxies (NewAPI etc.) that return errors inside a 200 body. Falls through to the
 * caller's mock on total failure. */
export async function generate(messages: ChatMessage[], modelOverride?: string): Promise<Completion> {
  if (!isOpenRouterLive()) throw new Error("LLM not configured");

  const tryModels = Array.from(new Set([modelOverride, ...MODELS].filter(Boolean))) as string[];
  let lastErr: unknown;
  for (const model of tryModels) {
    const key = nextKey();
    let res: Response;
    try {
      res = await fetch(ENDPOINT, {
        method: "POST",
        headers: {
          "Content-Type": "application/json",
          Authorization: `Bearer ${key}`,
          "HTTP-Referer": "https://amnesiac-office.local",
          "X-Title": "The Amnesiac Office",
        },
        body: JSON.stringify({ model, messages, max_tokens: 64, temperature: 0.9 }),
      });
    } catch (err) {
      lastErr = err;
      continue; // network — try the next model
    }
    if (!res.ok) {
      lastErr = new Error(`LLM ${res.status} (${model}): ${(await res.text()).slice(0, 120)}`);
      continue; // HTTP error (404/429/5xx) — try the next model
    }
    const json = await res.json();
    // Some aggregator proxies return errors in a 200 body.
    if (json?.error || json?.base_resp?.status_code) {
      lastErr = new Error(`LLM error (${model}): ${JSON.stringify(json.error ?? json.base_resp).slice(0, 120)}`);
      continue;
    }
    const text = json?.choices?.[0]?.message?.content?.trim();
    if (text) return { text, tokens: json?.usage?.completion_tokens ?? 0 };
    lastErr = new Error(`LLM empty (${model})`); // e.g. reasoning models — try next
  }
  throw lastErr ?? new Error("LLM failed");
}
