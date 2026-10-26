"""Vercel serverless entry point: exposes the FastAPI app as an ASGI function.

vercel.json rewrites /api/*, /docs and /openapi.json here; the original request
path is preserved, so FastAPI routes match as they do locally.
"""

import sys
from pathlib import Path

sys.path.insert(0, str(Path(__file__).resolve().parent.parent / "backend"))

from app.main import app  # noqa: E402

__all__ = ["app"]
