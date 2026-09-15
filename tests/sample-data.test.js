const test = require('node:test');
const assert = require('node:assert/strict');
const fs = require('node:fs');
const path = require('node:path');
const crypto = require('node:crypto');

/*
 * Nothing we publish should carry data from a real tenant.
 *
 * The kitchen sink, the welcome document and the site's pages are all built
 * into the demo, the theme screenshots and the public documentation site, so a
 * hostname pasted in while working on a feature ends up deployed. That is how
 * a set of internal database and server names reached the spanning-cell table:
 * they came in as convenient real example of a table worth spanning, and
 * shipped.
 *
 * Example data belongs to the ranges reserved for it. RFC 2606 keeps
 * example.com, example.net, example.org and the .example, .invalid, .test and
 * .localhost suffixes free for documentation, and Microsoft's own docs use
 * contoso for a SharePoint tenant. Anything else naming a host has to be a
 * real public address we mean to link to, so those are listed rather than
 * pattern-matched: a new one is a deliberate decision, not an accident.
 *
 * That rule only reaches names carrying a domain. A bare host name is the
 * same shape as a design token, `ms-slate-900` or `markstrata-icon-16`, and no
 * pattern separates a server from a token without failing on the innocent one.
 * So the shape is not guessed at: the example data is written onto
 * example.com, where the rule above does reach it.
 *
 * A handful of bare names are known not to belong in a public repository. They
 * are held as hashes rather than written out, because a list of real host
 * names is the thing being kept out of the repository, and writing them into
 * the test that bans them would publish them just as surely as the table did.
 * Hashing stops them being read or found by search; it is not encryption, and
 * a short name would not survive someone determined to guess at it.
 */
const ROOT = path.join(__dirname, '..');

const CONTENT = [
  'samples/kitchen-sink.md',
  'samples/welcome.md',
  'docs/site/home.md',
  'docs/site/documentation.md',
  'docs/site/themes.md',
  'docs/site/about.md',
  'docs/site/support.md',
  'README.md',
  'CONTRIBUTING.md',
  'THEMES.md'
].filter((file) => fs.existsSync(path.join(ROOT, file)));

/* Real addresses we link to on purpose. */
const PUBLIC_HOSTS = [
  'github.com',
  'www.microsoft.com',
  'learn.microsoft.com',
  'mermaid.js.org',
  'shields.io',
  'img.shields.io',
  'buymeacoffee.com',
  'semver.org',
  'codywhite.me',
  'primer.style',
  'katex.org',
  'nodejs.org',
  'opensource.org'
];

/* Reserved for documentation, so safe by construction. */
function isReserved(host) {
  return /(^|\.)example\.(com|net|org)$/.test(host)
    || /\.(example|invalid|test|localhost)$/.test(host)
    || /(^|\.)contoso\./.test(host);
}

const HOST = /\b(?:[a-zA-Z0-9](?:[a-zA-Z0-9-]*[a-zA-Z0-9])?\.)+(?:com|net|org|io|dev|app|co|me|us|local|style|internal)\b/g;

/*
 * Truncated SHA-256 of names that must not appear. Sixteen hex characters is
 * far more than enough to never collide across the few thousand words these
 * documents hold, and the test says which file failed, which is all a person
 * needs to find the offending line.
 */
const BANNED = new Set([
  '726f4bf97b6fac69',
  'ebb2669b51499d0b',
  '7d0a15aad660939c',
  '8a678105cbbc8d3e',
  '855b88692f1d948d'
]);

/* The names are one token each under this split, which is the widest thing
   that still keeps a hyphenated host in one piece. */
const TOKEN = /[a-z0-9][a-z0-9-]*/g;

function digest(token) {
  return crypto.createHash('sha256').update(token).digest('hex').slice(0, 16);
}

CONTENT.forEach((file) => {
  test(`${file} does not name a known internal host`, () => {
    const text = fs.readFileSync(path.join(ROOT, file), 'utf8').toLowerCase();
    const banned = (text.match(TOKEN) || []).some((token) => BANNED.has(digest(token)));

    assert.equal(banned, false,
      `${file} names a host or database from a real tenant. Example data `
      + 'belongs on example.com.');
  });

  test(`${file} names no real host`, () => {
    const text = fs.readFileSync(path.join(ROOT, file), 'utf8');
    const found = (text.match(HOST) || [])
      .map((host) => host.toLowerCase())
      .filter((host) => !isReserved(host))
      .filter((host) => PUBLIC_HOSTS.indexOf(host) === -1);

    assert.deepEqual([...new Set(found)], [],
      `${file} names a host that is neither reserved for documentation nor a `
      + 'known public address. Use example.com, or add it to PUBLIC_HOSTS if '
      + 'it is genuinely public.');
  });
});
