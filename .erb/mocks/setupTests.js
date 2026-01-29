// Mock window.platform
window.platform = {
  appmode: 'cloud',
  environment: 'test',
  version: '0.0.0',
  multiuser: false,
};

// Mock window.storage
window.storage = {
  get: jest.fn().mockResolvedValue(null),
  set: jest.fn().mockResolvedValue(),
  delete: jest.fn().mockResolvedValue(),
};

// Mock window.electron
window.electron = {
  ipcRenderer: {
    sendMessage: jest.fn(),
    on: jest.fn(),
    once: jest.fn(),
    invoke: jest.fn().mockResolvedValue(''),
    removeAllListeners: jest.fn(),
  },
};

// Mock window.autoUpdater
window.autoUpdater = {
  onMessage: jest.fn(),
  removeAllListeners: jest.fn(),
  requestUpdate: jest.fn(),
};

// Mock matchMedia
Object.defineProperty(window, 'matchMedia', {
  writable: true,
  value: jest.fn().mockImplementation((query) => ({
    matches: false,
    media: query,
    onchange: null,
    addListener: jest.fn(),
    removeListener: jest.fn(),
    addEventListener: jest.fn(),
    removeEventListener: jest.fn(),
    dispatchEvent: jest.fn(),
  })),
});

// Mock ResizeObserver
global.ResizeObserver = jest.fn().mockImplementation(() => ({
  observe: jest.fn(),
  unobserve: jest.fn(),
  disconnect: jest.fn(),
}));
