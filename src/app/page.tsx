import Dashboard from "@/components/Dashboard";

export default function Home() {
  return (
    <main className="mx-auto w-full max-w-7xl px-4 py-6 md:px-6">
      <header className="mb-5 flex flex-wrap items-end justify-between gap-3">
        <div>
          <p className="text-xs font-semibold uppercase tracking-[0.14em] text-slate-400">
            Earth-Re · Reliability
          </p>
          <h1 className="mt-1 text-2xl font-bold tracking-tight">SLA Monitoring Dashboard</h1>
          <p className="mt-1 max-w-2xl text-sm leading-5 text-slate-500">
            Upload a health-check CSV. A stateless cloud function (
            <code className="num rounded bg-slate-900/5 px-1">POST /api/uploads/process</code>) cleans
            it, persists to Supabase, and this screen shows availability vs the 99.9% SLA.
          </p>
        </div>
        <span className="pill pill-info">Threshold 99.9% · 15-min checks</span>
      </header>

      <Dashboard />

      <footer className="mt-6 text-xs leading-4 text-slate-400">
        Up = HTTP 2xx only (incl. 999 → down). One canonical check per service × 15-min slot
        (worst-status-wins on agent conflict). Latency percentiles over successful checks with valid
        latency. See README for data findings and assumptions.
      </footer>
    </main>
  );
}
