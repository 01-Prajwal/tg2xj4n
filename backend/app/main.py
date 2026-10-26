"""FastAPI application factory.  Run locally with:  uvicorn app.main:app --reload"""

from fastapi import FastAPI, Request
from fastapi.middleware.cors import CORSMiddleware
from fastapi.responses import JSONResponse
from fastapi.staticfiles import StaticFiles

from app.api.routes import router
from app.config import settings


def create_app() -> FastAPI:
    app = FastAPI(
        title="UK Wind Forecast Monitor",
        version="0.1.0",
        description=(
            "Day-ahead national wind generation forecasts (Elexon WINDFOR) compared with "
            "actual output (Elexon FUELHH) for purchase decisions made in January 2026."
        ),
    )
    origins = [o.strip() for o in settings.cors_origins.split(",") if o.strip()]
    app.add_middleware(
        CORSMiddleware, allow_origins=origins, allow_methods=["GET"], allow_headers=["*"]
    )
    app.include_router(router)

    @app.exception_handler(FileNotFoundError)
    async def snapshot_missing(_: Request, exc: FileNotFoundError) -> JSONResponse:
        return JSONResponse(status_code=503, content={"detail": str(exc)})

    # Mounted last so /api/* and /docs take precedence over static files.
    if settings.frontend_dist.is_dir():
        app.mount("/", StaticFiles(directory=settings.frontend_dist, html=True), name="frontend")

    return app


app = create_app()
