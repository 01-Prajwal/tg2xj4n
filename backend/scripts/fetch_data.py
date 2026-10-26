"""Download the January 2026 wind snapshot from Elexon into backend/data/.

Usage (from backend/):  python -m scripts.fetch_data [--data-dir PATH]
"""

import argparse
import logging
from datetime import UTC, datetime
from pathlib import Path

from app.config import (
    ACTUALS_FIRST_DAY,
    ACTUALS_LAST_DAY,
    FORECAST_PUBLISH_FROM,
    FORECAST_PUBLISH_TO,
    settings,
)
from app.data.elexon import ElexonClient
from app.data.snapshot import Snapshot, SnapshotMeta, save_snapshot


def main() -> None:
    parser = argparse.ArgumentParser(description=__doc__)
    parser.add_argument("--data-dir", type=Path, default=settings.data_dir)
    args = parser.parse_args()
    logging.basicConfig(level=logging.INFO, format="%(levelname)s %(message)s")

    client = ElexonClient()
    actuals = client.fetch_wind_actuals(ACTUALS_FIRST_DAY, ACTUALS_LAST_DAY)
    forecasts = client.fetch_wind_forecasts(FORECAST_PUBLISH_FROM, FORECAST_PUBLISH_TO)
    if actuals.empty or forecasts.empty:
        raise SystemExit("Elexon returned no data; snapshot not written.")

    meta = SnapshotMeta(
        fetched_at=datetime.now(UTC).isoformat(timespec="seconds"),
        source=settings.elexon_base_url,
        actuals_rows=len(actuals),
        actuals_from=actuals["start_time"].min().isoformat(),
        actuals_to=actuals["start_time"].max().isoformat(),
        forecast_rows=len(forecasts),
        forecast_runs=int(forecasts["publish_time"].nunique()),
        forecast_publish_from=forecasts["publish_time"].min().isoformat(),
        forecast_publish_to=forecasts["publish_time"].max().isoformat(),
    )
    save_snapshot(args.data_dir, Snapshot(actuals=actuals, forecasts=forecasts, meta=meta))
    logging.info("Snapshot written to %s: %s", args.data_dir, meta)


if __name__ == "__main__":
    main()
