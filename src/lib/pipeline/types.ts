/** Canonical types for the SLA pipeline (pure, framework-free). */

export interface RawRow {
  service_id: string;
  service_name: string;
  timestamp: string;
  status_code: string;
  latency: string;
  latency_unit: string;
  agent: string;
  region: string;
}

export type QuarantineReason =
  | "bad_timestamp"
  | "invalid_latency"
  | "missing_latency"
  | "exact_dupe"
  | "overlap_suppressed"
  | "unknown_status"
  | "status_conflict";

export interface CanonicalCheck {
  serviceId: string;
  serviceName: string;
  /** Canonical 15-min slot, UTC ISO string. */
  ts: string;
  statusCode: number;
  isUp: boolean;
  /** Normalized ms; null when missing / invalid. */
  latencyMs: number | null;
  latencyOk: boolean;
  /** Winning agent after dedupe (prefer agent-1). */
  agent: string;
  agents: string[];
  agentCount: number;
  region: string;
  flags: string[];
}

export interface QuarantineRow {
  serviceId?: string;
  tsRaw?: string;
  reason: QuarantineReason;
  detail: string;
  payload: Record<string, string>;
}

export interface PipelineReport {
  totalRows: number;
  keptChecks: number;
  quarantined: number;
  exactDupesSuppressed: number;
  overlapsCollapsed: number;
  epochFixed: number;
  missingLatency: number;
  invalidLatency: number;
  unknownStatus: number;
  dateMin: string | null;
  dateMax: string | null;
  services: string[];
}

export interface PipelineResult {
  checks: CanonicalCheck[];
  quarantine: QuarantineRow[];
  report: PipelineReport;
}
