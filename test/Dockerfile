# Dockerfile for testing Transformer Lab API and Frontend together
# To build: docker build -t transformerlab-test -f test/Dockerfile .
# To run: docker run -p 8338:8338 transformerlab-test

# Stage 1: Build the frontend
FROM node:22 AS frontend-builder
WORKDIR /app

# Copy package files first for better caching
COPY package*.json ./
RUN npm install

# Copy necessary files for frontend build
COPY .erb ./.erb
COPY src ./src
COPY tsconfig.json ./
COPY assets ./assets
COPY release ./release
# Create a dummy .env file to satisfy dotenv-cli which is used in the build script
RUN touch .env
# Build the frontend (outputs to release/cloud)
RUN npm run build

# Stage 2: Setup the backend
FROM python:3.11-slim
WORKDIR /app

# Install system dependencies
RUN apt-get update && apt-get install -y curl git build-essential && rm -rf /var/lib/apt/lists/*

# Install uv for faster package management
RUN pip install uv

# Copy lab-sdk and api
COPY lab-sdk ./lab-sdk
COPY api ./api

# Install lab-sdk (transformerlab)
RUN uv pip install --system ./lab-sdk

# Install api with cpu dependencies
# We also install uvicorn as it is used to run the server
WORKDIR /app/api
RUN uv pip install --system ".[cpu]" uvicorn

# Generate JWT secrets for the API
RUN mkdir -p /root/.transformerlab && \
    echo "TRANSFORMERLAB_JWT_SECRET=$(python3 -c 'import secrets; print(secrets.token_urlsafe(32))')" > /root/.transformerlab/.env && \
    echo "TRANSFORMERLAB_REFRESH_SECRET=$(python3 -c 'import secrets; print(secrets.token_urlsafe(32))')" >> /root/.transformerlab/.env

# Copy built frontend from Stage 1 to the static files directory
# Based on api/transformerlab/shared/dirs.py, the default STATIC_FILES_DIR is ~/.transformerlab/webapp
RUN mkdir -p /root/.transformerlab/webapp
COPY --from=frontend-builder /app/release/cloud/ /root/.transformerlab/webapp/

# Set environment variables
ENV TFL_HOME_DIR=/root/.transformerlab
ENV PYTHONUNBUFFERED=1

EXPOSE 8338

# Run the API
# We run from the /app/api directory so that the 'transformerlab' subfolder is found
CMD ["uvicorn", "api:app", "--host", "0.0.0.0", "--port", "8338"]
