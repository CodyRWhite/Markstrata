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
  /*
   * The heading has to match the whole version, not contain it. A substring
   * test reads the 0.0.10.0 section when asked for 0.0.1, which is the kind of
   * mistake that ships the wrong notes and is never noticed.
   *
   * A three-part number also answers to its four-part heading, since a release
   * cut as 1.2.0 is written up as 1.2.0.0.
   */
  const heading = (line) => line.replace(/^##\s+/, '').trim();
  /* The four-part and three-part spellings of one release both count, so the
     sections written before the four-part switch are still reachable. */
  const forms = [version,
    version.split('.').length === 4 ? version.replace(/\.0$/, '') : `${version}.0`];
  const start = lines.findIndex((line) => line.startsWith('## ')
    && forms.indexOf(heading(line)) !== -1);
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
