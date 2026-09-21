/**
 * .SYNOPSIS
 * Nothing published carries data from a real tenant.
 *
 * .USAGE
 *   npm test                                every test
 *   node --test tests/sample-data.test.js   this one
 *
 * .NOTES
 * Since:     0.0.12.0
 * Ships in:  nothing - it runs at test time only
 * Requires:  nothing else in this project
 */

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

/*
 * Every page of the site, rather than a list kept in step by hand: a page added
 * without being added here is a page nothing checks, and the whole point of the
 * rule is that it catches the file somebody pasted a real path into while
 * working on a feature.
 */
const CONTENT = [
  'samples/kitchen-sink.md',
  'samples/welcome.md',
  /* The HTML web part's sample document and the stylesheet it shares. Both are
     read by a person and both are the kind of file a real path gets pasted
     into while a fault is being chased, which is what this list is for. */
  'samples/welcome.html',
  'samples/shared.css',
  /* Handed to a language model whole, so anything in it travels further than
     anything else here. */
  'docs/css-for-an-llm.md',
  'README.md',
  'CONTRIBUTING.md',
  'THEMES.md',
  'scripts/specimens.js'
]
  .concat(require('../scripts/site').PAGES
    .filter((entry) => entry.source)
    .map((entry) => entry.source))
  .filter((file, index, all) => all.indexOf(file) === index)
  .filter((file) => fs.existsSync(path.join(ROOT, file)));

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
  /* This project's own site. It is named in the SharePoint package and the
     Teams manifest, so the privacy policy that both of them link to is entitled
     to say which site it is describing. */
  'markstrata.com',
  'www.markstrata.com',
  'primer.style',
  'katex.org',
  'nodejs.org',
  'opensource.org',
  /* GitHub's raw host. Named rather than described because it is the one
     server known to let a page here read a document from it, so a check that
     says "use a server that allows cross-origin reads" and does not name one
     is a check nobody can carry out. It belongs to GitHub, not to any tenant,
     which is the distinction this list is for. */
  'raw.githubusercontent.com',
  /* Microsoft's own domain, with no tenant in front of it. The sanitiser's
     iframe allowlist is described to authors as "any *.sharepoint.com", which
     is the rule rather than an address. A real tenant is matched whole, as
     `tenant.sharepoint.com`, so it still fails this check. */
  'sharepoint.com'
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
  '855b88692f1d948d',
  /* A site and a tenant that reached the tests and a source header, through
     the one route this list did not watch: a fault reported against a real
     document, reproduced verbatim as the test case for it. */
  'd257dab657b413a5',
  'a45284a09f173c6e',
  /* A real document's identifier, from that same reproduction. Everything
     above is a host or a database, so an identifier was a class of name this
     list did not cover: it was taken off main by rewriting the history and
     nothing here would have failed if it came back.

     The identifier only. The title beside it was three ordinary words, and
     banning those would fail on prose that has every right to use them, so
     the words are not covered and this is the part that is. A title that
     reads as ordinary English is the gap left, and it is left knowingly. */
  '11c4074b5129fa92'
]);

/* The names are one token each under this split, which is the widest thing
   that still keeps a hyphenated host in one piece. */
const TOKEN = /[a-z0-9][a-z0-9-]*/g;

function digest(token) {
  return crypto.createHash('sha256').update(token).digest('hex').slice(0, 16);
}

/*
 * Everything that ships or is read by a person, for the banned-name check
 * only.
 *
 * Wider than CONTENT on purpose, and narrower in what it checks. A real name
 * reached this repository through tests and a source file's own header, not
 * through the prose CONTENT covers: a fault was reported against a real
 * document and the reproduction was pasted in as the test case, which is the
 * most natural thing in the world to do and the reason this list exists.
 *
 * The host check below cannot be widened the same way. Source carries real
 * hostnames on purpose - the sanitiser's iframe allowlist names YouTube,
 * Vimeo and SharePoint - so running it over code would fail on the code doing
 * its job. Names are different: there is no reason for one of these to appear
 * anywhere, ever.
 */
const EVERYTHING = CONTENT
  .concat(['CHANGELOG.md'])
  .concat(walk('src'))
  .concat(walk('tests'))
  .concat(walk('harness').filter((file) => file.indexOf('harness/dist') !== 0))
  .concat(walk('scripts'))
  .concat(walk('config'))
  /* Written prose and shipped samples. docs/ holds pages the site publishes
     and the CSS contract, which is copied out rather than listed as a page, so
     walking the folder covers it without a second list to keep in step. */
  .concat(walk('docs'))
  .concat(walk('samples'))
  .filter((file, index, all) => all.indexOf(file) === index)
  .filter((file) => fs.existsSync(path.join(ROOT, file)));

function walk(from) {
  const here = path.join(ROOT, from);
  if (!fs.existsSync(here)) { return []; }
  return fs.readdirSync(here, { withFileTypes: true }).reduce((found, entry) => {
    const next = `${from}/${entry.name}`;
    if (entry.isDirectory()) { return found.concat(walk(next)); }
    return /\.(ts|js|json|md|css|html)$/.test(entry.name) ? found.concat([next]) : found;
  }, []);
}

EVERYTHING.forEach((file) => {
  test(`${file} does not name a known internal host`, () => {
    const text = fs.readFileSync(path.join(ROOT, file), 'utf8').toLowerCase();
    const banned = (text.match(TOKEN) || []).some((token) => BANNED.has(digest(token)));

    assert.equal(banned, false,
      `${file} names a host or database from a real tenant. Example data `
      + 'belongs on example.com.');
  });
});

CONTENT.forEach((file) => {
  test(`${file} does not name a known internal host, in prose`, () => {
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
