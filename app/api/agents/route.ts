import { NextResponse } from "next/server";
import { getAgents, updateAgent } from "@/lib/agentConfig";

export const runtime = "nodejs";
export const dynamic = "force-dynamic";

export async function GET() {
  const agents = getAgents().map((a) => ({
    id: a.id,
    name: a.name,
    persona: a.persona,
    role: a.role,
    remembers: a.remembers,
    accent: a.accent,
  }));
  return NextResponse.json({ agents });
}

export async function POST(req: Request) {
  let body: { id?: string; name?: string; persona?: string; role?: string };
  try {
    body = await req.json();
  } catch {
    return NextResponse.json({ error: "Invalid body" }, { status: 400 });
  }
  if (!body?.id) {
    return NextResponse.json({ error: "Missing agent id" }, { status: 400 });
  }
  updateAgent(body.id, { name: body.name, persona: body.persona, role: body.role });
  return NextResponse.json({ ok: true });
}
