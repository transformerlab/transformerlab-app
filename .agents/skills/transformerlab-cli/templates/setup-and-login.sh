#!/bin/bash
# Template: First-time Transformer Lab CLI setup
# Checks if lab is installed, logs in, sets experiment, and verifies connectivity.
#
# Usage: ./setup-and-login.sh
#
# Set these environment variables before running:
#   TL_SERVER   — Server URL (e.g. https://your-server:8338)
#   TL_API_KEY  — Your API key
#   TL_EXPERIMENT — Experiment name to set as current

set -euo pipefail

# 1. Check if lab CLI is installed
if ! command -v lab &> /dev/null; then
    echo "lab CLI not found. Installing..."
    uv tool install transformerlab-cli
fi

echo "CLI version: $(lab version)"

# 2. Login
SERVER="${TL_SERVER:-http://localhost:8338}"
API_KEY="${TL_API_KEY:?Set TL_API_KEY environment variable}"

lab login --server "$SERVER" --api-key "$API_KEY"

# 3. Verify authentication
echo "Logged in as:"
lab whoami

# 4. Set current experiment (if provided)
EXPERIMENT="${TL_EXPERIMENT:-}"
if [ -n "$EXPERIMENT" ]; then
    lab config set current_experiment "$EXPERIMENT"
    echo "Current experiment set to: $EXPERIMENT"
fi

# 5. Verify connectivity
echo ""
echo "Server status:"
lab status

echo ""
echo "Setup complete!"
