// Shared domain types for the Amnesiac Office.

export type AgentId = "nova" | "atlas" | "biff";

export interface AgentPersona {
  id: AgentId;
  name: string;
  role: string;
  /** Short personality prompt fed to the dialogue LLM. */
  persona: string;
  /** Does this agent have persistent Cognee memory? The amnesiac agent does not. */
  remembers: boolean;
  /** Cognee dataset that holds this agent's private memory. */
  dataset: string;
  /** Optional per-agent LLM model (overrides the default). Lets each character
   * run on a different model; falls back to the shared pool if it's unavailable. */
  model?: string;
  /** Grid cell the avatar occupies in the meeting room. */
  seat: { col: number; row: number };
  /** Accent for the avatar + memory panel. */
  accent: "cyan" | "magenta" | "gold" | "amnesia";
}

export interface MemoryNode {
  id: string;
  label: string;
  kind: "person" | "project" | "decision" | "fact";
}

/** One line spoken in a meeting, with the memory work that produced it. */
export interface TurnLine {
  id: string;
  agentId: AgentId;
  agentName: string;
  text: string;
  /** Did the agent recall anything from Cognee before speaking? */
  recalled: string[];
  /** Was this line stored back into memory? */
  remembered: boolean;
  ts: number;
}

export interface MeetingResult {
  meetingId: string;
  topic: string;
  transcript: TurnLine[];
  /** True when running against real Cognee/OpenRouter, false in mock mode. */
  live: boolean;
}

/** What we persist per agent so memory survives an app restart. */
export interface StoredMemory {
  dataset: string;
  nodes: MemoryNode[];
  /** Raw remembered lines, newest last. */
  entries: { text: string; topic: string; ts: number }[];
}

/** Per-character speaking budget (completion tokens). */
export interface TokenState {
  used: number;
  budget: number;
  remaining: number;
}

export interface AgentSnapshot {
  persona: AgentPersona;
  memory: StoredMemory | null;
  /** Number of past meetings this agent has retained. */
  meetingsRetained: number;
  /** Token budget usage for the in-UI meter. */
  tokens: TokenState;
}
