"use client";

import { useState } from "react";
import type { SummaryResponse } from "./types";
import { fmtInt, fmtMs, fmtPct } from "./types";

interface Props {
  datasetId: string | null;
  summary: SummaryResponse | null;
  loading: boolean;
}

function initialOpen(): boolean {
  if (typeof window === "undefined") return true;
  try {
    const v = window.localStorage.getItem("earthre-stats-open");
    return v == null ? true : v === "1";
  } catch {
    return true;
  }
}

/** Collapsible stats bento (expanded by default, persisted). */
export default function StatsSection({ datasetId, summary, loading }: Props) {
  const [open, setOpen] = useState<boolean>(initialOpen);

  function toggle() {
    setOpen((o) => {
      try {
        localStorage.setItem("earthre-stats-open", o ? "0" : "1");
      } catch {
        /* ignore */
      }
      return !o;
    });
  }

  return (
    <section className="neu p-5 md:col-span-2" aria-label="Statistics">
      <div className="flex items-center justify-between">
        <h2 className="text-base font-semibold">Stats — availability & SLA</h2>
        <button
          type="button"
          onClick={toggle}
          aria-expanded={open}
          className="neu-btn px-3 py-1 text-sm font-semibold text-slate-600"
        >
          {open ? "Collapse ▲" : "Expand ▼"}
        </button>
      </div>

      {!datasetId && (
        <p className="mt-3 text-sm text-slate-500">
          Upload a CSV to compute availability. Stats chosen for on-call + billing: overall
          availability, 99.9% credit verdict, error-budget remaining, p50/p95 latency, and
          data-quality counts.
        </p>
      )}
      {datasetId && loading && <p className="mt-3 text-sm text-slate-500">Computing summary…</p>}

      {datasetId && summary && open && (
        <div className="mt-4 grid grid-cols-1 gap-4 sm:grid-cols-2 xl:grid-cols-4">
          <div className="neu-inset p-4">
            <p className="text-xs font-medium uppercase tracking-wide text-slate-400">Overall availability</p>
            <p className="num mt-1 text-[28px] font-bold leading-8">{fmtPct(summary.overall.availability)}</p>
            <p className="num mt-1 text-xs text-slate-500">
              {fmtInt(summary.overall.up)} up · {fmtInt(summary.overall.down)} down ·{" "}
              {fmtInt(summary.overall.downtimeMin)} min downtime
            </p>
            <span className={`pill mt-2 ${summary.overall.creditEligible ? "pill-down" : "pill-up"}`}>
              {summary.overall.creditEligible ? "Credit eligible (< 99.9%)" : "Within SLA (≥ 99.9%)"}
            </span>
          </div>

          <div className="neu-inset p-4">
            <p className="text-xs font-medium uppercase tracking-wide text-slate-400">Latency (successful checks)</p>
            <p className="num mt-1 text-[28px] font-bold leading-8">{fmtMs(summary.latency.p95)}</p>
            <p className="num mt-1 text-xs text-slate-500">
              p50 {fmtMs(summary.latency.p50)} · p99 {fmtMs(summary.latency.p99)} · n={fmtInt(summary.latency.n)}
            </p>
            <p className="mt-2 text-xs text-slate-400">Error rows excluded by design.</p>
          </div>

          <div className="neu-inset p-4">
            <p className="text-xs font-medium uppercase tracking-wide text-slate-400">Data quality</p>
            <ul className="num mt-1 space-y-1 text-[13px] text-slate-600">
              <li>Quarantined: <b>{fmtInt(summary.quality.quarantined)}</b></li>
              <li>Exact dupes suppressed: <b>{fmtInt(summary.quality.exactDupes)}</b></li>
              <li>Agent overlaps collapsed: <b>{fmtInt(summary.quality.overlaps)}</b></li>
              <li>Epoch timestamps fixed: <b>{fmtInt(summary.quality.epochFixed)}</b></li>
            </ul>
          </div>

          <div className="neu-inset p-4">
            <p className="text-xs font-medium uppercase tracking-wide text-slate-400">Monthly availability</p>
            {summary.byMonth.map((m) => (
              <div key={m.month} className="mt-2">
                <div className="flex justify-between text-[13px]">
                  <span className="num font-medium">{m.month}</span>
                  <span className={`num font-semibold ${m.creditEligible ? "text-red-600" : "text-green-700"}`}>
                    {fmtPct(m.availability)}
                  </span>
                </div>
                <div className="mt-1 h-2 overflow-hidden rounded-full bg-slate-300/60">
                  <div
                    className={`h-full rounded-full ${m.creditEligible ? "bg-red-500" : "bg-green-500"}`}
                    style={{ width: `${Math.min(100, m.availability * 100)}%` }}
                  />
                </div>
              </div>
            ))}
            {!summary.persistent && (
              <p className="pill pill-warn mt-3">Dev-memory mode — add Supabase keys for persistence</p>
            )}
          </div>
        </div>
      )}

      {datasetId && summary && open && (
        <div className="mt-4 overflow-x-auto">
          <table className="w-full min-w-[760px] text-left text-[13px]">
            <thead>
              <tr className="text-xs uppercase tracking-wide text-slate-400">
                <th className="py-2 pr-3 font-medium">Service</th>
                <th className="py-2 pr-3 font-medium">Avail</th>
                <th className="py-2 pr-3 font-medium">Up / Down</th>
                <th className="py-2 pr-3 font-medium">Downtime</th>
                <th className="py-2 pr-3 font-medium">Budget left</th>
                <th className="py-2 pr-3 font-medium">p95</th>
                <th className="py-2 font-medium">Credit?</th>
              </tr>
            </thead>
            <tbody>
              {summary.byService.map((s) => (
                <tr key={s.serviceId} className="border-t border-slate-300/50">
                  <td className="py-2 pr-3 font-medium">
                    {s.serviceName} <span className="text-slate-400">({s.serviceId})</span>
                  </td>
                  <td className={`num py-2 pr-3 font-semibold ${s.creditEligible ? "text-red-600" : "text-green-700"}`}>
                    {fmtPct(s.availability)}
                  </td>
                  <td className="num py-2 pr-3 text-slate-600">
                    {fmtInt(s.up)} / {fmtInt(s.down)}
                  </td>
                  <td className="num py-2 pr-3 text-slate-600">{fmtInt(s.downtimeMin)} min</td>
                  <td className="num py-2 pr-3 text-slate-600">
                    {s.budgetMin ? `${fmtInt(Math.round(s.budgetRemainingMin))} min` : "—"}
                  </td>
                  <td className="num py-2 pr-3 text-slate-600">{fmtMs(s.p95)}</td>
                  <td className="py-2">
                    <span className={`pill ${s.creditEligible ? "pill-down" : "pill-up"}`}>
                      {s.creditEligible ? "Yes" : "No"}
                    </span>
                  </td>
                </tr>
              ))}
            </tbody>
          </table>
        </div>
      )}
    </section>
  );
}
