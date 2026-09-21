"use client";

import { useRef, useState } from "react";
import type { ProcessResult } from "./types";
import { fmtInt } from "./types";

interface Props {
  onProcessed: (r: ProcessResult) => void;
}

/** Ingest panel: dropzone idle state → pipeline trace report state. */
export default function UploadCard({ onProcessed }: Props) {
  const inputRef = useRef<HTMLInputElement>(null);
  const [busy, setBusy] = useState(false);
  const [error, setError] = useState<string | null>(null);
  const [dragOver, setDragOver] = useState(false);
  const [last, setLast] = useState<ProcessResult | null>(null);

  async function send(file: File) {
    setBusy(true);
    setError(null);
    try {
      if (file.size > 10 * 1024 * 1024) {
        setError("File exceeds the 10MB limit.");
        return;
      }
      const form = new FormData();
      form.append("file", file);
      const res = await fetch("/api/uploads/process", { method: "POST", body: form });
      const body = await res.json();
      if (!res.ok) {
        setError(body.error ?? "Upload failed.");
        return;
      }
      setLast(body as ProcessResult);
      onProcessed(body as ProcessResult);
    } catch {
      setError("Network error. Is the app running?");
    } finally {
      setBusy(false);
    }
  }

  const steps = last
    ? [
        { label: "Ingested", value: fmtInt(last.totalRows), hint: "raw rows" },
        { label: "Canonicalized", value: fmtInt(last.keptChecks), hint: "15-min checks" },
        { label: "Merged", value: `−${fmtInt(last.exactDupesSuppressed + last.overlapsCollapsed)}`, hint: "dupes + overlaps" },
        { label: last.persistent ? "Persisted" : "Held in memory", value: last.persistent ? "Supabase" : "Session", hint: last.persistent ? "re-queryable" : "add keys to persist" },
      ]
    : [];

  return (
    <section aria-label="Upload" className="card flex flex-col p-5 md:col-span-2">
      <div className="flex flex-wrap items-start justify-between gap-3">
        <div className="max-w-xl">
          <p className="eyebrow">Ingest</p>
          <h2 className="mt-1 text-[15px] font-bold tracking-tight">Upload health-check CSV</h2>
          <p className="mt-1 text-[13px] leading-5 text-slate-500">
            service_id · timestamp · status_code · latency · agent — cleaning runs in the stateless
            function <code className="mono rounded bg-slate-100 px-1 text-[12px]">POST /api/uploads/process</code>
          </p>
        </div>
        <button
          type="button"
          disabled={busy}
          onClick={() => inputRef.current?.click()}
          className="btn btn-primary disabled:opacity-60"
        >
          {busy ? "Processing…" : last ? "Upload another" : "Choose file"}
        </button>
      </div>

      <div
        role="button"
        tabIndex={0}
        aria-label="Drop CSV file here"
        onClick={() => inputRef.current?.click()}
        onKeyDown={(e) => {
          if (e.key === "Enter") inputRef.current?.click();
        }}
        onDragOver={(e) => {
          e.preventDefault();
          setDragOver(true);
        }}
        onDragLeave={() => setDragOver(false)}
        onDrop={(e) => {
          e.preventDefault();
          setDragOver(false);
          const f = e.dataTransfer.files?.[0];
          if (f) void send(f);
        }}
        className={`dropzone mt-4 flex cursor-pointer flex-col items-center justify-center px-4 py-6 text-center ${dragOver ? "over" : ""}`}
      >
        <svg width="26" height="26" viewBox="0 0 24 24" fill="none" aria-hidden className="text-slate-400">
          <path d="M12 15V4m0 0 4 4m-4-4L8 8" stroke="currentColor" strokeWidth="1.8" strokeLinecap="round" strokeLinejoin="round" />
          <path d="M4 13v6a1 1 0 0 0 1 1h14a1 1 0 0 0 1-1v-6" stroke="currentColor" strokeWidth="1.8" strokeLinecap="round" />
        </svg>
        <p className="mt-2 text-[13.5px] font-semibold text-slate-600">
          {busy ? "Cleaning in the cloud function…" : "Drop a CSV here, or browse"}
        </p>
        <p className="mono mt-0.5 text-[11.5px] text-slate-400">.csv · max 10 MB · one file per session</p>
        {busy && <div className="mt-3 h-1.5 w-48 overflow-hidden rounded-full bg-slate-200"><div className="h-full w-1/2 animate-pulse rounded-full bg-slate-800" /></div>}
      </div>

      <input
        ref={inputRef}
        type="file"
        accept=".csv,text/csv"
        className="hidden"
        onChange={(e) => {
          const f = e.target.files?.[0];
          if (f) void send(f);
          e.target.value = "";
        }}
      />

      {error && (
        <p role="alert" className="mt-3 border-l-4 border-l-red-500 bg-red-50 px-3 py-2 text-[13px] font-medium text-red-700">
          {error}
        </p>
      )}

      {last && (
        <div className="mt-4">
          <div className="step-line relative grid grid-cols-2 gap-2 sm:grid-cols-4" aria-label="Pipeline trace">
            {steps.map((s) => (
              <div key={s.label} className="relative rounded-xl bg-slate-50 px-3 py-2.5 text-center ring-1 ring-slate-200">
                <span className="mx-auto mb-1.5 flex h-2.5 w-2.5 rounded-full bg-emerald-500 ring-4 ring-emerald-100" aria-hidden />
                <p className="num text-[15px] font-extrabold tracking-tight">{s.value}</p>
                <p className="text-[11.5px] font-bold">{s.label}</p>
                <p className="text-[11px] text-slate-400">{s.hint}</p>
              </div>
            ))}
          </div>
          <p className="mono mt-2.5 truncate text-[11.5px] text-slate-400">
            {last.filename} · {last.dateMin?.slice(0, 10)} → {last.dateMax?.slice(0, 10)} · epoch repaired {last.epochFixed} · quarantined {last.quarantined}
          </p>
        </div>
      )}
    </section>
  );
}
