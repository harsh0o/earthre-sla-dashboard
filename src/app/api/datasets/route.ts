import { NextResponse } from "next/server";
import { listDatasets } from "@/lib/db/store";

export const runtime = "nodejs";

/** GET /api/datasets — recent upload sessions (newest first, max 20). */
export async function GET() {
  const datasets = await listDatasets();
  return NextResponse.json({ datasets });
}
