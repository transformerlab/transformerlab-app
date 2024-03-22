/* eslint-disable prefer-template */
/* eslint global-require: off, no-console: off, promise/always-return: off */

/**
 * This module executes inside of electron's main process. You can start
 * electron renderer process from here and communicate with the other processes
 * through IPC.
 *
 * When running `npm run build` or `npm run build:main`, this file is compiled to
 * `./src/main.js` using webpack. This gives us some performance wins.
 */
import path from 'path';
import {
  app,
  BrowserWindow,
  shell,
  ipcMain,
  utilityProcess,
  Menu,
  dialog,
} from 'electron';
import { autoUpdater } from 'electron-updater';
import log from 'electron-log';
import Store from 'electron-store';

import MenuBuilder from './menu';
import {
  checkLocalServerVersion,
  resolveHtmlPath,
  startLocalServer,
  installLocalServer,
  killLocalServer,
  executeInstallStep,
  checkIfCondaEnvironmentExists,
  checkDependencies,
  checkIfCondaBinExists,
} from './util';

// ////////////
// STORAGE
// ////////////
const store = new Store();
store.set('unicorn', '🦄');

console.log = log.log;
console.error = log.error;
log.info('Log from the main process');

ipcMain.handle('getStoreValue', (event, key) => {
  return store.get(key);
});

ipcMain.handle('setStoreValue', (event, key, value) => {
  console.log('setting', key, value);
  return store.set(key, value);
});

ipcMain.handle('deleteStoreValue', (event, key) => {
  console.log('deleting', key);
  return store.delete(key);
});
// ////////////
// ////////////

ipcMain.handle('server:checkIfInstalledLocally', async (event) => {
  return await checkLocalServerVersion() !== false;
});

ipcMain.handle('server:checkLocalVersion', async (event) => {
  return await checkLocalServerVersion();
});

ipcMain.handle('server:startLocalServer', async (event) => {
  return await startLocalServer();
});

ipcMain.handle('server:InstallLocally', async (event) => {
  return await installLocalServer();
});

ipcMain.handle('server:install_conda', async (event) => {
  console.log('** Installing conda');
  await executeInstallStep('install_conda');
  console.log('Finishing installing conda');
  return;
});

ipcMain.handle('server:install_create-conda-environment', async (event) => {
  return executeInstallStep('create_conda_environment');
});

ipcMain.handle('server:install_install-dependencies', async (event) => {
  return executeInstallStep('install_dependencies');
});

ipcMain.handle('server:checkIfCondaExists', async (event) => {
  const r = await checkIfCondaBinExists();
  console.log('conda exists', r);
  return r;
});

ipcMain.handle('server:checkIfCondaEnvironmentExists', async (event) => {
  const envList = await checkIfCondaEnvironmentExists();
  console.log('envList', envList);
  return envList;
});

ipcMain.handle('server:checkDependencies', async (event) => {
  return await checkDependencies();
});

let mainWindow: BrowserWindow | null = null;

process.on('uncaughtException', function (error) {
  console.log(error);
});

if (process.env.NODE_ENV === 'production') {
  const sourceMapSupport = require('source-map-support');
  sourceMapSupport.install();
}

const isDebug =
  process.env.NODE_ENV === 'development' || process.env.DEBUG_PROD === 'true';

if (isDebug) {
  require('electron-debug')();
}

if (isDebug) {
  // autoUpdater.forceDevUpdateConfig = true;
  // console.log('Looking for dev-app-update.yml in', app.getAppPath());
  // autoUpdater.updateConfigPath = path.join(__dirname, 'dev-app-update.yml');
  autoUpdater.on('error', (error) => {
    dialog.showErrorBox(
      'AutoUpdate Error: ',
      error == null ? 'unknown' : (error.stack || error).toString()
    );
  });
}

autoUpdater.autoDownload = false;

class AppUpdater {
  constructor() {
    log.transports.file.level = 'info';
    autoUpdater.logger = log;
    autoUpdater.checkForUpdates();
  }
}

const installExtensions = async () => {
  const installer = require('electron-devtools-installer');
  const forceDownload = !!process.env.UPGRADE_EXTENSIONS;
  const extensions = ['REACT_DEVELOPER_TOOLS'];

  return installer
    .default(
      extensions.map((name) => installer[name]),
      forceDownload
    )
    .catch(console.log);
};

const createWindow = async () => {
  if (isDebug) {
    await installExtensions();
  }

  const RESOURCES_PATH = app.isPackaged
    ? path.join(process.resourcesPath, 'assets')
    : path.join(__dirname, '../../assets');

  const getAssetPath = (...paths: string[]): string => {
    return path.join(RESOURCES_PATH, ...paths);
  };

  mainWindow = new BrowserWindow({
    show: false,
    width: 1200,
    height: 728,
    minWidth: 900,
    minHeight: 640,
    icon: getAssetPath('icon.png'),
    titleBarStyle: 'hiddenInset',
    vibrancy: 'light',
    visualEffectState: 'followWindow',
    webPreferences: {
      webSecurity: false,
      preload: app.isPackaged
        ? path.join(__dirname, 'preload.js')
        : path.join(__dirname, '../../.erb/dll/preload.js'),
    },
  });

  mainWindow.loadURL(resolveHtmlPath('index.html'));

  mainWindow.on('ready-to-show', () => {
    if (!mainWindow) {
      throw new Error('"mainWindow" is not defined');
    }
    if (process.env.START_MINIMIZED) {
      mainWindow.minimize();
    } else {
      mainWindow.show();
    }
  });

  mainWindow.on('closed', () => {
    mainWindow = null;
  });

  const menuBuilder = new MenuBuilder(mainWindow);
  menuBuilder.buildMenu();

  // Open urls in the user's browser
  mainWindow.webContents.setWindowOpenHandler((edata) => {
    shell.openExternal(edata.url);
    return { action: 'deny' };
  });

  sshClient(mainWindow);

  // Remove this if your app does not use auto updates
  // eslint-disable-next-line
  new AppUpdater();
};

const appAboutOptions = {
  applicationName: 'Transformer Lab',
  applicationVersion: app.getVersion(),
  credits: 'Made by @aliasaria and @dadmobile',
  authors: ['Ali Asaria', 'Tony Salomone'],
  website: 'https://transformerlab.ai',
  // iconPath: path.join(__dirname, 'assets/icon.png'),
};
app.setAboutPanelOptions(appAboutOptions);

/**
 * Add event listeners...
 */

app.on('window-all-closed', async () => {
  // Respect the OSX convention of having the application in memory even
  // after all windows have been closed
  console.log('window-all-closed');
  await killLocalServer();

  if (process.platform !== 'darwin') {
    app.quit();
  }
});

// The following solution is from StackOverflow because
// Electron doesn't have a syncronous before-quit event
// Which means our kill command never completes before the app quits
// https://github.com/electron/electron/issues/9433
let asyncOperationDone = false;

app.on('before-quit', async (e) => {
  if (!asyncOperationDone) {
    e.preventDefault();

    try {
      await killLocalServer();
    } catch (err) {
      console.log('Failed to kill local server', err);
    }
    asyncOperationDone = true;
    console.log('async operation done, quitting');
    app.quit();
  }
});

// /////////////////////////////
import sshClient from './ssh-client';
// /////////////////////////////

// AUTO UPDATER
let updater;

function sendStatusToWindow(text) {
  log.info(text);
  mainWindow?.webContents.send('autoUpdater', text);
}

autoUpdater.on('checking-for-update', () => {
  console.log('main.js: Checking for update...');
  sendStatusToWindow('Checking for update...');
});
autoUpdater.on('update-available', (info) => {
  console.log('main.js: Update available...');
  // sendStatusToWindow('Update available.');

  dialog
    .showMessageBox({
      type: 'info',
      title: 'Found Updates',
      message:
        'An updated version of Transformer Lab is available, do you want update now?',
      buttons: ['Yes', 'No'],
    })
    .then((buttonIndex) => {
      if (buttonIndex.response === 0) {
        autoUpdater.downloadUpdate();
      } else {
        updater.enabled = true;
        updater = null;
      }
    });
});
autoUpdater.on('update-not-available', (info) => {
  console.log('main.js: Update not available...');
  // sendStatusToWindow('Update not available.');
  // dialog.showMessageBox({
  //   title: 'No Updates',
  //   message: 'Current version is up-to-date.',
  // });
  // updater.enabled = true;
  // updater = null;
});
autoUpdater.on('error', (err) => {
  console.log('main.js: Error in auto-updater. ' + err);
  // sendStatusToWindow('main.js: Error in auto-updater. ' + err);
});
autoUpdater.on('download-progress', (progressObj) => {
  let log_message = 'Download speed: ' + progressObj.bytesPerSecond;
  log_message = log_message + ' - Downloaded ' + progressObj.percent + '%';
  log_message =
    log_message +
    ' (' +
    progressObj.transferred +
    '/' +
    progressObj.total +
    ')';
  sendStatusToWindow(log_message);
});
autoUpdater.on('update-downloaded', (info) => {
  console.log('main.js: Update downloaded...');
  // sendStatusToWindow('Update downloaded');
  dialog
    .showMessageBox({
      title: 'Install Updates',
      message: 'Updates downloaded. Press ok to update and restart now.',
    })
    .then(() => {
      setImmediate(() => autoUpdater.quitAndInstall());
    });
});

app
  .whenReady()
  .then(() => {
    createWindow();

    app.on('activate', () => {
      // On macOS it's common to re-create a window in the app when the
      // dock icon is clicked and there are no other windows open.
      if (mainWindow === null) createWindow();
    });
  })
  .catch(console.log);
