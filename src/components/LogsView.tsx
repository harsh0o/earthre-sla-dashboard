"use client";

import { useState } from "react";
import type { LogRow } from "./types";
import { fmtMs } from "./types";

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
      <section aria-label="Logs" className="card p-5 md:col-span-2">
        <p className="eyebrow">Evidence</p>
        <h2 className="mt-1 text-[15px] font-bold tracking-tight">Check logs</h2>
        <div className="mt-3 flex items-center gap-3 rounded-xl bg-slate-50 px-4 py-6 ring-1 ring-slate-200">
          <span className="dot dot-idle" />
          <p className="text-[13px] text-slate-500">
            Every underlying check appears here after an upload — filter by a single day or a range,
            by service, by outcome.
          </p>
        </div>
      </section>
    );
  }

  return (
    <section aria-label="Logs" className="card p-5 md:col-span-2">
      <div className="flex flex-wrap items-center justify-between gap-3">
        <div>
          <p className="eyebrow">Evidence</p>
          <h2 className="mt-1 text-[15px] font-bold tracking-tight">
            Check logs{" "}
            <span className="num ml-1 align-middle text-xs font-semibold text-slate-400">
              {total.toLocaleString()} matching
            </span>
          </h2>
        </div>
        <div className="seg" role="group" aria-label="Date mode">
          {(["single", "range"] as Mode[]).map((m) => (
            <button key={m} aria-pressed={mode === m} onClick={() => setMode(m)}>
              {m === "single" ? "Single day" : "Range"}
            </button>
          ))}
        </div>
      </div>

      <div className="mt-4 flex flex-wrap items-center gap-x-4 gap-y-3">
        {mode === "single" ? (
          <label className="text-[13px] font-medium text-slate-500">
            Date{" "}
            <input type="date" value={effDay} onChange={(e) => setDay(e.target.value)} className="field mono ml-1" />
          </label>
        ) : (
          <>
            <label className="text-[13px] font-medium text-slate-500">
              From <input type="date" value={effFrom} onChange={(e) => setFrom(e.target.value)} className="field mono ml-1" />
            </label>
            <label className="text-[13px] font-medium text-slate-500">
              To <input type="date" value={effTo} onChange={(e) => setTo(e.target.value)} className="field mono ml-1" />
            </label>
          </>
        )}

        <div className="flex flex-wrap items-center gap-1.5" aria-label="Service filter">
          {services.map((s) => (
            <button key={s} onClick={() => toggleSvc(s)} aria-pressed={svc.includes(s)} className={`pill mono ${svc.includes(s) ? "pill-info" : "pill-mute"}`}>
              {s}
            </button>
          ))}
        </div>

        <div className="seg" aria-label="Status filter">
          {(["all", "up", "down"] as Status[]).map((s) => (
            <button key={s} onClick={() => setStatus(s)} aria-pressed={status === s}>
              {s === "all" ? "All" : s === "up" ? "Up" : "Down"}
            </button>
          ))}
        </div>

        <button onClick={() => void fetchLogs(1)} disabled={busy} className="btn btn-primary ml-auto disabled:opacity-60">
          {busy ? "Loading…" : "Apply filters"}
        </button>
      </div>

      <div className="mt-3 overflow-x-auto rounded-xl ring-1 ring-slate-200">
        <table className="w-full min-w-[840px] border-collapse text-left text-[13px]">
          <thead>
            <tr className="table-head bg-slate-50">
              <th className="px-4 py-2.5 font-bold">Timestamp · UTC</th>
              <th className="px-3 py-2.5 font-bold">Service</th>
              <th className="px-3 py-2.5 font-bold">Status</th>
              <th className="px-3 py-2.5 text-right font-bold">Latency</th>
              <th className="px-3 py-2.5 font-bold">Agent</th>
              <th className="px-3 py-2.5 font-bold">Flags</th>
            </tr>
          </thead>
          <tbody className="divide-y divide-slate-100">
            {rows.map((r, i) => (
              <tr key={`${r.ts}-${r.serviceId}-${i}`} className={`transition-colors hover:bg-slate-50 ${r.isUp ? "" : "bg-red-50/60 hover:bg-red-50"}`}>
                <td className="mono whitespace-nowrap px-4 py-2 text-[12.5px] text-slate-500">
                  {r.ts.slice(0, 10)} <b className="font-semibold text-slate-700">{r.ts.slice(11, 16)}</b>
                </td>
                <td className="whitespace-nowrap px-3 py-2 font-semibold">{r.serviceId.replace("svc-", "")}</td>
                <td className="px-3 py-2">
                  <span className="inline-flex items-center gap-1.5">
                    <span className={`dot ${r.isUp ? "dot-up" : "dot-down"}`} />
                    <span className={`mono num text-[12.5px] font-semibold ${r.isUp ? "text-emerald-700" : "text-red-600"}`}>{r.statusCode}</span>
                  </span>
                </td>
                <td className="num px-3 py-2 text-right text-slate-500">{fmtMs(r.latencyMs)}</td>
                <td className="mono px-3 py-2 text-[12px] text-slate-500">
                  {r.agent.replace("agent-", "a")}
                  {r.agentCount > 1 && <span className="pill pill-mute ml-1.5">×{r.agentCount}</span>}
                </td>
                <td className="px-3 py-2">
                  {r.flags.length ? (
                    <span className="pill pill-warn">{r.flags.join(" · ")}</span>
                  ) : (
                    <span className="text-slate-300">—</span>
                  )}
                </td>
              </tr>
            ))}
            {!rows.length && !busy && (
              <tr>
                <td colSpan={6} className="px-4 py-10 text-center text-[13px] text-slate-400">
                  No checks in this range. Widen the dates or clear the filters.
                </td>
              </tr>
            )}
          </tbody>
        </table>
      </div>

      <div className="mt-3 flex items-center justify-between">
        <p className="num text-[13px] text-slate-400">
          Page {page} of {totalPages}
        </p>
        <div className="flex gap-2">
          <button disabled={page <= 1 || busy} onClick={() => void fetchLogs(page - 1)} className="btn btn-ghost px-4 py-1.5 disabled:opacity-40">
            ← Prev
          </button>
          <button disabled={page >= totalPages || busy} onClick={() => void fetchLogs(page + 1)} className="btn btn-ghost px-4 py-1.5 disabled:opacity-40">
            Next →
          </button>
        </div>
      </div>
    </section>
  );
}
