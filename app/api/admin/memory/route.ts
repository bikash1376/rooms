import { NextResponse } from "next/server";
import { getAgents } from "@/lib/agentConfig";
import { SHARED_DATASET } from "@/lib/agents";
import {
  getMemory,
  addMemory,
  updateEntry,
  removeEntry,
  clearDataset,
  wipeAll,
} from "@/lib/store";
import * as cognee from "@/lib/cognee";

export const runtime = "nodejs";
export const dynamic = "force-dynamic";

// Admin memory manager. Reads/writes the local memory mirror (what the knowledge
// graph is drawn from) and, for adds, best-effort pushes into Cognee too. Note:
// deletes affect the local mirror; purging a live Cognee dataset must be done in
// the Cognee Cloud dashboard.
export async function GET() {
  const agents = getAgents().map((a) => {
    const mem = getMemory(a.dataset);
    return {
      id: a.id,
      name: a.name,
      accent: a.accent,
      remembers: a.remembers,
      dataset: a.dataset,
      entries: mem.entries.map((e, i) => ({ index: i, text: e.text, topic: e.topic, ts: e.ts })),
      nodeCount: mem.nodes.length,
    };
  });
  const shared = getMemory(SHARED_DATASET);
  return NextResponse.json({
    live: cognee.isCogneeLive(),
    agents,
    shared: {
      dataset: SHARED_DATASET,
      entries: shared.entries.map((e, i) => ({ index: i, text: e.text, topic: e.topic, ts: e.ts })),
      nodeCount: shared.nodes.length,
    },
  });
}

export async function POST(req: Request) {
  let body: { action?: string; dataset?: string; index?: number; text?: string };
  try {
    body = await req.json();
  } catch {
    return NextResponse.json({ error: "Invalid body" }, { status: 400 });
  }
  const { action, dataset, index, text } = body;

  // Only allow known datasets (agent_* or the shared brain).
  const known = new Set([SHARED_DATASET, ...getAgents().map((a) => a.dataset)]);

  switch (action) {
    case "add": {
      if (!dataset || !known.has(dataset) || !text?.trim()) {
        return NextResponse.json({ error: "Bad add" }, { status: 400 });
      }
      addMemory(dataset, text);
      if (cognee.isCogneeLive()) {
        // add → cognify so the memory is searchable; runs in the background.
        cognee
          .remember(dataset, text)
          .then(() => cognee.cognify(dataset))
          .catch((e) => console.warn(`[admin/memory] Cognee ingest failed: ${(e as Error).message}`));
      }
      break;
    }
    case "edit": {
      if (!dataset || typeof index !== "number" || text == null) {
        return NextResponse.json({ error: "Bad edit" }, { status: 400 });
      }
      updateEntry(dataset, index, text);
      break;
    }
    case "delete": {
      if (!dataset || typeof index !== "number") {
        return NextResponse.json({ error: "Bad delete" }, { status: 400 });
      }
      removeEntry(dataset, index);
      break;
    }
    case "clearAgent": {
      if (!dataset || !known.has(dataset)) {
        return NextResponse.json({ error: "Bad clear" }, { status: 400 });
      }
      clearDataset(dataset);
      break;
    }
    case "clearAll": {
      wipeAll();
      break;
    }
    default:
      return NextResponse.json({ error: "Unknown action" }, { status: 400 });
  }

  return NextResponse.json({ ok: true });
}
