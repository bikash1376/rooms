import type { AgentPersona } from "./types";

// The cast. Two run on Cognee memory; Biff is the amnesiac who skips recall
// and remember entirely — the live proof of what a memory layer buys you.
export const AGENTS: AgentPersona[] = [
  {
    id: "nova",
    name: "Divyansh",
    role: "Design Engineer",
    // Initial prompt intentionally blank — the admin writes it in the Settings tab.
    persona: "",
    remembers: true,
    dataset: "agent_nova",
    model: "gpt-3.5-turbo-0613",
    seat: { col: 1, row: 1 },
    accent: "cyan",
  },
  {
    id: "atlas",
    name: "Maaz",
    role: "AI Engineer",
    persona: "",
    remembers: true,
    dataset: "agent_atlas",
    model: "qwen2.5",
    seat: { col: 3, row: 1 },
    accent: "magenta",
  },
  {
    id: "biff",
    name: "Harsh",
    role: "Web Developer",
    // Blank prompt; the amnesiac behaviour comes from `remembers: false`, not the prompt.
    persona: "",
    remembers: false,
    dataset: "agent_biff",
    model: "glm-4.6",
    seat: { col: 2, row: 2 },
    accent: "amnesia",
  },
];

export const SHARED_DATASET = "company_brain";

export function agentById(id: string): AgentPersona | undefined {
  return AGENTS.find((a) => a.id === id);
}

export const MEMORY_AGENTS = AGENTS.filter((a) => a.remembers);
export const AMNESIAC = AGENTS.find((a) => !a.remembers)!;
