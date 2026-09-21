"use client";

import { useCallback, useState } from "react";
import UploadCard from "./UploadCard";
import StatsSection from "./StatsSection";
import LogsView, { type InitialLogs } from "./LogsView";
import type { ProcessResult, SummaryResponse } from "./types";

/** Single-screen composition: upload → stats (collapsible) → logs. */
export default function Dashboard() {
  const [result, setResult] = useState<ProcessResult | null>(null);
  const [summary, setSummary] = useState<SummaryResponse | null>(null);
  const [initialLogs, setInitialLogs] = useState<InitialLogs | null>(null);
  const [loadingSummary, setLoadingSummary] = useState(false);

  const handleProcessed = useCallback(async (r: ProcessResult) => {
    setResult(r);
    setSummary(null);
    setInitialLogs(null);
    setLoadingSummary(true);
    try {
      const day = r.dateMin?.slice(0, 10);
      const [sRes, lRes] = await Promise.all([
        fetch(`/api/summary?datasetId=${encodeURIComponent(r.datasetId)}`),
        fetch(
          `/api/logs?datasetId=${encodeURIComponent(r.datasetId)}&from=${day ?? ""}&to=${day ?? ""}&page=1&pageSize=50`,
        ),
      ]);
      if (sRes.ok) setSummary((await sRes.json()) as SummaryResponse);
      if (lRes.ok) {
        const body = await lRes.json();
        setInitialLogs({ rows: body.rows, total: body.total, totalPages: body.totalPages });
      }
    } finally {
      setLoadingSummary(false);
    }
  }, []);

  return (
    <div className="grid grid-cols-1 gap-5 md:grid-cols-2">
      <UploadCard onProcessed={handleProcessed} />

      {result && (
        <section className="neu p-5" aria-label="Upload report">
          <h2 className="text-base font-semibold">Cleaning report</h2>
          <dl className="num mt-2 grid grid-cols-2 gap-x-4 gap-y-1 text-[13px] text-slate-600">
            <dt className="text-slate-400">File</dt>
            <dd className="truncate font-medium text-slate-700">{result.filename}</dd>
            <dt className="text-slate-400">Rows → checks</dt>
            <dd>
              {result.totalRows.toLocaleString()} → {result.keptChecks.toLocaleString()}
            </dd>
            <dt className="text-slate-400">Quarantined</dt>
            <dd>{result.quarantined.toLocaleString()}</dd>
            <dt className="text-slate-400">Dupes / overlaps</dt>
            <dd>
              {result.exactDupesSuppressed} / {result.overlapsCollapsed}
            </dd>
            <dt className="text-slate-400">Epoch fixed</dt>
            <dd>{result.epochFixed}</dd>
            <dt className="text-slate-400">Span</dt>
            <dd className="col-span-1">
              {result.dateMin?.slice(0, 10)} → {result.dateMax?.slice(0, 10)}
            </dd>
          </dl>
          <p className={`pill mt-3 ${result.persistent ? "pill-up" : "pill-warn"}`}>
            {result.persistent ? "Persisted to Supabase" : "Dev-memory mode (add Supabase keys to persist)"}
          </p>
        </section>
      )}

      <StatsSection datasetId={result?.datasetId ?? null} summary={summary} loading={loadingSummary} />

      <LogsView
        key={result?.datasetId ?? "empty"}
        datasetId={result?.datasetId ?? null}
        services={result?.services ?? []}
        dateMin={result?.dateMin ?? null}
        dateMax={result?.dateMax ?? null}
        initialLogs={initialLogs}
      />
    </div>
  );
}
