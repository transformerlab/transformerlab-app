import { ElectronHandler } from 'main/preload';

interface Platform {
  node: () => string,
  chrome: () => string,
  electron: () => string,
  isMac: () => string,
  isWindows: () => string,
  isLinux: () => string,
  platform: () => string,
  arch: () => string,
}

declare global {
  // eslint-disable-next-line no-unused-vars
  interface Window {
    electron: ElectronHandler;
    TransformerLab: {
      API_URL?: string;
    }
    platform: Platform
    storage: Storage
  }

}

export {};
