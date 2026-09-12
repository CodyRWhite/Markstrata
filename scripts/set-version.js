/*
 * Stamps a version into package.json and config/package-solution.json.
 *
 *   node scripts/set-version.js 1.2.0
 *
 * SharePoint solution versions are four-part (1.2.0.0), npm versions are
 * three-part, and they have to agree or a tenant will not see an upgrade. This
 * keeps both in step from one number - the release workflow passes the git tag.
 */
const fs = require('fs');
const path = require('path');

const root = path.join(__dirname, '..');
const version = (process.argv[2] || '').trim();

if (!/^\d+\.\d+\.\d+$/.test(version)) {
  console.error(`Usage: node scripts/set-version.js <major.minor.patch>\nGot: "${version}"`);
  process.exit(1);
}

function editJson(relativePath, edit) {
  const file = path.join(root, relativePath);
  const json = JSON.parse(fs.readFileSync(file, 'utf8'));
  edit(json);
  fs.writeFileSync(file, `${JSON.stringify(json, null, 2)}\n`);
  console.log(`Updated ${relativePath}`);
}

editJson('package.json', (json) => {
  json.version = version;
});

editJson('config/package-solution.json', (json) => {
  json.solution.version = `${version}.0`;
  (json.solution.features || []).forEach((feature) => {
    feature.version = `${version}.0`;
  });
});

// package-lock.json carries the version twice; npm ci fails if it disagrees.
const lockPath = path.join(root, 'package-lock.json');
if (fs.existsSync(lockPath)) {
  const lock = JSON.parse(fs.readFileSync(lockPath, 'utf8'));
  lock.version = version;
  if (lock.packages && lock.packages['']) {
    lock.packages[''].version = version;
  }
  fs.writeFileSync(lockPath, `${JSON.stringify(lock, null, 2)}\n`);
  console.log('Updated package-lock.json');
}
