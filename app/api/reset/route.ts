import { NextResponse } from "next/server";
import { wipeAll } from "@/lib/store";

export const runtime = "nodejs";
export const dynamic = "force-dynamic";

// The "fresh install" button. Wipes the mock store so a demo can start clean.
// Note: this does NOT wipe live Cognee datasets — do that from Cognee Cloud.
export async function POST() {
  wipeAll();
  return NextResponse.json({ ok: true });
}
