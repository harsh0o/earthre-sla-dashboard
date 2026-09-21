"use client";

import { useState } from "react";
import type { LogRow } from "./types";
import { fmtMs, fmtTs } from "./types";

export interface InitialLogs {
  rows: LogRow[];
  total: number;
  totalPages: number;
}

interface Props {
  datasetId: string | null;
  services: string[];
  dateMin: string | null;
  dateMax: string | null;
  /** First page, fetched by Dashboard right after upload (no fetch effect here). */
  initialLogs: InitialLogs | null;
}

type Mode = "single" | "range";
type Status = "all" | "up" | "down";

/** Filterable logs view: single date OR date range + service + status, paginated. */
export default function LogsView({ datasetId, services, dateMin, dateMax, initialLogs }: Props) {
  const [mode, setMode] = useState<Mode>("single");
  // null = not customized yet → derive from the dataset span during render.
  const [day, setDay] = useState<string | null>(null);
  const [from, setFrom] = useState<string | null>(null);
  const [to, setTo] = useState<string | null>(null);
  const [svc, setSvc] = useState<string[]>([]);
  const [status, setStatus] = useState<Status>("all");
  const [page, setPage] = useState(1);
  const [rows, setRows] = useState<LogRow[]>(initialLogs?.rows ?? []);
  const [total, setTotal] = useState(initialLogs?.total ?? 0);
  const [totalPages, setTotalPages] = useState(initialLogs?.totalPages ?? 1);
  const [busy, setBusy] = useState(false);

  const effDay = day ?? dateMin?.slice(0, 10) ?? "";
  const effFrom = from ?? dateMin?.slice(0, 10) ?? "";
  const effTo = to ?? dateMax?.slice(0, 10) ?? dateMin?.slice(0, 10) ?? "";

  /** All fetching is user-initiated (Apply / Prev / Next) — no fetch effects. */
  async function fetchLogs(p: number) {
    if (!datasetId) return;
    setBusy(true);
    try {
      const q = new URLSearchParams({ datasetId, page: String(p), pageSize: "50" });
      if (mode === "single" && effDay) {
        q.set("from", effDay);
        q.set("to", effDay);
      } else {
        if (effFrom) q.set("from", effFrom);
        if (effTo) q.set("to", effTo);
      }
      if (svc.length) q.set("service", svc.join(","));
      q.set("status", status);
      const res = await fetch(`/api/logs?${q.toString()}`);
      const body = await res.json();
      if (res.ok) {
        setRows(body.rows);
        setTotal(body.total);
        setTotalPages(body.totalPages);
        setPage(body.page);
      }
    } finally {
      setBusy(false);
    }
  }

  function toggleSvc(id: string) {
    setSvc((prev) => (prev.includes(id) ? prev.filter((s) => s !== id) : [...prev, id]));
  }

  if (!datasetId) {
    return (
      <section className="neu p-5 md:col-span-2" aria-label="Logs">
        <h2 className="text-base font-semibold">Logs</h2>
        <p className="mt-2 text-sm text-slate-500">
          Underlying check records will appear here after an upload — filterable by a single
          date or a date range.
        </p>
      </section>
    );
  }

  return (
    <section className="neu p-5 md:col-span-2" aria-label="Logs">
      <div className="flex flex-wrap items-center justify-between gap-3">
        <h2 className="text-base font-semibold">
          Logs <span className="num text-sm font-normal text-slate-400">({total.toLocaleString()} matching)</span>
        </h2>
        <div className="neu-inset flex rounded-[10px] p-1 text-sm font-medium" role="tablist" aria-label="Date mode">
          {(["single", "range"] as Mode[]).map((m) => (
            <button
              key={m}
              role="tab"
              aria-selected={mode === m}
              onClick={() => setMode(m)}
              className={`rounded-lg px-3 py-1 ${mode === m ? "bg-white shadow text-slate-800" : "text-slate-500"}`}
            >
              {m === "single" ? "Single day" : "Date range"}
            </button>
          ))}
        </div>
      </div>

      <div className="mt-4 grid grid-cols-1 gap-3 md:grid-cols-[auto_auto_1fr_auto]">
        {mode === "single" ? (
          <label className="text-sm text-slate-600">
            Date{" "}
            <input
              type="date"
              value={effDay}
              onChange={(e) => setDay(e.target.value)}
              className="neu-inset num ml-1 px-2 py-1 text-sm"
            />
          </label>
        ) : (
          <div className="flex flex-wrap items-center gap-2 text-sm text-slate-600">
            <label>
              From{" "}
              <input
                type="date"
                value={effFrom}
                onChange={(e) => setFrom(e.target.value)}
                className="neu-inset num px-2 py-1 text-sm"
              />
            </label>
            <label>
              To{" "}
              <input
                type="date"
                value={effTo}
                onChange={(e) => setTo(e.target.value)}
                className="neu-inset num px-2 py-1 text-sm"
              />
            </label>
          </div>
        )}

        <div className="flex flex-wrap items-center gap-1.5" aria-label="Service filter">
          {services.map((s) => (
            <button
              key={s}
              onClick={() => toggleSvc(s)}
              aria-pressed={svc.includes(s)}
              className={`pill ${svc.includes(s) ? "pill-info" : "pill-mute"}`}
            >
              {s}
            </button>
          ))}
        </div>

        <div className="flex items-center gap-1.5" aria-label="Status filter">
          {(["all", "up", "down"] as Status[]).map((s) => (
            <button
              key={s}
              onClick={() => setStatus(s)}
              aria-pressed={status === s}
              className={`pill ${status === s ? "pill-info" : "pill-mute"}`}
            >
              {s === "all" ? "All" : s === "up" ? "Up" : "Down"}
            </button>
          ))}
        </div>

        <button
          onClick={() => void fetchLogs(1)}
          disabled={busy}
          className="neu-btn px-4 py-1.5 text-sm font-semibold text-slate-700 disabled:opacity-50"
        >
          {busy ? "Loading…" : "Apply"}
        </button>
      </div>

      <div className="mt-4 overflow-x-auto">
        <table className="w-full min-w-[820px] text-left text-[13px]">
          <thead>
            <tr className="text-xs uppercase tracking-wide text-slate-400">
              <th className="py-2 pr-3 font-medium">Timestamp (UTC)</th>
              <th className="py-2 pr-3 font-medium">Service</th>
              <th className="py-2 pr-3 font-medium">Status</th>
              <th className="py-2 pr-3 font-medium">Latency</th>
              <th className="py-2 pr-3 font-medium">Agent</th>
              <th className="py-2 pr-3 font-medium">Region</th>
              <th className="py-2 font-medium">Flags</th>
            </tr>
          </thead>
          <tbody>
            {rows.map((r, i) => (
              <tr
                key={`${r.ts}-${r.serviceId}-${i}`}
                className={`border-t border-slate-300/50 ${r.isUp ? "" : "bg-red-50/50"}`}
              >
                <td className="num whitespace-nowrap py-1.5 pr-3 text-slate-600">{fmtTs(r.ts)}</td>
                <td className="whitespace-nowrap py-1.5 pr-3 font-medium">{r.serviceId}</td>
                <td className="py-1.5 pr-3">
                  <span className={`pill ${r.isUp ? "pill-up" : "pill-down"}`}>{r.statusCode}</span>
                </td>
                <td className="num py-1.5 pr-3 text-slate-600">{fmtMs(r.latencyMs)}</td>
                <td className="num py-1.5 pr-3 text-slate-600">
                  {r.agent}
                  {r.agentCount > 1 && <span className="pill pill-mute ml-1">×{r.agentCount}</span>}
                </td>
                <td className="py-1.5 pr-3 text-slate-500">{r.region}</td>
                <td className="py-1.5">
                  {r.flags.length ? (
                    <span className="pill pill-warn">{r.flags.join(", ")}</span>
                  ) : (
                    <span className="text-slate-300">—</span>
                  )}
                </td>
              </tr>
            ))}
            {!rows.length && !busy && (
              <tr>
                <td colSpan={7} className="py-6 text-center text-sm text-slate-400">
                  No checks in this range. Adjust the date or filters.
                </td>
              </tr>
            )}
          </tbody>
        </table>
      </div>

      <div className="mt-3 flex items-center justify-between text-sm text-slate-500">
        <p className="num">
          Page {page} of {totalPages}
        </p>
        <div className="flex gap-2">
          <button
            disabled={page <= 1 || busy}
            onClick={() => void fetchLogs(page - 1)}
            className="neu-btn px-3 py-1 font-medium disabled:opacity-40"
          >
            Prev
          </button>
          <button
            disabled={page >= totalPages || busy}
            onClick={() => void fetchLogs(page + 1)}
            className="neu-btn px-3 py-1 font-medium disabled:opacity-40"
          >
            Next
          </button>
        </div>
      </div>
    </section>
  );
}
