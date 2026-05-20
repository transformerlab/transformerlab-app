import detectPort from 'detect-port';

const port = process.env.PORT || '1212';

detectPort(port, (err, availablePort) => {
  // This is a hacked in place to check the version of Node but it works to prevent users from using Node 23 and above
  // because electron build breaks on Node 23. Remove this once electron is fixed.
  if (process.versions.node.split('.')[0] >= 23) {
    console.error(
      `Node.js version 23 and above are not supported. Current version: ${process.version}`,
    );
    process.exit(1);
  }

  if (port !== String(availablePort)) {
    throw new Error(
      `\x1b[1m\x1b[97m\x1b[41mPort "${port}" on "localhost" is already in use. Please use another port. ex: PORT=4343 npm start\x1b[0m`,
    );
  } else {
    process.exit(0);
  }
});
