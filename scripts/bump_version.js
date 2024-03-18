const fs = require('fs');
const { execSync } = require('child_process');
const { version } = require('os');

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
if (versionPart === 'major') versionParts[0] = parseInt(versionParts[0]) + 1; // Bump the major version
if (versionPart === 'minor') versionParts[1] = parseInt(versionParts[1]) + 1; // Bump the minor version
if (versionPart === 'patch') versionParts[2] = parseInt(versionParts[2]) + 1; // Bump the patch version
const newVersion = versionParts.join('.');
console.log(`Bumping version from ${currentVersion} to ${newVersion}`);

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
