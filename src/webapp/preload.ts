// Create a namespace for your methods to avoid polluting the global namespace
window.storage = {
    // Add your methods here
    get: async (key: string) => {
        return "localhost";
    },
    set: (key: string, value: string) => {
        return;
    },
    delete: (key: string) => {
        return;
    },

};

console.log('Browser preload script initialized. Browser is now available in the window object.');