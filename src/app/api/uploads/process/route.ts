import { NextResponse } from "next/server";
import Papa from "papaparse";
import { runPipeline } from "@/lib/pipeline/pipeline";
import type { RawRow } from "@/lib/pipeline/types";
import { saveDataset, supabaseEnabled } from "@/lib/db/store";

/**
 * POST /api/uploads/process — the stateless serverless function.
 * Runs on Vercel (nodejs runtime), holds no session/local state:
 * CSV in → pure pipeline → Supabase (or dev-memory) → summary out.
 */
export const runtime = "nodejs";
export const maxDuration = 60;

const MAX_BYTES = 10 * 1024 * 1024;

export async function POST(req: Request) {
  try {
    let filename = "upload.csv";
    let csvText = "";

    const contentType = req.headers.get("content-type") ?? "";
    if (contentType.includes("multipart/form-data")) {
      const form = await req.formData();
      const file = form.get("file");
      if (!(file instanceof File)) {
        return NextResponse.json({ error: "Missing 'file' field." }, { status: 400 });
      }
      if (file.size > MAX_BYTES) {
        return NextResponse.json({ error: "File exceeds 10MB limit." }, { status: 413 });
      }
      filename = file.name || filename;
      csvText = await file.text();
    } else {
      const body = (await req.json().catch(() => null)) as {
        csvText?: string;
        filename?: string;
      } | null;
      if (!body?.csvText) {
        return NextResponse.json({ error: "Provide multipart 'file' or JSON { csvText }." }, { status: 400 });
      }
      if (body.csvText.length > MAX_BYTES) {
        return NextResponse.json({ error: "Payload exceeds 10MB limit." }, { status: 413 });
      }
      filename = body.filename || filename;
      csvText = body.csvText;
    }

    if (!csvText.trim()) {
      return NextResponse.json({ error: "Empty file." }, { status: 400 });
    }

    const parsed = Papa.parse<Record<string, string>>(csvText, {
      header: true,
      skipEmptyLines: true,
    });
    if (parsed.errors.length && !parsed.data.length) {
      return NextResponse.json(
        { error: `CSV parse failed: ${parsed.errors[0].message}` },
        { status: 400 },
      );
    }
    const required = ["service_id", "timestamp", "status_code"];
    const cols = new Set(Object.keys(parsed.data[0] ?? {}));
    const missing = required.filter((c) => !cols.has(c));
    if (missing.length) {
      return NextResponse.json(
        { error: `Missing required columns: ${missing.join(", ")}` },
        { status: 400 },
      );
    }

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

    const { checks, quarantine, report } = runPipeline(rows);
    if (!checks.length) {
      return NextResponse.json(
        { error: "No valid checks after cleaning.", quarantined: quarantine.length },
        { status: 422 },
      );
    }

    const saved = await saveDataset(filename, checks, quarantine, report);

    return NextResponse.json({
      datasetId: saved.id,
      filename: saved.filename,
      totalRows: report.totalRows,
      keptChecks: report.keptChecks,
      quarantined: report.quarantined,
      exactDupesSuppressed: report.exactDupesSuppressed,
      overlapsCollapsed: report.overlapsCollapsed,
      epochFixed: report.epochFixed,
      missingLatency: report.missingLatency,
      invalidLatency: report.invalidLatency,
      unknownStatus: report.unknownStatus,
      dateMin: report.dateMin,
      dateMax: report.dateMax,
      services: report.services,
      persistent: saved.persistent,
      supabase: supabaseEnabled(),
    });
  } catch (err) {
    console.error("process upload failed", err);
    return NextResponse.json({ error: "Processing failed. Try again." }, { status: 500 });
  }
}
