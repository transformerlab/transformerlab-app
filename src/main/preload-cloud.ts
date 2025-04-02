// Disable no-unused-vars, broken for spread args
/* eslint no-unused-vars: off */

// webFrame.setZoomFactor(1);

console.log('CLOUD PRELOAD');

// This function contextBridge.exposeInMainWorld is a custom function that takes the provided argument
// adds it to the window object, and makes it available to the renderer process:
function exposeInMainWorld(key: string, value: unknown) {
  window[key] = value;
}

const contextBridge = {} as any;
contextBridge.exposeInMainWorld = exposeInMainWorld;

// Now make a stub ipcRenderer object that will fake the real ipcRenderer object:
const ipcRenderer = {
  send: async (_channel: string, ..._args: unknown[]) => {
    return new Promise((resolve) => {
      setTimeout(() => {
        console.log(`Message sent to ${_channel} with args:`, _args);
        resolve();
      }, 1); // Simulate async operation with 1 ms delay
    });
  },
  on: (_channel: string, _func: (...args: unknown[]) => void) => { },
  once: (_channel: string, _func: (...args: unknown[]) => void) => { },
  invoke: async (_channel: string, ..._args: unknown[]) => {
    console.log(`Invoking ${_channel} with args:`, _args);
    return new Promise((resolve) => {
      setTimeout(() => {
        resolve(`Response from ${_channel}`);
      }, 1); // Simulate async operation with 1 ms delay
    });
  },
  removeAllListeners: (_channel: string) => { },
};

// write to the browser window to break the HTML:
// export type Channels =
//   | 'getStoreValue'
//   | 'setStoreValue'
//   | 'deleteStoreValue'
//   | 'openURL'
//   | 'server:checkSystemRequirements'
//   | 'server:checkIfInstalledLocally'
//   | 'server:checkLocalVersion'
//   | 'server:startLocalServer'
//   | 'server:InstallLocally'
//   | 'server:install_conda'
//   | 'server:install_create-conda-environment'
//   | 'server:install_install-dependencies'
//   | 'server:checkIfCondaExists'
//   | 'server:checkIfCondaEnvironmentExists'
//   | 'server:checkIfUvicornExists'
//   | 'server:checkDependencies'
//   | 'serverLog:startListening'
//   | 'serverLog:stopListening'
//   | 'serverLog:update';

// actually make the Channels type empty:
export type Channels = '';

const electronHandler = {
  ipcRenderer: {
    sendMessage(channel: Channels, ...args: unknown[]) {
      ipcRenderer.send(channel, ...args);
    },
    on(channel: Channels, func: (...args: unknown[]) => void) {
      const subscription = (_event: any, ...args: unknown[]) => func(...args);
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

contextBridge.exposeInMainWorld('electron', electronHandler);

contextBridge.exposeInMainWorld('platform', {
  appmode: 'cloud',
  environment: process.env.NODE_ENV, // Webpack's EnvironmentPlugin will replace this with 'production' or 'development'
  version: process.env.VERSION,
});

contextBridge.exposeInMainWorld('storage', {
  get: (key: string) => {
    const keyValue = localStorage.getItem(key);
    try {
      return Promise.resolve(JSON.parse(keyValue));
    } catch (err) {
      // In case soemthing made it into storage wihout getting stringify-ed
      return Promise.resolve(keyValue);
    }
  },
  set: (key: string, value: any) => {
    localStorage.setItem(key, JSON.stringify(value));
    return Promise.resolve();
  },
  delete: (key: string) => {
    localStorage.removeItem(key);
    console.log('Deleted key from localStorage:', key);
    return Promise.resolve();
  },
});

// contextBridge.exposeInMainWorld('sshClient', {
//   connect: (data) => ipcRenderer.invoke('ssh:connect', data),
//   data: (data) => ipcRenderer.send('ssh:data', data),

//   onData: (data) => ipcRenderer.on('ssh:data', data),
//   onSSHConnected: (callback) => ipcRenderer.on('ssh:connected', callback),

//   removeAllListeners: () => {
//     ipcRenderer.removeAllListeners('ssh:data');
//     ipcRenderer.removeAllListeners('ssh:connected');
//   },
// });

contextBridge.exposeInMainWorld('autoUpdater', {
  onMessage: (f) => {
    f(null, 'Update not available.');
  },
  removeAllListeners: () => ipcRenderer.removeAllListeners('autoUpdater'),
  requestUpdate: () => ipcRenderer.invoke('autoUpdater:requestUpdate'),
});
