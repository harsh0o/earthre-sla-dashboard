"use client";

import { useCallback, useState } from "react";
import UploadCard from "./UploadCard";
import StatsSection from "./StatsSection";
import LogsView, { type InitialLogs } from "./LogsView";
import type { ProcessResult, SummaryResponse } from "./types";

interface HistoryEntry {
  id: string;
  filename: string;
  uploadedAt: string;
  keptChecks: number;
}

/** Single-screen composition: upload → stats (collapsible) → logs. */
export default function Dashboard() {
  const [result, setResult] = useState<ProcessResult | null>(null);
  const [summary, setSummary] = useState<SummaryResponse | null>(null);
  const [initialLogs, setInitialLogs] = useState<InitialLogs | null>(null);
  const [loadingSummary, setLoadingSummary] = useState(false);
  const [history, setHistory] = useState<HistoryEntry[] | null>(null);
  const [loadingHistory, setLoadingHistory] = useState(false);

  const loadDataset = useCallback(async (datasetId: string, meta: Omit<ProcessResult, "datasetId"> | null) => {
    setLoadingSummary(true);
    try {
      const sRes = await fetch(`/api/summary?datasetId=${encodeURIComponent(datasetId)}`);
      if (!sRes.ok) return;
      const s = (await sRes.json()) as SummaryResponse;
      const day = meta?.dateMin?.slice(0, 10) ?? s.span.from?.slice(0, 10) ?? "";
      const lRes = await fetch(
        `/api/logs?datasetId=${encodeURIComponent(datasetId)}&from=${day}&to=${day}&page=1&pageSize=50`,
      );
      const resolved: ProcessResult = meta
        ? { datasetId, ...meta }
        : {
            datasetId,
            filename: s.filename,
            totalRows: s.overall.total,
            keptChecks: s.overall.total,
            quarantined: s.quality.quarantined,
            exactDupesSuppressed: s.quality.exactDupes,
            overlapsCollapsed: s.quality.overlaps,
            epochFixed: s.quality.epochFixed,
            missingLatency: s.quality.missingLatency,
            invalidLatency: s.quality.invalidLatency,
            unknownStatus: s.quality.unknownStatus,
            dateMin: s.span.from,
            dateMax: s.span.to,
            services: s.byService.map((x) => x.serviceId),
            persistent: s.persistent,
          };
      setResult(resolved);
      setSummary(s);
      if (lRes.ok) {
        const body = await lRes.json();
        setInitialLogs({ rows: body.rows, total: body.total, totalPages: body.totalPages });
      } else {
        setInitialLogs({ rows: [], total: 0, totalPages: 1 });
      }
    } finally {
      setLoadingSummary(false);
    }
  }, []);

  const handleProcessed = useCallback(
    async (r: ProcessResult) => {
      const { datasetId, ...meta } = r;
      await loadDataset(datasetId, meta);
    },
    [loadDataset],
  );

  /** History is loaded on explicit click (no fetch effects anywhere in the UI). */
  async function showHistory() {
    if (history) {
      setHistory(null);
      return;
    }
    setLoadingHistory(true);
    try {
      const res = await fetch("/api/datasets");
      if (res.ok) setHistory(((await res.json()).datasets as HistoryEntry[]) ?? []);
    } finally {
      setLoadingHistory(false);
    }
  }

  return (
    <div>
      <div className="mb-4 flex items-center justify-end">
        <button onClick={() => void showHistory()} className="btn btn-ghost" aria-expanded={history != null}>
          {loadingHistory ? "Loading…" : history ? "Hide previous uploads" : "Previous uploads"}
        </button>
      </div>

      {history && (
        <div className="card mb-4 p-3" aria-label="Previous uploads">
          {history.length === 0 && (
            <p className="px-2 py-1 text-[13px] text-slate-500">No uploads yet in this environment.</p>
          )}
          <ul className="divide-y divide-slate-100">
            {history.map((h) => (
              <li key={h.id}>
                <button
                  onClick={() => void loadDataset(h.id, null)}
                  className={`flex w-full items-center justify-between gap-3 rounded-lg px-3 py-2 text-left text-[13px] hover:bg-slate-50 ${
                    result?.datasetId === h.id ? "bg-slate-50" : ""
                  }`}
                >
                  <span className="min-w-0">
                    <b className="block truncate font-semibold">{h.filename}</b>
                    <span className="mono text-[11.5px] text-slate-400">
                      {h.uploadedAt.replace("T", " ").slice(0, 19)}Z · {h.keptChecks.toLocaleString()} checks
                    </span>
                  </span>
                  {result?.datasetId === h.id && <span className="pill pill-info">open</span>}
                </button>
              </li>
            ))}
          </ul>
        </div>
      )}

      <div className="grid grid-cols-1 gap-5 md:grid-cols-2">
        <UploadCard onProcessed={handleProcessed} />

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
    </div>
  );
}
