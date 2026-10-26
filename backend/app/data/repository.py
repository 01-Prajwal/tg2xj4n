"""Process-wide access to the data snapshot.

The snapshot is small (~20k rows) and read-only, so it is loaded once and kept in
memory. Routes receive it through FastAPI's dependency injection, which lets
tests swap in a synthetic snapshot.
"""

from functools import lru_cache

from app.config import settings
from app.data.snapshot import Snapshot, load_snapshot


@lru_cache(maxsize=1)
def get_snapshot() -> Snapshot:
    return load_snapshot(settings.data_dir)
