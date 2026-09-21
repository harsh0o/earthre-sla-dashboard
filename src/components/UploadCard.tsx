"use client";

import { useRef, useState } from "react";
import type { ProcessResult } from "./types";

interface Props {
  onProcessed: (r: ProcessResult) => void;
}

/** CSV upload card. POSTs to the stateless cloud function. */
export default function UploadCard({ onProcessed }: Props) {
  const inputRef = useRef<HTMLInputElement>(null);
  const [busy, setBusy] = useState(false);
  const [error, setError] = useState<string | null>(null);
  const [dragOver, setDragOver] = useState(false);

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
      onProcessed(body as ProcessResult);
    } catch {
      setError("Network error. Is the app running?");
    } finally {
      setBusy(false);
    }
  }

  return (
    <section className="neu p-5 md:col-span-2">
      <div className="flex items-start justify-between gap-3">
        <div>
          <h2 className="text-base font-semibold">Upload health-check CSV</h2>
          <p className="mt-1 text-[13px] leading-5 text-slate-500">
            Expected columns: service_id, service_name, timestamp, status_code, latency,
            latency_unit, agent, region. Cleaning runs in the stateless cloud function{" "}
            <code className="num rounded bg-slate-200/70 px-1">POST /api/uploads/process</code>.
          </p>
        </div>
        {!busy && (
          <button
            type="button"
            className="neu-btn shrink-0 px-4 py-2 text-sm font-semibold text-slate-700"
            onClick={() => inputRef.current?.click()}
          >
            Choose file
          </button>
        )}
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
        className={`neu-inset mt-4 flex cursor-pointer flex-col items-center justify-center px-4 py-8 text-center ${
          dragOver ? "outline-2 outline-blue-500" : ""
        }`}
      >
        <p className="text-sm font-medium text-slate-600">
          {busy ? "Processing in the cloud function…" : "Drag & drop a CSV here, or click to browse"}
        </p>
        <p className="num mt-1 text-xs text-slate-400">Max 10 MB · one file per upload session</p>
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
        <p role="alert" className="mt-3 text-sm font-medium text-red-600">
          {error}
        </p>
      )}
    </section>
  );
}
