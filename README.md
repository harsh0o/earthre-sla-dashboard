# Earth-Re · SLA Monitoring Dashboard

Upload a health-check CSV → a **stateless serverless function** cleans it → **Supabase Postgres**
persists it → a **single-screen dashboard** shows availability vs the 99.9% SLA.

- **Live URL:** _(set after `vercel deploy`; verified-live date recorded here)_
- **Cloud function (live):** `POST {LIVE_URL}/api/uploads/process`
- **Stack:** Next.js App Router + TypeScript · Supabase Postgres · Vercel · Tailwind

## 1. Architecture — what runs where, and why

```
Browser (Next.js, Vercel)
├── /  UploadCard + StatsSection (collapsible) + LogsView
│   ├── POST /api/uploads/process → Vercel Serverless Function (stateless, nodejs)
│   │        Papa parse → runPipeline() → Supabase inserts → summary JSON
│   ├── GET  /api/summary?datasetId=…  → aggregates from store
│   └── GET  /api/logs?…               → filtered, paginated rows
└── Supabase Postgres (datasets / checks / quarantine)
```

- **Why Vercel function:** the spec demands a real deployed stateless function on a cloud provider
  (Lambda / Cloud Function / Worker / equivalent). A Next.js Route Handler on Vercel **is** exactly
  that — no local execution, no sticky state — while honoring the required Backend: Next.js.
  Pure logic lives in `src/lib/pipeline/` so it could move verbatim to Lambda later.
- **Why Supabase Postgres:** free tier, real SQL (monthly SLA grouping + percentiles are natural),
  re-queryable after upload, migrations checked in at `supabase/migrations/` (applied live).
- **Without keys (local dev):** the app runs in dev-memory mode (processes + shows everything, pill
  says so). Nothing persists across restarts. **Live review requires Supabase keys** (below).

## 2. Data findings — every issue found and how it is handled

Measured by script over all 5 CSVs (`service_id, service_name, timestamp, status_code, latency,
latency_unit, agent, region`; 1 check / 15 min / service):

1. **Unsorted rows** (all files) → sort by canonical ts after cleaning.
2. **Two timestamp formats:** ~1.5% epoch seconds (`1746938700`) + ISO `…Z` (9d:70 … 30d:233)
   → epoch → UTC ISO; unparseable → quarantine `bad_timestamp`, excluded from SLA.
3. **Empty latency** (~1.2%; 56–186/file) → `NULL`, kept for availability, excluded from latency.
4. **Mixed units:** `s` only on `svc-search`, `ms` elsewhere → normalize to `latency_ms`, keep raw.
5. **Negative latency** (1/file) → impossible → `NULL` + `invalid_latency`.
6. **Status `999`** (1/file) → unknown → counts as **DOWN**, flagged `unknown_status`.
7. **`500/502/503`** (~1%) → all non-2xx = down; latency on errors excluded from p50/p95/p99.
8. **Exact dupes** (6–24/file) → keep 1, count suppressed.
9. **Multi-agent overlap** (~7% slots; agent-1 ~93%, agent-2 ~7%) → collapse to ONE canonical check
   per (service, slot): prefer agent-1, **worst-status-wins** on disagreement (customer-favoring,
   never hides an outage). Stores `agents[]`, `agent_count`.
10. **2 conflicting payloads** (14d file) → same worst-wins rule + `status_conflict` note.
11. **No true gaps** (100% slot coverage per service after canonicalization) → no imputation;
    gap-detector retained in code.
12. **Single region** (`ap-south-1`), stable `service_id↔service_name` → stored anyway, enforced.
13. **No extreme outliers** (max ~3s) → no trimming; p50/p95/p99 used.

Validation: `dataset_incident_log.json` injected outages (e.g. reports-api day-5 16:00–17:15)
surface as 5xx clusters — preserved as downtime, never smoothed.

## 3. Assumptions (ambiguous points, choices + why)

- **Up = HTTP 2xx only.** Only `200` observed as success; any 3xx (none present) counts as down
  for a health-check SLA. Documented so billing never silently passes.
- **Availability = up / total canonical checks**, grouped by **calendar month × service**
  (data spans month edges, e.g. Apr 6–May 5; SLA credits are monthly).
- **Threshold 99.9%**, error budget = 0.1% of month minutes, consumed = down_slots × 15.
  `creditEligible = availability < 0.999`. No invented credit tiers — just eligible/not + minutes.
- **Latency is informational**: p50/p95/p99 over successful checks with valid latency only.
- **Stats shown** (on-call + billing lens): dark command panel with availability ring + credit
  verdict + error-budget bar; latency p50/p95/p99 with daily-p95 sparkline; monthly calendar bars;
  auto-detected incident callouts (worst sub-SLA service-days); per-service rows with daily heat
  strips; pipeline-quality counts.
- **Logs**: single-date (whole UTC day) or range, service chips, All/Up/Down, 50/page.

## 4. Run locally

```bash
cd earthre-sla-dashboard
npm install
# optional (required for persistence; without it the app runs in dev-memory mode)
cp .env.example .env.local  # fill Supabase keys
npm run dev   # http://localhost:3000
```

Apply every file in `supabase/migrations/` in order (or run `node scripts/migrate.cjs`
with `SUPABASE_DB_PASSWORD` set) — once.

```bash
npm test        # 70 unit tests: pipeline, API routes, store, formatters, components, dataset conformance
npm run build   # production build check
```

## 5. Deploy / redeploy (free tier)

1. Apply the migration in Supabase.
2. `npx vercel` (or import the repo in Vercel dashboard) with env:
   `NEXT_PUBLIC_SUPABASE_URL`, `NEXT_PUBLIC_SUPABASE_ANON_KEY`, `SUPABASE_SERVICE_ROLE_KEY`.
3. Upload any provided CSV at the live URL; verify the cleaning report + monthly bars.
4. Record here: **last verified live: _TODO_; URL: _TODO_**.

## 6. What I would do with more time

- Supabase Auth-gated saved views (currently out of scope per spec).
- Streaming parse + background job for >10MB files (current cap is deliberate for serverless limits).
- Week-over-week availability compare and alerting webhooks for new sub-SLA days.
- Playwright e2e: upload fixture → verdict → date-filtered log row assertions.
- Export quarantine report CSV for support/billing audit trail.
