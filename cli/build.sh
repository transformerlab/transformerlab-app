#!/bin/bash

# Define output paths
BUNDLE_ENTRY="./src/cli.tsx"
INTERMEDIATE_FILE="./dist/cli-bundle.js"
FINAL_OUTPUT="./dist/lab"

# --- STEP 1: Bundle Dependencies and Resolve Modules ---
# Bundle the application using the 'bun' target, but DO NOT compile yet.
# The goal is to resolve the module system conflicts (CJS/ESM/TLA)
# and create a single, clean JavaScript file.

echo "--- Step 1: Bundling modules to resolve ink/TLA conflicts ---"
bun build $BUNDLE_ENTRY \
  --outfile $INTERMEDIATE_FILE \
  --target=bun \
  --minify \
  # Externalizing 'ink' to be processed cleanly in the intermediate step,
  # as it's the source of the conflict.
  # Note: You may need to remove --external ink if this step fails.
  --external ink \
  --external ink-table \
  || { echo "Step 1 (Bundling) failed."; exit 1; }

echo "Step 1 succeeded: Intermediate bundle created at $INTERMEDIATE_FILE"

# --- STEP 2: Compile the Clean Bundle into a Single Executable ---
# Use the Bun compiler on the clean, pre-bundled JavaScript file
# to create the final standalone executable.

echo "--- Step 2: Compiling the intermediate bundle into an executable ---"
bun build $INTERMEDIATE_FILE \
  --compile \
  --outfile $FINAL_OUTPUT \
  --target=bun \
  # Keep ink external here as well, since it caused the compilation failure.
  # This means the final binary might expect ink/ink-table to be in node_modules,
  # but we try to resolve that in the next step.
  --external ink \
  --external ink-table \
  || { echo "Step 2 (Compilation) failed."; exit 1; }

echo "Step 2 succeeded: Final executable created at $FINAL_OUTPUT"

# --- Final step: Test the binary ---
echo "--- Testing the final executable ---"
./$FINAL_OUTPUT
