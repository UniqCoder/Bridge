# BridgeWitness API (Render). Runtime is tiny: models run offline in `python -m bridgewitness.pipeline`,
# the container only streams the pre-built artifacts and polls the live Across tail.
FROM python:3.10-slim
ENV PYTHONDONTWRITEBYTECODE=1 PYTHONUNBUFFERED=1 PORT=8000
WORKDIR /app
COPY bridgewitness/requirements-api.txt .
RUN pip install --no-cache-dir -r requirements-api.txt
COPY bridgewitness/__init__.py bridgewitness/api.py bridgewitness/live_tail.py bridgewitness/
COPY bridgewitness/artifacts/*.json bridgewitness/artifacts/
RUN useradd -m bw && chown -R bw /app
USER bw
EXPOSE 8000
CMD ["sh", "-c", "uvicorn bridgewitness.api:app --host 0.0.0.0 --port ${PORT} --workers 1"]
