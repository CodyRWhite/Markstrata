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
 *   Writes dist/teams/markstrata-teams.zip. Upload it in the Teams admin
 *   centre under Manage apps, or sideload it in a team to try it.
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
 * The manifest and the zip live outside teams/, and that is not tidiness.
 * SPFx globs every file under teams/ into the solution package, so anything left
 * there is shipped inside the .sppkg: the first cut of this put the hand-
 * written manifest in there as ClientSideAssets/manifest.json, a generic name
 * sitting beside SPFx's own assets, and shipped a stale copy of the Teams app
 * inside the SharePoint one. Only the two icons belong in teams/, because
 * those are what that folder is for.
 */
const manifestPath = path.join(root, 'config', 'teams-app-manifest.json');
const teams = path.join(root, 'teams');
const out = path.join(root, 'dist', 'teams');

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
      const target = path.join(out, 'markstrata-teams.zip');
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
