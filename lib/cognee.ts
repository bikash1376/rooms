// Cognee Cloud REST client. Language-agnostic HTTP per the PRD (no Python SDK).
// Verify field names against your live tenant before the demo — the PRD flags
// `dataset_name` vs `dataset` and the search response shape as things to confirm.

const BASE_URL = process.env.COGNEE_BASE_URL?.replace(/\/$/, "");
const API_KEY = process.env.COGNEE_API_KEY;

export function isCogneeLive(): boolean {
  return Boolean(BASE_URL && API_KEY);
}

function headers(): HeadersInit {
  return {
    "Content-Type": "application/json",
    "X-Api-Key": API_KEY as string,
  };
}

async function withTimeout(input: string, init: RequestInit, ms = 20000) {
  const ctrl = new AbortController();
  const t = setTimeout(() => ctrl.abort(), ms);
  try {
    return await fetch(input, { ...init, signal: ctrl.signal });
  } finally {
    clearTimeout(t);
  }
}

/** Ingest text into a dataset. The searchable pipeline is `add → cognify →
 * search`, so this uses **`/api/v1/add`** (multipart: `data` file part +
 * `datasetName`) — NOT `/remember`, which writes to a separate memory store the
 * graph search doesn't read. Call `cognify()` afterwards to build the graph. Do
 * NOT set Content-Type — fetch adds the multipart boundary itself. */
export async function remember(dataset: string, data: string): Promise<void> {
  if (!isCogneeLive()) throw new Error("Cognee not configured");
  const form = new FormData();
  form.append("data", new Blob([data], { type: "text/plain" }), "memory.txt");
  form.append("datasetName", dataset);
  const res = await withTimeout(
    `${BASE_URL}/api/v1/add`,
    {
      method: "POST",
      headers: { "X-Api-Key": API_KEY as string },
      body: form,
    },
    30000
  );
  if (!res.ok) {
    throw new Error(`Cognee add ${res.status}: ${await res.text()}`);
  }
}

/** Build the knowledge graph for a dataset so it becomes searchable. Runs in the
 * background by default (returns fast); pass `wait: true` to block until the
 * pipeline completes (used when we need recall ready immediately, e.g. seeding). */
export async function cognify(dataset: string, wait = false): Promise<void> {
  if (!isCogneeLive()) throw new Error("Cognee not configured");
  const res = await withTimeout(
    `${BASE_URL}/api/v1/cognify`,
    {
      method: "POST",
      headers: headers(),
      body: JSON.stringify({ datasets: [dataset], runInBackground: !wait }),
    },
    wait ? 180000 : 30000
  );
  if (!res.ok) {
    throw new Error(`Cognee cognify ${res.status}: ${await res.text()}`);
  }
}

/** Search a dataset. `GRAPH_COMPLETION` synthesizes an answer via an LLM (rich but
 * slow, ~20s); `CHUNKS` is fast vector retrieval (no LLM). Use CHUNKS in the live
 * meeting loop and reserve GRAPH_COMPLETION for the admin viewer. */
export async function recall(
  dataset: string,
  query: string,
  opts?: { searchType?: string; timeoutMs?: number }
): Promise<string> {
  if (!isCogneeLive()) throw new Error("Cognee not configured");
  const res = await withTimeout(
    `${BASE_URL}/api/v1/search`,
    {
      method: "POST",
      headers: headers(),
      body: JSON.stringify({
        query,
        search_type: opts?.searchType ?? "GRAPH_COMPLETION",
        datasets: [dataset],
      }),
    },
    opts?.timeoutMs ?? 20000
  );
  if (!res.ok) {
    throw new Error(`Cognee search ${res.status}: ${await res.text()}`);
  }
  const json = await res.json();
  // Cloud shape: [{ dataset_name, search_result: [...] }, ...] where each result
  // is either a string (GRAPH_COMPLETION) or a chunk object with a `.text` field
  // (CHUNKS). Normalize both to plain text.
  if (Array.isArray(json)) {
    const parts: string[] = [];
    for (const d of json) {
      const sr = Array.isArray(d?.search_result) ? d.search_result : Array.isArray(d) ? d : [d];
      for (const r of sr) {
        if (typeof r === "string") parts.push(r);
        else if (r && typeof r === "object") parts.push(r.text ?? r.content ?? "");
      }
    }
    return parts.filter(Boolean).join(" ").trim();
  }
  if (typeof json === "string") return json;
  return json.result ?? json.answer ?? json.text ?? "";
}
