const fs = require('fs');
const { execSync } = require('child_process');
const { version } = require('os');
const readline = require('node:readline');

const rl = readline.createInterface({
  input: process.stdin,
  output: process.stdout,
});

const files = [
  'package.json',
  'package-lock.json',
  'release/app/package.json',
  'release/app/package-lock.json',
];

function getVersion() {
  const data = fs.readFileSync('package.json', 'utf-8');
  const json = JSON.parse(data);
  return json.version;
}

function bumpVersion(filePath, newVersion) {
  console.log(`Bumping version in ${filePath}`);
  const data = fs.readFileSync(filePath, 'utf-8');
  const json = JSON.parse(data);
  json.version = newVersion;
  fs.writeFileSync(filePath, JSON.stringify(json, null, 2));
}

// Get argument which can be either 'major', 'minor', or 'patch'
const versionPart = process.argv[2];
if (versionPart === undefined) {
  console.error(
    'No argument provided. Must provide either "major", "minor", or "patch"'
  );
  process.exit(1);
}

if (versionPart && !['major', 'minor', 'patch'].includes(versionPart)) {
  console.error(
    'Invalid argument. Must be either "major", "minor", or "patch"'
  );
  process.exit(1);
}

const currentVersion = getVersion();
const versionParts = currentVersion.split('.');
// Bump the major version
if (versionPart === 'major') {
  versionParts[0] = parseInt(versionParts[0]) + 1;
  versionParts[1] = 0;
  versionParts[2] = 0;
}
// Bump the minor version
if (versionPart === 'minor') {
  versionParts[1] = parseInt(versionParts[1]) + 1;
  versionParts[2] = 0;
}
// Bump the patch version
if (versionPart === 'patch') {
  versionParts[2] = parseInt(versionParts[2]) + 1;
}
const newVersion = versionParts.join('.');
console.log(`Bumping version from ${currentVersion} to ${newVersion}`);

rl.question(`Do you want to continue? (y/n) `, (answer) => {
  rl.close();
  if (answer.toLowerCase() !== 'y' && answer.toLowerCase() !== 'yes') {
    console.log('Exiting process...');
    process.exit(1);
  } else {
    files.forEach((file) => {
      bumpVersion(file, newVersion);
    });

    // Add the updated files to git, commit the changes, and tag the new commit
    execSync(`git add ${files.join(' ')}`);
    execSync(`git commit -m "Bump version to ${newVersion}"`);
    execSync(`git tag v${newVersion}`);

    console.log(
      'A new commit and tag have been created. Please push the changes to the remote repository to trigger a new build.'
    );
  }
});
