/**
 * .SYNOPSIS
 * Links and pictures whose address has spaces in it.
 *
 * .DESCRIPTION
 * SharePoint names pages and files after their titles, so the address a person
 * copies out of the address bar usually has spaces in it. CommonMark says a
 * link destination that is not in angle brackets may not, and markdown-it is
 * right to enforce that, so the link the author plainly meant reached the page
 * as literal brackets with a stray autolinked fragment in the middle of it.
 *
 * Two halves are tested here and the second is the one that matters. That the
 * rescued link renders, and that nothing which renders today renders any
 * differently: the rule is registered after markdown-it's own, so it is only
 * offered what CommonMark has already refused, and a test suite that did not
 * say so would be one change away from claiming ordinary prose.
 *
 * .USAGE
 *   npm test                                every test
 *   node --test tests/spaced-links.test.js  this one
 *
 * .NOTES
 * Since:     0.0.20.3
 * Ships in:  nothing - it runs at test time only
 * Requires:  helpers.js
 */

const test = require('node:test');
const assert = require('node:assert/strict');
const { MarkdownProcessor, spacedLinks } = require('./helpers');

const { looksLikeAddress, encodeSpaces } = spacedLinks;

const render = (markdown) => new MarkdownProcessor({}).render(markdown).trim();

const SHAREPOINT =
  'https://contoso.sharepoint.com/sites/ITPolicies/SitePages/ITP00024 - Access Control Plan.aspx';
const ENCODED =
  'https://contoso.sharepoint.com/sites/ITPolicies/SitePages/ITP00024%20-%20Access%20Control%20Plan.aspx';

/* ------------------------------------------------- what it is meant to fix */

test('the address a SharePoint page hands you is a link', () => {
  const html = render(`[ITP00024 - Access Control Plan](${SHAREPOINT})`);
  assert.match(html, new RegExp(`href="${ENCODED.replace(/[.*+?^${}()|[\]\\]/g, '\\$&')}"`));
  assert.match(html, />ITP00024 - Access Control Plan</);
  /* The failure it replaces: the brackets reaching the page as text. */
  assert.ok(html.indexOf('[ITP00024') === -1, 'the raw brackets are still being rendered');
});

test('inside a blockquote, which is where it was reported', () => {
  const html = render(`> [The plan](${SHAREPOINT}).`);
  assert.match(html, /<blockquote>/);
  assert.match(html, /<a href="https:\/\/contoso[^"]*%20[^"]*">The plan<\/a>/);
});

test('a server relative address works the same way', () => {
  assert.match(render('[Policy](/sites/ITPolicies/SitePages/Access Control Plan.aspx)'),
    /href="\/sites\/ITPolicies\/SitePages\/Access%20Control%20Plan\.aspx"/);
});

test('so does a relative path to another document', () => {
  assert.match(render('[The runbook](Runbooks/Deploy notes.md)'),
    /href="Runbooks\/Deploy%20notes\.md"/);
});

test('a label keeps its own markdown', () => {
  /* Parsed rather than pushed as text, so a label is not flattened by being
     rescued. */
  assert.match(render(`[**ITP00024** the plan](${SHAREPOINT})`),
    /<a [^>]*><strong>ITP00024<\/strong> the plan<\/a>/);
});

test('a picture works too, and keeps its alt text', () => {
  /* The renderer rebuilds alt by flattening the token's children, so a
     picture given none has no alt however the attribute was set. */
  const html = render('![A screenshot](screenshots/The first run.png)');
  assert.match(html, /src="screenshots\/The%20first%20run\.png"/);
  assert.match(html, /alt="A screenshot"/);
});

/* ------------------------------------- what must not have changed around it */

test('an ordinary link is left exactly alone', () => {
  assert.equal(render('[GitHub](https://github.com)'),
    '<p><a href="https://github.com">GitHub</a></p>');
});

test('a link with a title keeps its title', () => {
  /* The destination has no space; the parenthetical does. markdown-it parses
     this, so the new rule is never asked, and a rule that claimed it would
     lose the title. */
  assert.match(render('[GitHub](https://github.com "The home page")'),
    /title="The home page"/);
});

test('the angle bracket form still works, and reads the same', () => {
  assert.equal(render(`[Plan](<${SHAREPOINT}>)`), render(`[Plan](${SHAREPOINT})`));
});

test('prose with a bracket near a parenthesis stays prose', () => {
  const html = render('The list [above] (see the note below) explains it.');
  assert.ok(html.indexOf('<a ') === -1, 'a sentence was turned into a link: ' + html);
});

test('and a bracket followed by a parenthetical is not a link either', () => {
  const html = render('[not a link] (this is just prose with spaces)');
  assert.ok(html.indexOf('<a ') === -1, html);
});

test('a reference style link is still resolved by markdown-it', () => {
  assert.match(render('[Plan][ref]\n\n[ref]: https://example.com'),
    /href="https:\/\/example\.com"/);
});

test('a code span is not markdown and is not touched', () => {
  const html = render('`[Plan](https://x/A Page.aspx)`');
  assert.ok(html.indexOf('<a ') === -1, 'a link inside a code span was rendered: ' + html);
});

/* --------------------------------------------------------- the judgement */

test('an address is one that opens with a scheme or a slash', () => {
  assert.ok(looksLikeAddress('https://host/A Page.aspx'));
  assert.ok(looksLikeAddress('/sites/x/A Page.aspx'));
});

test('or a relative path that ends in an extension', () => {
  assert.ok(looksLikeAddress('Runbooks/Deploy notes.md'));
  assert.ok(looksLikeAddress('The first run.png'));
});

test('a sentence is not an address, however many words it has', () => {
  assert.equal(looksLikeAddress('see the note below'), false);
  assert.equal(looksLikeAddress('this is just prose with spaces'), false);
});

test('nor is one with no space in it, which markdown-it refused for another reason', () => {
  assert.equal(looksLikeAddress('https://host/page.aspx'), false);
});

test('a quote means a title and an angle bracket means the other form', () => {
  assert.equal(looksLikeAddress('https://host/a b.aspx "Title"'), false);
  assert.equal(looksLikeAddress('<https://host/a b.aspx>'), false);
});

test('only the spaces are encoded, so an address already escaped survives', () => {
  /* Re-encoding would turn %20 into %2520 and break a link that was right. */
  assert.equal(encodeSpaces('https://host/Already%20Done and more.aspx'),
    'https://host/Already%20Done%20and%20more.aspx');
});
