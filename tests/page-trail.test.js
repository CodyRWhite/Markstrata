/**
 * .SYNOPSIS
 * The document trail survives a whole page load, and nothing written into the
 * address by somebody else is drawn as a way back.
 *
 * .DESCRIPTION
 * A wiki built as one SharePoint page per document lost its trail at every
 * click, because a .aspx link unloads the page and the trail lives in the web
 * part that goes with it. The trail travels on the address now.
 *
 * Two halves are worth checking, and they fail differently.
 *
 * The round trip has to survive the names people actually give pages: commas,
 * pipes, per cent signs, accents, question marks, the lot. The separators were
 * chosen so that they cannot appear inside an encoded field, and a test that
 * only used plain names would pass whatever separators had been picked.
 *
 * And the parameter arrives from outside, so anything can be in it. Every way
 * it can be wrong has to end in no trail rather than in a crumb linking
 * somewhere the reader did not ask to go, `javascript:` being the one that
 * matters.
 *
 * .USAGE
 *   npm test                              every test
 *   node --test tests/page-trail.test.js  this one
 *
 * .NOTES
 * Since:     0.0.23.0
 * Ships in:  nothing - it runs at test time only
 * Requires:  helpers.js
 */

const test = require('node:test');
const assert = require('node:assert/strict');

const { pageTrail } = require('./helpers');
const {
  encodeTrail, decodeTrail, trailFromSearch, withTrail,
  siteCollectionOf, sameSiteCollection, TRAIL_PARAMETER, MAX_CRUMBS
} = pageTrail;

/* Invented names, as everything in this repository's examples is. */
const TRAIL = [
  { label: 'Handbook', url: '/sites/wiki/SitePages/Handbook.aspx' },
  { label: 'Runbooks', url: '/sites/wiki/SitePages/Runbooks/Runbooks.aspx' }
];

// ------------------------------------------------------------- round trip

test('a trail comes back as it went out', () => {
  assert.deepEqual(decodeTrail(encodeTrail(TRAIL)), TRAIL);
});

test('a name carrying the separators comes back whole', () => {
  /* The two characters the encoding is built on, in the data. If either one
     survived a field unescaped the split would happen in the wrong place and
     this crumb would come back as two, or as one with half a name. */
  const awkward = [
    { label: 'Backups, restores | and drills', url: '/sites/wiki/SitePages/A, B | C.aspx' }
  ];
  assert.deepEqual(decodeTrail(encodeTrail(awkward)), awkward);
});

test('a name carrying per cent signs and accents comes back whole', () => {
  const awkward = [
    { label: '100% uptime, allegedly', url: '/sites/wiki/SitePages/100%25.aspx' },
    { label: 'Résumé of the outage', url: '/sites/wiki/SitePages/Résumé.aspx' }
  ];
  assert.deepEqual(decodeTrail(encodeTrail(awkward)), awkward);
});

test('a trail rides on an address and comes off it again', () => {
  const address = withTrail('/sites/wiki/SitePages/Deploy.aspx', TRAIL);
  const search = address.slice(address.indexOf('?'));
  assert.deepEqual(trailFromSearch(search), TRAIL);
});

// ------------------------------------------------------- what else is there

test('the trail does not disturb the other parameters', () => {
  /* strataDoc is written with its slashes left alone on purpose, so that a
     shared address reads as a path. Running the query through URLSearchParams
     and back would have rewritten it as a wall of escapes. */
  const written = withTrail(
    '/sites/wiki/SitePages/Deploy.aspx?strataDoc=Runbooks/Deploy%20notes.md&mode=read', TRAIL);

  assert.ok(written.indexOf('strataDoc=Runbooks/Deploy%20notes.md') !== -1,
    `the other parameter was rewritten: ${written}`);
  assert.ok(written.indexOf('mode=read') !== -1, `a parameter was lost: ${written}`);
});

test('a second trail replaces the first rather than joining it', () => {
  const once = withTrail('/sites/wiki/SitePages/Deploy.aspx', TRAIL);
  const twice = withTrail(once, [TRAIL[0]]);

  assert.equal(twice.split(`${TRAIL_PARAMETER}=`).length - 1, 1,
    `the address carries the trail twice: ${twice}`);
  assert.deepEqual(trailFromSearch(twice.slice(twice.indexOf('?'))), [TRAIL[0]]);
});

test('an empty trail takes the parameter off again', () => {
  const written = withTrail(withTrail('/sites/wiki/SitePages/Deploy.aspx', TRAIL), []);
  assert.equal(written, '/sites/wiki/SitePages/Deploy.aspx');
});

test('a fragment stays at the end, where the browser looks for it', () => {
  const written = withTrail('/sites/wiki/SitePages/Deploy.aspx#rollback', TRAIL);
  assert.ok(/#rollback$/.test(written), `the fragment moved: ${written}`);
});

// ------------------------------------------------------------------- caps

test('a long trail keeps the near end and drops the far one', () => {
  const long = [];
  for (let index = 0; index < MAX_CRUMBS + 4; index += 1) {
    long.push({ label: `Page ${index}`, url: `/sites/wiki/SitePages/Page${index}.aspx` });
  }

  const back = decodeTrail(encodeTrail(long));
  assert.equal(back.length, MAX_CRUMBS);
  /* The near end, because that is the part a reader would use. */
  assert.deepEqual(back[back.length - 1], long[long.length - 1]);
});

test('a trail of enormous names is cut to something an address can carry', () => {
  const huge = [];
  for (let index = 0; index < MAX_CRUMBS; index += 1) {
    huge.push({ label: 'x'.repeat(400), url: `/sites/wiki/SitePages/${'y'.repeat(400)}.aspx` });
  }

  const encoded = encodeTrail(huge);
  assert.ok(encoded.length <= 1600, `the address would be ${encoded.length} characters`);
  /* Cut, not emptied: a short trail is still a way back. */
  assert.ok(decodeTrail(encoded).length >= 1, 'the whole trail was thrown away');
});

// ---------------------------------------------------- what is not accepted

test('a crumb pointing anywhere but this server is dropped', () => {
  /* The parameter arrives from outside, so this is the one that matters: a
     crumb is drawn as a link, and a link is something a reader clicks. */
  const hostile = [
    'javascript:alert(1)',
    'https://example.com/phish',
    '//example.com/phish',
    'data:text/html,<script>alert(1)</script>',
    'SitePages/Relative.aspx'
  ];

  hostile.forEach((url) => {
    const written = `${encodeURIComponent('Looks fine')},${encodeURIComponent(url)}`;
    assert.deepEqual(decodeTrail(written), [], `accepted a crumb pointing at ${url}`);
  });
});

test('a crumb missing a half is dropped, and the rest of the trail survives', () => {
  const good = `${encodeURIComponent('Handbook')},${encodeURIComponent(TRAIL[0].url)}`;

  assert.deepEqual(decodeTrail(`no-comma-here|${good}`), [TRAIL[0]]);
  assert.deepEqual(decodeTrail(`${encodeURIComponent('')},${encodeURIComponent(TRAIL[0].url)}`), []);
  assert.deepEqual(decodeTrail(`${encodeURIComponent('Nowhere')},`), []);
});

test('a value that is not valid encoding costs that crumb and no more', () => {
  const good = `${encodeURIComponent('Handbook')},${encodeURIComponent(TRAIL[0].url)}`;
  assert.deepEqual(decodeTrail(`%zz,%zz|${good}`), [TRAIL[0]]);
});

test('no parameter, and no trail', () => {
  assert.deepEqual(decodeTrail(undefined), []);
  assert.deepEqual(decodeTrail(''), []);
  assert.deepEqual(trailFromSearch(''), []);
  assert.deepEqual(trailFromSearch('?somethingElse=1'), []);
});

// -------------------------------------------------------- site collections

test('a site collection is read off the path', () => {
  assert.equal(siteCollectionOf('/sites/wiki/SitePages/Deploy.aspx'), '/sites/wiki');
  assert.equal(siteCollectionOf('/teams/ops/SitePages/Deploy.aspx'), '/teams/ops');
  /* The root site, which is a site collection with no name in the path. */
  assert.equal(siteCollectionOf('/SitePages/Deploy.aspx'), '');
});

test('the same site collection is recognised however it is spelled', () => {
  assert.ok(sameSiteCollection(
    '/sites/wiki/SitePages/A.aspx', '/Sites/WIKI/SitePages/B.aspx'));
  assert.ok(sameSiteCollection(
    '/sites/team%20wiki/SitePages/A.aspx', '/sites/team wiki/SitePages/B.aspx'));
});

test('another site collection is not the same one', () => {
  assert.ok(!sameSiteCollection(
    '/sites/wiki/SitePages/A.aspx', '/sites/other/SitePages/B.aspx'));
  assert.ok(!sameSiteCollection(
    '/sites/wiki/SitePages/A.aspx', '/teams/wiki/SitePages/B.aspx'));
  /* A page on the root site is not in the wiki's site collection, and a
     prefix match would have said it was. */
  assert.ok(!sameSiteCollection(
    '/sites/wiki/SitePages/A.aspx', '/SitePages/B.aspx'));
});
