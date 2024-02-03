/* eslint import/prefer-default-export: off */
import { URL } from 'url';
import path from 'path';
const fs = require('fs');
const os = require('os');
const { spawn, exec, ChildProcess } = require('child_process');
const homeDir = os.homedir();
const transformerLabDir = path.join(homeDir, '.transformerlab/src/');

var localServer: typeof ChildProcess = null;

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
  const mainFile = path.join(transformerLabDir, 'LATEST_VERSION');

  console.log('Checking if server is installed locally at', mainFile);
  if (fs.existsSync(mainFile)) {
    let version = fs.readFileSync(mainFile, 'utf8');
    // remove whitespace:
    version = version.replace(/\s/g, '');
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
    //shell: true,
  };
  console.log('Starting local server at', mainFile);
  try {
    localServer = spawn('bash', [mainFile], options);
    localServer.stderr.on('data', (data) => {
      console.error(`stderr: ${data}`);
    });

    localServer.on('close', (code) => {
      console.log(`child process exited with code ${code}`);
    });
  } catch (err) {
    console.log('Failed to start local server', err);
  }
}

export function killLocalServer() {
  return new Promise((resolve) => {
    console.log('Killing local server if not NULL');
    if (localServer) {
      console.log(
        `Killing local server with pid ${localServer.pid} and all it children`
      );
      var kill = require('tree-kill');
      kill(localServer.pid, 'SIGTERM', function (err) {
        console.log('Finished killing local server');
        console.log(err);
        resolve(err);
      });
      // localServer.kill();
    } else {
      resolve(null);
    }
  });
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
