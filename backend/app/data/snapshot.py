"""Read and write the bundled data snapshot (gzipped CSV files plus a metadata file).

January 2026 is historical, so the app ships a frozen copy of the Elexon data
instead of calling the API at request time. CSV (not parquet) keeps pyarrow out
of the runtime, which matters for Vercel's serverless bundle size limit.
"""

import json
from dataclasses import asdict, dataclass
from pathlib import Path

import pandas as pd

from app.data.elexon import ACTUALS_COLUMNS, FORECAST_COLUMNS

ACTUALS_FILE = "wind_actuals.csv.gz"
FORECASTS_FILE = "wind_forecasts.csv.gz"
META_FILE = "snapshot_meta.json"


@dataclass(frozen=True)
class SnapshotMeta:
    fetched_at: str
    source: str
    actuals_rows: int
    actuals_from: str
    actuals_to: str
    forecast_rows: int
    forecast_runs: int
    forecast_publish_from: str
    forecast_publish_to: str


@dataclass(frozen=True)
class Snapshot:
    actuals: pd.DataFrame
    forecasts: pd.DataFrame
    meta: SnapshotMeta


def save_snapshot(data_dir: Path, snapshot: Snapshot) -> None:
    data_dir.mkdir(parents=True, exist_ok=True)
    # mtime=0 keeps the gzip bytes identical across refetches of identical data.
    gzip = {"method": "gzip", "mtime": 0}
    snapshot.actuals.to_csv(data_dir / ACTUALS_FILE, index=False, compression=gzip)
    snapshot.forecasts.to_csv(data_dir / FORECASTS_FILE, index=False, compression=gzip)
    (data_dir / META_FILE).write_text(json.dumps(asdict(snapshot.meta), indent=2) + "\n")


def load_snapshot(data_dir: Path) -> Snapshot:
    missing = [f for f in (ACTUALS_FILE, FORECASTS_FILE, META_FILE) if not (data_dir / f).exists()]
    if missing:
        raise FileNotFoundError(
            f"Snapshot incomplete in {data_dir} (missing {missing}). "
            "Run `python -m scripts.fetch_data` from backend/."
        )
    actuals = pd.read_csv(data_dir / ACTUALS_FILE)
    forecasts = pd.read_csv(data_dir / FORECASTS_FILE)
    _check_columns(actuals, ACTUALS_COLUMNS, ACTUALS_FILE)
    _check_columns(forecasts, FORECAST_COLUMNS, FORECASTS_FILE)
    actuals = actuals.assign(
        start_time=_utc(actuals["start_time"]),
        settlement_date=pd.to_datetime(actuals["settlement_date"]).dt.date,
        settlement_period=actuals["settlement_period"].astype("int16"),
        generation_mw=actuals["generation_mw"].astype("float64"),
    )
    forecasts = forecasts.assign(
        publish_time=_utc(forecasts["publish_time"]),
        start_time=_utc(forecasts["start_time"]),
        generation_mw=forecasts["generation_mw"].astype("float64"),
    )
    meta = SnapshotMeta(**json.loads((data_dir / META_FILE).read_text()))
    return Snapshot(actuals=actuals, forecasts=forecasts, meta=meta)


def _utc(col: pd.Series) -> pd.Series:
    out: pd.Series = pd.to_datetime(col, utc=True).dt.as_unit("us")
    return out


def _check_columns(df: pd.DataFrame, expected: list[str], name: str) -> None:
    if list(df.columns) != expected:
        raise ValueError(f"{name} has columns {list(df.columns)}, expected {expected}")
