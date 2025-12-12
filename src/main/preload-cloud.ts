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
  on: (_channel: string, _func: (...args: unknown[]) => void) => {},
  once: (_channel: string, _func: (...args: unknown[]) => void) => {},
  invoke: async (_channel: string, ..._args: unknown[]) => {
    console.log(`Invoking ${_channel} with args:`, _args);
    return new Promise((resolve) => {
      setTimeout(() => {
        resolve(`Response from ${_channel}`);
      }, 1); // Simulate async operation with 1 ms delay
    });
  },
  removeAllListeners: (_channel: string) => {},
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
  environment: process.env.NODE_ENV,
  version: process.env.VERSION,
  multiuser: process.env.MULTIUSER === 'true',
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

// Cloud mode auto-updater implementation
let updateMessageListeners: Array<(event: any, message: string) => void> = [];

const getAPIUrl = () => {
  // Try to get API URL from window or use default
  if (
    typeof window !== 'undefined' &&
    (window as any).TransformerLab?.API_URL
  ) {
    let apiUrl = (window as any).TransformerLab.API_URL;
    // Ensure trailing slash
    if (!apiUrl.endsWith('/')) {
      apiUrl += '/';
    }
    return apiUrl;
  }
  // Default to relative path if in browser
  return '/api/';
};

contextBridge.exposeInMainWorld('autoUpdater', {
  onMessage: (callback: (event: any, message: string) => void) => {
    updateMessageListeners.push(callback);
    // Return a function to remove the listener (for compatibility)
    return () => {
      updateMessageListeners = updateMessageListeners.filter(
        (cb) => cb !== callback,
      );
    };
  },
  removeAllListeners: () => {
    updateMessageListeners = [];
    ipcRenderer.removeAllListeners('autoUpdater');
  },
  requestUpdate: async () => {
    // Send initial checking message
    updateMessageListeners.forEach((listener) => {
      listener(null, 'Checking for update...');
    });

    try {
      // Get current version
      const platformVersion = (window as any).platform?.version || '0.0.0';

      // Check GitHub for latest release
      const response = await fetch(
        'https://api.github.com/repos/transformerlab/transformerlab-app/releases/latest',
      );
      if (!response.ok) {
        throw new Error('Failed to fetch latest release');
      }

      const release = await response.json();
      const latestTag = release.tag_name;

      // Compare versions
      if (latestTag !== platformVersion) {
        // Update available - notify listeners
        updateMessageListeners.forEach((listener) => {
          listener(null, 'Update available');
        });
      } else {
        // No update available
        updateMessageListeners.forEach((listener) => {
          listener(null, 'Update not available.');
        });
      }
    } catch (error) {
      console.error('Error checking for updates:', error);
      updateMessageListeners.forEach((listener) => {
        listener(null, 'Update error');
      });
    }
  },
  downloadUpdate: async () => {
    // Send downloading message
    updateMessageListeners.forEach((listener) => {
      listener(null, 'Downloading update...');
    });

    try {
      const apiUrl = getAPIUrl();
      // Get auth token and team from localStorage
      const accessToken =
        typeof window !== 'undefined'
          ? localStorage.getItem('access_token')
          : null;
      let currentTeam: { id: string; name: string } | null = null;
      if (typeof window !== 'undefined') {
        try {
          const teamStr = localStorage.getItem('current_team');
          if (teamStr) {
            currentTeam = JSON.parse(teamStr);
          }
        } catch {
          currentTeam = null;
        }
      }

      const headers: Record<string, string> = {
        'Content-Type': 'application/json',
      };

      // Add auth header if token exists
      if (accessToken) {
        headers['Authorization'] = `Bearer ${accessToken}`;
      }

      // Add team headers if team exists (required for authenticated endpoints)
      if (currentTeam) {
        headers['X-Team-Id'] = currentTeam.id;
        headers['X-Team-Name'] = currentTeam.name;
      }

      const response = await fetch(`${apiUrl}server/update`, {
        method: 'POST',
        headers,
      });

      if (!response.ok) {
        const errorData = await response
          .json()
          .catch(() => ({ detail: 'Unknown error' }));
        throw new Error(
          errorData.detail || `Update failed with status ${response.status}`,
        );
      }

      const result = await response.json();
      // Notify that download completed
      updateMessageListeners.forEach((listener) => {
        listener(null, 'Update downloaded');
      });
    } catch (error) {
      console.error('Error downloading update:', error);
      updateMessageListeners.forEach((listener) => {
        listener(null, 'Update error');
      });
    }
  },
});
