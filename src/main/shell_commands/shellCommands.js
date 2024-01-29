export const updateAndInstallCommand = `
TFL_FILENAME="transformerlab_api_v0.1.0.zip"
TFL_URL="https://transformerlab-binaries.s3.amazonaws.com/\${TFL_FILENAME}"
TFL_DEST_DIR="\${HOME}/.transformerlab/src/"
echo "Check if \${TFL_DEST_DIR} exists"
mkdir -p "\${TFL_DEST_DIR}"
echo "Downloading \${TFL_URL} to \${TFL_DEST_DIR}"
curl "\${TFL_URL}" --output "\${TFL_DEST_DIR}\${TFL_FILENAME}"
unzip -o "\${TFL_DEST_DIR}\${TFL_FILENAME}" -d "$TFL_DEST_DIR"
echo "Starting API server"
cd "\${TFL_DEST_DIR}" || exit

if [ -f .DEPENDENCIES_INSTALLED ]; then
    echo "Dependencies already installed. Skipping."
    echo "To reinstall dependencies, delete the .DEPENDENCIES_INSTALLED file and run this script again."
else
  ./init.sh
  touch .DEPENDENCIES_INSTALLED
fi
`;

export const installOnlyIfNotInstalledCommand = `
TFL_FILENAME="main.zip"
TFL_URL="https://github.com/transformerlab/transformerlab-api/archive/refs/heads/main.zip"
TFL_DIR="\${HOME}/.transformerlab"
TFL_DEST_DIR="\${HOME}/.transformerlab/src"
echo "Check if \${TFL_DEST_DIR} exists"
# Check if the Install directory exists, if so, do nothing
if [[ ! -d "\${TFL_DEST_DIR}" ]]
then
  mkdir -p "\${TFL_DEST_DIR}"
  echo "Downloading \${TFL_URL} to \${TFL_DIR}"
  curl -L "\${TFL_URL}" --output "\${TFL_DIR}\${TFL_FILENAME}"
  unzip -o "\${TFL_DIR}\${TFL_FILENAME}" -d "$TFL_DEST_DIR"
  echo "Starting API server"
  cd "\${TFL_DEST_DIR}" || exit

  if [ -f .DEPENDENCIES_INSTALLED ]; then
      echo "Dependencies already installed. Skipping."
      echo "To reinstall dependencies, delete the .DEPENDENCIES_INSTALLED file and run this script again."
  else
    ./init.sh
    touch .DEPENDENCIES_INSTALLED
  fi
else
  echo "Install directory already exists. Skipping."
fi
`;

export const runCommand = `
conda activate transformerlab
TFL_DEST_DIR="\${HOME}/.transformerlab/src/"
cd "\${TFL_DEST_DIR}" || exit
./run.sh
`;

export const runCommandInBackground = `
conda activate transformerlab
TFL_DEST_DIR="\${HOME}/.transformerlab/src/"
cd "\${TFL_DEST_DIR}" || exit
if [ -f pid.nohup ]; then
    echo "PID file exists, killing process"
    kill $(cat pid.nohup)
fi
nohup ./run.sh > /dev/null 2>&1 &
# Write the PID to a file
echo $! > pid.nohup
`;
