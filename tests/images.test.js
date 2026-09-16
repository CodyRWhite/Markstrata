/**
 * .SYNOPSIS
 * Where a relative image source resolves to, how an image is sized, and
 * what markdown-it is asked to do with one.
 *
 * .USAGE
 *   npm test                           every test
 *   node --test tests/images.test.js   this one
 *
 * .NOTES
 * Since:     0.0.6
 * Ships in:  nothing - it runs at test time only
 * Requires:  helpers.ts
 */

const test = require('node:test');
const assert = require('node:assert/strict');
const { MarkdownProcessor, imagePaths } = require('./helpers');

const { resolveAgainst, isAbsoluteSource, encodePath, folderOf } = imagePaths;
const LIBRARY = '/sites/it/Shared Documents/runbooks';

const render = (markdown, options) =>
  new MarkdownProcessor(Object.assign({ imageBasePath: LIBRARY }, options || {})).render(markdown);
const srcOf = (html) => (/<img[^>]*\ssrc="([^"]*)"/.exec(html) || [])[1];

test('folderOf takes everything before the last separator', () => {
  assert.equal(folderOf('/sites/it/docs/readme.md'), '/sites/it/docs');
  assert.equal(folderOf('readme.md'), '');
});

test('a relative source resolves against the markdown file, not the page', () => {
  assert.equal(srcOf(render('![d](images/flow.png)')),
    '/sites/it/Shared%20Documents/runbooks/images/flow.png');
});

/*
 * The base arrives raw from SharePoint and the src arrives already
 * percent-encoded, because markdown-it encodes it before any render rule sees
 * it. Encoding the whole result would turn %20 into %2520.
 */
test('the base is encoded, the already-encoded source is not encoded twice', () => {
  const source = srcOf(render('![d](<my folder/flow.png>)'));
  assert.equal(source, '/sites/it/Shared%20Documents/runbooks/my%20folder/flow.png');
  assert.ok(!source.includes('%2520'), 'the source was encoded a second time');
});

/* encodeURI would leave these alone, and all three are legal in SharePoint. */
test('characters that would truncate a URL are encoded', () => {
  assert.equal(resolveAgainst('/sites/it/Q&A/what?/docs', 'a.png'),
    '/sites/it/Q%26A/what%3F/docs/a.png');
  assert.ok(resolveAgainst('/sites/it/C#/docs', 'a.png').includes('C%23'));
});

test('. and .. are walked rather than passed through', () => {
  assert.equal(resolveAgainst(LIBRARY, './a.png'), '/sites/it/Shared%20Documents/runbooks/a.png');
  assert.equal(resolveAgainst(LIBRARY, '../shared/a.png'), '/sites/it/Shared%20Documents/shared/a.png');
  assert.equal(resolveAgainst(LIBRARY, '../../a.png'), '/sites/it/a.png');
});

test('a source that climbs past the site is left alone rather than guessed at', () => {
  assert.equal(resolveAgainst('/sites/it', '../../../etc/passwd.png'), undefined);
});

test('sources that already point somewhere are untouched', () => {
  for (const source of [
    'https://example.com/a.png',
    'http://example.com/a.png',
    '//example.com/a.png',
    '/sites/it/absolute/a.png',
    'data:image/png;base64,iVBORw0KGgo='
  ]) {
    assert.ok(isAbsoluteSource(source), `${source} should count as absolute`);
    assert.equal(resolveAgainst(LIBRARY, source), undefined, `${source} should not be rewritten`);
  }
});

test('an external image still renders, since that is the author\'s content', () => {
  assert.equal(srcOf(render('![x](https://example.com/a.png)')), 'https://example.com/a.png');
});

test('a query or fragment survives the walk', () => {
  assert.equal(resolveAgainst(LIBRARY, 'a.png?v=2'), '/sites/it/Shared%20Documents/runbooks/a.png?v=2');
  assert.equal(resolveAgainst(LIBRARY, '../a.png#top'), '/sites/it/Shared%20Documents/a.png#top');
});

test('with no base path, sources are left exactly as written', () => {
  assert.equal(srcOf(render('![d](images/flow.png)', { imageBasePath: undefined })), 'images/flow.png');
});

test('images are lazy, so a long document does not fetch all of them at once', () => {
  const html = render('![d](a.png)');
  assert.match(html, /loading="lazy"/);
  assert.match(html, /decoding="async"/);
});

test('alt text and the title are kept', () => {
  const html = render('![a diagram](a.png "Hover text")');
  assert.match(html, /alt="a diagram"/);
  assert.match(html, /title="Hover text"/);
});

test('images inside callouts and tables resolve too', () => {
  assert.ok(srcOf(render('> [!NOTE]\n> ![d](a.png)')).startsWith('/sites/'));
  assert.ok(srcOf(render('| x |\n|---|\n| ![d](a.png) |')).startsWith('/sites/'));
});

test('encodePath leaves the separators alone', () => {
  assert.equal(encodePath('/a b/c d'), '/a%20b/c%20d');
});

/*
 * Every content load pushes the whole option set at the processor so a newly
 * picked file takes its folder with it. That must stay cheap when nothing
 * moved, and must still apply a base path that did.
 */
test('changing the base path re-resolves; repeating it does not rebuild', () => {
  const processor = new MarkdownProcessor({ imageBasePath: LIBRARY });
  /* Reaching for the markdown-it instance itself, because "did it rebuild" is
     not a question the rendered output can answer. */
  const before = processor.markdownIt;
  assert.ok(before, 'the processor no longer has a markdownIt to compare');

  processor.updateOptions({ imageBasePath: LIBRARY });
  assert.equal(processor.markdownIt, before, 'rebuilt for an unchanged option');

  processor.updateOptions({ imageBasePath: '/sites/it/Policies' });
  assert.notEqual(processor.markdownIt, before, 'did not rebuild for a changed option');
  assert.equal(srcOf(processor.render('![d](a.png)')), '/sites/it/Policies/a.png');
});

/*
 * A document does not have to come from SharePoint. The "File URL" source
 * fetches one from anywhere that will answer, and everything relative inside
 * it - every picture, every ordinary link, every wiki link - resolves against
 * the folder that URL is in.
 *
 * It resolved against it as though it were a SharePoint path: encodePath ran
 * over the whole thing, so `https://host/docs` came back as `/https%3A/host/docs`,
 * an address on the tenant rather than on the other server, and any %20 in it
 * was encoded a second time into %2520. Nothing in the document loaded, and
 * the report was a wall of 404s.
 */
const REMOTE = 'https://raw.githubusercontent.com/org/repo/main/docs';

test('a document fetched from a URL resolves against that URL', () => {
  assert.equal(resolveAgainst(REMOTE, 'images/flow.png'),
    'https://raw.githubusercontent.com/org/repo/main/docs/images/flow.png');
  assert.equal(resolveAgainst(REMOTE, 'Runbook.md'),
    'https://raw.githubusercontent.com/org/repo/main/docs/Runbook.md');
});

test('the scheme survives, rather than becoming a folder on the site', () => {
  const resolved = resolveAgainst(REMOTE, 'a.md');
  assert.ok(resolved.indexOf('https://') === 0, `got ${resolved}`);
  assert.doesNotMatch(resolved, /%3A/, 'the colon was encoded, so the host became a path segment');
});

test('a base that is already encoded is not encoded again', () => {
  /* The tenant's own library reached through its URL rather than its path,
     which is what somebody pastes out of the browser. */
  assert.equal(
    resolveAgainst('https://contoso.sharepoint.com/sites/wiki/Shared%20Documents', 'Runbook.md'),
    'https://contoso.sharepoint.com/sites/wiki/Shared%20Documents/Runbook.md'
  );
});

test('a port belongs to the host, not to the path', () => {
  assert.equal(resolveAgainst('https://example.com:8443/docs', 'a.md'),
    'https://example.com:8443/docs/a.md');
});

test('.. walks the remote folders and stops at the host', () => {
  assert.equal(resolveAgainst(REMOTE, '../Other/Page.md'),
    'https://raw.githubusercontent.com/org/repo/main/Other/Page.md');
  assert.equal(resolveAgainst('https://example.com/docs', '../../../../etc/passwd'), undefined,
    'climbing past the host should be refused, as climbing past the site is');
});

test('a SharePoint path still resolves exactly as it did', () => {
  assert.equal(resolveAgainst(LIBRARY, 'images/flow.png'),
    '/sites/it/Shared%20Documents/runbooks/images/flow.png');
  assert.equal(resolveAgainst('/sites/team/Runbooks', '../Other/p.md'), '/sites/team/Other/p.md');
});

test('a wiki link in a document fetched from a URL points at that server', () => {
  const html = new MarkdownProcessor({ enableWikiLinks: true, imageBasePath: REMOTE })
    .render('See [[Deploy runbook]].');
  assert.match(html, /href="https:\/\/raw\.githubusercontent\.com\/org\/repo\/main\/docs\/Deploy%20runbook\.md"/);
  assert.doesNotMatch(html, /%3A/);
  assert.doesNotMatch(html, /%2520/);
});
