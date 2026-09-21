import Dashboard from "@/components/Dashboard";

function Mark() {
  return (
    <svg width="30" height="30" viewBox="0 0 32 32" aria-hidden>
      <rect width="32" height="32" rx="9" fill="#0b1220" />
      <path
        d="M7 19.5 11 13l3.2 5.2L17.5 12l2.4 4 1.6-2.4L25 19.5"
        fill="none"
        stroke="#34d399"
        strokeWidth="2.2"
        strokeLinecap="round"
        strokeLinejoin="round"
      />
      <circle cx="25" cy="19.5" r="2.2" fill="#f87171" />
    </svg>
  );
}

export default function Home() {
  return (
    <main className="mx-auto w-full max-w-6xl px-4 pb-10 pt-6 md:px-6">
      <header className="mb-6 flex flex-wrap items-center justify-between gap-3">
        <div className="flex items-center gap-3">
          <Mark />
          <div>
            <p className="text-[13px] font-extrabold tracking-tight">
              Earth-Re <span className="font-medium text-slate-400">/ reliability</span>
            </p>
            <h1 className="text-xl font-extrabold tracking-tight">SLA Monitoring Dashboard</h1>
          </div>
        </div>
        <div className="flex items-center gap-2">
          <span className="pill pill-mute mono">cloud fn · /api/uploads/process</span>
          <span className="pill pill-info">SLA 99.9%</span>
        </div>
      </header>

      <Dashboard />

      <footer className="mt-8 border-t border-slate-200 pt-4 text-[12px] leading-5 text-slate-400">
        Up = HTTP 2xx only (999 → down) · one canonical check per service × 15-min slot
        (worst-status-wins on agent conflict) · latency percentiles over successful checks with valid
        latency · monthly buckets follow calendar months. Method and findings: README.
      </footer>
    </main>
  );
}
