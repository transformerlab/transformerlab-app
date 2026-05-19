// Check if the cloud bundle is built
import path from 'path';
import fs from 'fs';
import webpackPaths from '../configs/webpack.paths';

const cloudIndexPath = path.join(webpackPaths.distCloudPath, 'index.html');

if (!fs.existsSync(cloudIndexPath)) {
  throw new Error(
    '\x1b[1m\x1b[97m\x1b[41mThe app is not built yet. Build it by running "npm run build"\x1b[0m',
  );
}
