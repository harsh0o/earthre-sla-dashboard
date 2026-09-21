import { describe, expect, it } from "vitest";
import {
  canonicalizeTimestamp,
  daysInMonth,
  latencyStats,
  monthKey,
  normalizeLatency,
  percentile,
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
  it("parses ISO Zulu", () => {
    expect(canonicalizeTimestamp("2025-04-10T00:00:00Z").iso).toBe("2025-04-10T00:00:00.000Z");
  });
  it("converts offsets to UTC", () => {
    // 05:30 +05:30 == 00:00Z
    expect(canonicalizeTimestamp("2025-04-10T05:30:00+05:30").iso).toBe("2025-04-10T00:00:00.000Z");
  });
  it("parses epoch seconds and flags the repair", () => {
    const r = canonicalizeTimestamp("1746938700");
    expect(r.epochFixed).toBe(true);
    expect(r.iso).toBe(new Date(1746938700 * 1000).toISOString());
  });
  it("rejects garbage, blanks, and epoch-millis", () => {
    expect(canonicalizeTimestamp("not-a-date").iso).toBeNull();
    expect(canonicalizeTimestamp("").iso).toBeNull();
    expect(canonicalizeTimestamp("1746938700123").iso).toBeNull(); // 13-digit millis unsupported by design
  });
  it("trims whitespace", () => {
    expect(canonicalizeTimestamp("  2025-04-10T00:00:00Z  ").iso).toBe("2025-04-10T00:00:00.000Z");
  });
});

describe("normalizeLatency", () => {
  it("converts seconds to ms", () => {
    expect(normalizeLatency("0.486", "s").ms).toBe(486);
  });
  it("accepts uppercase unit", () => {
    expect(normalizeLatency("1", "S").ms).toBe(1000);
  });
  it("keeps ms and trims", () => {
    expect(normalizeLatency(" 258 ", "ms").ms).toBe(258);
  });
  it("nulls empty, non-numeric, negative, and NaN", () => {
    expect(normalizeLatency("", "ms")).toMatchObject({ ms: null, ok: false });
    expect(normalizeLatency("abc", "ms").ok).toBe(false);
    expect(normalizeLatency("-5", "ms")).toMatchObject({ ms: null, ok: false, reason: "invalid" });
    expect(normalizeLatency("NaN", "ms").ok).toBe(false);
  });
  it("treats zero as valid", () => {
    expect(normalizeLatency("0", "ms")).toMatchObject({ ms: 0, ok: true });
  });
});

describe("runPipeline: status semantics", () => {
  it.each(["200", "201", "204", "299"])("counts %s as UP", (code) => {
    expect(runPipeline([row({ status_code: code })]).checks[0].isUp).toBe(true);
  });
  it.each(["500", "502", "503", "999", "301", "", "abc"])("counts '%s' as DOWN", (code) => {
    expect(runPipeline([row({ status_code: code })]).checks[0].isUp).toBe(false);
  });
  it("flags unknown status 999 and quarantines a note without dropping the check", () => {
    const res = runPipeline([row({ status_code: "999" })]);
    expect(res.checks).toHaveLength(1);
    expect(res.checks[0].flags).toContain("unknown-status");
    expect(res.report.unknownStatus).toBe(1);
    expect(res.quarantine.some((q) => q.reason === "unknown_status")).toBe(true);
  });
});

describe("runPipeline: field defaults and quarantine", () => {
  it("quarantines rows with bad timestamps or missing service", () => {
    const res = runPipeline([row({ timestamp: "garbage" }), row({ service_id: "" })]);
    expect(res.checks).toHaveLength(0);
    expect(res.report.quarantined).toBe(2);
    expect(res.quarantine.every((q) => q.reason === "bad_timestamp")).toBe(true);
  });
  it("keeps missing-latency checks for availability but excludes them from stats", () => {
    const res = runPipeline([row({ latency: "" })]);
    expect(res.checks).toHaveLength(1);
    expect(res.checks[0].latencyMs).toBeNull();
    expect(res.report.missingLatency).toBe(1);
    expect(latencyStats(res.checks).n).toBe(0);
  });
  it("nulls negative latency with an invalid-latency flag", () => {
    const res = runPipeline([row({ latency: "-296" })]);
    expect(res.checks[0].latencyMs).toBeNull();
    expect(res.checks[0].flags).toContain("invalid-latency");
    expect(res.report.invalidLatency).toBe(1);
  });
  it("defaults agent/region and falls back service_name to service_id", () => {
    const res = runPipeline([row({ agent: "", region: "", service_name: "" })]);
    expect(res.checks[0].agent).toBe("agent-1");
    expect(res.checks[0].region).toBe("ap-south-1");
    expect(res.checks[0].serviceName).toBe("svc-auth");
  });
  it("marks epoch-repaired rows", () => {
    const res = runPipeline([row({ timestamp: "1746938700" })]);
    expect(res.checks[0].flags).toContain("epoch-fix");
    expect(res.report.epochFixed).toBe(1);
  });
});

describe("runPipeline: dedupe", () => {
  it("suppresses exact dupes", () => {
    const res = runPipeline([row({}), row({})]);
    expect(res.checks).toHaveLength(1);
    expect(res.report.exactDupesSuppressed).toBe(1);
  });
  it("does not treat different latencies as exact dupes", () => {
    const res = runPipeline([row({ latency: "100" }), row({ latency: "101" })]);
    // same slot, same agent → collapsed as overlap, not exact dupe
    expect(res.report.exactDupesSuppressed).toBe(0);
    expect(res.checks).toHaveLength(1);
  });
  it("collapses same-status overlaps and merges agents", () => {
    const res = runPipeline([
      row({ agent: "agent-1", status_code: "200" }),
      row({ agent: "agent-2", status_code: "200" }),
    ]);
    expect(res.checks).toHaveLength(1);
    expect(res.checks[0].agent).toBe("agent-1");
    expect(res.checks[0].agentCount).toBe(2);
    expect(res.checks[0].agents).toEqual(expect.arrayContaining(["agent-1", "agent-2"]));
    expect(res.report.overlapsCollapsed).toBe(1);
  });
  it("worst-status-wins regardless of agent preference", () => {
    const down2 = runPipeline([
      row({ agent: "agent-1", status_code: "200" }),
      row({ agent: "agent-2", status_code: "500" }),
    ]);
    expect(down2.checks[0].isUp).toBe(false);
    const down1 = runPipeline([
      row({ agent: "agent-1", status_code: "503" }),
      row({ agent: "agent-2", status_code: "200" }),
    ]);
    expect(down1.checks[0].isUp).toBe(false);
    expect(down1.checks[0].agent).toBe("agent-1");
    expect(
      down1.quarantine.some((q) => q.reason === "status_conflict"),
    ).toBe(true);
  });
  it("sorts canonical checks by timestamp then service", () => {
    const res = runPipeline([
      row({ timestamp: "2025-04-10T00:15:00Z", service_id: "svc-b" }),
      row({ timestamp: "2025-04-10T00:00:00Z", service_id: "svc-a" }),
      row({ timestamp: "2025-04-10T00:00:00Z", service_id: "svc-b" }),
    ]);
    expect(res.checks.map((c) => `${c.ts} ${c.serviceId}`)).toEqual([
      "2025-04-10T00:00:00.000Z svc-a",
      "2025-04-10T00:00:00.000Z svc-b",
      "2025-04-10T00:15:00.000Z svc-b",
    ]);
  });
  it("reports span and service list", () => {
    const res = runPipeline([
      row({ timestamp: "2025-04-10T00:00:00Z", service_id: "svc-b" }),
      row({ timestamp: "2025-04-11T00:00:00Z", service_id: "svc-a" }),
    ]);
    expect(res.report.dateMin).toBe("2025-04-10T00:00:00.000Z");
    expect(res.report.dateMax).toBe("2025-04-11T00:00:00.000Z");
    expect(res.report.services).toEqual(["svc-a", "svc-b"]);
  });
});

describe("SLA math", () => {
  function thousandWithTwoDown(): RawRow[] {
    return Array.from({ length: 1000 }, (_, i) => {
      const ts = new Date(Date.UTC(2025, 3, 10) + i * 15 * 60 * 1000).toISOString();
      return row({ timestamp: ts, status_code: i < 998 ? "200" : "500" });
    });
  }
  it("flags credit below 99.9% with 15-min downtime accounting", () => {
    const res = runPipeline(thousandWithTwoDown());
    const s = summarize(res.checks);
    expect(s.total).toBe(1000);
    expect(s.availability).toBeCloseTo(0.998, 5);
    expect(s.creditEligible).toBe(true);
    expect(s.downtimeMin).toBe(30);
  });
  it("is not eligible at exactly 100%", () => {
    const s = summarize(runPipeline([row({})]).checks);
    expect(s.creditEligible).toBe(false);
  });
  it("handles empty input sanely", () => {
    expect(summarize([])).toMatchObject({ total: 0, availability: 1, creditEligible: false });
    expect(latencyStats([])).toMatchObject({ n: 0, p50: null, p95: null, p99: null });
  });
  it("excludes error and invalid rows from latency", () => {
    const res = runPipeline([
      row({ status_code: "200", latency: "100" }),
      row({ status_code: "500", latency: "9000", timestamp: "2025-04-10T00:15:00Z" }),
      row({ status_code: "200", latency: "-5", timestamp: "2025-04-10T00:30:00Z" }),
    ]);
    const lat = latencyStats(res.checks);
    expect(lat.n).toBe(1);
    expect(lat.p50).toBe(100);
  });
});

describe("percentile / month helpers", () => {
  it("returns null on empty, exact on single", () => {
    expect(percentile([], 95)).toBeNull();
    expect(percentile([7], 95)).toBe(7);
  });
  it("picks nearest-rank values", () => {
    const v = [10, 20, 30, 40, 50, 60, 70, 80, 90, 100];
    expect(percentile(v, 50)).toBe(50);
    expect(percentile(v, 95)).toBe(100);
  });
  it("buckets calendar months incl. leap February", () => {
    expect(monthKey("2025-04-22T04:00:00.000Z")).toBe("2025-04");
    expect(daysInMonth("2025-04")).toBe(30);
    expect(daysInMonth("2024-02")).toBe(29);
    expect(daysInMonth("2025-02")).toBe(28);
  });
});
