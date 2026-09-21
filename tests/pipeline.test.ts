import { describe, expect, it } from "vitest";
import {
  canonicalizeTimestamp,
  latencyStats,
  normalizeLatency,
  runPipeline,
  summarize,
} from "@/lib/pipeline/pipeline";
import type { RawRow } from "@/lib/pipeline/types";

function row(partial: Partial<RawRow>): RawRow {
  return {
    service_id: "svc-auth",
    service_name: "auth-api",
    timestamp: "2025-04-10T00:00:00Z",
    status_code: "200",
    latency: "150",
    latency_unit: "ms",
    agent: "agent-1",
    region: "ap-south-1",
    ...partial,
  };
}

describe("canonicalizeTimestamp", () => {
  it("parses ISO", () => {
    expect(canonicalizeTimestamp("2025-04-10T00:00:00Z").iso).toBe("2025-04-10T00:00:00.000Z");
  });
  it("parses epoch seconds", () => {
    const r = canonicalizeTimestamp("1746938700");
    expect(r.epochFixed).toBe(true);
    expect(r.iso).toBe(new Date(1746938700 * 1000).toISOString());
  });
  it("rejects garbage", () => {
    expect(canonicalizeTimestamp("not-a-date").iso).toBeNull();
  });
});

describe("normalizeLatency", () => {
  it("converts seconds to ms", () => {
    expect(normalizeLatency("0.486", "s").ms).toBe(486);
  });
  it("keeps ms", () => {
    expect(normalizeLatency("258", "ms").ms).toBe(258);
  });
  it("nulls empty and negative", () => {
    expect(normalizeLatency("", "ms").ms).toBeNull();
    expect(normalizeLatency("-5", "ms").ok).toBe(false);
  });
});

describe("runPipeline", () => {
  it("counts 999 as down and quarantines it", () => {
    const res = runPipeline([row({ status_code: "999" })]);
    expect(res.checks[0].isUp).toBe(false);
    expect(res.report.unknownStatus).toBe(1);
  });

  it("collapses agent overlap worst-status-wins", () => {
    const res = runPipeline([
      row({ agent: "agent-1", status_code: "200" }),
      row({ agent: "agent-2", status_code: "500" }),
    ]);
    expect(res.checks).toHaveLength(1);
    expect(res.checks[0].isUp).toBe(false);
    expect(res.checks[0].agentCount).toBe(2);
    expect(res.report.overlapsCollapsed).toBe(1);
  });

  it("suppresses exact dupes", () => {
    const res = runPipeline([row({}), row({})]);
    expect(res.checks).toHaveLength(1);
    expect(res.report.exactDupesSuppressed).toBe(1);
  });

  it("quarantines bad timestamps", () => {
    const res = runPipeline([row({ timestamp: "garbage" })]);
    expect(res.checks).toHaveLength(0);
    expect(res.report.quarantined).toBe(1);
  });
});

describe("SLA math", () => {
  it("flags credit below 99.9%", () => {
    const rows: RawRow[] = [];
    for (let i = 0; i < 999; i++) {
      rows.push(row({ timestamp: `2025-04-10T00:${String(i % 60).padStart(2, "0")}:00Z`, status_code: "200" }));
    }
    // dedupe by slot may collapse minutes; use distinct hours instead for determinism
    const distinct = Array.from({ length: 1000 }, (_, i) =>
      row({
        timestamp: new Date(Date.UTC(2025, 3, 10, 0, 0) + i * 15 * 60 * 1000).toISOString(),
        status_code: i < 998 ? "200" : "500",
      }),
    );
    const res = runPipeline(distinct);
    const s = summarize(res.checks);
    expect(s.total).toBe(1000);
    expect(s.availability).toBeCloseTo(0.998, 5);
    expect(s.creditEligible).toBe(true);
    expect(s.downtimeMin).toBe(2 * 15);
  });

  it("excludes error rows from latency", () => {
    const res = runPipeline([
      row({ status_code: "200", latency: "100" }),
      row({ status_code: "500", latency: "9000", timestamp: "2025-04-10T00:15:00Z" }),
    ]);
    const lat = latencyStats(res.checks);
    expect(lat.n).toBe(1);
    expect(lat.p50).toBe(100);
  });
});
