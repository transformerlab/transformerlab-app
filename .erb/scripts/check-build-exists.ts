// Check if the cloud bundle is built
import path from 'path';
import chalk from 'chalk';
import fs from 'fs';
import webpackPaths from '../configs/webpack.paths';

const cloudIndexPath = path.join(webpackPaths.distCloudPath, 'index.html');

if (!fs.existsSync(cloudIndexPath)) {
  throw new Error(
    chalk.whiteBright.bgRed.bold(
      'The app is not built yet. Build it by running "npm run build"',
    ),
  );
}
