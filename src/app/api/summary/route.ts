import { NextResponse } from "next/server";
import { getDataset } from "@/lib/db/store";
import {
  SLA_THRESHOLD,
  daysInMonth,
  latencyStats,
  monthKey,
  summarize,
} from "@/lib/pipeline/pipeline";

export const runtime = "nodejs";

/** GET /api/summary?datasetId=… — availability, budget, latency, quality. */
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

  const overall = summarize(ds.checks);
  const latencyAll = latencyStats(ds.checks);

  const byService = ds.report.services.map((sid) => {
    const rows = ds.checks.filter((c) => c.serviceId === sid);
    const s = summarize(rows);
    const lat = latencyStats(rows);
    // Worst month drives the budget story; budget uses calendar-month minutes.
    const months = [...new Set(rows.map((c) => monthKey(c.ts)))].sort();
    const budgetMin =
      months.length === 1 ? daysInMonth(months[0]) * 24 * 60 * (1 - SLA_THRESHOLD) : 0;
    return {
      serviceId: sid,
      serviceName: rows[0]?.serviceName ?? sid,
      ...s,
      budgetMin: Math.round(budgetMin * 10) / 10,
      budgetRemainingMin: Math.round((budgetMin - s.downtimeMin) * 10) / 10,
      p50: lat.p50,
      p95: lat.p95,
      p99: lat.p99,
    };
  });

  const monthKeys = [...new Set(ds.checks.map((c) => monthKey(c.ts)))].sort();
  const byMonth = monthKeys.map((m) => {
    const rows = ds.checks.filter((c) => monthKey(c.ts) === m);
    return { month: m, ...summarize(rows) };
  });

  return NextResponse.json({
    datasetId: ds.id,
    filename: ds.filename,
    persistent: ds.persistent,
    overall,
    latency: latencyAll,
    byService,
    byMonth,
    quality: {
      quarantined: ds.report.quarantined,
      exactDupes: ds.report.exactDupesSuppressed,
      overlaps: ds.report.overlapsCollapsed,
      epochFixed: ds.report.epochFixed,
      missingLatency: ds.report.missingLatency,
      invalidLatency: ds.report.invalidLatency,
      unknownStatus: ds.report.unknownStatus,
    },
    span: { from: ds.report.dateMin, to: ds.report.dateMax },
  });
}
