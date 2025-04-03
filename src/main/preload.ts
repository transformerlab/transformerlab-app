// Disable no-unused-vars, broken for spread args
/* eslint no-unused-vars: off */
import {
  contextBridge,
  ipcRenderer,
  IpcRendererEvent,
  webFrame,
} from 'electron';

webFrame.setZoomFactor(0.85);

export type Channels =
  | 'getStoreValue'
  | 'setStoreValue'
  | 'deleteStoreValue'
  | 'openURL'
  | 'server:checkSystemRequirements'
  | 'server:checkIfInstalledLocally'
  | 'server:checkLocalVersion'
  | 'server:startLocalServer'
  | 'server:InstallLocally'
  | 'server:install_conda'
  | 'server:install_create-conda-environment'
  | 'server:install_install-dependencies'
  | 'server:checkIfCondaExists'
  | 'server:checkIfCondaEnvironmentExists'
  | 'server:checkIfUvicornExists'
  | 'server:checkDependencies'
  | 'serverLog:startListening'
  | 'serverLog:stopListening'
  | 'serverLog:update';

const electronHandler = {
  ipcRenderer: {
    sendMessage(channel: Channels, ...args: unknown[]) {
      ipcRenderer.send(channel, ...args);
    },
    on(channel: Channels, func: (...args: unknown[]) => void) {
      const subscription = (_event: IpcRendererEvent, ...args: unknown[]) =>
        func(...args);
      ipcRenderer.on(channel, subscription);

      return () => {
        ipcRenderer.removeListener(channel, subscription);
      };
    },
    once(channel: Channels, func: (...args: unknown[]) => void) {
      ipcRenderer.once(channel, (_event, ...args) => func(...args));
    },
    invoke(channel: Channels, ...args: unknown[]) {
      return ipcRenderer.invoke(channel, ...args);
    },
    removeAllListeners: (channel: string) =>
      ipcRenderer.removeAllListeners(channel),
  },
};

export type ElectronHandler = typeof electronHandler;

contextBridge.exposeInMainWorld('electron', electronHandler);

contextBridge.exposeInMainWorld('platform', {
  appmode: 'electron',
  environment: process.env.NODE_ENV, // Webpack's EnvironmentPlugin will replace this with 'production' or 'development'
  version: process.env.npm_package_version,
});

contextBridge.exposeInMainWorld('storage', {
  get: (key: string) => {
    return ipcRenderer.invoke('getStoreValue', key);
  },
  set: (key: string, value: string) => {
    return ipcRenderer.invoke('setStoreValue', key, value);
  },
  delete: (key: string) => {
    console.log('inv delete', key);
    return ipcRenderer.invoke('deleteStoreValue', key);
  },
});

contextBridge.exposeInMainWorld('sshClient', {
  connect: (data) => ipcRenderer.invoke('ssh:connect', data),
  data: (data) => ipcRenderer.send('ssh:data', data),

  onData: (data) => ipcRenderer.on('ssh:data', data),
  onSSHConnected: (callback) => ipcRenderer.on('ssh:connected', callback),

  removeAllListeners: () => {
    ipcRenderer.removeAllListeners('ssh:data');
    ipcRenderer.removeAllListeners('ssh:connected');
  },
});

contextBridge.exposeInMainWorld('autoUpdater', {
  onMessage: (data) => ipcRenderer.on('autoUpdater', data),
  removeAllListeners: () => ipcRenderer.removeAllListeners('autoUpdater'),
  requestUpdate: () => ipcRenderer.invoke('autoUpdater:requestUpdate'),
});
