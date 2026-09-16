/**
 * .SYNOPSIS
 * The stand-ins the harness puts under the web part still answer everything
 * the web part asks of the real thing.
 *
 * .DESCRIPTION
 * The web part harness runs the real web part against a SharePoint that is not
 * there: a service with the same methods, holding three documents in memory.
 * That is only worth anything while the two agree. A method added to the real
 * service and forgotten here would not break the harness - it would make it
 * quietly stop covering whatever uses that method, which is the failure mode
 * that matters, because it is silent.
 *
 * So the two are compared: every public member of the real service has to
 * exist on the stand-in. Not the other way round - the stand-in has a few
 * knobs of its own, for making the library slow or making it refuse, which
 * SharePoint would never offer.
 *
 * The SPFx stand-ins are checked more loosely, by name, because their contents
 * come from a package rather than from this repository: what is checked is
 * that every SPFx import the web part makes has something behind it in the
 * harness build.
 *
 * .USAGE
 *   npm test                            every test
 *   node --test tests/stand-ins.test.js this one
 *
 * .NOTES
 * Since:     0.0.18.0
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

/** Every member the class declares, whatever it is declared as. */
function allMembers(source) {
  const found = [];
  const pattern = /^ {2}(?:(?:public|private|protected|static|abstract|async|readonly|get|set)\s+)*([A-Za-z_$][\w$]*)\s*[(:<]/gm;

  let match = pattern.exec(source);
  while (match) {
    found.push(match[1]);
    match = pattern.exec(source);
  }
  return found;
}

/** Public methods, getters and static methods, in the order they appear. */
function publicMembers(source) {
  const found = [];
  const pattern = /^ {2}public\s+(?:static\s+)?(?:async\s+)?(?:(get|set)\s+)?([A-Za-z_$][\w$]*)\s*\(/gm;

  let match = pattern.exec(source);
  while (match) {
    found.push(match[2]);
    match = pattern.exec(source);
  }
  return found;
}

test('the harness SharePoint answers everything the real one does', () => {
  const real = publicMembers(read('src', 'webparts', 'markstrata', 'utils', 'SharePointService.ts'));
  const standIn = publicMembers(read('harness', 'spfx', 'sharePoint.ts'));

  assert.ok(real.length > 10, `only found ${real.length} methods on the real service`);

  const missing = real.filter((name) => standIn.indexOf(name) === -1);
  assert.deepEqual(
    missing,
    [],
    'the harness would run the web part against a service that cannot answer these'
  );
});

test('the types the real service exports are the ones the stand-in exports', () => {
  /* The web part imports these by name from whichever of the two it is built
     against, so a renamed field would be a compile error in the tenant build
     and nothing at all in the harness. */
  const names = ['IFileMetadata', 'IVersionInfo', 'ILibraryInfo'];
  const standIn = read('harness', 'spfx', 'sharePoint.ts');

  names.forEach((name) => {
    assert.ok(
      standIn.indexOf(`export interface ${name}`) !== -1,
      `${name} is not exported by the harness service`
    );
  });
});

test('every SPFx module the web part imports has something behind it', () => {
  const build = read('harness', 'build.js');

  /* What the web part actually imports, read from the web part rather than
     listed here, so a new import cannot be missed. */
  const sources = ['MarkstrataWebPart.ts', 'propertyPane.ts', 'paneSources.ts', 'webPartProps.ts']
    .map((file) => read('src', 'webparts', 'markstrata', file))
    .concat([read('src', 'webparts', 'markstrata', 'utils', 'SharePointService.ts')]);

  const imported = new Set();
  sources.forEach((source) => {
    const pattern = /from\s+'(@microsoft\/[^']+|MarkstrataWebPartStrings)'/g;
    let match = pattern.exec(source);
    while (match) {
      imported.add(match[1]);
      match = pattern.exec(source);
    }
  });

  assert.ok(imported.size >= 5, `only found ${imported.size} SPFx imports`);

  const unmapped = Array.from(imported).filter((name) => build.indexOf(`'${name}'`) === -1);
  assert.deepEqual(unmapped, [], 'the harness build has no stand-in for these');
});

test('nothing the harness adds to the base class collides with the web part', () => {
  /* The harness base class carries methods the real SPFx one does not - the
     page's side of the lifecycle. A web part member of the same name silently
     overrides one, and nothing catches it: the harness is not typechecked, and
     the tenant build never sees this class. It happened within an hour of the
     file being written, and cost an afternoon's confusion. */
  const base = allMembers(read('harness', 'spfx', 'webPartBase.ts'));
  const webPart = allMembers(read('src', 'webparts', 'markstrata', 'MarkstrataWebPart.ts'));

  /* What both are meant to have in common: the lifecycle the web part
     overrides on purpose, and the fields SPFx gives it. */
  const shared = [
    'render', 'onInit', 'onDispose', 'onPropertyPaneFieldChanged',
    'getPropertyPaneConfiguration', 'context', 'properties', 'domElement',
    'displayMode'
  ];

  const added = base.filter((name) => shared.indexOf(name) === -1);
  const collisions = added.filter((name) => webPart.indexOf(name) !== -1);

  assert.ok(added.length > 4, `only found ${added.length} harness-only members`);
  assert.deepEqual(
    collisions,
    [],
    'the web part would be overriding these without meaning to'
  );
});
