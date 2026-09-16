/**
 * .SYNOPSIS
 * Builds the Teams app package: the manifest, the two icons, zipped.
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
 *   Writes teams/TeamsSPFxApp.zip, which the .sppkg then carries. An
 *   administrator presses Sync to Teams in the app catalog and SharePoint
 *   deploys this package rather than one of its own. The same zip can be
 *   uploaded by hand in the Teams admin centre, or sideloaded to try it.
 *
 * .NOTES
 * Since:     unreleased
 * Ships in:  nothing - it builds the Teams package beside the .sppkg
 * Requires:  config/teams-app-manifest.json, the icons built by build-brand.js
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
const manifestPath = path.join(root, 'config', 'teams-app-manifest.json');
const teams = path.join(root, 'teams');
const out = teams;
const PACKAGE_NAME = 'TeamsSPFxApp.zip';

const COMPONENT_ID = '74aecd51-7619-4ca6-b81a-6c670d6098b3';

/*
 * Teams wants three parts and SharePoint's version is four. The fourth is the
 * build number and is normally zero, so it is dropped rather than invented
 * around: 0.0.18.2 goes to Teams as 0.0.18.
 */
function teamsVersion(fourPart) {
  const parts = fourPart.split('.');
  return parts.slice(0, 3).join('.');
}

function build() {
  const packageVersion = JSON.parse(
    fs.readFileSync(path.join(root, 'package.json'), 'utf8')
  ).version;

  const manifest = JSON.parse(fs.readFileSync(manifestPath, 'utf8'));
  manifest.version = teamsVersion(packageVersion);

  /* The icons are built from the brand package under the component id, because
     that is the name Sync to Teams looks for. Inside this package they are
     named by the manifest instead. */
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
      const target = path.join(out, PACKAGE_NAME);
      fs.writeFileSync(target, buffer);
      console.log(`Wrote ${path.relative(root, target)}`
        + ` (Teams version ${manifest.version}, from ${packageVersion})`);
      return target;
    });
}

build().catch((error) => {
  console.error(error.message);
  process.exit(1);
});
