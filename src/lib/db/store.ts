import type {
  CanonicalCheck,
  PipelineReport,
  QuarantineRow,
} from "@/lib/pipeline/types";
import { getSupabase, getSupabaseAdmin } from "./client";

/**
 * Persistence layer with two backends:
 * - Supabase Postgres when env keys are configured (production / review).
 * - In-memory Map fallback for local dev before keys exist (NOT persistent
 *   across serverless invocations — README states Supabase is required live).
 */

export interface DatasetRecord {
  id: string;
  filename: string;
  uploadedAt: string;
  report: PipelineReport;
  checks: CanonicalCheck[];
  quarantine: QuarantineRow[];
  persistent: boolean;
}

const memory = new Map<string, DatasetRecord>();

export function supabaseEnabled(): boolean {
  return Boolean(
    (process.env.NEXT_PUBLIC_SUPABASE_URL ?? process.env.SUPABASE_URL) &&
      process.env.SUPABASE_SERVICE_ROLE_KEY,
  );
}

export async function saveDataset(
  filename: string,
  checks: CanonicalCheck[],
  quarantine: QuarantineRow[],
  report: PipelineReport,
): Promise<DatasetRecord> {
  const admin = getSupabaseAdmin();
  if (admin) {
    const { data: ds, error } = await admin
      .from("datasets")
      .insert({
        filename,
        total_rows: report.totalRows,
        kept_checks: report.keptChecks,
        quarantined: report.quarantined,
        date_min: report.dateMin,
        date_max: report.dateMax,
        exact_dupes: report.exactDupesSuppressed,
        overlaps_collapsed: report.overlapsCollapsed,
        epoch_fixed: report.epochFixed,
        missing_latency: report.missingLatency,
        invalid_latency: report.invalidLatency,
        unknown_status: report.unknownStatus,
      })
      .select("id, uploaded_at")
      .single();
    if (error) throw new Error(`Supabase datasets insert failed: ${error.message}`);
    const datasetId: string = ds.id;
    // Batch inserts (500 rows) to stay within limits.
    for (let i = 0; i < checks.length; i += 500) {
      const batch = checks.slice(i, i + 500).map((c) => ({
        dataset_id: datasetId,
        service_id: c.serviceId,
        service_name: c.serviceName,
        ts: c.ts,
        status_code: c.statusCode,
        is_up: c.isUp,
        latency_ms: c.latencyMs,
        latency_ok: c.latencyOk,
        agent: c.agent,
        agents: c.agents,
        agent_count: c.agentCount,
        region: c.region,
      }));
      const { error: e2 } = await admin.from("checks").insert(batch);
      if (e2) throw new Error(`Supabase checks insert failed: ${e2.message}`);
    }
    if (quarantine.length) {
      for (let i = 0; i < quarantine.length; i += 500) {
        const batch = quarantine.slice(i, i + 500).map((q) => ({
          dataset_id: datasetId,
          service_id: q.serviceId ?? null,
          ts_raw: q.tsRaw ?? null,
          reason: q.reason,
          payload: { detail: q.detail, ...q.payload },
        }));
        const { error: e3 } = await admin.from("quarantine").insert(batch);
        if (e3) throw new Error(`Supabase quarantine insert failed: ${e3.message}`);
      }
    }
    const rec: DatasetRecord = {
      id: datasetId,
      filename,
      uploadedAt: ds.uploaded_at,
      report,
      checks,
      quarantine,
      persistent: true,
    };
    memory.set(datasetId, rec); // warm local cache
    return rec;
  }
  // Memory fallback.
  const id =
    typeof crypto !== "undefined" && "randomUUID" in crypto
      ? crypto.randomUUID()
      : `ds-${Date.now()}`;
  const rec: DatasetRecord = {
    id,
    filename,
    uploadedAt: new Date().toISOString(),
    report,
    checks,
    quarantine,
    persistent: false,
  };
  memory.set(id, rec);
  return rec;
}

export async function getDataset(id: string): Promise<DatasetRecord | null> {
  const hit = memory.get(id);
  if (hit) return hit;
  const reader = getSupabase() ?? getSupabaseAdmin();
  if (!reader) return null;
  const { data: ds } = await reader.from("datasets").select("*").eq("id", id).single();
  if (!ds) return null;
  // Checks could be large; page through.
  const checks: CanonicalCheck[] = [];
  const pageSize = 1000;
  for (let from = 0; ; from += pageSize) {
    const { data, error } = await reader
      .from("checks")
      .select("*")
      .eq("dataset_id", id)
      .order("ts", { ascending: true })
      .range(from, from + pageSize - 1);
    if (error || !data || data.length === 0) break;
    for (const r of data) {
      checks.push({
        serviceId: r.service_id,
        serviceName: r.service_name,
        ts: new Date(r.ts).toISOString(),
        statusCode: r.status_code,
        isUp: r.is_up,
        latencyMs: r.latency_ms,
        latencyOk: r.latency_ok,
        agent: r.agent,
        agents: r.agents ?? [r.agent],
        agentCount: r.agent_count ?? 1,
        region: r.region,
        flags: [],
      });
    }
    if (data.length < pageSize) break;
  }
  const rec: DatasetRecord = {
    id: ds.id,
    filename: ds.filename,
    uploadedAt: ds.uploaded_at,
    report: {
      totalRows: ds.total_rows,
      keptChecks: checks.length,
      quarantined: ds.quarantined,
      exactDupesSuppressed: ds.exact_dupes ?? 0,
      overlapsCollapsed: ds.overlaps_collapsed ?? 0,
      epochFixed: ds.epoch_fixed ?? 0,
      missingLatency: ds.missing_latency ?? 0,
      invalidLatency: ds.invalid_latency ?? 0,
      unknownStatus: ds.unknown_status ?? 0,
      dateMin: ds.date_min,
      dateMax: ds.date_max,
      services: [...new Set(checks.map((c) => c.serviceId))].sort(),
    },
    checks,
    quarantine: [],
    persistent: true,
  };
  memory.set(id, rec);
  return rec;
}

export async function listDatasets(): Promise<
  { id: string; filename: string; uploadedAt: string; keptChecks: number }[]
> {
  const reader = getSupabase() ?? getSupabaseAdmin();
  if (reader) {
    const { data } = await reader
      .from("datasets")
      .select("id, filename, uploaded_at, kept_checks")
      .order("uploaded_at", { ascending: false })
      .limit(20);
    if (data?.length) {
      return data.map((d) => ({
        id: d.id,
        filename: d.filename,
        uploadedAt: d.uploaded_at,
        keptChecks: d.kept_checks,
      }));
    }
  }
  return [...memory.values()]
    .sort((a, b) => (a.uploadedAt < b.uploadedAt ? 1 : -1))
    .slice(0, 20)
    .map((d) => ({
      id: d.id,
      filename: d.filename,
      uploadedAt: d.uploadedAt,
      keptChecks: d.report.keptChecks,
    }));
}
