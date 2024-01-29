/* eslint import/prefer-default-export: off */
import { URL } from 'url';
import path from 'path';
const fs = require('fs');
const os = require('os');
const { spawn, exec } = require('child_process');
const homeDir = os.homedir();
const transformerLabDir = path.join(homeDir, '.transformerlab/src/');

export function resolveHtmlPath(htmlFileName: string) {
  if (process.env.NODE_ENV === 'development') {
    const port = process.env.PORT || 1212;
    const url = new URL(`http://localhost:${port}`);
    url.pathname = htmlFileName;
    return url.href;
  }
  return `file://${path.resolve(__dirname, '../renderer/', htmlFileName)}`;
}

export function checkLocalServerVersion() {
  const mainFile = path.join(transformerLabDir, 'VERSION');

  console.log('Checking if server is installed locally at', mainFile);
  if (fs.existsSync(mainFile)) {
    const version = fs.readFileSync(mainFile, 'utf8');
    console.log('Found version', version);
    return version;
  } else {
    return false;
  }
}

export function startLocalServer() {
  const mainFile = path.join(transformerLabDir, 'run.sh');

  const options = {
    cwd: transformerLabDir,
    // The following two options allow it to keep running after parent is closed
    // detached: true,
    // stdio: 'ignore',
  };
  console.log('Starting local server at', mainFile);
  try {
    const child = spawn('bash', [mainFile], options);
    child.stderr.on('data', (data) => {
      console.error(`stderr: ${data}`);
    });

    child.on('close', (code) => {
      console.log(`child process exited with code ${code}`);
    });
  } catch (err) {
    console.log('Failed to start local server', err);
  }
}

export function installLocalServer() {
  console.log('Installing local server');

  const options = { shell: '/bin/sh' };
  try {
    const child = exec(
      'curl https://raw.githubusercontent.com/transformerlab/transformerlab-api/main/download_and_install_remote_script.sh | sh',
      options,
      (error, stdout, stderr) => {
        if (error) {
          console.error(`exec error: ${error}`);
          return;
        }
        console.log(`stdout: ${stdout}`);
        console.error(`stderr: ${stderr}`);
      }
    );
  } catch (err) {
    console.log('Failed to install local server', err);
  }
}
