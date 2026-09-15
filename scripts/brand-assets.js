/**
 * .SYNOPSIS
 * Shared brand wiring for the generated pages.
 *
 * .DESCRIPTION
 * The demo builder and the harness builder each write a standalone HTML file
 * into their own output directory, so both need the icon set beside them and
 * the same tags in <head>. Keeping that in one place means the docs site and
 * the harness cannot end up with different favicons.
 *
 * .USAGE
 *   const { lockup, favicon } = require('./brand-assets');
 *
 *   html += lockup('dark');   // the horizontal lockup, for a dark header
 *
 * .NOTES
 * Since:     0.0.6
 * Ships in:  nothing - it builds or drives what ships
 * Requires:  nothing else in this project
 */

const fs = require('fs');
const path = require('path');

const root = path.join(__dirname, '..');
const assetsDir = path.join(root, 'assets');

/*
 * Where the site is published, for the absolute URLs link previews require.
 * The path is the repository name and GitHub Pages paths are case-sensitive,
 * so this has to be spelled exactly - it needs updating if the repository is
 * ever renamed again.
 */
const SITE_ORIGIN = process.env.SITE_ORIGIN || 'https://codywhite.me/Markstrata';

const COPIES = [
  ['icons/favicon-32.png', 'brand/favicon-32.png'],
  ['icons/favicon-48.png', 'brand/favicon-48.png'],
  ['icons/apple-touch-icon.png', 'brand/apple-touch-icon.png'],
  ['mark.svg', 'brand/mark.svg'],
  ['lockup-tagline.svg', 'brand/lockup-tagline.svg'],
  ['lockup-horizontal.svg', 'brand/lockup-horizontal.svg'],
  ['lockup-horizontal-dark.svg', 'brand/lockup-horizontal-dark.svg'],
  ['social-card.png', 'brand/social-card.png']
];

/* Copies the assets a page references into `outDir`, next to the page. */
function copyBrand(outDir) {
  COPIES.forEach(([from, to]) => {
    const dest = path.join(outDir, to);
    fs.mkdirSync(path.dirname(dest), { recursive: true });
    fs.copyFileSync(path.join(assetsDir, from), dest);
  });
}

/*
 * The <head> tags that go with those files. `description` is optional; pass it
 * and the page also carries the link-preview card.
 */
/*
 * Google Analytics.
 *
 * Written as a guarded loader rather than the plain snippet Google hands out,
 * because these pages are built and opened in more places than the published
 * site: `npm run site` locally, the demo page the browser driver loads off
 * disk in CI, and any checkout someone builds. The plain snippet fires in all
 * of them, which reports test runs as traffic and puts a third-party request
 * inside the driver's "no page errors" check.
 *
 * Gating on the hostname keeps the markup identical everywhere and lets only
 * the real site measure anything. Both hosts are listed because the site
 * answers on its own domain and on the Pages path that redirects to it.
 */
const ANALYTICS_ID = 'G-9S03B399TB';
const ANALYTICS_HOSTS = ['markstrata.com', 'www.markstrata.com', 'codywhite.me'];

function analyticsTag() {
  return `<!-- Google tag (gtag.js) -->
<script>
  (function () {
    if (${JSON.stringify(ANALYTICS_HOSTS)}.indexOf(location.hostname) === -1) { return; }
    var tag = document.createElement('script');
    tag.async = true;
    tag.src = 'https://www.googletagmanager.com/gtag/js?id=${ANALYTICS_ID}';
    document.head.appendChild(tag);
    window.dataLayer = window.dataLayer || [];
    function gtag() { dataLayer.push(arguments); }
    window.gtag = gtag;
    gtag('js', new Date());
    gtag('config', '${ANALYTICS_ID}');
  })();
</script>`;
}

function brandHead(title, description) {
  const tags = [
    '<link rel="icon" type="image/png" sizes="32x32" href="brand/favicon-32.png">',
    '<link rel="icon" type="image/png" sizes="48x48" href="brand/favicon-48.png">',
    '<link rel="apple-touch-icon" href="brand/apple-touch-icon.png">'
  ];
  if (description) {
    tags.push(
      `<meta name="description" content="${description}">`,
      `<meta property="og:title" content="${title}">`,
      `<meta property="og:description" content="${description}">`,
      `<meta property="og:image" content="${SITE_ORIGIN}/brand/social-card.png">`,
      '<meta name="twitter:card" content="summary_large_image">'
    );
  }
  tags.push(analyticsTag());
  return tags.join('\n');
}

/*
 * The horizontal lockup, for the bar at the top of a generated page - the
 * stacked one needs more height than a toolbar has. `surface` says what it
 * will sit on: 'dark' and 'light' pick a variant outright, 'auto' follows the
 * reader's colour scheme.
 */
function brandLogo(height, surface = 'auto') {
  const image = (file) =>
    `<img src="brand/${file}" alt="Markstrata" style="height:${height}px;display:block">`;
  if (surface === 'dark') { return image('lockup-horizontal-dark.svg'); }
  if (surface === 'light') { return image('lockup-horizontal.svg'); }
  return '<picture>'
    + '<source media="(prefers-color-scheme: dark)" srcset="brand/lockup-horizontal-dark.svg">'
    + image('lockup-horizontal.svg')
    + '</picture>';
}

module.exports = { copyBrand, brandHead, brandLogo, SITE_ORIGIN, ANALYTICS_ID };
