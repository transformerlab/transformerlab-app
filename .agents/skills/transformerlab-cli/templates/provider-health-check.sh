#!/bin/bash
# Template: Check health of all compute providers
# Lists all providers and checks each one's connectivity.
#
# Usage: ./provider-health-check.sh [--include-disabled]

set -euo pipefail

INCLUDE_DISABLED=""
if [ "${1:-}" = "--include-disabled" ]; then
    INCLUDE_DISABLED="--include-disabled"
fi

echo "Checking compute provider health..."
echo ""

# 1. Get provider list as JSON
PROVIDERS=$(lab --format json provider list $INCLUDE_DISABLED)

# 2. Extract provider IDs and names
PROVIDER_COUNT=$(echo "$PROVIDERS" | python3 -c "import sys,json; print(len(json.load(sys.stdin)))")

if [ "$PROVIDER_COUNT" -eq 0 ]; then
    echo "No compute providers configured."
    echo "Add one with: lab provider add --name <name> --type <type> --no-interactive"
    exit 0
fi

echo "Found $PROVIDER_COUNT provider(s):"
echo ""

# 3. Check each provider
echo "$PROVIDERS" | python3 -c "
import sys, json
providers = json.load(sys.stdin)
for p in providers:
    print(f\"{p['id']}|{p['name']}|{p.get('type', '?')}|{'disabled' if p.get('disabled') else 'enabled'}\")
" | while IFS='|' read -r id name type status; do
    printf "  %-4s %-20s %-10s %-10s " "$id" "$name" "$type" "$status"

    if [ "$status" = "disabled" ]; then
        echo "[SKIPPED]"
        continue
    fi

    # Run health check
    if lab --format json provider check "$id" > /dev/null 2>&1; then
        echo "[HEALTHY]"
    else
        echo "[UNHEALTHY]"
    fi
done

echo ""
echo "Done."
