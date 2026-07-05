import { NextResponse } from "next/server";
import { getAgents } from "@/lib/agentConfig";
import { AGENTS, agentById } from "@/lib/agents";
import { getTasks, setTasks, type Task } from "@/lib/tasks";
import type { AgentId } from "@/lib/types";
import * as cognee from "@/lib/cognee";

export const runtime = "nodejs";
export const dynamic = "force-dynamic";

// The office task board. Tasks are admin-assigned from the frontend and stored
// on disk — no hardcoded content.
export async function GET() {
  const agents = getAgents().map((a) => ({
    id: a.id,
    name: a.name,
    accent: a.accent,
    remembers: a.remembers,
    tasks: getTasks(a.id),
  }));
  return NextResponse.json({ agents });
}

export async function POST(req: Request) {
  let body: { agentId?: string; tasks?: Task[] };
  try {
    body = await req.json();
  } catch {
    return NextResponse.json({ error: "Invalid body" }, { status: 400 });
  }
  const id = body.agentId;
  if (!id || !AGENTS.some((a) => a.id === id)) {
    return NextResponse.json({ error: "Unknown agent" }, { status: 400 });
  }
  const tasks = setTasks(id as AgentId, body.tasks ?? []);

  // Push the assignments into Cognee (the real cloud memory DB) for memory-backed
  // agents, so they can recall their tasks in meetings. Best-effort, non-blocking;
  // the amnesiac stores nothing, and a bad/absent key just no-ops.
  const agent = agentById(id);
  if (agent?.remembers && tasks.length > 0 && cognee.isCogneeLive()) {
    const summary = `Assigned tasks for ${agent.name} (${agent.role}): ${tasks
      .map((t, i) => `${i + 1}. ${t.title} [${t.status}]`)
      .join("; ")}.`;
    cognee
      .remember(agent.dataset, summary)
      .then(() => cognee.cognify(agent.dataset))
      .catch((err) => console.warn(`[tasks] Cognee ingest failed: ${(err as Error).message}`));
  }

  return NextResponse.json({ ok: true, tasks });
}
