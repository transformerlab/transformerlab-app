# Stage 1: Build the frontend
FROM node:22 AS frontend-builder
WORKDIR /app

# Copy package files first to lock in dependencies
COPY package*.json ./

# Use a cache mount to persist npm's cache across builds
RUN --mount=type=cache,target=/root/.npm \
    npm install

# Copy source files (these change often, so they are kept lower down)
COPY .erb ./.erb
COPY src ./src
COPY tsconfig.json ./
COPY assets ./assets
COPY release ./release

# Create a dummy .env file to satisfy dotenv-cli
RUN touch .env

# Build the frontend (outputs to release/cloud)
RUN npm run build

# --- Stage 2: Final Image ---
FROM python:3.11-slim
WORKDIR /app

# Install system dependencies (High stability layer)
RUN --mount=type=cache,target=/var/cache/apt \
    apt-get update && \
    apt-get install -y --no-install-recommends curl git build-essential && \
    rm -rf /var/lib/apt/lists/*

# Install uv for faster package management
RUN pip install uv

# 1. Install SDK (Assuming it's a local directory dependency)
COPY lab-sdk ./lab-sdk
RUN --mount=type=cache,target=/root/.cache/uv \
    uv pip install --system ./lab-sdk

# 2. Install API dependencies (Brittle layer optimization)
# We copy ONLY the requirements definition first.
# If your pyproject.toml hasn't changed, this 13s+ step is skipped!
COPY api/pyproject.toml ./api/
WORKDIR /app/api
RUN --mount=type=cache,target=/root/.cache/uv \
    uv pip install --system ".[cpu]" uvicorn

# 3. Now copy the actual API source code (Changes every build)
COPY api ./

# Generate JWT secrets and setup environment
RUN mkdir -p /root/.transformerlab && \
    JWT_SECRET="$(python3 -c 'import secrets; print(secrets.token_urlsafe(32))')" && \
    REFRESH_SECRET="$(python3 -c 'import secrets; print(secrets.token_urlsafe(32))')" && \
    printf "TRANSFORMERLAB_JWT_SECRET=%s\nTRANSFORMERLAB_REFRESH_SECRET=%s\n" "$JWT_SECRET" "$REFRESH_SECRET" > /root/.transformerlab/.env && \
    cp /root/.transformerlab/.env /app/api/.env

# Setup webapp directory and copy built frontend from Stage 1
RUN mkdir -p /root/.transformerlab/webapp
COPY --from=frontend-builder /app/release/cloud/ /root/.transformerlab/webapp/

# Set environment variables
ENV TFL_HOME_DIR=/root/.transformerlab
ENV PYTHONUNBUFFERED=1

EXPOSE 8338

# Run the API
CMD ["uvicorn", "api:app", "--host", "0.0.0.0", "--port", "8338"]
