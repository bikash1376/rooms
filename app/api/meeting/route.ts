import { NextResponse } from "next/server";
import { runMeeting } from "@/lib/orchestrator";

export const runtime = "nodejs";
export const dynamic = "force-dynamic";

export async function POST(req: Request) {
  let topic = "";
  try {
    const body = await req.json();
    topic = String(body?.topic ?? "").trim();
  } catch {
    // fall through to validation below
  }

  if (!topic) {
    return NextResponse.json(
      { error: "Give the team a topic to meet about." },
      { status: 400 }
    );
  }
  if (topic.length > 140) topic = topic.slice(0, 140);

  try {
    const result = await runMeeting(topic);
    return NextResponse.json(result);
  } catch (err) {
    console.error("[api/meeting]", err);
    return NextResponse.json(
      { error: "The meeting fell apart. Check server logs." },
      { status: 500 }
    );
  }
}
