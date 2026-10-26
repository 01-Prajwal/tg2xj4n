"""Thin client for the Elexon BMRS Insights API (wind actuals and forecasts).

Only fetching and normalising happens here; no analysis. Requests are split into
chunks so one slow or failed window can be retried without refetching everything.
"""

import logging
import time
from collections.abc import Iterator
from datetime import date, datetime, timedelta
from typing import Any

import httpx
import pandas as pd

from app.config import settings

log = logging.getLogger(__name__)

ACTUALS_COLUMNS = ["start_time", "settlement_date", "settlement_period", "generation_mw"]
FORECAST_COLUMNS = ["publish_time", "start_time", "generation_mw"]


class ElexonError(RuntimeError):
    pass


class ElexonClient:
    def __init__(
        self,
        client: httpx.Client | None = None,
        chunk_days: int = settings.elexon_chunk_days,
        max_retries: int = 3,
    ) -> None:
        self._client = client or httpx.Client(
            base_url=settings.elexon_base_url, timeout=settings.elexon_timeout_s
        )
        self._chunk_days = chunk_days
        self._max_retries = max_retries

    def fetch_wind_actuals(self, first_day: date, last_day: date) -> pd.DataFrame:
        """Half-hourly national wind generation (FUELHH, fuelType=WIND), by settlement date."""
        rows: list[dict[str, Any]] = []
        for start, end in _date_chunks(first_day, last_day, self._chunk_days):
            rows += self._get(
                "/datasets/FUELHH/stream",
                {
                    "settlementDateFrom": start.isoformat(),
                    "settlementDateTo": end.isoformat(),
                    "fuelType": "WIND",
                },
            )
        return normalise_actuals(rows)

    def fetch_wind_forecasts(self, publish_from: datetime, publish_to: datetime) -> pd.DataFrame:
        """Every hourly wind forecast (WINDFOR) published in [publish_from, publish_to)."""
        rows: list[dict[str, Any]] = []
        for start, end in _datetime_chunks(publish_from, publish_to, self._chunk_days):
            rows += self._get(
                "/datasets/WINDFOR/stream",
                {
                    "publishDateTimeFrom": _iso_z(start),
                    # The API bound is inclusive; step back 1s to keep chunks disjoint.
                    "publishDateTimeTo": _iso_z(end - timedelta(seconds=1)),
                },
            )
        return normalise_forecasts(rows)

    def _get(self, path: str, params: dict[str, str]) -> list[dict[str, Any]]:
        for attempt in range(1, self._max_retries + 1):
            try:
                resp = self._client.get(path, params=params)
                resp.raise_for_status()
                data = resp.json()
                if not isinstance(data, list):
                    raise ElexonError(f"Unexpected payload from {path}: {type(data).__name__}")
                log.info("GET %s %s -> %d rows", path, params, len(data))
                return data
            except (httpx.TransportError, httpx.HTTPStatusError) as exc:
                if attempt == self._max_retries:
                    raise ElexonError(f"{path} failed after {attempt} attempts: {exc}") from exc
                log.warning("GET %s attempt %d failed (%s); retrying", path, attempt, exc)
                time.sleep(2 ** (attempt - 1))
        raise AssertionError("unreachable")


def normalise_actuals(rows: list[dict[str, Any]]) -> pd.DataFrame:
    df = pd.DataFrame(rows)
    if df.empty:
        return pd.DataFrame(columns=ACTUALS_COLUMNS)
    df = df[df["fuelType"] == "WIND"]
    df = df.assign(
        start_time=pd.to_datetime(df["startTime"], utc=True).dt.as_unit("us"),
        publish_time=pd.to_datetime(df["publishTime"], utc=True).dt.as_unit("us"),
        settlement_date=pd.to_datetime(df["settlementDate"]).dt.date,
        settlement_period=df["settlementPeriod"].astype("int16"),
        generation_mw=df["generation"].astype("float64"),
    )
    # If a period was republished, keep its latest value.
    df = df.sort_values("publish_time").drop_duplicates("start_time", keep="last")
    return df.sort_values("start_time")[ACTUALS_COLUMNS].reset_index(drop=True)


def normalise_forecasts(rows: list[dict[str, Any]]) -> pd.DataFrame:
    df = pd.DataFrame(rows)
    if df.empty:
        return pd.DataFrame(columns=FORECAST_COLUMNS)
    df = df.assign(
        publish_time=pd.to_datetime(df["publishTime"], utc=True).dt.as_unit("us"),
        start_time=pd.to_datetime(df["startTime"], utc=True).dt.as_unit("us"),
        generation_mw=df["generation"].astype("float64"),
    )
    df = df.drop_duplicates(["publish_time", "start_time"], keep="last")
    return df.sort_values(["publish_time", "start_time"])[FORECAST_COLUMNS].reset_index(drop=True)


def _date_chunks(first: date, last: date, days: int) -> Iterator[tuple[date, date]]:
    """Inclusive [start, end] date windows covering first..last."""
    start = first
    while start <= last:
        end = min(start + timedelta(days=days - 1), last)
        yield start, end
        start = end + timedelta(days=1)


def _datetime_chunks(
    start: datetime, end: datetime, days: int
) -> Iterator[tuple[datetime, datetime]]:
    """Half-open [a, b) windows covering start..end."""
    step = timedelta(days=days)
    a = start
    while a < end:
        b = min(a + step, end)
        yield a, b
        a = b


def _iso_z(dt: datetime) -> str:
    return dt.strftime("%Y-%m-%dT%H:%M:%SZ")
