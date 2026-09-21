import { beforeEach, describe, expect, it } from "vitest";
import { getDataset, listDatasets, saveDataset } from "@/lib/db/store";
import { runPipeline } from "@/lib/pipeline/pipeline";
import type { RawRow } from "@/lib/pipeline/types";

function ensureMemoryBackend() {
  delete process.env.NEXT_PUBLIC_SUPABASE_URL;
  delete process.env.SUPABASE_URL;
  delete process.env.NEXT_PUBLIC_SUPABASE_ANON_KEY;
  delete process.env.SUPABASE_SERVICE_ROLE_KEY;
}

const SAMPLE: RawRow[] = [
  { service_id: "s", service_name: "s", timestamp: "2025-01-01T00:00:00Z", status_code: "200", latency: "1", latency_unit: "ms", agent: "a", region: "r" },
];

describe("store (memory fallback)", () => {
  beforeEach(ensureMemoryBackend);

  it("round-trips a dataset with its full report", async () => {
    const { checks, quarantine, report } = runPipeline(SAMPLE);
    const saved = await saveDataset("f.csv", checks, quarantine, report);
    expect(saved.persistent).toBe(false);
    expect(saved.report.keptChecks).toBe(1);

    const loaded = await getDataset(saved.id);
    expect(loaded?.filename).toBe("f.csv");
    expect(loaded?.checks).toHaveLength(1);
    expect(loaded?.report.keptChecks).toBe(1);
  });

  it("returns null for unknown ids and lists recent uploads", async () => {
    expect(await getDataset("does-not-exist")).toBeNull();
    const { checks, quarantine, report } = runPipeline(SAMPLE);
    const saved = await saveDataset("g.csv", checks, quarantine, report);
    const list = await listDatasets();
    expect(list.map((d) => d.id)).toContain(saved.id);
    expect(list.find((d) => d.id === saved.id)).toMatchObject({ filename: "g.csv", keptChecks: 1 });
  });
});
