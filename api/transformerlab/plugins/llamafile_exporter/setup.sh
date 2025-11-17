#!/usr/bin/env bash

# TODO: Get latest version dynamically?
LATEST_VERSION="0.9.0"

# Download latest built of llamafile
# This is possibly not great because this is 350MB.
# But llamafile is over half of that
curl -L https://github.com/Mozilla-Ocho/llamafile/releases/download/$LATEST_VERSION/llamafile-$LATEST_VERSION -o llamafile
curl -L https://github.com/Mozilla-Ocho/llamafile/releases/download/$LATEST_VERSION/zipalign-$LATEST_VERSION -o zipalign

# Set llamafile to be executable
chmod +x llamafile
chmod +x zipalign