import fs from "fs";
import path from "path";
import type { MemoryNode, StoredMemory } from "./types";

// A tiny disk-backed store. In mock mode this IS the memory layer, so the
// restart-persistence demo works with zero external services: kill the dev
// server, restart it, and the memory-backed agents reload their graphs from
// here. In live mode it mirrors Cognee (the real cloud DB) so the UI can draw
// the constellations without round-tripping Cognee on every render.

const DATA_DIR = path.join(process.cwd(), ".data");
const FILE = path.join(DATA_DIR, "memory.json");

type Store = Record<string, StoredMemory>;

function read(): Store {
  try {
    const raw = fs.readFileSync(FILE, "utf8");
    return JSON.parse(raw) as Store;
  } catch {
    return {};
  }
}

function write(store: Store): void {
  try {
    fs.mkdirSync(DATA_DIR, { recursive: true });
    fs.writeFileSync(FILE, JSON.stringify(store, null, 2), "utf8");
  } catch (err) {
    // Read-only filesystem (e.g. some serverless hosts). Memory just won't
    // persist across restarts there — surfaced in the UI's live/mock badge.
    console.warn("[store] could not persist memory:", (err as Error).message);
  }
}

export function getMemory(dataset: string): StoredMemory {
  const store = read();
  return store[dataset] ?? { dataset, nodes: [], entries: [] };
}

export function appendMemory(
  dataset: string,
  entry: { text: string; topic: string; ts: number },
  nodes: MemoryNode[]
): void {
  const store = read();
  const mem = store[dataset] ?? { dataset, nodes: [], entries: [] };
  mem.entries.push(entry);
  // De-dupe nodes by label so the graph stays legible.
  const seen = new Set(mem.nodes.map((n) => n.label.toLowerCase()));
  for (const n of nodes) {
    if (!seen.has(n.label.toLowerCase())) {
      mem.nodes.push(n);
      seen.add(n.label.toLowerCase());
    }
  }
  store[dataset] = mem;
  write(store);
}

export function meetingsRetained(dataset: string): number {
  const topics = new Set(getMemory(dataset).entries.map((e) => e.topic));
  return topics.size;
}

/** Wipe everything — the "fresh install" button for a clean demo run. */
export function wipeAll(): void {
  write({});
}

// ── admin CRUD (memory manager) ──────────────────────────────────────────────

/** Manually add a memory line to a dataset (also seeds a graph node for it). */
export function addMemory(dataset: string, text: string): void {
  const clean = text.trim();
  if (!clean) return;
  const rand = Math.random().toString(36).slice(2, 6);
  appendMemory(dataset, { text: clean, topic: "note", ts: Date.now() }, [
    { id: `n-${Date.now()}-${rand}`, label: clean.slice(0, 24), kind: "fact" },
  ]);
}

/** Edit the text of the Nth memory entry in a dataset. */
export function updateEntry(dataset: string, index: number, text: string): boolean {
  const store = read();
  const mem = store[dataset];
  if (!mem || !mem.entries[index]) return false;
  mem.entries[index].text = text.trim();
  write(store);
  return true;
}

/** Delete the Nth memory entry in a dataset. */
export function removeEntry(dataset: string, index: number): boolean {
  const store = read();
  const mem = store[dataset];
  if (!mem || !mem.entries[index]) return false;
  mem.entries.splice(index, 1);
  write(store);
  return true;
}

/** Wipe one character's whole memory (entries + graph nodes). */
export function clearDataset(dataset: string): void {
  const store = read();
  delete store[dataset];
  write(store);
}
