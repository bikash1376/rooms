import { NextResponse } from "next/server";
import { runTurn } from "@/lib/orchestrator";
import type { TurnLine } from "@/lib/types";

export const runtime = "nodejs";
export const dynamic = "force-dynamic";

// One agent turn of a meeting. The client calls this repeatedly (with a pause
// between calls) so dialogue plays out live and API calls stay spaced out.
export async function POST(req: Request) {
  let body: { topic?: string; transcript?: TurnLine[]; turnIndex?: number };
  try {
    body = await req.json();
  } catch {
    return NextResponse.json({ error: "Invalid body" }, { status: 400 });
  }

  const topic = String(body?.topic ?? "").trim().slice(0, 140);
  if (!topic) {
    return NextResponse.json({ error: "Give the team a topic." }, { status: 400 });
  }
  const transcript = Array.isArray(body?.transcript) ? body.transcript : [];
  const turnIndex = Math.max(0, Number(body?.turnIndex ?? 0) | 0);

  try {
    const result = await runTurn(topic, transcript, turnIndex);
    return NextResponse.json(result);
  } catch (err) {
    console.error("[api/turn]", err);
    return NextResponse.json({ error: "Turn failed. Check server logs." }, { status: 500 });
  }
}
