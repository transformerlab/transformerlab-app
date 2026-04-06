#!/bin/bash
# Template: Queue a task and monitor until completion
# Queues a task non-interactively, polls for job completion, and downloads results.
#
# Usage: ./queue-and-monitor.sh <task_id> [output_dir]
#
# Arguments:
#   task_id    — The ID of the task to queue
#   output_dir — Directory to download results to (default: ./results)

set -euo pipefail

TASK_ID="${1:?Usage: $0 <task_id> [output_dir]}"
OUTPUT_DIR="${2:-./results}"
POLL_INTERVAL=10

echo "Queuing task $TASK_ID..."

# 1. Queue the task and capture the job ID
JOB_JSON=$(lab --format json task queue "$TASK_ID" --no-interactive)
JOB_ID=$(echo "$JOB_JSON" | python3 -c "import sys,json; print(json.load(sys.stdin)['id'])")

echo "Job created: $JOB_ID"

# 2. Poll until the job finishes
echo "Monitoring job $JOB_ID..."
while true; do
    STATUS=$(lab --format json job info "$JOB_ID" | python3 -c "import sys,json; print(json.load(sys.stdin)['status'])")
    PROGRESS=$(lab --format json job info "$JOB_ID" | python3 -c "import sys,json; print(json.load(sys.stdin).get('progress', 0))" 2>/dev/null || echo "?")

    echo "  Status: $STATUS  Progress: $PROGRESS%"

    case "$STATUS" in
        COMPLETE)
            echo "Job completed successfully!"
            break
            ;;
        FAILED)
            echo "Job failed. Check logs:"
            echo "  lab job logs $JOB_ID"
            exit 1
            ;;
        STOPPED)
            echo "Job was stopped."
            exit 1
            ;;
        *)
            sleep "$POLL_INTERVAL"
            ;;
    esac
done

# 3. List artifacts
echo ""
echo "Artifacts:"
lab --format json job artifacts "$JOB_ID"

# 4. Download results
echo ""
echo "Downloading results to $OUTPUT_DIR..."
mkdir -p "$OUTPUT_DIR"
lab job download "$JOB_ID" -o "$OUTPUT_DIR"

echo "Done! Results saved to $OUTPUT_DIR"
