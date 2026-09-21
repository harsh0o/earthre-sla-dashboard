// @vitest-environment jsdom
import { afterEach, describe, expect, it } from "vitest";
import { cleanup, render } from "@testing-library/react";
import Dashboard from "@/components/Dashboard";
import LogsView from "@/components/LogsView";
import StatsSection from "@/components/StatsSection";
import UploadCard from "@/components/UploadCard";
import type { SummaryResponse } from "@/components/types";

afterEach(cleanup);

const SUMMARY: SummaryResponse = {
  datasetId: "ds-1",
  filename: "demo.csv",
  persistent: true,
  overall: { total: 192, up: 174, down: 18, downtimeMin: 270, availability: 0.90625, creditEligible: true },
  latency: { n: 170, p50: 140, p95: 220, p99: 310 },
  byService: [
    { serviceId: "svc-auth", serviceName: "auth-api", total: 96, up: 78, down: 18, downtimeMin: 270, availability: 0.8125, creditEligible: true, budgetMin: 43.2, budgetRemainingMin: -226.8, p50: 140, p95: 220, p99: 310 },
    { serviceId: "svc-search", serviceName: "search-api", total: 96, up: 96, down: 0, downtimeMin: 0, availability: 1, creditEligible: false, budgetMin: 43.2, budgetRemainingMin: 43.2, p50: 500, p95: 750, p99: 840 },
  ],
  byMonth: [
    { month: "2025-04", total: 192, up: 174, down: 18, downtimeMin: 270, availability: 0.90625, creditEligible: true },
  ],
  dayKeys: ["2025-04-21", "2025-04-22"],
  daily: [
    { date: "2025-04-21", total: 96, up: 96, down: 0, downtimeMin: 0, availability: 1, creditEligible: false, p95: 700 },
    { date: "2025-04-22", total: 96, up: 78, down: 18, downtimeMin: 270, availability: 0.8125, creditEligible: true, p95: 720 },
  ],
  byServiceDays: {
    "svc-auth": [1, 0.8125],
    "svc-search": [1, 1],
  },
  incidents: [
    { serviceId: "svc-auth", serviceName: "auth-api", date: "2025-04-22", total: 48, up: 30, down: 18, downtimeMin: 270, availability: 0.8125, creditEligible: true },
  ],
  quality: { quarantined: 3, exactDupes: 1, overlaps: 2, epochFixed: 1, missingLatency: 1, invalidLatency: 0, unknownStatus: 0 },
  span: { from: "2025-04-21T00:00:00.000Z", to: "2025-04-22T23:45:00.000Z" },
};

describe("Dashboard (empty state)", () => {
  it("renders upload, stats prompt, and logs placeholder", () => {
    const { container } = render(<Dashboard />);
    const text = container.textContent ?? "";
    expect(text).toContain("Upload health-check CSV");
    expect(text).toContain("Availability vs 99.9% SLA");
    expect(text).toContain("Check logs");
    expect(text).toContain("Previous uploads");
  });
});

describe("UploadCard", () => {
  it("renders the dropzone with the function contract", () => {
    const { container } = render(<UploadCard onProcessed={() => undefined} />);
    const text = container.textContent ?? "";
    expect(text).toContain("Drop a CSV here");
    expect(text).toContain("POST /api/uploads/process");
  });
});

describe("StatsSection", () => {
  it("shows the verdict, services, heat legend, and incidents", () => {
    const { container } = render(<StatsSection datasetId="ds-1" summary={SUMMARY} loading={false} />);
    const text = container.textContent ?? "";
    expect(text).toContain("Credit eligible");
    expect(text).toContain("90.625%");
    expect(text).toContain("auth-api");
    expect(text).toContain("search-api");
    expect(text).toContain("2025-04-22");
    expect(text).toContain("81.25%");
    expect(text).toContain("Pipeline quality");
  });

  it("collapses on toggle", () => {
    const { container } = render(<StatsSection datasetId="ds-1" summary={SUMMARY} loading={false} />);
    const btn = container.querySelector('button[aria-expanded="true"]');
    expect(btn?.textContent).toContain("Collapse");
  });
});

describe("LogsView", () => {
  it("explains the empty state before any upload", () => {
    const { container } = render(
      <LogsView datasetId={null} services={[]} dateMin={null} dateMax={null} initialLogs={null} />,
    );
    expect(container.textContent).toContain("Every underlying check appears here");
  });

  it("renders provided rows with status language", () => {
    const { container } = render(
      <LogsView
        datasetId="ds-1"
        services={["svc-auth"]}
        dateMin="2025-04-22T00:00:00.000Z"
        dateMax="2025-04-22T23:45:00.000Z"
        initialLogs={{
          rows: [
            { serviceId: "svc-auth", serviceName: "auth-api", ts: "2025-04-22T04:00:00.000Z", statusCode: 500, isUp: false, latencyMs: 180, agent: "agent-1", agents: ["agent-1"], agentCount: 1, region: "ap-south-1", flags: ["error-status"] },
          ],
          total: 1,
          totalPages: 1,
        }}
      />,
    );
    const text = container.textContent ?? "";
    expect(text).toContain("500");
    expect(text).toContain("2025-04-22");
    expect(text).toContain("error-status");
  });
});
