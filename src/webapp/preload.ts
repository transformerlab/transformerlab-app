// Create a namespace for your methods to avoid polluting the global namespace
window.storage = {
    // Add your methods here
    get: async (key: string) => {
        return localStorage.getItem(key);
    },
    set: (key: string, value: string) => {
        localStorage.setItem(key, value);
    },
    delete: (key: string) => {
        localStorage.removeItem(key);
    },

};

console.log('Browser preload script initialized. Browser is now available in the window object.');