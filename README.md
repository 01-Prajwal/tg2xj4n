# UK Wind Forecast Monitor

A web app for a UK utility's day-ahead trading desk. It covers the two needs in the
brief, as two sections of the page:

1. **Plan tomorrow's purchase: the latest forecast available at decision time.** Pick
   a decision date and time. The app shows the most recent forecast run published by
   then, tomorrow's hourly profile, how that forecast changed run by run, and when the
   next run is due.
2. **How accurate are the forecasts: quantified error to decide with.** The day-ahead
   forecast is scored against actual output across the month. The same error is also
   applied to each decision. Using only errors already known at decision time, the app
   gives the wind to count on at a chosen confidence level and the extra cover to buy,
   in GWh. A backtest over every January decision shows that the confidence levels
   hold.

Scope: national wind generation from Elexon BMRS only, for purchase decisions made in
January 2026 (delivery days 2 Jan – 1 Feb 2026).

**Live app:** https://tg2xj4n.vercel.app (API docs: https://tg2xj4n.vercel.app/docs)

## What the January data shows

**Can you trust the bands?** The decision rule was replayed for all 31 January
decisions at 11:00, calibrated each time on the previous 30 days of known errors.

| Confidence | Hours with actual ≥ count-on line | Average extra cover |
|---|---|---|
| 80% | 77.8% | 75 GWh/day |
| 90% | 89.4% | 100 GWh/day |
| 95% | 93.5% | 123 GWh/day |

**Accuracy over the month:**

| Day-ahead forecast (11:00 D-1) | Value |
|---|---|
| Hours scored | 744 / 744 |
| Mean absolute error | 2.00 GW (17.7% of mean output) |
| Bias (actual − forecast) | **−1.73 GW**: the forecast ran high almost all month |
| Error P10 / P90 | −4.2 GW / +0.5 GW |

- In 1 hour in 10, wind came in more than 4.2 GW below the day-ahead forecast.
- Accuracy degrades steadily with lead time: MAE is 1.68 GW for the latest forecast
  available before each hour and about 2.3 GW at 48 h ahead.
- Worst single day: for 28 Jan, the desk would have been told to count on 170 GWh at
  90%, but only 139 GWh arrived, and every hour came in below the line.
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
cd backend && ruff check . && mypy app scripts && pytest       # 69 tests
cd frontend && npm run lint && npm run typecheck && npm test   # 19 tests
```

CI ([.github/workflows/ci.yml](.github/workflows/ci.yml)) runs all of these on every
push, then builds the Docker image and smoke-tests it.

### Refreshing the data

The app ships with a frozen snapshot of the Elexon data in `backend/data/`, because
January 2026 is historical. It also includes December 2025, so that decisions early
in January have 30 days of known forecast errors to calibrate on. To rebuild it:

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
| `backend/app/services/decision.py` | **Decision support**: latest run at decision time, error bands learned only from errors known then, GWh to count on and extra cover, backtest |
| `backend/app/api/routes.py` | HTTP layer: query validation, calls to services, response shaping |
| `backend/app/schemas.py` | Pydantic response models: the JSON contract with the frontend |
| `backend/app/main.py` | App factory: CORS, error handling, serving the built frontend |
| `backend/scripts/fetch_data.py` | Command-line tool that downloads the snapshot |
| `backend/data/` | The snapshot, 1 Dec 2025 – 1 Feb 2026: 3,024 half-hourly actuals and 39,128 forecast rows from 536 runs |
| `backend/tests/` | Unit tests (selection, metrics, client, snapshot), API tests on a synthetic snapshot, checks against the real data |
| `frontend/src/App.tsx` | Page layout; holds filter and drill-down state |
| `frontend/src/api/` | Typed API client and TypeScript copies of the response schemas |
| `frontend/src/hooks/` | TanStack Query hooks (cached, keep previous data while refetching), chart/table toggle |
| `frontend/src/components/DecisionPanel.tsx` | Section 1, "Plan tomorrow's purchase": decision settings, latest-run summary, GWh tiles, hourly chart, run-by-run changes, backtest result |
| `frontend/src/components/` (others) | Section 2: filters, headline and stat tiles, actual-vs-forecast chart |
| `frontend/src/lib/` | Formatting (UK time, GW), chart theme and tick helpers, date presets |
| `api/index.py` | Vercel serverless entry point that imports the FastAPI app |
| `vercel.json` | Vercel build: static frontend, Python function, `/api` rewrites |
| `Dockerfile`, `docker-compose.yml` | Multi-stage image: Node builds the frontend, Python serves everything |
| `postman/` | Postman collection: every endpoint with example queries, error cases and response tests (`baseUrl` defaults to http://127.0.0.1:8000) |
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

### Decision support (section 1)

For a decision at time *t* on day D-1:

- **Latest forecast:** the most recent forecast run published at or before *t*. Its
  hourly values for delivery day D form tomorrow's profile. Every earlier run for D is
  listed, so the desk can see how the forecast has moved.
- **Error model:** quantiles of the day-ahead error (actual − forecast) over the
  previous *N* days (7, 14 or 30), using only hours whose actual was already
  published by *t*. Nothing from the future is used.
- **Turning error into a purchase decision:** at confidence *c*, the wind to count on
  each hour is the forecast plus the (1 − *c*) error quantile. Summed over the day,
  this gives the GWh of wind to rely on. The extra cover to buy, beyond a position
  based on the forecast, is the forecast total minus that figure.
- **Backtest:** the same rule replayed for every January decision. At 90% confidence,
  actual wind landed at or above the line in 89.4% of hours.

### Accuracy measures (section 2)

Error is defined as **actual − forecast**. The app reports:

- MAE, RMSE and bias
- nMAE: MAE as a % of mean actual output. MAPE is not used because it is unstable
  near zero wind.
- P10, P50 and P90 of the error, and the worst misses each way
- **reliable wind** = forecast + P10 error: the output the desk can count on 9 times
  in 10. The band is in-sample: it is built from the same period's errors. Section 1's bands are not.

The API also returns error by UK hour of day (`/api/metrics/by-hour`), error at every
lead time from 0 to 48 h (`/api/metrics/by-horizon`) and every forecast made for one
hour (`/api/forecast-vintages`). The findings above use them; the page does not show
them.

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
