import { beforeEach, describe, expect, it } from "vitest";
import { GET as datasetsGET } from "@/app/api/datasets/route";
import { GET as logsGET, parseBound } from "@/app/api/logs/route";
import { GET as summaryGET } from "@/app/api/summary/route";
import { POST as processPOST } from "@/app/api/uploads/process/route";

function ensureMemoryBackend() {
  delete process.env.NEXT_PUBLIC_SUPABASE_URL;
  delete process.env.SUPABASE_URL;
  delete process.env.NEXT_PUBLIC_SUPABASE_ANON_KEY;
  delete process.env.SUPABASE_SERVICE_ROLE_KEY;
}

const CSV = [
  "service_id,service_name,timestamp,status_code,latency,latency_unit,agent,region",
  "svc-a,a-api,2025-04-10T00:00:00Z,200,100,ms,agent-1,r1",
  "svc-a,a-api,2025-04-10T00:00:00Z,200,100,ms,agent-1,r1",
  "svc-a,a-api,2025-04-10T00:00:00Z,500,120,ms,agent-2,r1",
  "svc-a,a-api,2025-04-10T00:15:00Z,200,0.2,s,agent-1,r1",
  "svc-a,a-api,1743980400,200,50,ms,agent-1,r1",
  "svc-b,b-api,2025-04-10T00:00:00Z,999,10,ms,agent-1,r1",
  "svc-b,b-api,2025-04-10T00:15:00Z,200,,ms,agent-1,r1",
].join("\n");

function req(url: string, init?: RequestInit): Request {
  return new Request(url, init);
}

async function uploadJson(csvText: string, filename = "t.csv") {
  const res = await processPOST(
    req("http://x/api/uploads/process", {
      method: "POST",
      headers: { "content-type": "application/json" },
      body: JSON.stringify({ csvText, filename }),
    }),
  );
  return { status: res.status, body: (await res.json()) as Record<string, never> };
}

describe("POST /api/uploads/process", () => {
  beforeEach(ensureMemoryBackend);

  it("cleans a messy CSV deterministically", async () => {
    const { status, body } = await uploadJson(CSV);
    expect(status).toBe(200);
    expect(body).toMatchObject({
      totalRows: 7,
      keptChecks: 5,
      exactDupesSuppressed: 1,
      overlapsCollapsed: 1,
      epochFixed: 1,
      missingLatency: 1,
      unknownStatus: 1,
      persistent: false,
    });
    expect(body.services).toEqual(["svc-a", "svc-b"]);
  });

  it("accepts multipart uploads", async () => {
    const fd = new FormData();
    fd.append("file", new File([CSV], "m.csv", { type: "text/csv" }));
    const res = await processPOST(req("http://x/api/uploads/process", { method: "POST", body: fd }));
    expect(res.status).toBe(200);
    expect(((await res.json()) as { keptChecks: number }).keptChecks).toBe(5);
  });

  it("rejects empty, headerless, and oversize payloads", async () => {
    expect((await uploadJson("   ")).status).toBe(400);
    expect((await uploadJson("a,b,c\n1,2,3")).status).toBe(400);
    expect((await uploadJson("x".repeat(11 * 1024 * 1024))).status).toBe(413);
  });
});

describe("GET /api/summary", () => {
  beforeEach(ensureMemoryBackend);

  it("validates datasetId", async () => {
    expect((await summaryGET(req("http://x/api/summary"))).status).toBe(400);
    expect((await summaryGET(req("http://x/api/summary?datasetId=nope"))).status).toBe(404);
  });

  it("aggregates availability, latency, months, days, and incidents", async () => {
    const { body } = await uploadJson(CSV);
    const res = await summaryGET(req(`http://x/api/summary?datasetId=${body.datasetId as string}`));
    expect(res.status).toBe(200);
    const s = (await res.json()) as {
      overall: { total: number; up: number; down: number; availability: number; creditEligible: boolean };
      latency: { n: number };
      byService: { serviceId: string }[];
      byMonth: { month: string }[];
      dayKeys: string[];
      daily: { date: string }[];
      byServiceDays: Record<string, (number | null)[]>;
      incidents: { serviceId: string; date: string }[];
      quality: { exactDupes: number; overlaps: number };
    };
    expect(s.overall).toMatchObject({ total: 5, up: 3, down: 2, creditEligible: true });
    expect(s.overall.availability).toBeCloseTo(0.6, 5);
    expect(s.latency.n).toBe(2); // only up rows with valid latency (200ms via s, 50ms epoch)
    expect(s.byService.map((x) => x.serviceId)).toEqual(["svc-a", "svc-b"]);
    expect(s.byMonth.map((x) => x.month)).toEqual(["2025-04"]);
    expect(s.dayKeys).toEqual(["2025-04-06", "2025-04-10"]);
    expect(s.daily.map((x) => x.date)).toEqual(["2025-04-06", "2025-04-10"]);
    expect(Object.keys(s.byServiceDays).sort()).toEqual(["svc-a", "svc-b"]);
    expect(s.byServiceDays["svc-a"]).toHaveLength(2);
    expect(s.quality).toMatchObject({ exactDupes: 1, overlaps: 1 });
    // svc-a and svc-b tie at 50% on 04-10; deterministic tie-break: more down, then serviceId
    expect(s.incidents.map((g) => [g.serviceId, g.date])).toEqual([
      ["svc-a", "2025-04-10"],
      ["svc-b", "2025-04-10"],
    ]);
  });
});

describe("GET /api/logs", () => {
  beforeEach(ensureMemoryBackend);

  async function id(): Promise<string> {
    return (await uploadJson(CSV)).body.datasetId as string;
  }

  it("validates datasetId", async () => {
    expect((await logsGET(req("http://x/api/logs"))).status).toBe(400);
    expect((await logsGET(req("http://x/api/logs?datasetId=nope"))).status).toBe(404);
  });

  it("filters by single day, range, service, and status", async () => {
    const datasetId = await id();
    const get = async (q: string) =>
      (
        (await logsGET(req(`http://x/api/logs?datasetId=${datasetId}&${q}`))).json()
      ) as Promise<{ rows: { serviceId: string; isUp: boolean; ts: string }[]; total: number; page: number; totalPages: number }>;

    expect((await get("from=2025-04-10&to=2025-04-10")).total).toBe(4);
    expect((await get("from=2025-04-06&to=2025-04-10")).total).toBe(5);
    expect((await get("service=svc-b")).total).toBe(2);
    const down = await get("status=down");
    expect(down.total).toBe(2);
    expect(down.rows.every((r) => !r.isUp)).toBe(true);
    const combo = await get("from=2025-04-10&to=2025-04-10&service=svc-a&status=up");
    expect(combo.total).toBe(1);
    expect(combo.rows[0].ts).toBe("2025-04-10T00:15:00.000Z");
  });

  it("paginates and clamps out-of-range pages", async () => {
    const datasetId = await id();
    const get = async (q: string) =>
      (
        (await logsGET(req(`http://x/api/logs?datasetId=${datasetId}&${q}`))).json()
      ) as Promise<{ rows: unknown[]; total: number; page: number; totalPages: number; pageSize: number }>;
    const p1 = await get("pageSize=2&page=1");
    expect(p1.rows).toHaveLength(2);
    expect(p1.totalPages).toBe(3);
    const far = await get("pageSize=2&page=99");
    expect(far.page).toBe(3);
    expect(far.rows).toHaveLength(1);
    const clamped = await get("pageSize=500");
    expect(clamped.pageSize).toBe(200);
  });
});

describe("GET /api/datasets", () => {
  beforeEach(ensureMemoryBackend);

  it("lists recent uploads", async () => {
    const { body } = await uploadJson(CSV, "listed.csv");
    const res = await datasetsGET();
    expect(res.status).toBe(200);
    const list = ((await res.json()) as { datasets: { id: string; filename: string }[] }).datasets;
    expect(list.map((d) => d.id)).toContain(body.datasetId as string);
    expect(list.find((d) => d.id === body.datasetId)?.filename).toBe("listed.csv");
  });
});

describe("parseBound", () => {
  it("expands date-only input to whole UTC days", () => {
    expect(parseBound("2025-04-10", "start")).toBe("2025-04-10T00:00:00.000Z");
    expect(parseBound("2025-04-10", "end")).toBe("2025-04-10T23:59:59.999Z");
  });
  it("passes datetimes through and rejects garbage", () => {
    expect(parseBound("2025-04-10T12:00:00Z", "start")).toBe("2025-04-10T12:00:00.000Z");
    expect(parseBound("nope", "start")).toBeNull();
    expect(parseBound(null, "start")).toBeNull();
    expect(parseBound("   ", "end")).toBeNull();
  });
});
