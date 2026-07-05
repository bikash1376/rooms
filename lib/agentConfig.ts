import fs from "fs";
import path from "path";
import { AGENTS } from "./agents";
import type { AgentPersona } from "./types";

// Admin-editable overrides for each agent's display name and persona/prompt.
// Datasets stay keyed by the stable agent id, so renaming never loses memory.

const DATA_DIR = path.join(process.cwd(), ".data");
const FILE = path.join(DATA_DIR, "agents.json");

type Override = { name?: string; persona?: string; role?: string };
type Overrides = Record<string, Override>;

function read(): Overrides {
  try {
    return JSON.parse(fs.readFileSync(FILE, "utf8")) as Overrides;
  } catch {
    return {};
  }
}

function write(o: Overrides): void {
  try {
    fs.mkdirSync(DATA_DIR, { recursive: true });
    fs.writeFileSync(FILE, JSON.stringify(o, null, 2), "utf8");
  } catch (err) {
    console.warn("[agentConfig] could not persist:", (err as Error).message);
  }
}

/** Personas with any admin overrides applied. */
export function getAgents(): AgentPersona[] {
  const o = read();
  return AGENTS.map((a) => ({
    ...a,
    name: o[a.id]?.name?.trim() || a.name,
    persona: o[a.id]?.persona?.trim() || a.persona,
    role: o[a.id]?.role?.trim() || a.role,
  }));
}

export function getMemoryAgents(): AgentPersona[] {
  return getAgents().filter((a) => a.remembers);
}

export function updateAgent(id: string, patch: Override): void {
  if (!AGENTS.some((a) => a.id === id)) return;
  const o = read();
  const next = { ...(o[id] ?? {}) };
  if (typeof patch.name === "string") next.name = patch.name.slice(0, 40);
  if (typeof patch.persona === "string") next.persona = patch.persona.slice(0, 800);
  if (typeof patch.role === "string") next.role = patch.role.slice(0, 40);
  o[id] = next;
  write(o);
}
