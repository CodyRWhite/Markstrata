/**
 * .SYNOPSIS
 * The two icons a Teams app package needs are there, the right size, and named
 * for the web part they belong to.
 *
 * .DESCRIPTION
 * SharePoint's Sync to Teams builds the Teams app package out of the solution,
 * and it finds the icons by file name: the web part's component id, then
 * _color or _outline. Nothing checks that at build time. Get the name wrong -
 * or change the component id and forget these - and the package still builds,
 * still installs, and turns up in the Teams rail wearing a generic tile.
 *
 * The sizes matter for the same reason. Teams asks for 192 square in colour
 * and 32 square as an outline, and an outline is a white glyph on nothing at
 * all, because Teams tints it. A solid square would be tinted into a solid
 * square.
 *
 * .USAGE
 *   npm test                               every test
 *   node --test tests/teams-package.test.js  this one
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
const MANIFEST = path.join(
  ROOT, 'src', 'webparts', 'markstrata', 'MarkstrataWebPart.manifest.json'
);

const manifest = JSON.parse(fs.readFileSync(MANIFEST, 'utf8'));

/** Width, height and whether the image carries an alpha channel. */
function readPng(file) {
  const data = fs.readFileSync(file);
  assert.equal(data.toString('ascii', 1, 4), 'PNG', `${file} is not a PNG`);
  return {
    width: data.readUInt32BE(16),
    height: data.readUInt32BE(20),
    /* Colour type 4 is grey with alpha and 6 is RGB with alpha; the other
       three carry no transparency at all. */
    hasAlpha: data[25] === 4 || data[25] === 6
  };
}

test('the icons are named for the web part they belong to', () => {
  const id = manifest.id;
  assert.match(id, /^[0-9a-f-]{36}$/, `the component id reads ${id}`);

  ['color', 'outline'].forEach((which) => {
    const file = path.join(ROOT, 'teams', `${id}_${which}.png`);
    assert.ok(
      fs.existsSync(file),
      `teams/${id}_${which}.png is missing - Teams would use a generic icon`
    );
  });
});

test('they are the sizes Teams asks for', () => {
  const colour = readPng(path.join(ROOT, 'teams', `${manifest.id}_color.png`));
  assert.deepEqual(
    [colour.width, colour.height], [192, 192],
    `the colour icon is ${colour.width}x${colour.height}`
  );

  const outline = readPng(path.join(ROOT, 'teams', `${manifest.id}_outline.png`));
  assert.deepEqual(
    [outline.width, outline.height], [32, 32],
    `the outline icon is ${outline.width}x${outline.height}`
  );
  assert.ok(
    outline.hasAlpha,
    'the outline icon has no transparency, so Teams would tint a solid square'
  );
});

test('the hosts claimed are the ones there is a story for', () => {
  /* TeamsPersonalApp was claimed and never worked: a personal app has no site
     behind it, so the library, folder and file pickers have nothing to browse
     and the pane cannot configure anything. Supporting it means a different
     content source, not a different manifest line. */
  assert.deepEqual(
    manifest.supportedHosts,
    ['SharePointWebPart', 'TeamsTab', 'SharePointFullPage'],
    'a host is claimed here that nothing has been built or checked for'
  );
});

/*
 * The version Teams is given has to keep going up.
 *
 * SharePoint's version is four-part and Teams takes three, and the fourth was
 * simply dropped: 0.0.18.0 through 0.0.18.5 all reached Teams as "0.0.18".
 * Teams refuses an app whose version it already holds, so the first of those
 * installed and every one after it was refused - which looks, from the app
 * catalog, like Sync to Teams failing for no reason. On a release branch the
 * fourth part is the only one moving, which is exactly when it matters most.
 */
const { teamsVersion } = require('../scripts/build-teams-app.js');

test('the build number reaches Teams instead of being dropped', () => {
  assert.notEqual(teamsVersion('0.0.18.5'), teamsVersion('0.0.18.4'),
    'two releases of the same patch must not read as one version');
  assert.equal(teamsVersion('0.0.18.5'), '0.0.18005');
});

test('a later release always reads as a higher version', () => {
  const order = [
    '0.0.17.0', '0.0.17.2', '0.0.18.0', '0.0.18.1', '0.0.18.4', '0.0.18.5',
    '0.0.18.999', '0.0.19.0', '0.1.0.0', '1.0.0.0'
  ];
  const compare = (left, right) => {
    const a = left.split('.').map(Number);
    const b = right.split('.').map(Number);
    for (let index = 0; index < 3; index++) {
      if (a[index] !== b[index]) { return a[index] - b[index]; }
    }
    return 0;
  };
  for (let index = 1; index < order.length; index++) {
    const previous = teamsVersion(order[index - 1]);
    const next = teamsVersion(order[index]);
    assert.ok(compare(next, previous) > 0,
      `${order[index]} -> ${next} does not come after ${order[index - 1]} -> ${previous}`);
  }
});

test('a tenant on the old three-part version still upgrades', () => {
  /* What is installed now, from before this was fixed. */
  assert.ok(Number(teamsVersion('0.0.18.0').split('.')[2]) > 18,
    'the next release has to outrank the "0.0.18" already installed');
});

test('it is still three parts, which is all Teams accepts', () => {
  for (const version of ['0.0.18.5', '1.2.3.4', '0.0.18.0']) {
    assert.equal(teamsVersion(version).split('.').length, 3, version);
  }
});

test('a build number too large to stay in order fails the build', () => {
  /* Rather than writing a number that reads as older than the release before
     it and being refused by Teams with nothing to say why. */
  assert.throws(() => teamsVersion('0.0.18.1000'), /too large/);
});
