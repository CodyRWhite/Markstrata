const test = require('node:test');
const assert = require('node:assert/strict');
const { brandHead, ANALYTICS_ID } = require('../scripts/brand-assets');

/*
 * Analytics goes in the one <head> both page builders share, so a page added
 * to the site is measured without anyone remembering to wire it up.
 *
 * It is guarded on the hostname rather than written as the plain snippet,
 * because the same pages are built and opened well away from the published
 * site: `npm run site` on a laptop, and the demo page the browser driver
 * loads off disk on every CI run. Unguarded, those report as traffic, and the
 * driver's "no page errors" check starts depending on a third-party request
 * succeeding.
 */
const head = brandHead('Markstrata', 'Markdown for SharePoint.');

test('the head carries the analytics tag', () => {
  assert.match(head, /Google tag \(gtag\.js\)/);
  assert.match(head, new RegExp(ANALYTICS_ID));
  assert.match(head, /googletagmanager\.com\/gtag\/js/);
});

test('the tag is configured with the measurement id', () => {
  assert.match(head, new RegExp(`gtag\\('config', '${ANALYTICS_ID}'\\)`));
  assert.match(head, /gtag\('js', new Date\(\)\)/);
});

test('it only runs on the published site', () => {
  assert.match(head, /location\.hostname/,
    'the tag must be gated on the hostname, or local and CI builds report as traffic');
  assert.match(head, /markstrata\.com/);
});

/*
 * The script element is built at runtime behind that gate. A plain
 * <script src="...googletagmanager..."> would be fetched by the browser
 * before any of our code runs, so the gate would measure nothing.
 */
test('the script is not requested before the gate can stop it', () => {
  assert.doesNotMatch(head, /<script[^>]+src=["']https:\/\/www\.googletagmanager\.com/,
    'a static src is fetched regardless of the hostname check');
});
