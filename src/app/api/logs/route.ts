import { NextResponse } from "next/server";
import { getDataset } from "@/lib/db/store";

export const runtime = "nodejs";

/**
 * GET /api/logs?datasetId=…&from=…&to=…&service=a,b&status=all|up|down&page=1&pageSize=50
 * `from/to` accept date-only (whole UTC day) or full ISO datetimes.
 */
export async function GET(req: Request) {
  const { searchParams } = new URL(req.url);
  const datasetId = searchParams.get("datasetId");
  if (!datasetId) {
    return NextResponse.json({ error: "Missing datasetId." }, { status: 400 });
  }
  const ds = await getDataset(datasetId);
  if (!ds) {
    return NextResponse.json({ error: "Dataset not found." }, { status: 404 });
  }

  const from = parseBound(searchParams.get("from"), "start");
  const to = parseBound(searchParams.get("to"), "end");
  const services = (searchParams.get("service") ?? "")
    .split(",")
    .map((s) => s.trim())
    .filter(Boolean);
  const status = searchParams.get("status") ?? "all";
  const page = Math.max(1, Number.parseInt(searchParams.get("page") ?? "1", 10) || 1);
  const pageSize = Math.min(
    200,
    Math.max(1, Number.parseInt(searchParams.get("pageSize") ?? "50", 10) || 50),
  );

  let rows = ds.checks;
  if (from) rows = rows.filter((c) => c.ts >= from);
  if (to) rows = rows.filter((c) => c.ts <= to);
  if (services.length) rows = rows.filter((c) => services.includes(c.serviceId));
  if (status === "up") rows = rows.filter((c) => c.isUp);
  if (status === "down") rows = rows.filter((c) => !c.isUp);

  const total = rows.length;
  const totalPages = Math.max(1, Math.ceil(total / pageSize));
  const safePage = Math.min(page, totalPages);
  const slice = rows.slice((safePage - 1) * pageSize, safePage * pageSize);

  return NextResponse.json({
    rows: slice.map((c) => ({
      serviceId: c.serviceId,
      serviceName: c.serviceName,
      ts: c.ts,
      statusCode: c.statusCode,
      isUp: c.isUp,
      latencyMs: c.latencyMs,
      agent: c.agent,
      agents: c.agents,
      agentCount: c.agentCount,
      region: c.region,
      flags: c.flags,
    })),
    page: safePage,
    pageSize,
    total,
    totalPages,
  });
}

/** Exported for unit testing. Date-only input covers the whole UTC day. */
export function parseBound(raw: string | null, edge: "start" | "end"): string | null {
  if (!raw || !raw.trim()) return null;
  const t = raw.trim();
  // Date-only → whole UTC day.
  if (/^\d{4}-\d{2}-\d{2}$/.test(t)) {
    return edge === "start" ? `${t}T00:00:00.000Z` : `${t}T23:59:59.999Z`;
  }
  const d = new Date(t);
  if (Number.isNaN(d.getTime())) return null;
  return d.toISOString();
}
