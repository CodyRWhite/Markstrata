/*
 * Shared brand wiring for the generated pages.
 *
 * The demo builder and the harness builder each write a standalone HTML file
 * into their own output directory, so both need the icon set beside them and
 * the same tags in <head>. Keeping that in one place means the docs site and
 * the harness cannot end up with different favicons.
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
  return tags.join('\n');
}

/*
 * The horizontal lockup, for the bar at the top of a generated page - the
 * stacked one needs more height than a toolbar has. `surface` says what it
 * will sit on: 'dark' and 'light' pick a variant outright, 'auto' follows the
 * reader's colour scheme.
 */
function brandLogo(height, surface = 'auto') {
  const img = (file) =>
    `<img src="brand/${file}" alt="Markstrata Markdown" style="height:${height}px;display:block">`;
  if (surface === 'dark') { return img('lockup-horizontal-dark.svg'); }
  if (surface === 'light') { return img('lockup-horizontal.svg'); }
  return '<picture>'
    + '<source media="(prefers-color-scheme: dark)" srcset="brand/lockup-horizontal-dark.svg">'
    + img('lockup-horizontal.svg')
    + '</picture>';
}

module.exports = { copyBrand, brandHead, brandLogo, SITE_ORIGIN };
