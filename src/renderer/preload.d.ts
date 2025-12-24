// Cloud mode type definitions
export type Channels = '';

export interface ElectronHandler {
  ipcRenderer: {
    sendMessage(channel: Channels, ...args: unknown[]): void;
    on(channel: Channels, func: (...args: unknown[]) => void): () => void;
    once(channel: Channels, func: (...args: unknown[]) => void): void;
    invoke(channel: Channels, ...args: unknown[]): Promise<unknown>;
    removeAllListeners(channel: string): void;
  };
}

export interface PlatformInfo {
  appmode: 'cloud';
  environment: string;
  version: string;
  multiuser?: boolean;
}

export interface StorageAPI {
  get(key: string): Promise<any>;
  set(key: string, value: any): Promise<void>;
  delete(key: string): Promise<void>;
}

export interface AutoUpdaterAPI {
  onMessage(callback: (event: any, message: string) => void): void;
  removeAllListeners(): void;
  requestUpdate(): Promise<unknown>;
}

declare global {
  // eslint-disable-next-line no-unused-vars
  interface Window {
    electron: ElectronHandler;
    platform: PlatformInfo;
    storage: StorageAPI;
    autoUpdater: AutoUpdaterAPI;
    TransformerLab?: {
      API_URL?: string;
    };
  }
}

export {};
