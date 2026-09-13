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
  const src = srcOf(render('![d](<my folder/flow.png>)'));
  assert.equal(src, '/sites/it/Shared%20Documents/runbooks/my%20folder/flow.png');
  assert.ok(!src.includes('%2520'), 'the source was encoded a second time');
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
  for (const src of [
    'https://example.com/a.png',
    'http://example.com/a.png',
    '//example.com/a.png',
    '/sites/it/absolute/a.png',
    'data:image/png;base64,iVBORw0KGgo='
  ]) {
    assert.ok(isAbsoluteSource(src), `${src} should count as absolute`);
    assert.equal(resolveAgainst(LIBRARY, src), undefined, `${src} should not be rewritten`);
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
  const before = processor.md;

  processor.updateOptions({ imageBasePath: LIBRARY });
  assert.equal(processor.md, before, 'rebuilt for an unchanged option');

  processor.updateOptions({ imageBasePath: '/sites/it/Policies' });
  assert.notEqual(processor.md, before, 'did not rebuild for a changed option');
  assert.equal(srcOf(processor.render('![d](a.png)')), '/sites/it/Policies/a.png');
});
