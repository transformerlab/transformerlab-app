/* eslint import/prefer-default-export: off */
import { URL } from 'url';
import path from 'path';
const fs = require('fs');
const os = require('os');
const { spawn, exec, ChildProcess } = require('child_process');
const util = require('node:util');
const awaitExec = util.promisify(require('node:child_process').exec);
const homeDir = os.homedir();
const transformerLabRootDir = path.join(homeDir, '.transformerlab');
const transformerLabDir = path.join(transformerLabRootDir, 'src');
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

// Standardize how we decide if app is running on windows
export function isPlatformWindows() {
  return (process.platform == "win32");
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

  // Windows has its own install script so need to detect platform
  console.log("Platform:" + process.platform);
  const installScriptCommand = isPlatformWindows()
      ? `download_windows_api.bat`
      : `curl https://raw.githubusercontent.com/transformerlab/transformerlab-api/main/install.sh | bash -s -- download_transformer_lab`;
  const options = isPlatformWindows()
  ? {}
  : { shell: '/bin/bash', cwd: transformerLabRootDir };
  ;
  try {
    const child = exec(
      installScriptCommand,
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
  // Look for the conda directory inside .transformerlab
  const condaBin = isPlatformWindows()
      ? path.join(homeDir, '.transformerlab/miniconda3/Scripts')
      : path.join(homeDir, '.transformerlab/miniconda3/bin/conda');
  if (fs.existsSync(condaBin)) {
    return true;
  } else {
    console.log("Conda not found at " + condaBin)
    return false;
  }
}

export async function checkDependencies() {
  // First activate the transformerlab environment
  // Then run pip list
  // Then compare the output to the list of dependencies
  // If any are missing, return the missing ones
  // If all are present, manually check if the uvicorn command is present
  const stdout = await executeInstallStep("list_installed_packages");

  // if there was an error abort processing
  if (!stdout) {
    return ['Failed to detect packages'];
  }

  // parse returned JSON in to pipList
  let pipList = [];
  try {
    pipList = JSON.parse(stdout);
  } catch (e) {
    console.log(e);
    return ['Invalid package list returned'];
  }

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
  console.log('Checking if Conda environment "transformerlab" exists');

  const stdout = await executeInstallStep("list_environments");

  if (!stdout) {
    console.log("Conda environment check failed.");
    return false;
  }

  // search for the string "transformerlab" in the output AND check that the directory exists
  if (
    typeof stdout === 'string' &&
    stdout.includes(
      path.join(homeDir, '.transformerlab/envs/transformerlab')
    ) &&
    fs.existsSync(path.join(homeDir, '.transformerlab/envs/transformerlab'))
  ) {
    return true;
  } else {
    return false;
  }
}

/**
 * 
 * @param argument parameter to pass to install.sh 
 * @returns the stdout of the process or false on failure.
 */
export async function executeInstallStep(argument: string) {
  if (!fs.existsSync(transformerLabDir)) {
    console.log("Install step failed. TransformerLab directory has not been setup.")
    return false;
  }

  // Set installer script filename and options based on platform
  const installScriptFilename = isPlatformWindows()
      ? `install_windows.bat`
      : `install.sh`;
  const options = isPlatformWindows()
  ? {}
  : { cwd: transformerLabRootDir };
  ;
  console.log(`Running ${installScriptFilename} ${argument}`);


  const fullInstallScriptPath = path.join(transformerLabDir, installScriptFilename);
  console.log(
    `Running: ${fullInstallScriptPath} ${argument}`
  );

  // Call installer script and return stdout if it succeeds
  const { stdout, stderr } = await awaitExec(
    `${fullInstallScriptPath} ${argument}`,
    options
  ).catch((err) => {
    console.log(`Error running ${installScriptFilename}`, err);
    return {
      stdout: false,
      stderr: err,
    };
  });
  if (stdout) console.log(`${installScriptFilename} stdout:`, stdout);
  if (stderr) console.error(`${installScriptFilename} stderr:`, stderr);
  return stdout;
}
