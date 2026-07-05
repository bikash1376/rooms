import { NextResponse } from "next/server";
import { agentSnapshots, statusFlags } from "@/lib/orchestrator";

export const runtime = "nodejs";
export const dynamic = "force-dynamic";

// Snapshot of every agent's retained memory + service status. The UI polls
// this to draw the constellations and to prove what survived a restart.
export async function GET() {
  return NextResponse.json({
    agents: agentSnapshots(),
    status: statusFlags(),
  });
}
