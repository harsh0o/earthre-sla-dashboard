import { describe, expect, it } from "vitest";
import { fmtInt, fmtMs, fmtPct, fmtTs } from "@/components/types";
import { heatColor, heatLabel } from "@/components/viz";

describe("formatters", () => {
  it("formats availability to 3 decimals", () => {
    expect(fmtPct(0.999)).toBe("99.900%");
    expect(fmtPct(1)).toBe("100.000%");
    expect(fmtPct(0.8125)).toBe("81.250%");
  });
  it("groups thousands", () => {
    expect(fmtInt(14400)).toBe("14,400");
  });
  it("renders latency with em-dash fallback", () => {
    expect(fmtMs(null)).toBe("—");
    expect(fmtMs(486.4)).toBe("486 ms");
  });
  it("compacts ISO timestamps", () => {
    expect(fmtTs("2025-04-22T04:00:00.000Z")).toBe("2025-04-22 04:00:00Z");
  });
});

describe("heat scale", () => {
  it("maps SLA bands to distinct colors", () => {
    expect(heatColor(1)).toBe("#059669");
    expect(heatColor(0.9995)).toBe("#34d399");
    expect(heatColor(0.995)).toBe("#fbbf24");
    expect(heatColor(0.97)).toBe("#f97316");
    expect(heatColor(0.5)).toBe("#ef4444");
    expect(heatColor(null)).toBe("#e6eaf0");
  });
  it("labels cells incl. empty", () => {
    expect(heatLabel(1)).toBe("100.00% available");
    expect(heatLabel(null)).toBe("no data");
  });
});
