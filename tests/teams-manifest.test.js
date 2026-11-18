/**
 * .SYNOPSIS
 * The hand-written Teams manifest says what Teams needs, within the limits
 * Teams sets.
 *
 * .DESCRIPTION
 * This file is written by hand because the generated one could not be. Sync to
 * Teams produced an app whose short and full descriptions were both the word
 * "Markstrata", whose documentation link had nothing behind it because SPFx has
 * no field that maps to one, and whose tab configuration page - the way anybody
 * chooses which document a tab shows - was a placeholder.
 *
 * Written by hand means nothing checks it, which is the trade. So the limits
 * are checked here: a short name over 30 characters or a short description over
 * 80 is refused by Teams on upload, and finding that out from the admin centre
 * is a slow way to learn it.
 *
 * What cannot be checked here is whether the addresses work, because they are
 * SharePoint pages in a tenant. The manual check list in CONTRIBUTING covers
 * that, and it is the only thing that can.
 *
 * .USAGE
 *   npm test                                  every test
 *   node --test tests/teams-manifest.test.js  this one
 *
 * .NOTES
 * Since:     0.0.18.2
 * Ships in:  nothing - it runs at test time only
 * Requires:  teams/manifest.json
 */

const test = require('node:test');
const assert = require('node:assert/strict');
const fs = require('node:fs');
const path = require('node:path');

const ROOT = path.join(__dirname, '..');
const manifest = JSON.parse(
  fs.readFileSync(path.join(ROOT, 'config', 'teams-app-manifest.json'), 'utf8')
);
const webPart = JSON.parse(fs.readFileSync(
  path.join(ROOT, 'src', 'webparts', 'markstrata', 'MarkstrataWebPart.manifest.json'), 'utf8'
));

/*
 * The second app, for the HTML web part.
 *
 * It exists because the schema caps configurableTabs at one item per app, so a
 * second tab cannot go in the first package. It was written by copying the
 * first, which is exactly why it is validated here rather than trusted: a copy
 * is one careless edit from carrying the other web part's component id, the
 * other app's identity, or a key the schema does not define.
 */
const htmlManifest = JSON.parse(
  fs.readFileSync(path.join(ROOT, 'config', 'teams-html-app-manifest.json'), 'utf8')
);
const htmlWebPart = JSON.parse(fs.readFileSync(
  path.join(ROOT, 'src', 'webparts', 'markstratahtml', 'MarkstrataHtmlWebPart.manifest.json'),
  'utf8'
));

/*
 * The schema itself, vendored beside the manifest.
 *
 * The limits used to be copied into this file by hand, which is how a key
 * Teams does not allow got in: I checked the fields I remembered and never
 * asked the schema what it permits. It answers both questions, so it is read
 * rather than remembered.
 */
const schema = JSON.parse(fs.readFileSync(
  path.join(ROOT, 'config', 'teams-manifest-v1.17.schema.json'), 'utf8'
));

/**
 * Every key in `value` that the schema does not define, walked into the
 * objects we populate.
 *
 * This is not a JSON Schema validator and does not pretend to be one: it
 * checks names, requiredness and lengths, and it names the offending key in
 * words, which a validator's error path does not always do.
 *
 * The real validation is the check at the foot of this file. It was left out
 * when this was written, on the grounds that the schema is draft-04 and
 * nothing here read that draft. That turned out to be wrong: ajv is already
 * in the tree and reads draft-04 given its meta-schema. So both run, and this
 * one is the friendlier message rather than the only line of defence.
 */
function undefinedKeys(value, node, trail) {
  if (!node || !node.properties || typeof value !== 'object' || value === null) {
    return [];
  }
  if (node.additionalProperties !== false) {
    return [];
  }

  let found = [];
  Object.keys(value).forEach((key) => {
    if (key === '$schema') { return; }
    const where = trail ? `${trail}.${key}` : key;

    if (!node.properties[key]) {
      found.push(where);
      return;
    }
    const child = node.properties[key];
    if (Array.isArray(value[key]) && child.items) {
      value[key].forEach((entry, index) => {
        found = found.concat(undefinedKeys(entry, child.items, `${where}[${index}]`));
      });
      return;
    }
    found = found.concat(undefinedKeys(value[key], child, where));
  });
  return found;
}

test('every key in it is one the schema defines', () => {
  /* The one that mattered: "packageName" was in here, is not in v1.17, and
     the schema sets additionalProperties false, so Teams refused the upload
     outright - both by hand and through Sync to Teams, because that deploys
     this same package. */
  assert.deepEqual(
    undefinedKeys(manifest, schema, ''),
    [],
    'Teams refuses a manifest carrying a property the schema does not define'
  );
});

test('it has everything the schema demands', () => {
  const missing = (schema.required || []).filter((field) => manifest[field] === undefined);
  assert.deepEqual(missing, [], 'Teams refuses a manifest without these');
  assert.equal(manifest.manifestVersion, '1.17');
  assert.match(manifest.id, /^[0-9a-f]{8}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{12}$/);
  assert.match(manifest.accentColor, /^#[0-9A-Fa-f]{6}$/);
});

test('nothing is longer than the schema allows', () => {
  /* Read out of the schema rather than copied here, so a version of it that
     moves a limit fails this instead of failing an upload. */
  [['name', 'short'], ['name', 'full'], ['description', 'short'], ['description', 'full']]
    .forEach(([group, part]) => {
      const limit = schema.properties[group].properties[part].maxLength;
      const value = manifest[group][part];
      assert.ok(limit, `the schema states no limit for ${group}.${part}`);
      assert.ok(value, `${group}.${part} is empty`);
      assert.ok(
        value.length <= limit,
        `${group}.${part} is ${value.length} characters; the schema allows ${limit}`
      );
    });
});

test('the descriptions describe rather than repeat the name', () => {
  /* The fault being fixed: both of them were the app's own name, which tells
     an administrator deciding whether to allow it precisely nothing. */
  ['short', 'full'].forEach((which) => {
    const text = manifest.description[which];
    assert.notEqual(text.trim(), manifest.name.short, `the ${which} description is just the name`);
    assert.ok(text.length > 40, `the ${which} description is ${text.length} characters`);
  });
});

test('the admin-facing links are all real and all different', () => {
  const links = [
    manifest.developer.websiteUrl,
    manifest.developer.privacyUrl,
    manifest.developer.termsOfUseUrl,
    manifest.publisherDocsUrl
  ];
  links.forEach((url) => {
    assert.ok(url, 'an admin-facing link is empty');
    assert.match(url, /^https:\/\//, `not https: ${url}`);
  });
  assert.equal(new Set(links).size, 4, 'two of the four links are the same page');

  /* The one Sync to Teams could never fill, and the reason this file exists. */
  assert.ok(manifest.publisherDocsUrl, 'no documentation link');
});

test('the tab points at the web part that is actually deployed', () => {
  const tabs = manifest.configurableTabs;
  assert.ok(Array.isArray(tabs) && tabs.length === 1, 'Teams allows exactly one configurable tab');

  const url = tabs[0].configurationUrl;
  assert.ok(
    url.indexOf(webPart.id) !== -1,
    'the configuration page names a different component than the web part manifest does'
  );
  /* Teams substitutes this at load time; a tenant hostname written in here
     would work in one tenant and nowhere else. */
  assert.ok(url.indexOf('{teamSiteDomain}') !== -1, 'the address is not tenant-neutral');

  /*
   * And the site, which is a separate token and was missing.
   *
   * {teamSiteDomain} is only the tenant host. Without {teamSitePath} beside
   * it the address is the root site collection rather than the site behind
   * the team, so TeamsLogon was asked to sign the reader in to the wrong web
   * and hand it a dest in that web's _layouts. It answered HTTP 500, and even
   * had it loaded, the web part would have been looking at the root site's
   * libraries rather than the channel's Files.
   *
   * Twice, because the address carries the path twice: once for the page
   * being requested and once inside dest for the page it forwards to. The
   * second is the one easily forgotten, so it is asserted separately rather
   * than by counting.
   */
  assert.ok(url.indexOf('{teamSiteDomain}{teamSitePath}/_layouts/') !== -1,
    'TeamsLogon is being asked for on the root site rather than the team site');
  assert.ok(url.indexOf('dest={teamSitePath}/_layouts/') !== -1,
    'dest points into the root site rather than the team site');
  /* Without this the configuration page renders the web part with no way to
     configure it, which is the placeholder everybody saw. */
  assert.ok(url.indexOf('openPropertyPane=true') !== -1, 'the pane would not open');

  /*
   * A channel, and not a chat.
   *
   * groupChat was offered here and Teams took it at its word: the app could
   * be added to a 1:1 or group chat, and configuring it there answered
   * HTTP 500. The address above is why. It is anchored on {teamSiteDomain},
   * which Teams fills in from the SharePoint site behind a team, and a chat
   * has no team behind it and so no site: there is no host for the
   * configuration page to be requested from. webApplicationInfo.resource is
   * the same token and has the same nothing to resolve to.
   *
   * Removing the scope is right even where the address is not, because the
   * tab reads a markdown file out of a channel's Files, which is that
   * channel's document library. A chat has no library, so there would be
   * nothing to point the tab at even if it opened.
   */
  assert.deepEqual(tabs[0].scopes, ['team']);
});

/*
 * A private channel keeps its own SharePoint site collection rather than
 * sharing the parent team's, which is the whole reason it is private. Teams
 * treats such a channel as a non-standard type and hides an app from it unless
 * the app says otherwise: without this, adding either app to one is refused
 * with "App isn't supported in private channels."
 *
 * Saying otherwise is safe here for a reason worth writing down. The tab is
 * addressed with {teamSiteDomain}{teamSitePath}, which Teams fills in from
 * whichever site is behind the channel it is being added to, so a private
 * channel's own site is what the tab is pointed at and its own Files is what
 * the picker reads. The web part has to be available on that site for the page
 * to load, and it is, because the solution sets skipFeatureDeployment - it is
 * available tenant wide rather than installed site by site, so a channel's new
 * site collection needs nothing done to it.
 *
 * Shared channels are asked for as well, and the reasoning is worth keeping
 * because it is not the reasoning this file carried first.
 *
 * A shared channel also keeps a SharePoint site of its own, so the mechanism
 * is the one private channels already proved in a tenant: the tab is pointed
 * at the channel's own site and reads that channel's own Files.
 *
 * What differs is who can be in one. Guests cannot: Microsoft's own words are
 * that "guests (people with Microsoft Entra guest accounts in your
 * organization) can't be added to a shared channel". People from outside join
 * a shared channel through B2B direct connect instead, and they stay signed
 * into their own tenant while doing it. Microsoft's guidance for tabs in that
 * case is to request a token from the user's home tenant, which is not
 * something this manifest decides and not something the web part does for
 * itself - SharePoint Framework handles its own authentication.
 *
 * So the honest position is: shared channels inside the tenant work the way
 * private ones do, and a cross-tenant participant may find the tab will not
 * load for them. Declining the whole feature over that would cost every
 * in-tenant shared channel to protect a case the manifest cannot fix either
 * way.
 */
[
  ['the markdown app', manifest],
  ['the HTML app', htmlManifest]
].forEach(([which, subject]) => {
  test(`${which} can be added to a private or a shared channel`, () => {
    assert.deepEqual(subject.supportedChannelTypes, ['privateChannels', 'sharedChannels'],
      'a private or shared channel has its own site and Teams hides the app '
      + 'from one unless the manifest names the channel type');
  });
});

test('the domains the tab loads from are allowed', () => {
  assert.ok(
    manifest.validDomains.some((domain) => domain.indexOf('sharepoint.com') !== -1),
    'the tab loads from SharePoint and SharePoint is not in validDomains'
  );
});

test('the icons it names are the ones the package carries', () => {
  assert.equal(manifest.icons.color, 'color.png');
  assert.equal(manifest.icons.outline, 'outline.png');

  /* Built under the component id, renamed on the way into the zip: both names
     have to keep agreeing with the builder. */
  ['color', 'outline'].forEach((which) => {
    const source = path.join(ROOT, 'teams', `${webPart.id}_${which}.png`);
    assert.ok(fs.existsSync(source), `teams/${webPart.id}_${which}.png is missing`);
  });
});

test('teams/ holds what SharePoint looks for and nothing else', () => {
  /*
   * SPFx copies everything under teams/ into the .sppkg, and that is the
   * point rather than a nuisance: when an administrator presses Sync to Teams,
   * SharePoint looks inside the package for ./teams/TeamsSPFxApp.zip and
   * deploys that instead of generating a manifest of its own.
   *
   * So four things belong here and nothing else. The two icons, named by the
   * markdown component's id, which is the name Sync to Teams looks for and
   * which both apps' packages copy from; TeamsSPFxApp.zip, the one SharePoint
   * deploys; and the HTML web part's package, which SharePoint will not deploy
   * because it only knows the one name, and which rides inside the .sppkg so
   * that an administrator has it to hand without a second download. Neither
   * zip is committed, so both are allowed rather than required.
   *
   * Anything else is shipped inside the .sppkg for no reason - an earlier cut
   * of this left the manifest loose in the folder, where it became a generic
   * ClientSideAssets/manifest.json beside SPFx's own assets.
   */
  const allowed = [
    `${webPart.id}_color.png`,
    `${webPart.id}_outline.png`,
    'TeamsSPFxApp.zip',
    'MarkstrataHtmlTeamsApp.zip'
  ];

  const unexpected = fs.readdirSync(path.join(ROOT, 'teams'))
    .filter((name) => allowed.indexOf(name) === -1);

  assert.deepEqual(unexpected, [], 'these are shipped inside the .sppkg too');
});

test('the manifest carries what Teams needs to call SharePoint back', () => {
  /* Documented as required for a developer-provided package: without it, an
     API call from the Teams desktop and mobile clients fails. The resource is
     a placeholder on purpose, because it has to be the tenant the Teams client
     is in, and the id is SharePoint Online's own. */
  assert.deepEqual(manifest.webApplicationInfo, {
    resource: 'https://{teamSiteDomain}',
    id: '00000003-0000-0ff1-ce00-000000000000'
  });
});

/*
 * The whole schema, by a real validator.
 *
 * Written after a manifest carrying a `packageName` reached a tenant and was
 * refused by Teams, because the check beside it listed the fields somebody
 * remembered rather than the ones the schema defines. The reasoning for not
 * doing this properly was that the schema is draft-04 and nothing to hand
 * read that draft. ajv does, and it has been installed the whole time.
 *
 * ajv is in devDependencies rather than left as somebody else's transitive
 * dependency: a check that silently stops running when an unrelated package is
 * upgraded is worse than no check. ajv-draft-04 and ajv-formats are there for
 * the same reason, and manifestValidator below says what each one is for.
 */
test('the manifest validates against the whole v1.17 schema', () => {
  const validate = manifestValidator();
  const valid = validate(manifest);
  assert.ok(valid, valid ? '' : (validate.errors || [])
    /* `instancePath` in ajv 8; it was `dataPath` in 6, and reading the old
       name gave '(root)' for every error whatever it was about. */
    .map((error) => `${error.instancePath || '(root)'} ${error.message}`).join('; '));
});

test('and the validator really would refuse a bad one', () => {
  /* The exact shape that reached a tenant: a key the schema does not define,
     on a manifest that is otherwise correct. A validator that passes
     everything is not a validator. */
  const validate = manifestValidator();
  const withInvented = Object.assign({}, manifest, { packageName: 'com.example.markstrata' });
  assert.equal(validate(withInvented), false,
    'an undefined property was accepted, so this check proves nothing');

  const withoutRequired = Object.assign({}, manifest);
  delete withoutRequired.id;
  assert.equal(validate(withoutRequired), false, 'a manifest with no id was accepted');
});

// ----------------------------------------------------- the HTML web part's app

test('the HTML app validates against the whole v1.17 schema as well', () => {
  const validate = manifestValidator();
  const valid = validate(htmlManifest);
  assert.ok(valid, valid ? '' : (validate.errors || [])
    .map((error) => `${error.instancePath || '(root)'} ${error.message}`).join('; '));
});

test('its tab points at the HTML web part, not the markdown one', () => {
  /* The failure a copied manifest makes first, and the one nothing else would
     catch: two apps in a tenant's store, both opening the same web part. */
  const url = htmlManifest.configurableTabs[0].configurationUrl;
  assert.ok(url.indexOf(`componentId=${htmlWebPart.id}`) !== -1,
    `the tab does not name the HTML component: ${url}`);
  assert.ok(url.indexOf(webPart.id) === -1,
    'the tab still carries the markdown component id');
});

test('it is a different app from the first, by id and by name', () => {
  /* Teams identifies an app by its id, and a tenant's store shows people the
     name. Two apps sharing either is a store nobody can navigate. */
  assert.notEqual(htmlManifest.id, manifest.id);
  assert.notEqual(htmlManifest.name.short, manifest.name.short);
  assert.notEqual(htmlManifest.name.full, manifest.name.full);
  /* And the id is the component's, which is the convention the first app set. */
  assert.equal(htmlManifest.id, htmlWebPart.id);
});

test('and it claims one configurable tab, which is all Teams allows', () => {
  assert.equal(htmlManifest.configurableTabs.length, 1);
  assert.equal(manifest.configurableTabs.length, 1);
});

test('both apps say what kind of document they draw', () => {
  /* Somebody in the Teams store is choosing between two entries from the same
     publisher. A description that does not say which is which leaves them
     installing both to find out. */
  assert.match(manifest.description.short, /markdown/i);
  assert.match(htmlManifest.description.short, /\bHTML\b/);
  assert.ok(htmlManifest.description.short.toLowerCase().indexOf('markdown') === -1,
    'the HTML app describes itself as the markdown one');
});

test('the HTML app names the same icons the package carries', () => {
  /* Both apps ship the same two rendered files, renamed by each manifest on
     the way into its own zip. A name here that the build does not write is a
     package Teams refuses for a missing icon. */
  assert.deepEqual(htmlManifest.icons, manifest.icons);
});

/*
 * The validator, and why it is three packages rather than one.
 *
 * ajv 6 read draft-04 itself, given the meta-schema it shipped at
 * ajv/lib/refs/json-schema-draft-04.json, and validated `format` out of the
 * box. ajv 8 dropped both: that file is gone, the `schemaId` option with it,
 * and formats moved into a package of their own. So draft-04 comes from
 * ajv-draft-04, which is ajv 8 with the draft-04 dialect put back, and the one
 * `format: uri` in this schema comes from ajv-formats.
 *
 * ajv-formats is not optional here. ajv 8 is strict by default, so compiling
 * this schema without it does not quietly skip the key, it refuses outright:
 *
 *   unknown format "uri" ignored in schema at path "#/properties/%24schema"
 */
function manifestValidator() {
  const Ajv = require('ajv-draft-04');
  const addFormats = require('ajv-formats');
  const ajv = new Ajv({ allErrors: true });
  addFormats(ajv);
  return ajv.compile(schema);
}

/*
 * The app's id is the web part's component id, and not a new one.
 *
 * Teams keys an installed app by the id in its manifest. SPFx's own generated
 * Teams app uses the web part's component id, so that is what a tenant already
 * has registered from any earlier Sync to Teams - and an upload carrying a
 * different id is not an upgrade of that app, it is a stranger claiming its
 * place. Teams refuses it:
 *
 *   Tenant app external.id doesn't match existing tenant app external.id.
 *   Exist externalId: '74aecd51-...'  ExternalId: '9f2c1d64-...'
 *
 * The hand-written manifest invented an id, and the invented one is the second
 * of those. Nothing said the two had to agree, so nothing noticed. The rest of
 * the package had always keyed on the component id: the icons are named for
 * it, because that is how Sync to Teams finds them.
 *
 * The same shape as the packageName failure before it. A value taken from
 * memory rather than from the thing that defines it, and no check comparing
 * the two.
 */
test('the Teams app is the web part, by id', () => {
  const webPart = JSON.parse(fs.readFileSync(
    path.join(ROOT, 'src', 'webparts', 'markstrata', 'MarkstrataWebPart.manifest.json'), 'utf8'
  ));

  assert.equal(manifest.id, webPart.id,
    'the Teams manifest id and the web part component id have to be the same value, '
    + 'or an upload is a different app to the one a tenant already has and Teams '
    + 'refuses it as an external id mismatch');
});

test('and the icons are named for that same id', () => {
  /* They always were. This states the relationship so that moving one moves
     the other, rather than leaving the manifest free to drift again. */
  const built = path.join(ROOT, 'teams');
  for (const which of ['color', 'outline']) {
    assert.ok(fs.existsSync(path.join(built, `${manifest.id}_${which}.png`)),
      `teams/${manifest.id}_${which}.png is missing, so the manifest id and the `
      + 'icon names have drifted apart');
  }
});
