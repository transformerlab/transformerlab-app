const chokidar = require('chokidar');
const fs = require('fs');
const path = require('path');

const DEBUG = false;

module.exports = class FileWatcher {
    constructor(filepath, options = {}) {
        this.filepath = filepath;
        this.watcher = null;
        this.currentPosition = 0;
        this.eventHandlers = {};
        this.usePolling = false;

        if (options.usePolling) {
            this.usePolling = options.usePolling;
        }
    }

    start() {
        // Initialize watcher
        this.watcher = chokidar.watch(this.filepath, {
            persistent: true,
            usePolling: this.usePolling,
            awaitWriteFinish: {
                stabilityThreshold: 100,
                pollInterval: 100
            },
            interval: 300, // 300 milliseconds means the file won't be checked too often, consuming CPU
        });

        if (DEBUG) {
          console.log(`🤡 Watching file ${this.filepath} for changes...`);
        }

        // Set up initial file position
        if (fs.existsSync(this.filepath)) {
            const stats = fs.statSync(this.filepath);
            this.currentPosition = stats.size;
        }

        // Watch for changes
        this.watcher
            .on('add', (path) => this.handleFileEvent('add', path))
            .on('change', (path) => this.handleFileEvent('change', path))
            .on('unlink', (path) => this.handleFileEvent('unlink', path))
            .on('error', (error) => console.error(`Watcher error: ${error}`));
    }

    on(event, handler) {
        if (!this.eventHandlers[event]) {
            this.eventHandlers[event] = [];
        }
        this.eventHandlers[event].push(handler);
    }

    handleFileEvent(event, filepath) {
        if (event === 'unlink') {
            console.log(`Chokidar File Watcher: File ${filepath} has been removed`);
            this.currentPosition = 0;
            return;
        }

        if (event === 'add') {
            console.log(`Chokidar File Watcher: New file ${filepath} has been added`);
        }

        // Read new content
        this.streamChanges();
    }

    streamChanges() {
        fs.stat(this.filepath, (err, stats) => {
            if (err) {
                console.error(`Chokidar File Watcher: Error getting file stats: ${err}`);
                return;
            }

            if (stats.size < this.currentPosition) {
                // File was truncated, reset position
                this.currentPosition = 0;
            }

            if (stats.size > this.currentPosition) {
                // New content available
                const stream = fs.createReadStream(this.filepath, {
                    start: this.currentPosition,
                    encoding:'utf-8'
                });

                stream.on('data', (chunk) => {
                    // Process new content
                    if (DEBUG) console.log('Chokidar File Watcher: New content:', chunk);
                    this.triggerEvent('update', chunk);
                });

                stream.on('end', () => {
                    this.currentPosition = stats.size;
                });

                stream.on('error', (error) => {
                    console.error(`Chokidar File Watcher: Error reading file: ${error}`);
                });
            }
        });
    }

    triggerEvent(event, data) {
        if (this.eventHandlers[event]) {
            this.eventHandlers[event].forEach(handler => handler(data));
        }
    }

    stop() {
        if (this.watcher) {
            this.watcher.close();
        }
    }
}

// // Usage example
// const filepath = path.join(__dirname, 'example.log');
// const watcher = new FileWatcher(filepath);

// // Start watching
// watcher.start();

// // To stop watching (e.g., on process exit)
// process.on('SIGINT', () => {
//     console.log('Stopping file watcher...');
//     watcher.stop();
//     process.exit();
// });
