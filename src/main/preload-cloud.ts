console.log('CLOUD PRELOAD');

window.platform = {
  appmode: 'cloud',
  environment: process.env.NODE_ENV,
  version: process.env.VERSION,
  multiuser: process.env.MULTIUSER === 'true',
};

window.storage = {
  get: (key: string) => {
    const keyValue = localStorage.getItem(key);
    try {
      return Promise.resolve(JSON.parse(keyValue));
    } catch (err) {
      // In case something made it into storage without getting stringify-ed
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
};
