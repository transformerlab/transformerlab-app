#!/bin/bash

# Check if curl is installed; install it if it's not.
if ! command -v curl &> /dev/null; then
    echo "curl not found. Installing curl..."
    sudo apt-get update && sudo apt-get install -y curl
fi

# Fetch latest version from GitHub
REPO="transformerlab/transformerlab-api"
RAW_VERSION=$(curl -s "https://api.github.com/repos/$REPO/releases/latest" \
    | grep -o '"tag_name": *"[^"]*' \
    | sed 's/"tag_name": *"//')

if [ -z "$RAW_VERSION" ]; then
    echo "Failed to fetch the latest version."
    exit 1
fi

# Remove leading 'v' from version tag if present
VERSION="${RAW_VERSION#v}"

echo "Latest TransformerLab API version: $VERSION"

# Export the version for envsubst
export VERSION

# Generate docker-compose.yml dynamically
envsubst < docker-compose.yml.tpl > docker-compose.yml

echo "Generated docker-compose.yml with image version: ${VERSION}"

# Deploy container
docker compose up -d

