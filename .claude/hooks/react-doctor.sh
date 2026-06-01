#!/bin/sh
set -u

input_file=$(mktemp "${TMPDIR:-/tmp}/react-doctor-agent-hook.XXXXXX")
output_file=$(mktemp "${TMPDIR:-/tmp}/react-doctor-agent-hook-output.XXXXXX")
trap 'rm -f "$input_file" "$output_file"' EXIT
cat > "$input_file"

script_dir=$(CDPATH= cd "$(dirname "$0")" && pwd)
project_root=${CLAUDE_PROJECT_DIR:-}
if [ -z "$project_root" ]; then
  project_root=$(CDPATH= cd "$script_dir/../.." && pwd)
fi
if ! cd "$project_root"; then
  exit 0
fi

should_scan() {
  if ! command -v node >/dev/null 2>&1; then
    return 0
  fi

  node - "$input_file" <<'NODE'
const fs = require('node:fs');
const inputPath = process.argv[2];
const editToolNames = new Set(['Edit', 'Write', 'MultiEdit', 'NotebookEdit', 'ApplyPatch']);
try {
  const input = JSON.parse(fs.readFileSync(inputPath, 'utf8') || '{}');
  const eventName = input.hook_event_name || input.eventName || input.event_name;
  if (eventName === 'PostToolBatch') {
    const toolCalls = Array.isArray(input.tool_calls) ? input.tool_calls : [];
    process.exit(toolCalls.some((toolCall) => editToolNames.has(toolCall.tool_name)) ? 0 : 10);
  }
  const toolName = input.tool_name || input.toolName || input.tool;
  process.exit(!toolName || editToolNames.has(toolName) ? 0 : 10);
} catch {
  process.exit(0);
}
NODE
}

run_react_doctor() {
  if [ -x ./node_modules/.bin/react-doctor ]; then
    ./node_modules/.bin/react-doctor --verbose --diff --fail-on warning --no-score
    return
  fi

  if command -v react-doctor >/dev/null 2>&1; then
    react-doctor --verbose --diff --fail-on warning --no-score
    return
  fi

  if command -v pnpm >/dev/null 2>&1; then
    pnpm dlx react-doctor@latest --verbose --diff --fail-on warning --no-score
    return
  fi

  if command -v npx >/dev/null 2>&1; then
    npx --yes react-doctor@latest --verbose --diff --fail-on warning --no-score
    return
  fi

  printf '%s\n' 'react-doctor: command not found; skipping agent hook scan.'
  return 0
}

if ! should_scan; then
  exit 0
fi

if run_react_doctor > "$output_file" 2>&1; then
  exit 0
fi

node - "$input_file" "$output_file" <<'NODE'
const fs = require('node:fs');
const inputPath = process.argv[2];
const outputPath = process.argv[3];
const readInput = () => {
  try {
    return JSON.parse(fs.readFileSync(inputPath, 'utf8') || '{}');
  } catch {
    return {};
  }
};
const input = readInput();
const scanOutput = fs.readFileSync(outputPath, 'utf8').trim();
if (!scanOutput) process.exit(0);
const message = `React Doctor found issues in the changed files. Review this output and fix the regressions before finishing:\n\n${scanOutput}`;
if (input.hook_event_name === 'PostToolBatch') {
  console.log(JSON.stringify({ hookSpecificOutput: { hookEventName: 'PostToolBatch', additionalContext: message } }));
} else {
  console.log(JSON.stringify({ additional_context: message }));
}
NODE
