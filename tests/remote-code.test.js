/**
 * .SYNOPSIS
 * A fence that names an address instead of writing a body: which lines it
 * asks for, and what the block says while it waits and when it fails.
 *
 * .USAGE
 *   npm test                                every test
 *   node --test tests/remote-code.test.js   this one
 *
 * .NOTES
 * Since:     unreleased
 * Ships in:  nothing - it runs at test time only
 * Requires:  helpers.js, jsdom
 */

const test = require('node:test');
const assert = require('node:assert/strict');
const { JSDOM } = require('jsdom');
const { MarkdownProcessor, remoteCode } = require('./helpers');

const markdown = new MarkdownProcessor();

const BLOB = 'https://github.com/contoso/tools/blob/main/src/cache.ts';
const FILE = ['one', 'two', 'three', 'four', 'five'].join('\n') + '\n';

/* The rendered document, in a DOM the filler can walk. */
function article(source) {
  const dom = new JSDOM(`<body><article>${markdown.render(source)}</article></body>`);
  return dom.window.document.querySelector('article');
}

test('a line fragment names the lines it asks for', () => {
  assert.deepEqual(remoteCode.fragmentRange(`${BLOB}#L10-L20`), { from: 10, to: 20 });
  assert.deepEqual(remoteCode.fragmentRange(`${BLOB}#L10`), { from: 10, to: 10 });
  // GitHub writes the second number with an L; some copies of it lose the L.
  assert.deepEqual(remoteCode.fragmentRange(`${BLOB}#L10-14`), { from: 10, to: 14 });
  // Written backwards is a slip, not a request for nothing.
  assert.deepEqual(remoteCode.fragmentRange(`${BLOB}#L20-L10`), { from: 10, to: 20 });
  assert.equal(remoteCode.fragmentRange(BLOB), undefined);
  assert.equal(remoteCode.fragmentRange(`${BLOB}#readme`), undefined);
});

test('a fragment takes those lines out of the file', () => {
  assert.equal(remoteCode.sliceLines(FILE, { from: 2, to: 3 }), 'two\nthree');
  assert.equal(remoteCode.sliceLines(FILE, { from: 5, to: 5 }), 'five');
  // A range past the end shows what is there rather than refusing.
  assert.equal(remoteCode.sliceLines(FILE, { from: 4, to: 99 }), 'four\nfive');
  // No fragment means the whole file, without the newline every file ends on.
  assert.equal(remoteCode.sliceLines(FILE, undefined), 'one\ntwo\nthree\nfour\nfive');
});

test('a fence with a src and no body renders waiting, carrying the address', () => {
  const html = markdown.render('```ts src="' + BLOB + '#L2-L3"\n```');
  assert.match(html, /strata-code--loading/);
  assert.match(html, new RegExp('data-strata-code-src="' + BLOB.replace(/\//g, '\\/') + '#L2-L3"'));
  // It says which server it is waiting on, rather than staying blank.
  assert.match(html, /Loading this code from github\.com/);
  // And nothing was rendered as code yet.
  assert.doesNotMatch(html, /strata-code-line"/);
});

test('a range on the address reserves the height it will need', () => {
  const { codeBlocks } = require('./helpers');
  assert.equal(codeBlocks.reservedLines(BLOB + '#L12-L22'), 11);
  assert.equal(codeBlocks.reservedLines(BLOB + '#L12-22'), 11);
  // A single line and a whole file both say nothing useful about the height:
  // one line is not worth reserving, and a file nobody has read has no length.
  assert.equal(codeBlocks.reservedLines(BLOB + '#L12'), 0);
  assert.equal(codeBlocks.reservedLines(BLOB), 0);

  // The block asks for that room in its own line height, so the document under
  // it does not jump when the code arrives.
  const html = markdown.render('```ts src="' + BLOB + '#L12-L22"\n```');
  assert.match(html, /--strata-code-reserve:11/);
  assert.doesNotMatch(markdown.render('```ts src="' + BLOB + '"\n```'),
    /--strata-code-reserve/);
});

test('a body beats a src, and the block says nothing about the src', () => {
  const html = markdown.render('```ts src="' + BLOB + '"\nconst a = 1;\n```');
  assert.match(html, /const/);
  assert.doesNotMatch(html, /strata-code--loading/);
  assert.doesNotMatch(html, /data-strata-code-src/);
  assert.doesNotMatch(html, /Loading/);
});

test('the header names the file the address ends in', () => {
  const { codeBlocks } = require('./helpers');
  assert.equal(codeBlocks.parseInfo('ts src="' + BLOB + '#L2-L3"').filename, 'cache.ts');
  // Encoded, because that is how a path with a space in it arrives.
  assert.equal(
    codeBlocks.parseInfo('ts src="https://contoso.example/a/Deploy%20notes.ps1"').filename,
    'Deploy notes.ps1');
  // A title the author wrote still wins.
  assert.equal(
    codeBlocks.parseInfo('ts title="the cache" src="' + BLOB + '"').filename, 'the cache');
});

test('a fence that opens with an attribute has no language to label', () => {
  // The first word used to become the language whatever it was, so this block
  // was headed SRC="HTTPS://GITHUB.COM/..." and the colon in https:// was read
  // as the lang:filename shorthand.
  const info = require('./helpers').codeBlocks.parseInfo('src="' + BLOB + '"');
  assert.equal(info.lang, '');
  assert.equal(info.src, BLOB);
  /* The header names the file the address ends in, not the attribute. */
  assert.equal(info.filename, 'cache.ts');
});

test('the fetched file is filled in, highlighted, as text and never as markup', async () => {
  const content = article('```ts src="' + BLOB + '#L2-L3"\n```');
  await remoteCode.fillRemoteCode(content, (url) => {
    // The blob address is translated before anything is asked for.
    assert.equal(url, 'https://raw.githubusercontent.com/contoso/tools/main/src/cache.ts');
    return Promise.resolve('const a = 1;\nconst b = "<script>alert(1)</script>";\nconst c = 3;\n');
  });

  const block = content.querySelector('.strata-code');
  assert.equal(block.classList.contains('strata-code--loading'), false);
  assert.equal(block.hasAttribute('data-strata-code-src'), false);

  const lines = content.querySelectorAll('.strata-code-line');
  assert.equal(lines.length, 2, 'the fragment asked for two lines');
  assert.match(lines[0].textContent, /const b =/);

  // Highlighted the same way a block written in the document is.
  assert.ok(content.querySelector('.hljs-keyword'), 'nothing was highlighted');

  // Somebody else's file goes in as text.
  assert.equal(content.querySelector('script'), null);
  assert.match(content.innerHTML, /&lt;script&gt;/);

  // And the waiting note is gone, so nothing says "loading" over real code.
  assert.equal(content.querySelector('.strata-code-note'), null);
});

test('a fetch that fails says so in the block, in remoteDocuments words', async () => {
  const content = article('```ts src="' + BLOB + '"\n```');
  await remoteCode.fillRemoteCode(content, () => Promise.reject(new Error('Failed to fetch')));

  const block = content.querySelector('.strata-code');
  assert.equal(block.classList.contains('strata-code--failed'), true);
  assert.equal(block.classList.contains('strata-code--loading'), false);

  const note = content.querySelector('.strata-code-note');
  assert.ok(note, 'the block stayed empty and silent');
  // The host it could not read, named, and neither of the two causes claimed.
  assert.match(note.textContent, /raw\.githubusercontent\.com/);
  assert.doesNotMatch(note.textContent, /not found/i);
});

test("a server's own HTTP status is repeated rather than guessed at", async () => {
  const content = article('```ts src="' + BLOB + '"\n```');
  await remoteCode.fillRemoteCode(content,
    () => Promise.reject(new Error('Could not load that file (HTTP 404)')));
  assert.match(content.querySelector('.strata-code-note').textContent, /HTTP 404/);
});

test('a block is only asked for once, however often the filler runs', async () => {
  const content = article('```ts src="' + BLOB + '"\n```');
  let asked = 0;
  const answer = () => { asked += 1; return Promise.resolve('const a = 1;\n'); };
  await remoteCode.fillRemoteCode(content, answer);
  await remoteCode.fillRemoteCode(content, answer);
  assert.equal(asked, 1);
});
