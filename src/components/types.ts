/** Shared front-end shapes (mirror 04-API-CONTRACTS.md). */

export interface ProcessResult {
  datasetId: string;
  filename: string;
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
  persistent: boolean;
}

export interface ServiceSummary {
  serviceId: string;
  serviceName: string;
  total: number;
  up: number;
  down: number;
  downtimeMin: number;
  availability: number;
  creditEligible: boolean;
  budgetMin: number;
  budgetRemainingMin: number;
  p50: number | null;
  p95: number | null;
  p99: number | null;
}

export interface SummaryResponse {
  datasetId: string;
  filename: string;
  persistent: boolean;
  overall: {
    total: number;
    up: number;
    down: number;
    downtimeMin: number;
    availability: number;
    creditEligible: boolean;
  };
  latency: { n: number; p50: number | null; p95: number | null; p99: number | null };
  byService: ServiceSummary[];
  byMonth: {
    month: string;
    total: number;
    up: number;
    down: number;
    downtimeMin: number;
    availability: number;
    creditEligible: boolean;
  }[];
  quality: {
    quarantined: number;
    exactDupes: number;
    overlaps: number;
    epochFixed: number;
    missingLatency: number;
    invalidLatency: number;
    unknownStatus: number;
  };
  span: { from: string | null; to: string | null };
}

export interface LogRow {
  serviceId: string;
  serviceName: string;
  ts: string;
  statusCode: number;
  isUp: boolean;
  latencyMs: number | null;
  agent: string;
  agents: string[];
  agentCount: number;
  region: string;
  flags: string[];
}

export function fmtPct(x: number): string {
  return `${(x * 100).toFixed(3)}%`;
}

export function fmtInt(x: number): string {
  return x.toLocaleString("en-US");
}

export function fmtMs(x: number | null): string {
  if (x == null) return "—";
  return `${Math.round(x).toLocaleString("en-US")} ms`;
}

export function fmtTs(iso: string): string {
  return iso.replace("T", " ").replace(".000Z", "Z");
}
