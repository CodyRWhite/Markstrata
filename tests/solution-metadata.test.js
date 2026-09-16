/**
 * .SYNOPSIS
 * What the app catalog and Teams show about this solution: real addresses, and
 * a category.
 *
 * .DESCRIPTION
 * Nobody working on the web part ever sees this. It is read by SharePoint when
 * the package is installed and by Teams when the app is synced, and it is what
 * an administrator and every user are shown: who made this, where its website
 * is, its privacy policy, its terms of use, and what kind of thing it is.
 *
 * It was wrong for a long time and nothing said so. All three addresses pointed
 * at a private GitHub repository, which is a 404 for everybody in a tenant, and
 * the categories were empty, so the app arrived filed under nothing.
 *
 * The category names are not free text. The SPFx schema holds the list, so the
 * list is read from the schema in the package rather than copied here, which
 * means a version of SPFx that changes it fails this instead of failing an
 * upload months later.
 *
 * .USAGE
 *   npm test                                   every test
 *   node --test tests/solution-metadata.test.js  this one
 *
 * .NOTES
 * Since:     unreleased
 * Ships in:  nothing - it runs at test time only
 * Requires:  nothing else in this project
 */

const test = require('node:test');
const assert = require('node:assert/strict');
const fs = require('node:fs');
const path = require('node:path');

const ROOT = path.join(__dirname, '..');
const solution = JSON.parse(
  fs.readFileSync(path.join(ROOT, 'config', 'package-solution.json'), 'utf8')
).solution;

/** The categories SPFx itself will accept, read out of its own schema. */
function allowedCategories() {
  const schema = path.join(
    ROOT, 'node_modules', '@microsoft', 'spfx-heft-plugins', 'lib-commonjs',
    'plugins', 'packageSolutionPlugin', 'package-solution.schema.json'
  );
  if (!fs.existsSync(schema)) { return undefined; }

  const parsed = JSON.parse(fs.readFileSync(schema, 'utf8'));
  const metadata = parsed.properties.solution.properties.metadata;
  return metadata.properties.categories.items.enum;
}

test('every address shown to a tenant is a real one', () => {
  const developer = solution.developer;

  ['websiteUrl', 'privacyUrl', 'termsOfUseUrl'].forEach((field) => {
    const url = developer[field];
    assert.ok(url, `${field} is empty`);
    assert.match(url, /^https:\/\//, `${field} is not https: ${url}`);

    /* The repository is private. A link to it is a 404 for every person who
       installs this, which is worse than no link because it looks like one. */
    assert.ok(
      url.indexOf('github.com/CodyRWhite/Markstrata') === -1,
      `${field} points into the private repository: ${url}`
    );
  });

  /* Three different things, so three different pages: an app whose privacy
     policy and terms of use are its home page has neither. */
  const distinct = new Set([
    developer.websiteUrl, developer.privacyUrl, developer.termsOfUseUrl
  ]);
  assert.equal(distinct.size, 3, 'two of the three addresses are the same page');

  assert.ok(developer.name, 'the developer has no name');
});

test('the pages those addresses name are built by the site', () => {
  /* The site is where they are published, so a renamed page would leave the
     package pointing at nothing. */
  const site = fs.readFileSync(path.join(ROOT, 'scripts', 'site.js'), 'utf8');

  [['privacyUrl', 'privacy'], ['termsOfUseUrl', 'terms']].forEach(([field, id]) => {
    assert.ok(
      solution.developer[field].endsWith(`/${id}/`),
      `${field} does not point at the ${id} page: ${solution.developer[field]}`
    );
    assert.ok(
      site.indexOf(`id: '${id}'`) !== -1,
      `the site does not build a ${id} page`
    );
  });
});

test('the solution is filed under something, and something real', () => {
  const categories = solution.metadata.categories;
  assert.ok(Array.isArray(categories) && categories.length > 0,
    'no categories, so the app arrives filed under nothing');
  assert.ok(categories.length <= 3, `${categories.length} categories; SPFx allows 3`);

  const allowed = allowedCategories();
  if (!allowed) {
    /* Only when the toolchain is not installed, which is not this test's
       business to insist on. */
    return;
  }
  const unknown = categories.filter((name) => allowed.indexOf(name) === -1);
  assert.deepEqual(unknown, [], 'SPFx will not accept these category names');
});

test('there is still a description for both places that show one', () => {
  assert.ok(solution.metadata.shortDescription.default, 'no short description');
  assert.ok(solution.metadata.longDescription.default, 'no long description');
});
