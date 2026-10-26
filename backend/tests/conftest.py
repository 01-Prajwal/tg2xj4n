import pandas as pd

from app.data.elexon import ACTUALS_COLUMNS, FORECAST_COLUMNS


def ts(value: str) -> pd.Timestamp:
    return pd.Timestamp(value, tz="UTC")


def forecasts_frame(rows: list[tuple[str, str, float]]) -> pd.DataFrame:
    """Rows of (publish_time, start_time, generation_mw), UTC strings."""
    return pd.DataFrame(
        {
            "publish_time": [ts(p) for p, _, _ in rows],
            "start_time": [ts(s) for _, s, _ in rows],
            "generation_mw": [float(g) for _, _, g in rows],
        }
    )[FORECAST_COLUMNS]


def actuals_frame(rows: list[tuple[str, float]]) -> pd.DataFrame:
    """Rows of (start_time, generation_mw), UTC strings."""
    starts = [ts(s) for s, _ in rows]
    return pd.DataFrame(
        {
            "start_time": starts,
            "settlement_date": [s.date() for s in starts],
            "settlement_period": [1] * len(rows),
            "generation_mw": [float(g) for _, g in rows],
        }
    )[ACTUALS_COLUMNS]
