# UK Wind Forecast Monitor

A web app for a UK utility's day-ahead trading desk. It shows **the national wind
forecast that was available when day-ahead purchases had to be made**, and measures
**how accurate those forecasts were**, so buying decisions can account for the
expected error.

Scope: national wind generation from Elexon BMRS only, for purchase decisions made in
January 2026 (delivery days 2 Jan – 1 Feb 2026).

**Live app:** https://tg2xj4n.vercel.app (API docs: https://tg2xj4n.vercel.app/docs)

## What the January data shows

| Day-ahead forecast (11:00 D-1) | Value |
|---|---|
| Hours scored | 744 / 744 |
| Mean absolute error | 2.00 GW (17.7% of mean output) |
| Bias (actual − forecast) | **−1.73 GW**: the forecast ran high almost all month |
| Error P10 / P90 | −4.2 GW / +0.5 GW |

- In 1 hour in 10, wind came in more than 4.2 GW below the day-ahead forecast.
- Accuracy degrades steadily with lead time: MAE is 1.68 GW for the latest forecast
  available before each hour and about 2.3 GW at 48 h ahead.
- Misses are worst overnight (03:00–05:00 UK). One plausible cause is wind curtailment
  at low demand: actuals are metered output, while the forecast is of available
  output. This is unverified.

## Running it

### With Docker (one command)

```bash
docker compose up --build
```

Open http://localhost:8000. The same container serves the API at `/api/*`,
interactive API docs at `/docs`, and the React app at `/`.

### For development

Prerequisites: Python 3.11+ and Node 22+.

```bash
# API on http://127.0.0.1:8000
cd backend
python -m venv .venv
.venv/Scripts/activate          # Windows; use `source .venv/bin/activate` on macOS/Linux
pip install -e ".[dev]"
uvicorn app.main:app --reload
```

```bash
# Frontend on http://localhost:5173 (proxies /api to :8000)
cd frontend
npm install
npm run dev
```

### Tests and checks

```bash
cd backend && ruff check . && mypy app scripts && pytest       # 53 tests
cd frontend && npm run lint && npm run typecheck && npm test   # 18 tests
```

CI ([.github/workflows/ci.yml](.github/workflows/ci.yml)) runs all of these on every
push, then builds the Docker image and smoke-tests it.

### Refreshing the data

The app ships with a frozen snapshot of the Elexon data in `backend/data/`, because
January 2026 is historical. To rebuild it:

```bash
cd backend && python -m scripts.fetch_data
```

## Files and directories

| Path | Contents |
|---|---|
| `backend/app/config.py` | Settings (`WFM_*` env vars) and the analysis window: decision days, delivery days, 11:00 cutoff |
| `backend/app/data/elexon.py` | Elexon BMRS client: chunked requests, retries, normalisation (UTC, de-duplication, WIND-only) |
| `backend/app/data/snapshot.py` | Reads and writes the bundled snapshot (gzipped CSV and a metadata file) |
| `backend/app/data/repository.py` | Loads the snapshot once per process, injected into routes with FastAPI `Depends` |
| `backend/app/services/selection.py` | **Core logic**: picks the forecast that was available in time for each hour, and joins it to actuals |
| `backend/app/services/metrics.py` | Accuracy measures: summary, by hour of day, by lead time, histogram, P10–P90 band |
| `backend/app/api/routes.py` | HTTP layer: query validation, calls to services, response shaping |
| `backend/app/schemas.py` | Pydantic response models: the JSON contract with the frontend |
| `backend/app/main.py` | App factory: CORS, error handling, serving the built frontend |
| `backend/scripts/fetch_data.py` | Command-line tool that downloads the snapshot |
| `backend/data/` | The snapshot: 1,536 half-hourly actuals and 20,440 forecast rows from 280 runs |
| `backend/tests/` | Unit tests (selection, metrics, client, snapshot), API tests on a synthetic snapshot, checks against the real data |
| `frontend/src/App.tsx` | Page layout; holds filter and drill-down state |
| `frontend/src/api/` | Typed API client and TypeScript copies of the response schemas |
| `frontend/src/hooks/` | TanStack Query hooks (cached, keep previous data while refetching), chart/table toggle |
| `frontend/src/components/` | Filters, headline and stat tiles, main chart, analysis tabs, forecast-history drill-down |
| `frontend/src/lib/` | Formatting (UK time, GW), chart theme and tick helpers, date presets |
| `api/index.py` | Vercel serverless entry point that imports the FastAPI app |
| `vercel.json` | Vercel build: static frontend, Python function, `/api` rewrites |
| `Dockerfile`, `docker-compose.yml` | Multi-stage image: Node builds the frontend, Python serves everything |
| `requirements.txt` | API runtime dependencies for Docker and Vercel (a test keeps it in sync with `pyproject.toml`) |

## Design

### Choosing the forecast for each hour

Elexon publishes a wind forecast about 8 times a day, each covering about 3 days
ahead, so a single delivery hour has up to about 20 forecasts. The app picks one per
hour with one of two rules:

- **Day-ahead (default):** the latest forecast published at or before **11:00 UK time
  on the day before delivery**, when the GB day-ahead auction closes. This is what the
  trader actually saw. In January that is always the 09:30 run. The cutoff is computed
  on UK calendar days, so it stays correct when the clocks change; tests cover both
  changes.
- **Fixed lead time:** the latest forecast published at least *h* hours before the
  hour. Sweeping *h* shows how accuracy decays with lead time.

Each forecast run also restates about 25 hours that have already passed. Those rows
are never used: a forecast must be published before its target hour.

Forecasts are hourly and actuals are half-hourly. By default the forecast for HH:00 is
compared with the actual for the half-hour starting at HH:00, with an option to use
the hourly average instead.

### Accuracy measures

Error is defined as **actual − forecast**. The app reports:

- MAE, RMSE and bias
- nMAE: MAE as a % of mean actual output. MAPE is not used because it is unstable
  near zero wind.
- P10, P50 and P90 of the error, and the worst misses each way
- error by UK hour of day, and error at every lead time from 0 to 48 h
- **reliable wind** = forecast + P10 error: the output the desk can count on 9 times
  in 10. The band is in-sample: it is built from the same period's errors.

### Architecture

```
React (Vite, TypeScript, Recharts, TanStack Query)
        │  JSON over /api/*
FastAPI routes ──► services (pure pandas functions: selection, metrics)
        │
repository ──► snapshot files (backend/data)  ◄── scripts/fetch_data.py ◄── Elexon BMRS API
```

- **Services do no I/O.** Every rule is tested with small hand-checked DataFrames.
- **Snapshot instead of live calls.** The data is historical, so the app is fast,
  works if Elexon is down, and gives the same numbers on every run.
- **CSV instead of parquet for the snapshot.** This keeps `pyarrow` (about 90 MB) out
  of the runtime, so the Vercel Python function stays well under its size limit.
- **Every chart has a table view.** The colours were checked for colourblind
  separation and contrast in light and dark mode.

## Deployment

**Vercel** (recommended; free):

1. From the repo root, run `npx vercel login`, then `npx vercel deploy --prod`.
   Alternatively, import the GitHub repo at https://vercel.com/new.
2. No settings are needed: `vercel.json` builds the frontend and deploys
   `api/index.py` as a Python function using `requirements.txt`.

**Heroku, or any container host:** deploy the `Dockerfile`. The container listens on
`$PORT`.

## Use of AI tools

AI-assisted development tools were used during development. All design decisions,
results and code were reviewed and verified by me against the real data, the test
suites and CI.

## Data

Contains BMRS data © Elexon Limited copyright and database right 2026. Sources: the
[FUELHH](https://bmrs.elexon.co.uk/api-documentation/endpoint/datasets/FUELHH/stream)
(actual generation by fuel type, WIND only) and
[WINDFOR](https://bmrs.elexon.co.uk/api-documentation/endpoint/datasets/WINDFOR/stream)
(wind generation forecast) datasets.
