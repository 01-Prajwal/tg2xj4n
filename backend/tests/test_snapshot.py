from pathlib import Path

import pytest

from app.data.elexon import normalise_actuals, normalise_forecasts
from app.data.snapshot import Snapshot, SnapshotMeta, load_snapshot, save_snapshot


def test_snapshot_round_trip(tmp_path: Path) -> None:
    actuals = normalise_actuals(
        [
            {
                "publishTime": "2026-01-01T00:30:00Z",
                "startTime": "2026-01-01T00:00:00Z",
                "settlementDate": "2026-01-01",
                "settlementPeriod": 1,
                "fuelType": "WIND",
                "generation": 1234,
            }
        ]
    )
    forecasts = normalise_forecasts(
        [{"publishTime": "2025-12-31T09:30:00Z", "startTime": "2026-01-01T00:00:00Z",
          "generation": 1200}]
    )
    meta = SnapshotMeta("now", "test", 1, "a", "b", 1, 1, "c", "d")
    save_snapshot(tmp_path, Snapshot(actuals, forecasts, meta))

    loaded = load_snapshot(tmp_path)
    assert loaded.meta == meta
    assert loaded.actuals.equals(actuals)
    assert loaded.forecasts.equals(forecasts)


def test_missing_snapshot_explains_how_to_fix(tmp_path: Path) -> None:
    with pytest.raises(FileNotFoundError, match="fetch_data"):
        load_snapshot(tmp_path)
