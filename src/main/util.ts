/* eslint import/prefer-default-export: off */
import { URL } from 'url';
import path from 'path';
const fs = require('fs');
const os = require('os');
const { spawn, exec, ChildProcess } = require('child_process');
const util = require('node:util');
const awaitExec = util.promisify(require('node:child_process').exec);
const homeDir = os.homedir();
const transformerLabRootDir = path.join(homeDir, '.transformerlab/');
const transformerLabDir = path.join(homeDir, '.transformerlab/src/');
const commandExistsSync = require('command-exists').sync;

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
  const logFilePath = path.join(transformerLabDir, 'local_server.log');
  const out = fs.openSync(logFilePath, 'a');
  const err = fs.openSync(logFilePath, 'a');

  const options = {
    cwd: transformerLabDir,
    stdio: ['ignore', out, err],
    shell: '/bin/bash',
  };
  console.log('Starting local server at', mainFile);
  localServer = spawn('bash', ['-l', mainFile], options);

  console.log('Local server started with pid', localServer.pid);

  return new Promise((resolve) => {
    // localServer.stderr.on('data', (data) => {
    //   console.error(`stderr: ${data}`);
    // });

    localServer.on('close', (code) => {
      console.log(`child process exited with code ${code}`);
      resolve({ status: 'error', code: code });
    });

    localServer.on('error', (code) => {
      resolve({ status: 'error', code: code });
    });

    localServer.on('exit', (code) => {
      console.log(`child process exited with code ${code}`);

      if (code === 0) {
        resolve({ status: 'success', code: code });
      } else {
        resolve({
          status: 'error',
          code: code,
          message: 'May be fixed by running ~/.transformerlab/src/init.sh',
        });
      }
    });
  });
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

  if (!fs.existsSync(transformerLabRootDir)) {
    fs.mkdirSync(transformerLabRootDir);
  }

  const options = { shell: '/bin/bash', cwd: transformerLabRootDir };
  try {
    const child = exec(
      'curl https://raw.githubusercontent.com/transformerlab/transformerlab-api/main/install.sh | bash',
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

export function checkIfShellCommandExists(command: string) {
  if (commandExistsSync(command)) {
    return true;
  } else {
    return false;
  }
}

export function checkIfCondaBinExists() {
  // Look for the file ~/miniconda3/bin/conda
  const condaBin = path.join(homeDir, '.transformerlab/miniconda3/bin/conda');
  if (fs.existsSync(condaBin)) {
    return true;
  } else {
    return false;
  }
}

export async function checkDependencies() {
  // First activate the transformerlab environment
  // Then run pip list
  // Then compare the output to the list of dependencies
  // If any are missing, return the missing ones
  // If all are present, manually check if the uvicorn command is present
  const command = '~/.transformerlab/src/install.sh list_installed_packages';
  const options = { shell: '/bin/bash' };
  const { stdout, stderr } = await awaitExec(command, options).catch((err) => {
    console.log('Error running pip list', err);
    return {
      stdout: false,
      stderr: err,
    };
  });

  // if there was an error abort processing
  if (!stdout) {
    if (stderr) console.error('stderr:', stderr);
    return ['Failed to detect packages'];
  }
  console.log('stdout:', stdout);

  const pipList = JSON.parse(stdout);
  const pipListNames = pipList.map((x) => x.name);
  const keyDependencies = [
    'fastapi',
    'pydantic',
    'uvicorn',
    'sentencepiece',
    'torch',
    'transformers',
    'peft',
    'packaging',
    'fschat',
  ];

  //compare the list of dependencies to the keyDependencies
  let missingDependencies = [];
  for (let i = 0; i < keyDependencies.length; i++) {
    if (!pipListNames.includes(keyDependencies[i])) {
      missingDependencies.push(keyDependencies[i]);
    }
  }

  console.log('missingDependencies', missingDependencies);
  return missingDependencies;
}

export async function checkIfCondaEnvironmentExists() {
  const options = { shell: '/bin/bash' };
  console.log('Checking if Conda environment "transformerlab" exists');
  const command = '~/.transformerlab/src/install.sh list_environments';

  const { stdout, stderr } = await awaitExec(command, options).catch((err) => {
    return {
      stdout: false,
      stderr: err,
    };
  });
  if (stdout) console.log('stdout:', stdout);
  if (stderr) console.error('stderr:', stderr);

  // search for the string "transformerlab" in the output AND check that the directory exists
  if (
    stdout &&
    stdout.includes(path.join(homeDir, '.transformerlab/envs/transformerlab')) &&
    fs.existsSync(path.join(homeDir, '.transformerlab/envs/transformerlab'))
  ) {
    return true;
  } else {
    return false;
  }
}

export async function executeInstallStep(
  argument: string,
  useLocalInstallSh = false
) {
  if (!fs.existsSync(transformerLabRootDir)) {
    fs.mkdirSync(transformerLabRootDir);
  }
  const options = { cwd: transformerLabRootDir };
  console.log('Running install.sh ' + argument);

  if (useLocalInstallSh) {
    console.log(
      `Using local install.sh and running: ~/.transformerlab/src/install.sh ${argument}`
    );
    const { stdout, stderr } = await awaitExec(
      `~/.transformerlab/src/install.sh ${argument}`,
      options
    ).catch((err) => {
      console.log('Error running install.sh', err);
      return {
        stdout: false,
        stderr: err,
      };
    });
    if (stdout) console.log('stdout:', stdout);
    if (stderr) console.error('stderr:', stderr);
  } else {
    const { stdout, stderr } = await awaitExec(
      `curl https://raw.githubusercontent.com/transformerlab/transformerlab-api/main/install.sh | bash -s -- ${argument}`,
      options
    ).catch((err) => {
      console.log('Error running install.sh', err);
      return {
        stdout: false,
        stderr: err,
      };
    });
    if (stdout) console.log('stdout:', stdout);
    if (stderr) console.error('stderr:', stderr);
  }
}
