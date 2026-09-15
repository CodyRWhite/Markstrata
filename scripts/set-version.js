/**
 * .SYNOPSIS
 * Stamps a version into package.json and config/package-solution.json.
 *
 * .DESCRIPTION
 *   node scripts/set-version.js 1.2.0.0
 *
 * Versions are written the way SharePoint writes them, four-part, because that
 * is the number a tenant compares when deciding whether a package is an
 * upgrade. The same number goes into package.json, which npm tolerates here
 * because the package is private and never published to a registry.
 *
 * A three-part number is still accepted and gets a .0 appended, so tags cut
 * before this and anyone typing out of habit both still work.
 *
 * .USAGE
 *   node scripts/set-version.js 0.0.17.0
 *
 *   Writes the four-part version into package.json and
 *   config/package-solution.json, which is what a tenant compares when deciding
 *   whether a package is an upgrade.
 *
 * .NOTES
 * Since:     0.0.6
 * Ships in:  nothing - it builds or drives what ships
 * Requires:  nothing else in this project
 */

const fs = require('fs');
const path = require('path');

/* The repository, unless a caller points somewhere else. The tests do, so that
   checking what this writes cannot rewrite the real manifests. */
const root = process.env.SET_VERSION_ROOT || path.join(__dirname, '..');
const version = (process.argv[2] || '').trim();

if (!/^\d+\.\d+\.\d+(\.\d+)?$/.test(version)) {
  console.error(`Usage: node scripts/set-version.js <major.minor.patch[.build]>\nGot: "${version}"`);
  process.exit(1);
}

/* SharePoint wants four parts; a three-part number means build zero. */
const fourPart = version.split('.').length === 4 ? version : `${version}.0`;

function editJson(relativePath, edit) {
  const file = path.join(root, relativePath);
  const json = JSON.parse(fs.readFileSync(file, 'utf8'));
  edit(json);
  fs.writeFileSync(file, `${JSON.stringify(json, null, 2)}\n`);
  console.log(`Updated ${relativePath}`);
}

editJson('package.json', (json) => {
  json.version = fourPart;
});

editJson('config/package-solution.json', (json) => {
  json.solution.version = fourPart;
  (json.solution.features || []).forEach((feature) => {
    feature.version = fourPart;
  });
});

// package-lock.json carries the version twice; npm ci fails if it disagrees.
const lockPath = path.join(root, 'package-lock.json');
if (fs.existsSync(lockPath)) {
  const lock = JSON.parse(fs.readFileSync(lockPath, 'utf8'));
  lock.version = fourPart;
  if (lock.packages && lock.packages['']) {
    lock.packages[''].version = fourPart;
  }
  fs.writeFileSync(lockPath, `${JSON.stringify(lock, null, 2)}\n`);
  console.log('Updated package-lock.json');
}
