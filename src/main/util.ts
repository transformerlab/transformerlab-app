/* eslint import/prefer-default-export: off */
import { URL } from 'url';
import path from 'path';
import { log } from 'console';
import { dialog } from 'electron';
const fs = require('fs');
const os = require('os');
const { spawn, exec, ChildProcess } = require('child_process');
const util = require('node:util');
const awaitExec = util.promisify(require('node:child_process').exec);

const homeDir = os.homedir();
const transformerLabRootDir = path.join(homeDir, '.transformerlab');
const transformerLabDir = path.join(transformerLabRootDir, 'src');

var localServer: typeof ChildProcess = null;

// Standardize how we decide if app is running on windows
export function isPlatformWindows() {
  return process.platform == 'win32';
}

// WINDOWS SPECIFIC FUNCTION for figuring out how to access WSL file system
// API and workspace are installed in .transformerlab/ under the user's homedir
// On Windows, we use the home directory on WSL file system.
// This outputs how to access the WSL file system homedir from Windows.
async function getWSLHomeDir() {
  // We do not have to change the default encoding because this command
  // is run on linux, not windows, so we get utf-8
  const { stdout, stderr } = await awaitExec('wsl wslpath -w ~');
  if (stderr) console.error(`stderr: ${stderr}`);
  const homedir = stdout.trim();
  return homedir;
}

// Need to wrap directories in functions to cover the windows-specific case
async function getTransformerLabRootDir() {
  return isPlatformWindows()
    ? path.join(await getWSLHomeDir(), '.transformerlab')
    : transformerLabRootDir;
}

export async function getTransformerLabCodeDir() {
  return isPlatformWindows()
    ? path.join(await getTransformerLabRootDir(), 'src')
    : transformerLabDir;
}

export async function getLogFilePath() {
  return path.join(await getTransformerLabRootDir(), 'local_server.log');
}

export function resolveHtmlPath(htmlFileName: string) {
  if (process.env.NODE_ENV === 'development') {
    const port = process.env.PORT || 1212;
    const url = new URL(`http://localhost:${port}`);
    url.pathname = htmlFileName;
    return url.href;
  }
  return `file://${path.resolve(__dirname, '../renderer/', htmlFileName)}`;
}

// returns a string with the first encountered missing system requirement
// otherwise returns false
export async function checkForMissingSystemRequirements() {
  const platform = process.platform;
  switch (platform) {
    case 'win32':
      try {
        // Try running WSL to check for version
        // This may throw an exception if the WSL command is not availabile
        // Otherwise, return any errors
        const { stdout, stderr } = await awaitExec('wsl -l -v');
        if (stderr) return stderr;
      } catch (error) {
        return 'TransformerLab API requires WSL to run on Windows.';
      }

      try {
        // Let's call `wsl --status` and see what the default
        // version and distro of wsl is:
        // We must use encoding = utf16le because that is the default for powershell
        // according to https://learn.microsoft.com/en-us/powershell/module/microsoft.powershell.core/about/about_character_encoding?view=powershell-7.4
        // There is a potential for a bug here if the user changed their powershell encoding.
        const { stdout, stderr } = await awaitExec('wsl --status', {
          encoding: 'utf16le',
        });
        if (stderr) return stderr;

        //Read the output. The output looks like this:
        //Default Distribution: Ubuntu
        //Default Version: 2
        //So parse out the distro and version:
        const lines = stdout.split('\n');
        let distro = '';
        let version = '';
        for (let i = 0; i < lines.length; i++) {
          if (lines[i].includes('Default Distribution:')) {
            distro = lines[i].split(': ')[1];
          }
          if (lines[i].includes('Default Version:')) {
            version = lines[i].split(': ')[1];
          }
        }
        distro = distro.trim();
        version = version.trim();
        // Now print out the distro and version:
        console.log(`WSL distro: ${distro}`);
        console.log(`WSL version: ${version}`);

        // Check if the distro is set to Ubuntu and the version is 2
        // Removing this check for now as it seems to fail on some systems (not sure why)
        // if (distro != 'Ubuntu' || version != '2') {
        //   return `WSL distro must be set to Ubuntu and version 2. Please run 'wsl --set-version Ubuntu 2'.`;
        // }
      } catch (error) {
        return 'WSL is not enabled. Please enable WSL and install a distro.';
      }

      try {
        // We will need to be able to use the wslpath utility
        // This may not be available if the user has not installed WSL
        const { stdout, stderr } = await getWSLHomeDir();
        if (stderr) return stderr;
      } catch (error) {
        return "WSL file system unavailable: Is WSL installed (try 'wsl --install')?";
      }

      // Everything checks out OK!
      return false;

    // Currently nothing to check for on other platforms
    default:
      return false;
  }
}

export async function checkLocalServerVersion() {
  const mainFile = path.join(
    await getTransformerLabCodeDir(),
    'LATEST_VERSION'
  );

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

export async function startLocalServer() {
  const server_dir = await getTransformerLabCodeDir();
  const logFilePath = await getLogFilePath();
  const out = fs.openSync(logFilePath, 'a');
  // const err = fs.openSync(logFilePath, 'a');

  // Need to call bash script through WSL on Windows
  // Windows will not let you set a UNC directory to cwd
  // Consequently, we have to make a cd call first
  const exec_cmd = isPlatformWindows() ? 'wsl' : 'bash';
  const exec_args = isPlatformWindows()
    ? ['cd', '~/.transformerlab/src/', '&&', './run.sh']
    : ['-l', path.join(server_dir, 'run.sh')];
  const options = isPlatformWindows()
    ? {
        // stdio: ['ignore', out, err],
      }
    : {
        cwd: server_dir,
        // stdio: ['ignore', out, err],
        shell: '/bin/bash',
      };

  localServer = spawn(exec_cmd, exec_args, options);

  console.log('Local server started with pid', localServer.pid);

  return new Promise((resolve) => {
    let err_msg;

    // if there was an error spawning then stderr will be null
    if (localServer.stderr) {
      localServer.stderr.on('data', (data) => {
        console.error(`stderr: ${data}`);
        fs.writeSync(out, data);

        if (data.includes('Uvicorn running on')) {
          console.log('Server is running');
          resolve({ status: 'success', code: 0 });
        }
      });
    }

    localServer.stdout.on('data', (data) => {
      console.log(`stdout: ${data}`);
      fs.writeSync(out, data);
    });

    localServer.on('error', (error_msg) => {
      console.log(`child process failed: ${error_msg}`);
      err_msg = error_msg;
    });

    localServer.on('close', (code) => {
      console.log(`child process exited with code ${code}`);

      if (code === 0) {
        resolve({ status: 'success', code: code });
      } else {
        resolve({
          status: 'error',
          code: code,
          message: `${err_msg} (code ${code}). Check log for details: ${logFilePath}`,
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

export async function checkIfCurlInstalled() {
  try {
    const { stdout, stderr } = await awaitExec('curl --version');
    if (stderr) {
      console.error(`stderr: ${stderr}`);
      return false;
    }
    console.log(`stdout: ${stdout}`);
    return true;
  }
  catch (error) {
    console.error(`Failed to check if curl is installed: ${error}`);
    return false;
  }
}

export async function installLocalServer() {
  console.log('Installing local server');

  const server_dir = await getTransformerLabCodeDir();
  const logFilePath = await getLogFilePath();
  const out = fs.openSync(logFilePath, 'a');

  const root_dir = await getTransformerLabRootDir();
  if (!fs.existsSync(root_dir)) {
    fs.mkdirSync(root_dir);
  }

  // We can download the API in one line for linux/mac
  // but it's a little more complicated for windows, so call a bat file
  console.log('Platform:' + process.platform);

  // First check if curl is installed on the client machine:
  const curlInstalled = await checkIfCurlInstalled();
  if (!curlInstalled) {
    dialog.showMessageBox({message: 'Curl is not installed. Please install curl and try again.'});
    return;
  }

  const download_cmd = `curl https://raw.githubusercontent.com/transformerlab/transformerlab-api/main/install.sh | bash -s -- download_transformer_lab`;
  const installScriptCommand = isPlatformWindows()
    ? `wsl ` + download_cmd
    : download_cmd;
  const options = isPlatformWindows()
    ? {}
    : { shell: '/bin/bash', cwd: root_dir };
  try {
    const child = exec(
      installScriptCommand,
      options,
      (error, stdout, stderr) => {
        if (error) {
          dialog.showMessageBox({message: `Failed to download Transformer Lab ${error}`});
          console.error(`exec error: ${error}`);
          return;
        }
        console.log(`stdout: ${stdout}`);
        console.error(`stderr: ${stderr}`);
        // write stdout to the file called out:
        fs.writeSync(out, stdout);
      }
    );
  } catch (err) {
    console.log('Failed to install local server', err);
  }
}

export async function checkIfCondaBinExists() {
  // Look for the conda directory inside .transformerlab
  const root_dir = await getTransformerLabRootDir();
  const condaBin = path.join(root_dir, 'miniconda3', 'bin', 'conda');
  if (fs.existsSync(condaBin)) {
    return true;
  } else {
    console.log('Conda not found at ' + condaBin);
    return false;
  }
}

export async function checkDependencies() {
  // This function returns an API like response with status, message and data field
  let response = {
    status: '',
    message: '',
    data: [],
  };

  // check if we've done an install/update of dependencies with this build
  // if not, report back that we need to do an install/update!
  const installedDependenciesFile = path.join(
    await getTransformerLabCodeDir(),
    'INSTALLED_DEPENDENCIES'
  );
  if (!fs.existsSync(installedDependenciesFile)) {
    response.status = 'error';
    response.message = 'Dependencies need to be installed for new API version.';
    return response;
  }

  const { error, stdout, stderr } = await executeInstallStep(
    'list_installed_packages',
    false
  );

  // if there was an error abort processing
  if (error) {
    response.status = 'error';
    response.message = 'Failed to detect packages';
    response.data = { stdout: '', stderr: stderr.toString() };
    console.log('Failed to detect packages');
    console.log(JSON.stringify(response));
    return response;
  }

  // parse returned JSON in to pipList
  let pipList = [];
  try {
    pipList = JSON.parse(stdout);
  } catch (e) {
    console.log(e);
    response.status = 'error';
    response.message = 'Failed to parse package list';
    response.data = { stdout, stderr };
    return response;
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

  response.data = missingDependencies;
  console.log('missingDependencies', missingDependencies);
  if (missingDependencies.legnth > 0) {
    response.status = 'error';
    const missingList = missingDependencies.data?.join(', ');
    response.message = `Missing dependencies including: ${missingList}...`;
  } else {
    response.status = 'success';
  }
  return response;
}

export async function checkIfCondaEnvironmentExists() {
  console.log('Checking if Conda environment "transformerlab" exists');

  const { error, stdout, stderr } = await executeInstallStep(
    'list_environments',
    false
  );

  let response = {
    status: '',
    message: '',
    data: [],
  };

  console.log(JSON.stringify({ error, stdout, stderr }));

  if (error) {
    response.status = 'error';
    response.message = 'Conda environment check failed. ' + error;
    response.data = { stdout: stdout?.toString(), stderr: stderr.toString() };
    console.log(response.message);
    return response;
  }

  // search for the string "transformerlab" in the output AND check that the directory exists
  // On windows we don't have the full WSL homedir path so just check the end of the string
  const root_dir = await getTransformerLabRootDir();
  const env_path = isPlatformWindows()
    ? '.transformerlab/envs/transformerlab'
    : path.join(root_dir, 'envs', 'transformerlab');
  if (
    typeof stdout === 'string' &&
    stdout.includes(env_path) &&
    fs.existsSync(path.join(root_dir, 'envs', 'transformerlab'))
  ) {
    response.status = 'success';
    return response;
  } else {
    response.status = 'error';
    response.message = 'Conda environment "transformerlab" not found.';
    return response;
  }
}

function truncate(str: string, max: number) {
  return str.length > max ? str.substr(0, max - 1) + '…' : str;
}

/**
 *
 * @param argument parameter to pass to install.sh
 * @returns the stdout of the process or false on failure.
 */
export async function executeInstallStep(
  argument: string,
  logToFile = true
): Promise<{ error: string | null; stdout: string; stderr: string }> {
  const server_dir = await getTransformerLabCodeDir();
  const logFilePath = await getLogFilePath();
  const out = fs.openSync(logFilePath, 'a');
  const err = fs.openSync(logFilePath, 'a');

  if (!fs.existsSync(server_dir)) {
    console.log(
      'Install step failed. TransformerLab directory has not been setup.'
    );
    const err = new Error('TransformerLab directory has not been setup.');
    return { error: err, stdout: '', stderr: '' };
  }

  const installScriptFilename = 'install.sh';
  const fullInstallScriptPath = path.join(server_dir, installScriptFilename);

  // Set installer script filename and options based on platform
  // For windows this is a bit hacky...we need to pass a unix-style path to WSL
  const exec_cmd = isPlatformWindows() ? `wsl` : `${fullInstallScriptPath}`;

  console.log(`Running: ${exec_cmd}`);
  // Call installer script and return stdout if it succeeds

  return new Promise<{ error: string | null; stdout: string; stderr: string }>(
    async (resolve) => {
      let error, stdout: string, stderr: string;

      stdout = '';
      stderr = '';

      const exec_args = isPlatformWindows()
        ? [`~/.transformerlab/src/${installScriptFilename}`, `${argument}`]
        : [`${argument}`];
      const options = {};

      let process = null;
      try {
        // console.log('Executing install step');
        // console.log(exec_cmd);
        // console.log(exec_args);
        process = spawn(exec_cmd, exec_args, options);
      } catch (err) {
        console.log('Failed to execute install step', err);
        console.log(JSON.stringify(err));
        resolve({
          error: err?.code,
          stdout: err?.stdout?.toString(),
          stderr: err?.stderr?.toString(),
        });
      }

      process.stderr.on('data', (data) => {
        // console.error(`stderr: ${data}`);
        stderr += data;
        if (logToFile) fs.writeSync(out, data);
      });

      process.stdout.on('data', (data) => {
        // console.log(`stdout: ${truncate(data.toString(), 100)}`);
        if (data) {
          stdout += data;
          if (logToFile) fs.writeSync(out, data);
        }
      });

      process.on('error', (error_msg) => {
        console.log(`child process failed: ${error_msg}`);
        error = error_msg;
        resolve({ error, stdout, stderr });
      });

      process.on('close', (code) => {
        console.log(`child process exited with code ${code}`);
        if (code === 0) {
          // console.log(stdout);
          resolve({
            error: null,
            stdout: stdout?.toString(),
            stderr: stderr?.toString(),
          });
        } else {
          resolve({
            error: '1',
            stdout: stdout,
            stderr: stderr,
          });
        }
      });
    }
  );
}
