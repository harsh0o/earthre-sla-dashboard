"use client";

import { useState } from "react";
import type { SummaryResponse } from "./types";
import { fmtInt, fmtMs, fmtPct } from "./types";
import { HeatStrip, Ring, Spark } from "./viz";

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

/** Collapsible stats section: command panel, incidents, services, quality. */
export default function StatsSection({ datasetId, summary, loading }: Props) {
  const [open, setOpen] = useState<boolean>(initialOpen);

  function toggle() {
    setOpen((o) => {
      try {
        window.localStorage.setItem("earthre-stats-open", o ? "0" : "1");
      } catch {
        /* ignore */
      }
      return !o;
    });
  }

  return (
    <section aria-label="Statistics" className="md:col-span-2">
      <div className="mb-3 flex items-end justify-between gap-3">
        <div>
          <p className="eyebrow">Service health</p>
          <h2 className="mt-1 text-lg font-bold tracking-tight">
            Availability vs 99.9% SLA
            {summary && (
              <span className="mono ml-2 align-middle text-xs font-medium text-slate-400">
                {summary.filename}
              </span>
            )}
          </h2>
        </div>
        <button type="button" onClick={toggle} aria-expanded={open} className="btn btn-ghost">
          {open ? "Collapse" : "Expand"}
          <svg width="12" height="12" viewBox="0 0 12 12" aria-hidden className={`transition-transform ${open ? "rotate-180" : ""}`}>
            <path d="M2.5 4.5 6 8l3.5-3.5" fill="none" stroke="currentColor" strokeWidth="1.8" strokeLinecap="round" strokeLinejoin="round" />
          </svg>
        </button>
      </div>

      {!datasetId && (
        <div className="card flex items-center gap-4 p-5">
          <span className="dot dot-idle" />
          <p className="text-sm text-slate-500">
            Upload a CSV to compute availability. Designed for on-call and billing: verdict first,
            then the evidence — daily trends, incidents, and per-service budgets.
          </p>
        </div>
      )}
      {datasetId && loading && !summary && (
        <div className="card p-5 text-sm text-slate-500">Computing summary…</div>
      )}

      {datasetId && summary && (
        <div className={`collapse-grid ${open ? "" : "closed"}`}>
          <div className="collapse-inner">
            <div className="grid grid-cols-1 gap-4 lg:grid-cols-12">
              <CommandPanel summary={summary} />
              <div className="grid grid-cols-1 gap-4 lg:col-span-7">
                <LatencyCard summary={summary} />
                <MonthCard summary={summary} />
              </div>
            </div>

            {summary.incidents.length > 0 && <IncidentRow summary={summary} />}

            <ServiceCard summary={summary} />
            <QualityStrip summary={summary} />
          </div>
        </div>
      )}
    </section>
  );
}

/* ---------------------------------- hero ---------------------------------- */

function CommandPanel({ summary }: { summary: SummaryResponse }) {
  const o = summary.overall;
  const worst = [...summary.byService].sort((a, b) => a.availability - b.availability)[0];
  const budgetTotal = worst.budgetMin || 0;
  const consumed = Math.min(1, budgetTotal ? worst.downtimeMin / budgetTotal : o.creditEligible ? 1 : 0);
  return (
    <div className="command flex flex-col p-6 lg:col-span-5">
      <div className="flex items-center justify-between">
        <p className="text-[11px] font-bold uppercase tracking-[0.14em] text-slate-400">SLA verdict</p>
        <span className="pill-dark pill mono">99.9% · 15-min checks</span>
      </div>

      <div className="mt-4 flex items-center gap-5">
        <Ring
          value={o.availability}
          good={!o.creditEligible}
          label={`${(o.availability * 100).toFixed(2)}%`}
          sub="overall availability"
        />
        <div className="min-w-0">
          <span className={`pill ${o.creditEligible ? "pill-down" : "pill-up"}`}>
            <span className={`dot ${o.creditEligible ? "dot-down" : "dot-up"}`} />
            {o.creditEligible ? "Credit eligible" : "Within SLA"}
          </span>
          <p className="num mt-3 text-[13px] leading-5 text-slate-300">
            {fmtInt(o.up)} successful · {fmtInt(o.down)} failed
            <br />
            {fmtInt(o.downtimeMin)} min of downtime observed
          </p>
        </div>
      </div>

      <div className="mt-5 border-t border-white/10 pt-4">
        <div className="flex items-baseline justify-between text-[13px]">
          <span className="text-slate-400">
            Error budget <span className="text-slate-500">· {worst.serviceName}</span>
          </span>
          <span className={`num font-bold ${worst.creditEligible ? "text-red-300" : "text-emerald-300"}`}>
            {worst.budgetMin ? `${fmtInt(Math.round(worst.budgetRemainingMin))} min left` : "—"}
          </span>
        </div>
        <div className="mt-2 h-2 overflow-hidden rounded-full bg-white/10" role="img" aria-label="Error budget consumed">
          <div
            className={`h-full rounded-full ${worst.creditEligible ? "bg-red-400" : "bg-emerald-400"}`}
            style={{ width: `${Math.max(2, Math.min(100, consumed * 100))}%` }}
          />
        </div>
        <p className="mt-2 text-xs leading-4 text-slate-500">
          Budget = 0.1% of month minutes. Overrun means the SLA credit clause triggers.
        </p>
      </div>
    </div>
  );
}

/* --------------------------------- latency --------------------------------- */

function LatencyCard({ summary }: { summary: SummaryResponse }) {
  const l = summary.latency;
  return (
    <div className="card flex flex-wrap items-center gap-x-8 gap-y-4 p-5">
      <div>
        <p className="eyebrow">Latency · successful checks</p>
        <div className="num mt-2 flex items-baseline gap-5">
          <span><b className="text-2xl font-extrabold tracking-tight">{fmtMs(l.p50)}</b> <i className="text-xs not-italic text-slate-400">p50</i></span>
          <span><b className="text-2xl font-extrabold tracking-tight">{fmtMs(l.p95)}</b> <i className="text-xs not-italic text-slate-400">p95</i></span>
          <span><b className="text-2xl font-extrabold tracking-tight">{fmtMs(l.p99)}</b> <i className="text-xs not-italic text-slate-400">p99</i></span>
        </div>
        <p className="mt-1 text-xs text-slate-400">n = {fmtInt(l.n)} · error rows excluded by design</p>
      </div>
      <div className="ml-auto">
        <p className="eyebrow mb-1">Daily p95 trend</p>
        <Spark values={summary.daily.map((d) => d.p95)} label="Daily p95 latency trend" />
      </div>
    </div>
  );
}

/* ---------------------------------- months ---------------------------------- */

function MonthCard({ summary }: { summary: SummaryResponse }) {
  return (
    <div className="card p-5">
      <p className="eyebrow">Monthly availability · calendar months</p>
      <div className="mt-3 space-y-3">
        {summary.byMonth.map((m) => (
          <div key={m.month}>
            <div className="flex items-baseline justify-between text-[13px]">
              <span className="mono font-semibold text-slate-600">{m.month}</span>
              <span className="num text-xs text-slate-400">
                {fmtInt(m.up)} up · {fmtInt(m.down)} down ·{" "}
                <b className={m.creditEligible ? "text-red-600" : "text-emerald-700"}>{fmtPct(m.availability)}</b>
              </span>
            </div>
            <div className="mt-1.5 h-2.5 overflow-hidden rounded-full bg-slate-100">
              <div
                className={`h-full rounded-full ${m.creditEligible ? "bg-red-500" : "bg-emerald-500"}`}
                style={{ width: `${Math.max(1.5, Math.min(100, m.availability * 100))}%` }}
              />
            </div>
          </div>
        ))}
      </div>
      {!summary.persistent && (
        <p className="pill pill-warn mt-4">Dev-memory mode — add Supabase keys to persist</p>
      )}
    </div>
  );
}

/* --------------------------------- incidents --------------------------------- */

function IncidentRow({ summary }: { summary: SummaryResponse }) {
  return (
    <div className="mt-4 grid grid-cols-1 gap-3 md:grid-cols-3">
      {summary.incidents.map((g) => (
        <div key={`${g.serviceId}-${g.date}`} className="card-flat flex gap-3 border-l-4 border-l-red-500 p-4">
          <span className="dot dot-down mt-1.5" />
          <div className="min-w-0">
            <p className="text-[13px] font-bold">
              {g.serviceName} <span className="mono font-medium text-slate-400">{g.date}</span>
            </p>
            <p className="num mt-0.5 text-[13px] text-slate-500">
              <b className="text-red-600">{(g.availability * 100).toFixed(2)}%</b> · {g.down} failed ·{" "}
              {fmtInt(g.downtimeMin)} min
            </p>
            <p className="mt-1 text-xs text-slate-400">Filter the logs to this date to inspect.</p>
          </div>
        </div>
      ))}
    </div>
  );
}

/* --------------------------------- services --------------------------------- */

function ServiceCard({ summary }: { summary: SummaryResponse }) {
  return (
    <div className="card mt-4 p-5">
      <div className="flex items-baseline justify-between">
        <p className="eyebrow">Services · daily trend</p>
        <div className="hidden items-center gap-3 text-[11px] text-slate-400 md:flex" aria-hidden>
          <span><i className="mr-1 inline-block h-2.5 w-2.5 rounded-[3px] bg-[#059669] not-italic" />100%</span>
          <span><i className="mr-1 inline-block h-2.5 w-2.5 rounded-[3px] bg-[#34d399] not-italic" />≥99.9</span>
          <span><i className="mr-1 inline-block h-2.5 w-2.5 rounded-[3px] bg-[#fbbf24] not-italic" />≥99</span>
          <span><i className="mr-1 inline-block h-2.5 w-2.5 rounded-[3px] bg-[#ef4444] not-italic" />&lt;95</span>
        </div>
      </div>

      <div className="table-head mt-3 hidden grid-cols-[190px_minmax(0,1fr)_96px_96px_96px_120px] gap-3 px-1 lg:grid" aria-hidden>
        <span>Service</span><span>Trend</span><span className="text-right">Avail</span>
        <span className="text-right">Downtime</span><span className="text-right">p95</span><span className="text-right">Credit</span>
      </div>

      <ul className="mt-1 divide-y divide-slate-100">
        {summary.byService.map((s) => (
          <li
            key={s.serviceId}
            className="grid grid-cols-1 gap-2 py-3.5 lg:grid-cols-[190px_minmax(0,1fr)_96px_96px_96px_120px] lg:items-center lg:gap-3"
          >
            <div className="flex items-center gap-2.5 px-1">
              <span className={`dot ${s.creditEligible ? "dot-down" : "dot-up"}`} />
              <div className="leading-tight">
                <p className="text-[13.5px] font-bold">{s.serviceName}</p>
                <p className="mono text-[11px] text-slate-400">{s.serviceId}</p>
              </div>
            </div>
            <div className="px-1">
              <HeatStrip values={summary.byServiceDays[s.serviceId] ?? []} dates={summary.dayKeys} serviceId={s.serviceId} />
            </div>
            <p className={`num px-1 text-[15px] font-extrabold tracking-tight lg:text-right ${s.creditEligible ? "text-red-600" : "text-slate-800"}`}>
              {(s.availability * 100).toFixed(2)}%
            </p>
            <p className="num px-1 text-[13px] text-slate-500 lg:text-right">
              {fmtInt(s.downtimeMin)} min
              <span className="block text-[11px] text-slate-400">{fmtInt(s.down)} failed</span>
            </p>
            <p className="num px-1 text-[13px] text-slate-500 lg:text-right">{fmtMs(s.p95)}</p>
            <p className="px-1 lg:text-right">
              <span className={`pill ${s.creditEligible ? "pill-down" : "pill-up"}`}>
                {s.creditEligible ? "Eligible" : "None"}
              </span>
            </p>
          </li>
        ))}
      </ul>
    </div>
  );
}

/* ---------------------------------- quality ---------------------------------- */

function QualityStrip({ summary }: { summary: SummaryResponse }) {
  const q = summary.quality;
  const items: [string, number][] = [
    ["Rows quarantined", q.quarantined],
    ["Exact dupes dropped", q.exactDupes],
    ["Agent overlaps merged", q.overlaps],
    ["Epoch timestamps repaired", q.epochFixed],
    ["Missing latency", q.missingLatency],
    ["Invalid latency", q.invalidLatency],
    ["Unknown status 999", q.unknownStatus],
  ];
  return (
    <div className="card-flat mt-4 flex flex-wrap items-center gap-x-6 gap-y-2 px-5 py-3.5">
      <p className="eyebrow">Pipeline quality</p>
      {items.map(([label, v]) => (
        <p key={label} className="num text-xs text-slate-500">
          <b className="mr-1 text-[13px] font-bold text-slate-700">{fmtInt(v)}</b>
          {label}
        </p>
      ))}
    </div>
  );
}
