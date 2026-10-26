"""Application settings and the analysis window.

The client makes day-ahead purchase decisions on day D-1 for delivery day D.
"Decisions made in January 2026" therefore means delivery days 2 Jan - 1 Feb 2026.
"""

from datetime import UTC, date, datetime, timedelta
from pathlib import Path

from pydantic_settings import BaseSettings, SettingsConfigDict

BACKEND_DIR = Path(__file__).resolve().parent.parent

# Decision days (D-1) in scope.
DECISION_FIRST_DAY = date(2026, 1, 1)
DECISION_LAST_DAY = date(2026, 1, 31)

# Delivery days (D) those decisions buy power for.
DELIVERY_FIRST_DAY = DECISION_FIRST_DAY + timedelta(days=1)
DELIVERY_LAST_DAY = DECISION_LAST_DAY + timedelta(days=1)

# GB day-ahead auctions close at 11:00 UK time on D-1.
UK_TZ = "Europe/London"
DAY_AHEAD_CUTOFF_HOUR = 11

# Error bands for a decision are calibrated on errors already known at decision
# time, over a trailing window of up to this many days. The snapshot therefore
# also holds December 2025, so decisions early in January have history too.
MAX_LOOKBACK_DAYS = 30
HISTORY_FIRST_DAY = DECISION_FIRST_DAY - timedelta(days=MAX_LOOKBACK_DAYS + 1)

# The horizon analysis goes up to 72h ahead, so fetch forecasts published from
# a few days before the first history day up to the end of the last delivery day.
MAX_HORIZON_HOURS = 72
FORECAST_PUBLISH_FROM = datetime.combine(HISTORY_FIRST_DAY, datetime.min.time(), UTC) - timedelta(
    hours=MAX_HORIZON_HOURS + 24
)
FORECAST_PUBLISH_TO = datetime.combine(
    DELIVERY_LAST_DAY + timedelta(days=1), datetime.min.time(), UTC
)

# Default API window: target hours of the delivery days, [start, end) in UTC.
DELIVERY_START_UTC = datetime.combine(DELIVERY_FIRST_DAY, datetime.min.time(), UTC)
DELIVERY_END_UTC = datetime.combine(DELIVERY_LAST_DAY + timedelta(days=1), datetime.min.time(), UTC)

# Actuals for the history window, January, and the last delivery day.
ACTUALS_FIRST_DAY = HISTORY_FIRST_DAY
ACTUALS_LAST_DAY = DELIVERY_LAST_DAY


class Settings(BaseSettings):
    model_config = SettingsConfigDict(env_prefix="WFM_", env_file=".env", extra="ignore")

    elexon_base_url: str = "https://data.elexon.co.uk/bmrs/api/v1"
    elexon_timeout_s: float = 30.0
    elexon_chunk_days: int = 7
    data_dir: Path = BACKEND_DIR / "data"
    # Built React app; served at / when present (Docker image, local prod run).
    frontend_dist: Path = BACKEND_DIR.parent / "frontend" / "dist"
    # Comma-separated origins allowed to call the API from a browser (Vite dev server).
    cors_origins: str = "http://localhost:5173,http://127.0.0.1:5173"


settings = Settings()
