/*
 * Builds the documentation site published to GitHub Pages.
 *
 *   /          this project, rendered by its own pipeline, with theme controls
 *   /themes/   the kitchen sink document - every feature, for judging a theme
 *   /app/      the web part's real renderer classes, running in the page
 *
 * Everything here is built from the same sources the solution package uses, so
 * the site cannot drift from what the web part actually does.
 *
 *   node scripts/build-site.js [output directory]
 */
const fs = require('fs');
const path = require('path');
const { execFileSync } = require('child_process');

const root = path.join(__dirname, '..');
const siteDir = path.resolve(process.argv[2] || path.join(root, 'site'));

function run(script, args) {
  execFileSync(process.execPath, [path.join(root, script)].concat(args), { stdio: 'inherit', cwd: root });
}

fs.rmSync(siteDir, { recursive: true, force: true });
fs.mkdirSync(siteDir, { recursive: true });

console.log('Building the landing page...');
run('demo/build-demo.js', ['docs/site-home.md', '--out', siteDir]);

console.log('Building the theme preview...');
run('demo/build-demo.js', ['samples/kitchen-sink.md', '--out', path.join(siteDir, 'themes')]);

console.log('Building the working demo...');
run('harness/build.js', ['--standalone', '--out', path.join(siteDir, 'app')]);

// Pages serves this as-is rather than running it through Jekyll.
fs.writeFileSync(path.join(siteDir, '.nojekyll'), '');

console.log(`\nSite written to ${path.relative(root, siteDir) || '.'}`);
