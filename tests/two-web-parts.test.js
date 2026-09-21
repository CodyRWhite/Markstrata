/**
 * .SYNOPSIS
 * Two web parts ship now, and everything that has to be said twice has to
 * agree.
 *
 * .DESCRIPTION
 * A second web part multiplies the number of places one fact is written down:
 * a component id in a manifest, an entry point in config.json, a default in
 * three files, a property name in an interface and in a pane and in a
 * manifest's preconfigured entry. None of those is checked by the compiler,
 * and every one of them fails quietly.
 *
 * The worst of them is a preconfigured property whose name is not a property.
 * SPFx does not complain: the value is written into the web part's settings,
 * nothing ever reads it, and the web part opens with the default the author
 * did not choose. That is the third test below, and it reads the names out of
 * the interfaces rather than listing them, so a property renamed in one place
 * fails here rather than in somebody's site.
 *
 * .USAGE
 *   npm test                                  every test
 *   node --test tests/two-web-parts.test.js   this one
 *
 * .NOTES
 * Since:     0.0.22.0
 * Ships in:  nothing - it runs at test time only
 * Requires:  nothing else in this project
 */

const test = require('node:test');
const assert = require('node:assert/strict');
const fs = require('node:fs');
const path = require('node:path');

const ROOT = path.join(__dirname, '..');

function read(...parts) {
  return fs.readFileSync(path.join(ROOT, ...parts), 'utf8');
}

const config = JSON.parse(read('config', 'config.json'));

const WEB_PARTS = [
  {
    name: 'markdown',
    manifest: 'src/webparts/markstrata/MarkstrataWebPart.manifest.json',
    webPart: 'src/webparts/markstrata/MarkstrataWebPart.ts',
    props: 'src/webparts/markstrata/webPartProps.ts',
    title: 'Markstrata - Markdown'
  },
  {
    name: 'html',
    manifest: 'src/webparts/markstratahtml/MarkstrataHtmlWebPart.manifest.json',
    webPart: 'src/webparts/markstratahtml/MarkstrataHtmlWebPart.ts',
    props: 'src/webparts/markstratahtml/htmlWebPartProps.ts',
    title: 'Markstrata - HTML'
  }
];

const manifests = WEB_PARTS.map((part) => ({
  ...part,
  json: JSON.parse(read(part.manifest))
}));

/**
 * Every property name declared on an interface, plus the shared one it
 * extends. Read out of the source rather than listed here, so this test
 * cannot be the thing that is out of date.
 */
function declaredProperties(file) {
  const source = read(file) + read('src/webparts/shared/strataWebPartProps.ts');
  /* A member line: two spaces, a name, an optional ?, a colon. Comments and
     doc blocks do not match, because a comment line does not start with a
     bare identifier at that indent. */
  return new Set(
    [...source.matchAll(/^ {2}([a-zA-Z][a-zA-Z0-9]*)\??:/gm)].map((match) => match[1])
  );
}

test('each web part has a bundle, and each bundle has a web part', () => {
  const bundled = Object.values(config.bundles)
    .flatMap((bundle) => bundle.components.map((component) => component.manifest));
  const declared = manifests.map((part) => `./${part.manifest}`);

  assert.deepEqual(bundled.slice().sort(), declared.slice().sort());
});

test('every bundle points at an entry point that exists', () => {
  for (const bundle of Object.values(config.bundles)) {
    for (const component of bundle.components) {
      /* config.json names the compiled file; the test checks the source it is
         compiled from, because lib/ is a build output and may not be there. */
      const source = component.entrypoint
        .replace(/^\.\/lib\//, 'src/')
        .replace(/\.js$/, '.ts');
      assert.ok(fs.existsSync(path.join(ROOT, source)),
        `${component.entrypoint} has no source at ${source}`);
    }
  }
});

test('every preconfigured property is a property the web part has', () => {
  /* The quiet one. SPFx writes an unknown name into the settings, nothing
     reads it, and the web part opens with a default the author did not
     choose. */
  for (const part of manifests) {
    const known = declaredProperties(part.props);
    for (const entry of part.json.preconfiguredEntries) {
      for (const name of Object.keys(entry.properties)) {
        assert.ok(known.has(name),
          `${part.manifest} presets "${name}", which is not on ${part.props}`);
      }
    }
  }
});

test('every default the web part applies is a property it has', () => {
  /* The same failure by the other route: ownDefaults fills in a name nothing
     declares, so the real property keeps whatever undefined means to it. */
  for (const part of manifests) {
    const known = declaredProperties(part.props);
    const source = read(part.webPart);
    const defaults = source.split('ownDefaults(): Record<string, unknown> {')[1];
    assert.ok(defaults, `${part.webPart} has no ownDefaults`);

    const body = defaults.split('\n  }')[0];
    for (const match of body.matchAll(/^ {6}([a-zA-Z][a-zA-Z0-9]*):/gm)) {
      assert.ok(known.has(match[1]),
        `${part.webPart} defaults "${match[1]}", which is not on ${part.props}`);
    }
  }
});

test('the two components are two components', () => {
  const ids = manifests.map((part) => part.json.id);
  assert.notEqual(ids[0], ids[1], 'both web parts claim the same component id');
  for (const id of ids) {
    assert.match(id, /^[0-9a-f]{8}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{12}$/);
  }
});

test('and have two names, each saying which Markstrata this is', () => {
  /* The rename exists so an author adding a web part can tell them apart in
     the toolbox. One name, or two names that do not say, undoes it. */
  for (const part of manifests) {
    for (const entry of part.json.preconfiguredEntries) {
      assert.equal(entry.title.default, part.title);
    }
  }
});

test('both can be a Teams tab, and both are safe without custom script', () => {
  for (const part of manifests) {
    assert.ok(part.json.supportedHosts.indexOf('TeamsTab') !== -1,
      `${part.manifest} cannot be a Teams tab`);
    /* The HTML web part can run an author's scripts, but only inside a
       sandboxed frame that cannot reach the page or the reader's session, and
       only when somebody turns it on. Claiming otherwise here would take the
       web part off every tenant that has custom script disabled. */
    assert.equal(part.json.requiresCustomScript, false);
  }
});

test('the HTML web part ships with scripts off', () => {
  /* A default that runs an author's code is not a default. It is checked in
     the manifest as well as in the class because a preconfigured entry is what
     a newly added web part actually gets. */
  const html = manifests.find((part) => part.name === 'html');
  for (const entry of html.json.preconfiguredEntries) {
    assert.equal(entry.properties.runScripts, false);
  }
  assert.match(read(html.webPart), /runScripts: false/);
});

test('both web parts read the same strings file', () => {
  /* One localised module, so a label an author sees in one pane is the same
     label in the other. Two would be two places for "Document library" to
     drift. */
  assert.deepEqual(Object.keys(config.localizedResources), ['MarkstrataWebPartStrings']);
  for (const part of manifests) {
    assert.match(read(part.webPart), /from 'MarkstrataWebPartStrings'/);
  }
});

test('the App Catalog title names both web parts, not one of them', () => {
  /*
   * The exact drift brand.test.js warns about, one layer up. Its check is
   * that the title says Teams, because a title naming only SharePoint sat
   * there for a dozen releases after the Teams tab shipped. This is the same
   * failure with a second web part: "Markstrata - Markdown for SharePoint and
   * Teams" was true the day before this one existed.
   */
  const solution = JSON.parse(read('config', 'package-solution.json')).solution;
  const said = [
    solution.name,
    solution.metadata.shortDescription.default,
    solution.metadata.longDescription.default
  ];

  for (const text of said) {
    assert.match(text, /markdown/i, `does not mention markdown: ${text.substring(0, 80)}`);
    assert.match(text, /\bHTML\b/, `does not mention HTML: ${text.substring(0, 80)}`);
  }
});

test('and so does what Teams is told about the app', () => {
  const teams = JSON.parse(read('config', 'teams-app-manifest.json'));
  for (const text of [teams.name.full, teams.description.short, teams.description.full]) {
    assert.match(text, /markdown/i, `does not mention markdown: ${text.substring(0, 80)}`);
    assert.match(text, /\bHTML\b/, `does not mention HTML: ${text.substring(0, 80)}`);
  }
});

test('Teams is told about one configurable tab, which is all it allows', () => {
  /*
   * The schema caps this at one per app: "Currently only one configurable tab
   * per app is supported." A second entry here is not a second tab, it is a
   * manifest Teams rejects, and the rejection reads from the app catalog as
   * Sync to Teams failing for no reason. The description says which route the
   * other web part takes instead, so this also checks it still says it.
   */
  const teams = JSON.parse(read('config', 'teams-app-manifest.json'));
  assert.equal(teams.configurableTabs.length, 1);
  assert.match(teams.description.full, /one configurable tab/i,
    'the description should still explain how the other web part reaches Teams');
});
