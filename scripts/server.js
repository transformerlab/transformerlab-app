const http = require('http');
const fs = require('fs');
const path = require('path');
const url = require('url');

// Port to run the server on
const PORT = 4567;

// Directory containing your HTML files
const DIRECTORY = './release/cloud'; // Change this to your directory path if needed

// Create the HTTP server
const server = http.createServer((req, res) => {
  // Parse the URL to get the pathname
  const parsedUrl = url.parse(req.url);
  let pathname = parsedUrl.pathname;

  // Convert URL path to file path
  // Handle root path
  if (pathname === '/') {
    pathname = '/index.html';
  }

  // Create the full file path
  const filePath = path.join(DIRECTORY, pathname);

  // Read the file
  fs.readFile(filePath, (err, data) => {
    if (err) {
      // If file not found or error reading file
      if (err.code === 'ENOENT') {
        // File not found
        res.writeHead(404, { 'Content-Type': 'text/html' });
        res.end(
          '<h1>404 Not Found</h1><p>The requested file was not found on the server.</p>',
        );
      } else {
        // Server error
        res.writeHead(500, { 'Content-Type': 'text/html' });
        res.end(
          '<h1>500 Internal Server Error</h1><p>Error reading the requested file.</p>',
        );
      }
      return;
    }

    // Determine the content type based on file extension
    const ext = path.extname(filePath);
    let contentType = 'text/html';

    switch (ext) {
      case '.js':
        contentType = 'text/javascript';
        break;
      case '.css':
        contentType = 'text/css';
        break;
      case '.json':
        contentType = 'application/json';
        break;
      case '.png':
        contentType = 'image/png';
        break;
      case '.jpg':
      case '.jpeg':
        contentType = 'image/jpeg';
        break;
      case '.gif':
        contentType = 'image/gif';
        break;
      case '.svg':
        contentType = 'image/svg+xml';
        break;
    }

    // Serve the file
    res.writeHead(200, { 'Content-Type': contentType });
    res.end(data);
  });
});

// Start the server
server.listen(PORT, () => {
  console.log(`Server running at http://localhost:${PORT}/`);
  console.log(`Serving files from: ${path.resolve(DIRECTORY)}`);
});
