/**
 * .SYNOPSIS
 * Builds the documentation site published to GitHub Pages.
 *
 * .DESCRIPTION
 * The pages, their order and the navigation between them live in
 * scripts/site.js; this walks that list and builds each one. Markdown pages go
 * through the web part's own pipeline and stylesheets, and the demo runs its
 * real renderer classes, so nothing on the site can drift from what a
 * SharePoint page actually does.
 *
 *   node scripts/build-site.js [output directory]
 *
 * .USAGE
 *   npm run site
 *
 *   Writes site/ - one folder per page, each built by the demo builder or the
 *   harness builder depending on what the page is.
 *
 * .NOTES
 * Since:     0.0.6
 * Ships in:  nothing - it builds or drives what ships
 * Requires:  site.ts
 */

const fs = require('fs');
const path = require('path');
const { execFileSync } = require('child_process');
const { PAGES } = require('./site');

const root = path.join(__dirname, '..');
const siteDir = path.resolve(process.argv[2] || path.join(root, 'site'));

function run(script, args) {
  execFileSync(process.execPath, [path.join(root, script)].concat(args), { stdio: 'inherit', cwd: root });
}

fs.rmSync(siteDir, { recursive: true, force: true });
fs.mkdirSync(siteDir, { recursive: true });

PAGES.forEach((page) => {
  const outDir = page.folder ? path.join(siteDir, page.folder) : siteDir;
  console.log(`\nBuilding /${page.folder ? `${page.folder}/` : ''} ...`);
  if (page.source) {
    run('demo/build-demo.js', [page.source, '--out', outDir, '--page', page.id]);
  } else if (page.builder === 'html') {
    /* The HTML web part, which is a different entry point rather than the same
       harness with different settings. */
    run('harness/build.js', ['--standalone', '--html', '--out', outDir, '--page', page.id]);
  } else {
    run('harness/build.js', ['--standalone', '--out', outDir, '--page', page.id]);
  }
});

/*
 * The two documents the themes page links to.
 *
 * That page renders the sample that exercises everything, and part of what it
 * demonstrates is a wiki link: `[[deploy]]` resolves to `deploy.md` beside the
 * page it is on. In a library that opens inside the web part. On a website
 * there is no library, so without these a reader clicking the feature being
 * demonstrated got a 404 from GitHub Pages.
 *
 * Copied rather than rendered, because a wiki link points at a markdown file
 * and that is what it should hand over. Each one says what it is and why it
 * exists, so a reader who follows one is not left wondering.
 */
const STUBS = path.join(root, 'docs', 'site', 'stubs');
const themesFolder = PAGES.filter((entry) => entry.id === 'themes')[0];
if (themesFolder) {
  const into = path.join(siteDir, themesFolder.folder);
  fs.readdirSync(STUBS).forEach((name) => {
    fs.copyFileSync(path.join(STUBS, name), path.join(into, name));
  });
  console.log(`\nCopied ${fs.readdirSync(STUBS).length} linked documents into /${themesFolder.folder}/`);
}

// Pages serves this as-is rather than running it through Jekyll.
fs.writeFileSync(path.join(siteDir, '.nojekyll'), '');

console.log(`\nSite written to ${path.relative(root, siteDir) || '.'}`);
console.log(PAGES.map((entry) => `  /${entry.folder ? `${entry.folder}/` : ''}`).join('\n'));
