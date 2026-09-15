/*
 * Builds the documentation site published to GitHub Pages.
 *
 * The pages, their order and the navigation between them live in
 * scripts/site.js; this walks that list and builds each one. Markdown pages go
 * through the web part's own pipeline and stylesheets, and the demo runs its
 * real renderer classes, so nothing on the site can drift from what a
 * SharePoint page actually does.
 *
 *   node scripts/build-site.js [output directory]
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
  } else {
    run('harness/build.js', ['--standalone', '--out', outDir, '--page', page.id]);
  }
});

// Pages serves this as-is rather than running it through Jekyll.
fs.writeFileSync(path.join(siteDir, '.nojekyll'), '');

console.log(`\nSite written to ${path.relative(root, siteDir) || '.'}`);
console.log(PAGES.map((entry) => `  /${entry.folder ? `${entry.folder}/` : ''}`).join('\n'));
