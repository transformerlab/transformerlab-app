// Cloud mode type definitions
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

declare global {
  // eslint-disable-next-line no-unused-vars
  interface Window {
    platform: PlatformInfo;
    storage: StorageAPI;
    TransformerLab?: {
      API_URL?: string;
      inferenceServerURL?: string;
    };
  }
}

export {};
