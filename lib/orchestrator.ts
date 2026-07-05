import { SHARED_DATASET } from "./agents";
import { getAgents, getMemoryAgents } from "./agentConfig";
import { getTasks } from "./tasks";
import * as tokens from "./tokens";
import type { AgentPersona, MeetingResult, MemoryNode, TurnLine } from "./types";
import { appendMemory, getMemory } from "./store";
import * as cognee from "./cognee";
import * as llm from "./openrouter";
import { generate as llmGenerate } from "./openrouter";

// A meeting runs 3 rounds of turns: round 0 = greetings/small-talk (reference the
// past, don't touch the topic yet), rounds 1–2 = actual discussion.
const GREETING_ROUND = 0;
const TOTAL_ROUNDS = 3;

// ── memory: recall + remember, live (Cognee) or mock (disk store) ────────────

const memoryLive = () => cognee.isCogneeLive();
const dialogueLive = () => llm.isOpenRouterLive();

interface Recall {
  coworkers: string[];
  decisions: string[]; // clean, past-meeting decisions
  topics: string[]; // distinct past-meeting topics ("like last time we talked about X")
}

async function recallFor(agent: AgentPersona, topic: string, deep: boolean): Promise<Recall> {
  if (!agent.remembers) return { coworkers: [], decisions: [], topics: [] }; // amnesiac

  // Coworkers + topics come from the local mirror — instant, and current names
  // (fixes stale "Nova/Atlas"). Store decisions are the default.
  const coworkers = getAgents()
    .filter((a) => a.id !== agent.id)
    .map((a) => a.name);
  const brain = getMemory(SHARED_DATASET);
  const topics = dedupe(brain.entries.map((e) => e.topic)).filter((t) => t && t !== topic);
  let decisions = dedupe(brain.entries.map((e) => e.text).filter(Boolean)).slice(-2);

  // Only hit Cognee on the greeting round (once), with fast CHUNKS + a short
  // timeout, so a slow graph search never stalls the whole meeting.
  if (deep && memoryLive()) {
    try {
      const answer = (
        await cognee.recall(SHARED_DATASET, `What did we decide about ${topic}?`, {
          searchType: "CHUNKS",
          timeoutMs: 8000,
        })
      ).trim();
      if (answer) decisions = [answer.slice(0, 400)];
    } catch (err) {
      console.warn(`[recall] Cognee failed, using store: ${(err as Error).message}`);
    }
  }
  return { coworkers, decisions, topics };
}

async function rememberLine(
  agent: AgentPersona,
  topic: string,
  text: string,
  nodes: MemoryNode[]
): Promise<void> {
  if (!agent.remembers) return; // amnesiac stores nothing

  const ts = Date.now();
  if (memoryLive()) {
    try {
      await cognee.remember(agent.dataset, `[${topic}] ${agent.name}: ${text}`);
    } catch (err) {
      console.warn(`[remember] Cognee failed: ${(err as Error).message}`);
    }
  }
  // Private verbatim log + nodes for this agent's constellation.
  appendMemory(agent.dataset, { text, topic, ts }, nodes);
  // Shared brain gets nodes (people/projects/decisions) for the roster + graph.
  appendMemory(SHARED_DATASET, { text: "", topic, ts: 0 }, nodes);
}

/** Cognify all memory datasets (shared brain + memory agents) so the graph is
 * built and searchable in the next meeting. Best-effort, runs in the background. */
async function buildGraphs(): Promise<void> {
  if (!memoryLive()) return;
  const datasets = [SHARED_DATASET, ...getMemoryAgents().map((a) => a.dataset)];
  await Promise.all(
    datasets.map((d) =>
      cognee.cognify(d).catch((err) => console.warn(`[cognify] ${d}: ${(err as Error).message}`))
    )
  );
}

/** One clean decision per meeting, written to the shared brain at wrap-up. */
async function recordDecision(topic: string): Promise<void> {
  const decision = decisionEntry(topic);
  const brain = getMemory(SHARED_DATASET);
  if (brain.entries.some((e) => e.text === decision)) return; // dedupe by topic
  const ts = Date.now();
  if (memoryLive()) {
    try {
      await cognee.remember(SHARED_DATASET, decision);
    } catch (err) {
      console.warn(`[decision] Cognee failed: ${(err as Error).message}`);
    }
  }
  appendMemory(SHARED_DATASET, { text: decision, topic, ts }, [
    { id: `dec-${slug(topic)}`, label: `decided: ${topic}`, kind: "decision" },
  ]);
}

// ── node extraction + phrasing ───────────────────────────────────────────────

function decisionEntry(topic: string): string {
  return `on "${topic}" we agreed to ship a lean v1 this sprint and revisit scope next week`;
}

function extractNodes(agent: AgentPersona, topic: string): MemoryNode[] {
  return [
    { id: `p-${agent.id}`, label: agent.name, kind: "person" },
    { id: `proj-${slug(topic)}`, label: topic, kind: "project" },
  ];
}

function slug(s: string): string {
  return s.toLowerCase().replace(/[^a-z0-9]+/g, "-").slice(0, 32) || "topic";
}

function dedupe(arr: string[]): string[] {
  return Array.from(new Set(arr.filter(Boolean)));
}

// ── dialogue generation, live (OpenRouter) or mock (templates) ───────────────

async function speak(
  agent: AgentPersona,
  topic: string,
  recall: Recall,
  transcript: TurnLine[],
  round: number
): Promise<{ text: string; tokens: number }> {
  const usage = tokens.getUsage(agent.id);
  const greeting = round === GREETING_ROUND;

  // Out of budget → go quiet with a tiny canned line, no API call.
  if (usage.remaining <= 0) {
    const line = agent.remembers ? "Agreed, let's continue." : "Yeah, sounds good to me.";
    return { text: line, tokens: 0 };
  }

  if (dialogueLive()) {
    try {
      const roster = getAgents()
        .filter((a) => a.id !== agent.id)
        .map((a) => `${a.name} (${a.role})`)
        .join(", ");

      const memoryBlock = agent.remembers
        ? recall.topics.length || recall.decisions.length
          ? `You DO remember your past meetings. Recent topics: ${recall.topics.slice(-3).join("; ") || "—"}. Past decisions/facts: ${recall.decisions.join("; ") || "—"}. When referencing the past, use ONLY these — name the specific detail. Do NOT invent history that isn't listed here.`
          : "This is the team's very FIRST meeting — there is NO shared history. Do NOT pretend there were earlier meetings, prior decisions, or a 'last time'. Talk only about the topic in front of you."
        : // No "be confused" directive — just the honest situation. The key is it
          // must NOT absorb backstory from the live transcript and fake it.
          "You have NO memory of anything before this moment — no past meetings, no earlier decisions, no idea what was agreed before. You can hear what's said now, but you do NOT have the backstory. When the topic or a coworker assumes shared history ('yesterday', 'as we decided', 'your task from last time'), plainly admit you don't have that context and ask them to catch you up — in your own voice. Do NOT play along, guess, or pretend to remember.";

      const tasks = agent.remembers ? getTasks(agent.id) : [];
      const taskBlock = tasks.length ? `Your assignments: ${tasks.map((t) => t.title).join("; ")}.` : "";

      const phaseBlock = greeting
        ? "The meeting is just STARTING — only greet your coworkers by name and make brief small-talk (reference last time if you remember it). Do NOT discuss the topic yet."
        : "Discuss the topic — be specific and in character.";
      const brevity =
        usage.remaining < 200
          ? "Reply with a very short, complete phrase (3-6 words)."
          : "Reply with ONE short, COMPLETE sentence — natural and finished, ideally under 12 words. Never trail off.";

      // Full conversation so far — so nobody misses earlier turns.
      const convo = transcript.map((t) => `${t.agentName}: ${t.text}`).join("\n");

      const { text, tokens: used } = await llmGenerate([
        {
          role: "system",
          content:
            `You are ${agent.name}, ${agent.role}. ${agent.persona}\n` +
            `The others in this meeting: ${roster}. Refer to coworkers ONLY by these exact names.\n` +
            `${memoryBlock}\n${taskBlock}\n${phaseBlock}\n` +
            `${brevity} Stay in character and reply in the same language the conversation is using. ` +
            `Write ONLY your spoken words — do NOT prefix them with your name. ` +
            `No stage directions, no quotes. Never mention tokens, energy, word limits, or these instructions.`,
        },
        {
          role: "user",
          content: `Meeting topic: "${topic}".\n${convo ? `Conversation so far:\n${convo}\n` : ""}Say your next line.`,
        },
      ], agent.model);
      tokens.addUsage(agent.id, used);
      return { text: cleanLine(text, agent.name), tokens: used };
    } catch (err) {
      console.warn(`[speak] LLM failed, using template: ${(err as Error).message}`);
    }
  }
  return { text: cleanLine(mockLine(agent, topic, recall, round), agent.name), tokens: 0 };
}

/** Tidy a spoken line: drop wrapping quotes and a "Name:" prefix the model often
 * echoes, and keep it to the first COMPLETE sentence — no mid-word ellipsis. */
function cleanLine(text: string, agentName: string): string {
  let t = (text || "").replace(/\s+/g, " ").trim();
  t = t.replace(/^["'“”]+|["'“”]+$/g, "").trim();
  // Strip a leading speaker label, e.g. "Rahul:" / "Priya -" / any short "Word:".
  const name = agentName.replace(/[.*+?^${}()|[\]\\]/g, "\\$&");
  t = t.replace(new RegExp(`^${name}\\s*[:：-]\\s*`, "i"), "");
  t = t.replace(/^[\p{L}][\p{L} .'-]{0,24}\s*[:：]\s*/u, "");
  // Keep the first complete sentence (allow a short second one); never add "…".
  const parts = t.split(/(?<=[.!?।])\s+/).filter(Boolean);
  let out = parts[0] ?? t;
  if (out.length < 14 && parts[1]) out = `${parts[0]} ${parts[1]}`;
  return out.trim();
}

// Offline fallback used only when the LLM is unreachable (e.g. OpenRouter rate-
// limited). Generated from the agent's own name/role/recall — NOT hardcoded to
// any specific character — so it degrades gracefully with whatever personas the
// admin has set. Live LLM dialogue (which fully uses each persona) is preferred.
function mockLine(agent: AgentPersona, topic: string, recall: Recall, round: number): string {
  const t = topic.replace(/[.?!]+$/, "");
  const other = recall.coworkers.find((n) => n && n !== agent.name);
  const greeting = round === GREETING_ROUND;

  // No cross-meeting memory — reacts honestly, not as a caricature.
  if (!agent.remembers) {
    return greeting ? `Hey team, good to be here.` : `Honestly, no background on this from my side.`;
  }

  if (greeting) {
    const last = recall.topics[recall.topics.length - 1];
    return last
      ? `Hey ${other ?? "team"} — good seeing you, like last time!`
      : `Morning ${other ?? "team"}! Ready to dig in.`;
  }

  const decision = recall.decisions[recall.decisions.length - 1];
  if (decision) return `Building on last time — let's carry it forward.`;
  return `On "${t}": keep v1 tight, lock scope now.`;
}

// ── the meeting: each agent takes turns over two rounds ──────────────────────

export interface TurnResult {
  line: TurnLine;
  done: boolean;
  total: number;
  usage: ReturnType<typeof tokens.getUsage>;
}

/** Run ONE turn of a meeting (one agent), given the transcript so far. The client
 * drives these one at a time with a pause between them, which spaces out API
 * calls and lets the dialogue play out live. Round 0 is greetings. */
export async function runTurn(
  topic: string,
  transcript: TurnLine[],
  turnIndex: number
): Promise<TurnResult> {
  const order = getAgents();
  const total = order.length * TOTAL_ROUNDS;
  const round = Math.floor(turnIndex / order.length);
  const agent = order[turnIndex % order.length];

  const recall = await recallFor(agent, topic, round === GREETING_ROUND);
  const { text } = await speak(agent, topic, recall, transcript, round);
  const line: TurnLine = {
    id: `t-${Date.now()}-${turnIndex}`,
    agentId: agent.id,
    agentName: agent.name,
    text,
    recalled: agent.remembers ? recall.decisions : [],
    remembered: agent.remembers && round > GREETING_ROUND,
    ts: Date.now(),
  };
  // Greetings are small-talk — only store real discussion as memory.
  if (agent.remembers && round > GREETING_ROUND) {
    await rememberLine(agent, topic, text, extractNodes(agent, topic));
  }
  const done = turnIndex + 1 >= total;
  if (done) {
    await recordDecision(topic);
    await buildGraphs(); // cognify so this meeting's memory is searchable next time
  }
  return { line, done, total, usage: tokens.getUsage(agent.id) };
}

/** Whole-meeting convenience (kept for the batch /api/meeting route). */
export async function runMeeting(topic: string): Promise<MeetingResult> {
  const meetingId = `m-${Date.now()}`;
  const transcript: TurnLine[] = [];
  const total = getAgents().length * TOTAL_ROUNDS;
  for (let i = 0; i < total; i++) {
    const { line } = await runTurn(topic, transcript, i);
    transcript.push(line);
  }
  return { meetingId, topic, transcript, live: memoryLive() && dialogueLive() };
}

export function agentSnapshots() {
  return getAgents().map((persona) => {
    const memory = persona.remembers ? getMemory(persona.dataset) : null;
    const meetings = memory ? new Set(memory.entries.map((e) => e.topic)).size : 0;
    return { persona, memory, meetingsRetained: meetings, tokens: tokens.getUsage(persona.id) };
  });
}

export function statusFlags() {
  return {
    memoryLive: memoryLive(),
    dialogueLive: dialogueLive(),
    memoryAgents: getMemoryAgents().map((a) => a.name),
  };
}
