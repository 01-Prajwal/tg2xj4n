# One image serving the API (/api/*) and the built React app (/).

# --- Stage 1: build the frontend ----------------------------------------------
FROM node:22-alpine AS web
WORKDIR /web
COPY frontend/package.json frontend/package-lock.json ./
RUN npm ci
COPY frontend/ ./
RUN npm run build

# --- Stage 2: Python runtime -------------------------------------------------
FROM python:3.12-slim AS app
ENV PYTHONDONTWRITEBYTECODE=1 \
    PYTHONUNBUFFERED=1 \
    PIP_NO_CACHE_DIR=1 \
    PIP_DISABLE_PIP_VERSION_CHECK=1 \
    PORT=8000

WORKDIR /app/backend
COPY requirements.txt /app/
RUN pip install -r /app/requirements.txt

# Run from source (not pip-installed) so app/config.py finds data/ beside it.
COPY backend/app ./app
COPY backend/data ./data
COPY --from=web /web/dist /app/frontend/dist

RUN useradd --create-home --uid 10001 appuser
USER appuser

EXPOSE 8000
HEALTHCHECK --interval=30s --timeout=3s --start-period=10s \
    CMD python -c "import urllib.request,os; urllib.request.urlopen(f'http://127.0.0.1:{os.environ[\"PORT\"]}/api/health')"

# sh -c expands $PORT (set by Heroku and similar hosts); exec hands uvicorn PID 1
# so it receives SIGTERM and shuts down cleanly.
CMD ["sh", "-c", "exec uvicorn app.main:app --host 0.0.0.0 --port ${PORT}"]
