# ── Stage 1: build do frontend (React + Vite) ────────────────────────────────
FROM node:20-slim AS frontend
WORKDIR /frontend
COPY frontend/package*.json ./
RUN npm ci
COPY frontend/ ./
RUN NODE_OPTIONS="--max-old-space-size=4096" npm run build

# ── Stage 2: backend FastAPI servindo o build ────────────────────────────────
FROM python:3.11-slim-bookworm

# curl: healthcheck do Coolify · libaio1 + unzip: Oracle Instant Client (thick mode, Oracle 11g)
RUN apt-get update && apt-get install -y --no-install-recommends curl libaio1 unzip ca-certificates \
    && rm -rf /var/lib/apt/lists/*

# Instant Client 19 (o 23 não conecta em Oracle 11.2). Tolerante a falha: sem ele
# o app sobe normalmente e usa o fallback Task.xlsx.
ARG IC_URL=https://download.oracle.com/otn_software/linux/instantclient/1925000/instantclient-basiclite-linux.x64-19.25.0.0.0dbru.zip
RUN mkdir -p /opt/oracle && cd /opt/oracle \
    && (curl -fsSL -o ic.zip "$IC_URL" && unzip -q ic.zip && rm ic.zip \
        && ln -s /opt/oracle/instantclient_* /opt/oracle/instantclient \
        && echo "/opt/oracle/instantclient" > /etc/ld.so.conf.d/oracle.conf && ldconfig \
        || echo "AVISO: Instant Client nao baixado - Oracle indisponivel, app segue com fallback")
ENV ORACLE_INSTANT_CLIENT=/opt/oracle/instantclient

WORKDIR /app
COPY web/requirements.txt web/requirements.txt
RUN pip install --no-cache-dir -r web/requirements.txt

COPY web/ web/
# load_dotenv() sobe a partir de web/ e encontra /app/.env
COPY .env /app/.env
COPY --from=frontend /frontend/dist frontend/dist

WORKDIR /app/web
ENV PYTHONUNBUFFERED=1
EXPOSE 8000
CMD ["uvicorn", "main:app", "--host", "0.0.0.0", "--port", "8000"]
