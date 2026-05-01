# ── Stage 1: build frontend ───────────────────────────────────────────────────
FROM node:20-alpine AS frontend-build

WORKDIR /build
COPY frontend/package.json ./
RUN npm install
COPY frontend/ ./
RUN npm run build

# ── Stage 2: production image ─────────────────────────────────────────────────
FROM python:3.11-slim

WORKDIR /app

# Install Python dependencies
COPY backend/requirements.txt .
RUN pip install --no-cache-dir -r requirements.txt

# Copy backend
COPY backend/main.py .

# Copy built frontend into /app/static (served by FastAPI)
COPY --from=frontend-build /build/dist /app/static

# Copy netbox_schema_pull.py if present (used for form generation)
# This is optional — mount it as a volume if you want live updates
COPY --from=frontend-build /build/../backend/../netbox_schema_pull.py /app/ 2>/dev/null || true

# Data directory for mapping.yaml (mounted as volume)
RUN mkdir -p /data

EXPOSE 8000

CMD ["uvicorn", "main:app", "--host", "0.0.0.0", "--port", "8000", "--workers", "1"]
