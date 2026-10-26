import math

import pandas as pd
import pytest

from app.services.metrics import (
    by_horizon,
    by_hour_of_day,
    error_histogram,
    summarise,
    with_confidence_band,
)
from tests.conftest import actuals_frame, forecasts_frame, ts


def comparison(rows: list[tuple[str, float, float]]) -> pd.DataFrame:
    """Rows of (start_time, actual_mw, forecast_mw)."""
    df = pd.DataFrame(
        {
            "start_time": [ts(s) for s, _, _ in rows],
            "actual_mw": [float(a) for _, a, _ in rows],
            "forecast_mw": [float(f) for _, _, f in rows],
        }
    )
    return df.assign(error_mw=df["actual_mw"] - df["forecast_mw"])


def test_summarise_matches_hand_calculation() -> None:
    # errors: +100, -100, +300, -300
    frame = comparison(
        [
            ("2026-01-15T00:00", 1100, 1000),
            ("2026-01-15T01:00", 900, 1000),
            ("2026-01-15T02:00", 1300, 1000),
            ("2026-01-15T03:00", 700, 1000),
        ]
    )
    s = summarise(frame)
    assert s.n == 4
    assert s.mae_mw == 200
    assert s.rmse_mw == pytest.approx(math.sqrt(50_000))
    assert s.bias_mw == 0
    assert s.mean_actual_mw == 1000
    assert s.nmae_pct == 20
    assert s.max_under_forecast_mw == 300
    assert s.max_over_forecast_mw == 300
    assert s.p50_mw == 0


def test_summarise_empty_frame() -> None:
    s = summarise(comparison([]))
    assert s.n == 0
    assert s.mae_mw is None


def test_by_hour_of_day_uses_uk_local_hour() -> None:
    frame = comparison(
        [
            ("2026-01-15T05:00", 1100, 1000),  # GMT: hour 5
            ("2026-06-15T05:00", 800, 1000),  # BST: hour 6
        ]
    )
    out = by_hour_of_day(frame).set_index("hour")
    assert len(out) == 24
    assert out.loc[5, "bias_mw"] == 100
    assert out.loc[6, "bias_mw"] == -200
    assert out.loc[0, "n"] != out.loc[0, "n"]  # NaN for hours without data


def test_error_histogram_bins_cover_all_errors() -> None:
    frame = comparison([("2026-01-15T00:00", 0, 0), ("2026-01-15T01:00", 1250, 0),
                        ("2026-01-15T02:00", 0, 400)])
    hist = error_histogram(frame, bin_width_mw=500)
    assert hist["count"].sum() == 3
    assert hist["lo_mw"].iloc[0] == -500
    assert hist["hi_mw"].iloc[-1] == 1500


def test_confidence_band_offsets_forecast_by_error_quantiles() -> None:
    frame = comparison([(f"2026-01-15T{h:02d}:00", 1000 + e, 1000)
                        for h, e in enumerate(range(-500, 501, 100))])
    s = summarise(frame)
    out = with_confidence_band(frame, s)
    assert out["reliable_mw"].iloc[0] == pytest.approx(1000 + s.p10_mw)
    assert (out["reliable_mw"] <= out["forecast_mw"]).all()
    assert (out["upper_mw"] >= out["forecast_mw"]).all()


def test_confidence_band_never_negative() -> None:
    frame = comparison([("2026-01-15T00:00", 0, 100), ("2026-01-15T01:00", 0, 900)])
    assert (with_confidence_band(frame)["reliable_mw"] >= 0).all()


def test_by_horizon_gets_worse_with_older_forecasts() -> None:
    target = "2026-01-15T12:00"
    f = forecasts_frame(
        [
            ("2026-01-15T10:00", target, 1000),  # 2h ahead, perfect
            ("2026-01-15T00:00", target, 1500),  # 12h ahead, 500 MW off
        ]
    )
    a = actuals_frame([(target, 1000)])
    out = by_horizon(f, a, [0, 6, 24]).set_index("horizon_h")
    assert out.loc[0, "mae_mw"] == 0
    assert out.loc[6, "mae_mw"] == 500
    assert out.loc[24, "n"] == 0
    assert out.loc[24, "coverage_pct"] == 0
