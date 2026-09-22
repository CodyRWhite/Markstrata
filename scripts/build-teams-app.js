/**
 * .SYNOPSIS
 * Builds the Teams app packages: a manifest and two icons each, zipped.
 *
 * .DESCRIPTION
 * SharePoint's Sync to Teams can build a Teams app out of the solution, and
 * for a while that is what this used. What it produces is a manifest nobody
 * can edit, and it showed: the app's short and full descriptions both came out
 * as the word "Markstrata", the documentation link had nothing behind it
 * because SPFx has no field that maps to it, and the address of the tab's own
 * configuration page - the page somebody uses to choose which document the tab
 * shows - was generated for us and arrived as a placeholder.
 *
 * So the manifest is written by hand in teams/manifest.json and this assembles
 * it. Nothing is hosted: the tab points at the SPFx component already deployed
 * in the app catalog, through SharePoint's own Teams hosting page, so there is
 * no second thing to run and no app registration. What this adds is control
 * over what Teams and its admin centre display.
 *
 * The version is stamped from package.json, because Teams compares it the way
 * SharePoint compares the solution's: an upload with a version it has seen is
 * not an upgrade.
 *
 * .USAGE
 *   npm run teams
 *
 *   Writes two packages into teams/, which the .sppkg then carries.
 *
 *   TeamsSPFxApp.zip is the markdown web part's, and the name is what
 *   SharePoint looks for: an administrator presses Sync to Teams in the app
 *   catalog and SharePoint deploys this rather than one of its own.
 *
 *   MarkstrataHtmlTeamsApp.zip is the HTML web part's. Teams allows an app one
 *   configurable tab, so it cannot be a second tab in the first package, and
 *   SharePoint will not sync it because it only knows the one name. It is
 *   uploaded by hand in the Teams admin centre, or sideloaded to try it. A team
 *   that would rather not can put Markstrata - HTML on a SharePoint page and
 *   carry that page as a tab, which needs no app at all.
 *
 *   Either zip can be uploaded by hand.
 *
 * .NOTES
 * Since:     0.0.18.2
 * Ships in:  nothing - it builds the Teams package beside the .sppkg
 * Requires:  config/teams-app-manifest.json, config/teams-html-app-manifest.json,
 *            the icons built by build-brand.js
 */

const fs = require('fs');
const path = require('path');
const JSZip = require('jszip');

const root = path.join(__dirname, '..');

/*
 * The package goes into teams/ and is called TeamsSPFxApp.zip, and both of
 * those are load-bearing rather than tidy.
 *
 * SPFx copies everything under teams/ into the .sppkg, and when an
 * administrator presses Sync to Teams, SharePoint looks inside the package for
 * exactly ./teams/TeamsSPFxApp.zip. If it is there, SharePoint deploys that to
 * the tenant's Teams app store instead of generating a manifest of its own -
 * which is how a hand-written manifest and Sync to Teams turn out to be the
 * same answer rather than two competing ones, and how an update to the Teams
 * app arrives the same way an update to the web part does.
 *
 * The manifest is kept in config/ because it is source: the thing that ships
 * is the zip, and a second copy of the manifest loose in the package is a
 * generic manifest.json sitting beside SPFx's own assets.
 */
const teams = path.join(root, 'teams');
const out = teams;

/*
 * Two apps, because Teams allows an app one configurable tab.
 *
 * The manifest schema says so in as many words - configurableTabs is capped at
 * one item, "Currently only one configurable tab per app is supported" - so a
 * second tab for the HTML web part cannot go in the same package however much
 * one would prefer it there. A second entry in that array is not a second tab;
 * it is a manifest Teams rejects, and the rejection reads from the app catalog
 * as Sync to Teams failing again for no stated reason.
 *
 * So the markdown app keeps TeamsSPFxApp.zip, which is the exact name
 * SharePoint looks for inside the .sppkg when somebody presses Sync to Teams.
 * The HTML app is built beside it under a name of its own, which SharePoint
 * will not deploy - it only knows the one - so it is uploaded by hand in the
 * Teams admin centre, or sideloaded to try it. That extra step is the price of
 * a dedicated channel tab for the second web part; a team that does not want it
 * can add Markstrata - HTML to a SharePoint page and carry that page as a tab
 * instead, which needs no app at all.
 *
 * Both are the same package layout, the same version rule and the same icons.
 * The icons are the Markstrata mark, and both apps are Markstrata.
 */
const APPS = [
  {
    manifest: path.join(root, 'config', 'teams-app-manifest.json'),
    package: 'TeamsSPFxApp.zip',
    syncedBySharePoint: true
  },
  {
    manifest: path.join(root, 'config', 'teams-html-app-manifest.json'),
    package: 'MarkstrataHtmlTeamsApp.zip',
    syncedBySharePoint: false
  }
];

/*
 * The icons are built from the brand package under the markdown component's id,
 * because that is the name Sync to Teams looks for. Both apps carry the same
 * two files, renamed by each manifest on the way into its own zip.
 */
const COMPONENT_ID = '74aecd51-7619-4ca6-b81a-6c670d6098b3';

/*
 * Teams wants three parts and SharePoint's version is four, and the fourth one
 * has to survive the trip.
 *
 * It used to be dropped, on the reasoning that the fourth part is the build
 * number and is normally zero. On a release branch it is not zero and it is
 * the only part moving: 0.0.18.0 through 0.0.18.5 all went to Teams as
 * "0.0.18". Teams refuses an app whose version it already holds, so the first
 * of those installed and every one after it was rejected - which reads, from
 * the app catalog, as Sync to Teams simply failing again.
 *
 * So the build is folded into the patch instead of being thrown away. The
 * result is still three parts, and it still only ever goes up:
 *
 *   0.0.18.0  ->  0.0.18000
 *   0.0.18.5  ->  0.0.18005
 *   0.0.19.0  ->  0.0.19000
 *
 * A tenant sitting on the old "0.0.18" upgrades cleanly, because 18000 is
 * greater than 18.
 *
 * BUILD_SCALE is what keeps that true, and it only holds while the build
 * number stays below it. Past that, 0.0.18.1000 would collide with 0.0.19.0
 * and the upgrade would be refused with nothing to say why, so this throws
 * rather than writing a number that cannot be installed.
 */
const BUILD_SCALE = 1000;

function teamsVersion(fourPart) {
  const parts = fourPart.split('.');
  const [major, minor, patch] = parts;
  const build = Number(parts[3] || 0);

  if (!(build < BUILD_SCALE)) {
    throw new Error(
      `Build number ${build} in ${fourPart} is too large for the Teams version:`
      + ` it must stay below ${BUILD_SCALE} so that a later release always`
      + ' reads as a higher version to Teams.'
    );
  }

  return [major, minor, Number(patch) * BUILD_SCALE + build].join('.');
}

function buildOne(app, packageVersion) {
  const manifest = JSON.parse(fs.readFileSync(app.manifest, 'utf8'));
  manifest.version = teamsVersion(packageVersion);

  /* Inside the package the icons are named by the manifest rather than by the
     component, which is what lets both apps share the two rendered files. */
  const icons = [
    [`${COMPONENT_ID}_color.png`, manifest.icons.color],
    [`${COMPONENT_ID}_outline.png`, manifest.icons.outline]
  ];

  const zip = new JSZip();
  zip.file('manifest.json', JSON.stringify(manifest, null, 2) + '\n');

  icons.forEach(([from, to]) => {
    const source = path.join(teams, from);
    if (!fs.existsSync(source)) {
      throw new Error(`${from} is missing - run npm run brand first`);
    }
    zip.file(to, fs.readFileSync(source));
  });

  return zip
    .generateAsync({ type: 'nodebuffer', compression: 'DEFLATE' })
    .then((buffer) => {
      fs.mkdirSync(out, { recursive: true });
      const target = path.join(out, app.package);
      fs.writeFileSync(target, buffer);
      console.log(`Wrote ${path.relative(root, target)}`
        + ` (Teams version ${manifest.version}, from ${packageVersion})`
        + (app.syncedBySharePoint ? '' : ' - upload this one by hand'));
      return target;
    });
}

function build() {
  const packageVersion = JSON.parse(
    fs.readFileSync(path.join(root, 'package.json'), 'utf8')
  ).version;

  /* One after another rather than together: they write into the same folder
     and read the same icons, and there is nothing to gain from racing. */
  return APPS.reduce(
    (done, app) => done.then((built) =>
      buildOne(app, packageVersion).then((target) => built.concat([target]))),
    Promise.resolve([])
  );
}

/* Exported so the version rule can be checked without building a package.
   Run directly, this still builds. */
/* APPS is exported so a test can ask what this writes rather than keeping a
   second list of the same names. A third app added here has to reach the
   release workflow too, and that is what the test checks. */
module.exports = { teamsVersion: teamsVersion, APPS: APPS };

if (require.main === module) {
  build().catch((error) => {
    console.error(error.message);
    process.exit(1);
  });
}
