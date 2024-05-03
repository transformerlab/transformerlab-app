var Client = require('electron-ssh2').Client;
import { app, ipcMain } from 'electron';

import * as shellCommands from './shell_commands/shellCommands';

const HOME_DIR = app.getPath('home');

const default_private_key = '';
const default_private_key_location = HOME_DIR + '/.ssh/id_rsa';

var mainWindow = null;

function sendToRenderer(channel, data) {
  if (mainWindow === null) {
    console.log('mainWindow is null');
    return;
  }
  mainWindow.webContents.send(channel, data);
}

ipcMain.handle('ssh:connect', (event, key) => {
  console.log('ssh:connect');

  // Core SSH connection parameters
  const host = key.host;
  const username = key.username;
  const password = key.password;
  const sshkeylocation = key?.sshkeylocation;

  // Extra options:
  const update_and_install = key?.update_and_install;
  const create_reverse_tunnel = key?.create_reverse_tunnel;
  const run_permanent = key?.run_permanent;

  const tryKeyboard = key?.tryKeyboard;
  console.log('tryKeyboard', tryKeyboard);

  if (sshkeylocation) {
    var private_key = require('fs').readFileSync(sshkeylocation, 'utf8');
  } else {
    var private_key = require('fs').readFileSync(
      default_private_key_location,
      'utf8'
    );
  }

  var result = '';

  ipcMain.removeAllListeners('ssh:data');
  ipcMain.removeAllListeners('ssh:resize');
  var conn = new Client();

  conn
    .on('ready', function () {
      sendToRenderer('ssh:connected', true);
      console.log('Client :: ready');
      conn.shell(function (err, stream) {
        if (err) {
          console.log('error', err);
          sendToRenderer('ssh:connected', false);
          return conn.end();
        }
        stream
          .on('close', function () {
            console.log('Stream :: close');
            conn.end();
            ipcMain.removeAllListeners('ssh:data');
            ipcMain.removeAllListeners('ssh:resize');
          })
          .on('data', function (data) {
            sendToRenderer('ssh:data', data.toString('utf-8'));
          });

        if (update_and_install) {
          stream.write(shellCommands.updateAndInstallCommand);
        } else {
          stream.write(shellCommands.installOnlyIfNotInstalledCommand);
        }

        if (create_reverse_tunnel) {
          console.log('create_reverse_tunnel is not implemented yet');
        }

        if (run_permanent) {
          stream.write(shellCommands.runCommand);
        } else {
          stream.write(shellCommands.runCommandInBackground);
        }

        ipcMain.on('ssh:data', (event, key) => {
          stream.write(key);
        });
        ipcMain.on('ssh:resize', (event, key) => {
          stream.setWindow(data.rows, data.cols);
        });
      });
    })
    .connect({
      host: host,
      port: 22,
      username: username,
      password: password,
      privateKey: private_key,
      tryKeyboard: key?.tryKeyboard,
    });

  conn.on('end', (err) => {
    if (err) console.log('CONN END BY HOST', err);
  });
  conn.on('close', (err) => {
    if (err) console.log('CONN CLOSE', err);
  });
  conn.on('error', (err) => {
    console.log(err);
    // Send the error to the user
    sendToRenderer('ssh:data', err.toString('utf-8'));
  });
});

export default function setupSSHClient(browserWindow) {
  console.log('setting up ssh client');
  console.log(browserWindow);
  mainWindow = browserWindow;
}
