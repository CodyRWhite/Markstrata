/*
 * Prints the release notes for a version by pulling its section out of
 * CHANGELOG.md. Falls back to a one-liner when the version has no entry, so a
 * release never fails just because the changelog was not updated.
 *
 *   node scripts/release-notes.js 1.2.0
 */
const fs = require('fs');
const path = require('path');

const version = (process.argv[2] || '').trim();
const changelog = path.join(__dirname, '..', 'CHANGELOG.md');

function section() {
  if (!fs.existsSync(changelog)) {
    return '';
  }
  const lines = fs.readFileSync(changelog, 'utf8').split('\n');
  const start = lines.findIndex((line) => line.startsWith('## ') && line.indexOf(version) !== -1);
  if (start === -1) {
    return '';
  }
  const rest = lines.slice(start + 1);
  const end = rest.findIndex((line) => line.startsWith('## '));
  return rest.slice(0, end === -1 ? rest.length : end).join('\n').trim();
}

const notes = section();
process.stdout.write(
  notes ||
    `Markstrata ${version}.\n\nDownload the .sppkg below and upload it to your tenant App Catalog.`
);
