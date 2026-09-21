import { existsSync, readFileSync } from "node:fs";
import path from "node:path";
import Papa from "papaparse";
import { describe, expect, it } from "vitest";
import { runPipeline, summarize } from "@/lib/pipeline/pipeline";
import type { RawRow } from "@/lib/pipeline/types";

/**
 * Conformance suite: runs the REAL pipeline over every CSV shipped with the
 * case study and asserts the profiled expectations (02-DATA-FINDINGS.md).
 * Skips when the data folder is absent (e.g. reviewer machines without it).
 */
const DATA_DIR =
  process.env.EARTHRE_DATA ??
  path.join("D:", "EarthRe-interview", "Full Stack Case Study - EarthRe");

const FILES = [
  { file: "monitoring_checks_9d_seed101.csv", rows: 4672, kept: 4320, epoch: 70, empty: 56, min: "2025-05-08T00:00:00.000Z", max: "2025-05-16T23:45:00.000Z" },
  { file: "monitoring_checks_12d_seed505.csv", rows: 6230, kept: 5760, epoch: 93, empty: 74, min: "2025-04-10T00:00:00.000Z", max: "2025-04-21T23:45:00.000Z" },
  { file: "monitoring_checks_14d_seed202.csv", rows: 7269, kept: 6720, epoch: 109, empty: 87, min: "2025-05-19T00:00:00.000Z", max: "2025-06-01T23:45:00.000Z" },
  { file: "monitoring_checks_21d_seed303.csv", rows: 10904, kept: 10080, epoch: 163, empty: 130, min: "2025-04-03T00:00:00.000Z", max: "2025-04-23T23:45:00.000Z" },
  { file: "monitoring_checks_30d_seed404.csv", rows: 15577, kept: 14400, epoch: 233, empty: 186, min: "2025-04-06T00:00:00.000Z", max: "2025-05-05T23:45:00.000Z" },
];

describe.skipIf(!existsSync(DATA_DIR))("case-study datasets", () => {
  for (const f of FILES) {
    it(`${f.file}: cleans to the exact canonical grid`, () => {
      const csv = readFileSync(path.join(DATA_DIR, f.file), "utf8");
      const parsed = Papa.parse<Record<string, string>>(csv, { header: true, skipEmptyLines: true });
      const rows: RawRow[] = parsed.data.map((r) => ({
        service_id: r.service_id ?? "",
        service_name: r.service_name ?? "",
        timestamp: r.timestamp ?? "",
        status_code: r.status_code ?? "",
        latency: r.latency ?? "",
        latency_unit: r.latency_unit ?? "ms",
        agent: r.agent ?? "agent-1",
        region: r.region ?? "ap-south-1",
      }));
      const { checks, report } = runPipeline(rows);

      // Profiled expectations.
      expect(report.totalRows).toBe(f.rows);
      expect(report.keptChecks).toBe(f.kept);
      expect(report.epochFixed).toBe(f.epoch);
      expect(report.missingLatency).toBe(f.empty);
      expect(report.invalidLatency).toBe(1); // one negative-latency sensor fault per file
      expect(report.unknownStatus).toBe(1); // one status-999 per file
      expect(report.services).toHaveLength(5);
      expect(report.dateMin).toBe(f.min);
      expect(report.dateMax).toBe(f.max);

      // Conservation identity: every input row is kept, deduped, or quarantined-not-dropped.
      // (bad_timestamp is 0 on all files — all timestamps parse.)
      expect(report.keptChecks + report.exactDupesSuppressed + report.overlapsCollapsed).toBe(f.rows);

      // Exactly one canonical check per (service, 15-min slot) — no gaps, no doubles.
      const slots = new Set(checks.map((c) => `${c.serviceId}|${c.ts}`));
      expect(slots.size).toBe(f.kept);

      // Sane SLA outcome on every file.
      const s = summarize(checks);
      expect(s.availability).toBeGreaterThan(0.9);
      expect(s.availability).toBeLessThanOrEqual(1);
    });
  }
});
