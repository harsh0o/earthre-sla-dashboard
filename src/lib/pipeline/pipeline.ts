import type {
  CanonicalCheck,
  PipelineReport,
  PipelineResult,
  QuarantineRow,
  RawRow,
} from "./types";

export const SLA_THRESHOLD = 0.999;
const SLOT_MINUTES = 15;

/** Canonicalize a raw timestamp: epoch seconds OR ISO-8601 → UTC ISO string. */
export function canonicalizeTimestamp(
  raw: string,
): { iso: string | null; epochFixed: boolean } {
  const t = (raw ?? "").trim();
  if (!t) return { iso: null, epochFixed: false };
  if (/^\d{9,11}$/.test(t)) {
    const ms = Number(t) * 1000;
    const d = new Date(ms);
    if (Number.isNaN(d.getTime())) return { iso: null, epochFixed: false };
    return { iso: d.toISOString(), epochFixed: true };
  }
  // Accept "Z" and offset forms; Date parses ISO reliably.
  const d = new Date(t);
  if (Number.isNaN(d.getTime())) return { iso: null, epochFixed: false };
  return { iso: d.toISOString(), epochFixed: false };
}

/** Normalize latency to ms. Returns null when missing/invalid (incl. negatives). */
export function normalizeLatency(
  raw: string,
  unit: string,
): { ms: number | null; ok: boolean; reason: "missing" | "invalid" | null } {
  const v = (raw ?? "").trim();
  if (!v) return { ms: null, ok: false, reason: "missing" };
  const n = Number(v);
  if (!Number.isFinite(n)) return { ms: null, ok: false, reason: "invalid" };
  if (n < 0) return { ms: null, ok: false, reason: "invalid" };
  const u = (unit ?? "").trim().toLowerCase();
  const ms = u === "s" ? n * 1000 : n;
  if (!Number.isFinite(ms)) return { ms: null, ok: false, reason: "invalid" };
  return { ms: Math.round(ms * 100) / 100, ok: true, reason: null };
}

function str(v: unknown): string {
  return (v ?? "").toString().trim();
}

/**
 * Full cleaning pipeline (pure function — runs identically locally and in the
 * Vercel serverless function). Rules implement 02-DATA-FINDINGS.md:
 * - epoch + ISO timestamps → canonical UTC
 * - s/ms → ms; empty/negative → NULL + quarantine note
 * - 2xx = up; everything else (incl. 999) = down
 * - exact dupes suppressed; (service, slot) overlaps collapsed worst-status-wins
 */
export function runPipeline(rawRows: RawRow[]): PipelineResult {
  const quarantine: QuarantineRow[] = [];
  let epochFixed = 0;
  let missingLatency = 0;
  let invalidLatency = 0;
  let unknownStatus = 0;

  // Stage 1 — validate + canonicalize each row.
  const staged: CanonicalCheck[] = [];
  for (const r of rawRows) {
    const serviceId = str(r.service_id);
    const serviceName = str(r.service_name) || serviceId;
    const { iso, epochFixed: ef } = canonicalizeTimestamp(str(r.timestamp));
    if (!iso || !serviceId) {
      quarantine.push({
        serviceId: serviceId || undefined,
        tsRaw: str(r.timestamp) || undefined,
        reason: "bad_timestamp",
        detail: "Unparseable or missing timestamp/service_id; row excluded from SLA.",
        payload: { ...(r as unknown as Record<string, string>) },
      });
      continue;
    }
    if (ef) epochFixed += 1;

    const statusCode = Number.parseInt(str(r.status_code), 10);
    const status = Number.isFinite(statusCode) ? statusCode : 0;
    const isUp = status >= 200 && status <= 299;
    const flags: string[] = [];
    if (ef) flags.push("epoch-fix");
    if (status === 999) {
      unknownStatus += 1;
      flags.push("unknown-status");
      quarantine.push({
        serviceId,
        tsRaw: str(r.timestamp),
        reason: "unknown_status",
        detail: "Status 999 is unknown; counted as DOWN (non-2xx).",
        payload: { ...(r as unknown as Record<string, string>) },
      });
    }
    if (!isUp && status !== 999 && status !== 0) flags.push("error-status");

    const { ms, ok, reason } = normalizeLatency(str(r.latency), str(r.latency_unit) || "ms");
    if (reason === "missing") {
      missingLatency += 1;
      quarantine.push({
        serviceId,
        tsRaw: str(r.timestamp),
        reason: "missing_latency",
        detail: "Empty latency; check kept for availability, excluded from latency stats.",
        payload: { ...(r as unknown as Record<string, string>) },
      });
    } else if (reason === "invalid") {
      invalidLatency += 1;
      flags.push("invalid-latency");
      quarantine.push({
        serviceId,
        tsRaw: str(r.timestamp),
        reason: "invalid_latency",
        detail: "Non-numeric or negative latency; stored as NULL.",
        payload: { ...(r as unknown as Record<string, string>) },
      });
    }

    staged.push({
      serviceId,
      serviceName,
      ts: iso,
      statusCode: status,
      isUp,
      latencyMs: ok ? ms : null,
      // Latency on error rows is kept but flagged; stats layer excludes it.
      latencyOk: ok,
      agent: str(r.agent) || "agent-1",
      agents: [str(r.agent) || "agent-1"],
      agentCount: 1,
      region: str(r.region) || "ap-south-1",
      flags,
    });
  }

  // Stage 2 — exact-dupe suppression.
  const seenExact = new Set<string>();
  const deduped: CanonicalCheck[] = [];
  let exactDupesSuppressed = 0;
  for (const c of staged) {
    const key = [c.serviceId, c.ts, c.agent, c.statusCode, c.latencyMs].join("|");
    if (seenExact.has(key)) {
      exactDupesSuppressed += 1;
      quarantine.push({
        serviceId: c.serviceId,
        tsRaw: c.ts,
        reason: "exact_dupe",
        detail: "Identical row seen before; suppressed.",
        payload: { service_id: c.serviceId, timestamp: c.ts, agent: c.agent },
      });
      continue;
    }
    seenExact.add(key);
    deduped.push(c);
  }

  // Stage 3 — collapse multi-agent overlaps to one canonical check per (service, slot).
  // Worst-status-wins: DOWN beats UP (customer-favoring); tie → prefer agent-1.
  const groups = new Map<string, CanonicalCheck[]>();
  for (const c of deduped) {
    const key = `${c.serviceId}|${c.ts}`;
    const arr = groups.get(key);
    if (arr) arr.push(c);
    else groups.set(key, [c]);
  }
  const checks: CanonicalCheck[] = [];
  let overlapsCollapsed = 0;
  for (const [, arr] of groups) {
    if (arr.length === 1) {
      checks.push(arr[0]);
      continue;
    }
    const sorted = [...arr].sort((a, b) => {
      if (a.isUp !== b.isUp) return a.isUp ? 1 : -1; // down first
      if (a.agent !== b.agent) return a.agent === "agent-1" ? -1 : 1;
      return a.statusCode - b.statusCode;
    });
    const winner = sorted[0];
    const agents = [...new Set(arr.map((x) => x.agent))];
    const disagree = new Set(arr.map((x) => (x.isUp ? "up" : "down"))).size > 1;
    overlapsCollapsed += arr.length - 1;
    quarantine.push({
      serviceId: winner.serviceId,
      tsRaw: winner.ts,
      reason: disagree ? "status_conflict" : "overlap_suppressed",
      detail: disagree
        ? `Agents disagreed (${agents.join(",")}); worst-status-wins kept ${winner.agent}=${winner.statusCode}.`
        : `${arr.length} agent reports for one slot; kept ${winner.agent}, suppressed ${arr.length - 1}.`,
      payload: { service_id: winner.serviceId, timestamp: winner.ts, agents: agents.join(",") },
    });
    checks.push({
      ...winner,
      agent: winner.agent,
      agents,
      agentCount: agents.length,
      flags: [...winner.flags, "overlap"],
    });
  }

  checks.sort((a, b) => (a.ts < b.ts ? -1 : a.ts > b.ts ? 1 : a.serviceId.localeCompare(b.serviceId)));

  const report: PipelineReport = {
    totalRows: rawRows.length,
    keptChecks: checks.length,
    quarantined: quarantine.length,
    exactDupesSuppressed,
    overlapsCollapsed,
    epochFixed,
    missingLatency,
    invalidLatency,
    unknownStatus,
    dateMin: checks.length ? checks[0].ts : null,
    dateMax: checks.length ? checks[checks.length - 1].ts : null,
    services: [...new Set(checks.map((c) => c.serviceId))].sort(),
  };
  return { checks, quarantine, report };
}

/** Availability + error-budget math shared by API and UI. */
export function summarize(checks: CanonicalCheck[]) {
  const up = checks.filter((c) => c.isUp).length;
  const down = checks.length - up;
  const availability = checks.length ? up / checks.length : 1;
  return {
    total: checks.length,
    up,
    down,
    downtimeMin: down * SLOT_MINUTES,
    availability,
    creditEligible: availability < SLA_THRESHOLD,
  };
}

export function percentile(sorted: number[], p: number): number | null {
  if (!sorted.length) return null;
  const idx = Math.min(sorted.length - 1, Math.ceil((p / 100) * sorted.length) - 1);
  return sorted[Math.max(0, idx)];
}

export function latencyStats(checks: CanonicalCheck[]) {
  const vals = checks
    .filter((c) => c.isUp && c.latencyOk && c.latencyMs != null)
    .map((c) => c.latencyMs as number)
    .sort((a, b) => a - b);
  return {
    n: vals.length,
    p50: percentile(vals, 50),
    p95: percentile(vals, 95),
    p99: percentile(vals, 99),
  };
}

/** Calendar-month bucket key, e.g. "2025-04". */
export function monthKey(iso: string): string {
  return iso.slice(0, 7);
}

export function daysInMonth(key: string): number {
  const [y, m] = key.split("-").map(Number);
  return new Date(Date.UTC(y, m, 0)).getUTCDate();
}

export { SLOT_MINUTES };
