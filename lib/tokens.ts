import fs from "fs";
import path from "path";
import type { AgentId, TokenState } from "./types";

// Per-character token budget. Each agent gets BUDGET completion tokens to "spend"
// on speaking; usage is tracked from real LLM token counts and persisted. Agents
// are told (indirectly) how little they have left so they self-shorten — but they
// must never mention tokens out loud. When a bucket is empty, we stop calling the
// LLM for that agent and they go quiet, saving API calls too.
export const TOKEN_BUDGET = 1000;

const DATA_DIR = path.join(process.cwd(), ".data");
const FILE = path.join(DATA_DIR, "tokens.json");

type Store = Partial<Record<AgentId, number>>; // agentId -> completion tokens used

function read(): Store {
  try {
    return JSON.parse(fs.readFileSync(FILE, "utf8")) as Store;
  } catch {
    return {};
  }
}

function write(store: Store): void {
  try {
    fs.mkdirSync(DATA_DIR, { recursive: true });
    fs.writeFileSync(FILE, JSON.stringify(store, null, 2), "utf8");
  } catch (err) {
    console.warn("[tokens] could not persist:", (err as Error).message);
  }
}

export function getUsage(id: AgentId): TokenState {
  const used = read()[id] ?? 0;
  return { used, budget: TOKEN_BUDGET, remaining: Math.max(0, TOKEN_BUDGET - used) };
}

export function addUsage(id: AgentId, tokens: number): TokenState {
  const store = read();
  store[id] = (store[id] ?? 0) + Math.max(0, Math.round(tokens || 0));
  write(store);
  return getUsage(id);
}

export function resetTokens(): void {
  write({});
}
