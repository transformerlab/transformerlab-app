#!/bin/bash

# Check if FastChat is running on port 8338 by looking at the root
# if it is not, quit and log an error:
if [ "$(curl -s -o /dev/null -w ''%{http_code}'' localhost:8338)" != "200" ]; then
  echo "FastChat is not running on port 8338. Please start Transformer Lab and try again."
  exit 1
fi

# make a tmp dir:
mkdir -p ./tmp

# now fetch the openapi spec
curl -o ./tmp/openapi.json http://localhost:8338/openapi.json

# generate the SDK using orval in the format like
# $ orval --input ./petstore.yaml --output ./src/petstore.ts
npx orval --config ./orval.config.js
