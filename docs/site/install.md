# Installing Markstrata

One file goes into the tenant App Catalog and the web part appears in the web
part picker on every site you allowed it on. Nothing else is deployed, nothing
runs outside the tenant, and no permission is requested from an administrator.

[[toc]]

## What it needs

- **A tenant App Catalog**, at `/sites/appcatalog`, with the *Apps for
  SharePoint* library in it. Creating one is a one-off job in the SharePoint
  admin centre.
- **Permission to upload there**: a SharePoint administrator, or somebody with
  write access to that library.
- **Nothing else.** No API permission to approve, no Azure resource, no service
  account, no outbound address to allow.

The web part reads files with the signed-in reader's own session, so a document
is visible to exactly the people the library already shows it to. It has no
server of its own, because there is no Markstrata service. The
[privacy page](../privacy/) says the same thing at more length.

## Uploading the package

Download `markstrata.sppkg` from the
[latest release](https://github.com/CodyRWhite/Markstrata/releases/latest).

1. Open the tenant App Catalog, `/sites/appcatalog`, and its *Apps for
   SharePoint* library.
2. Upload `markstrata.sppkg`.
3. When prompted, choose **Enable this app and add it to all sites**, or leave
   it unticked and add it to each site from *Site contents*, *New*, *App*.
4. Edit a page, add a web part, and pick **Markstrata** from the **Content**
   group.

A newly added web part has nothing to show yet and says so, with a button that
fills it with a sample document. Open the property pane and point it at a file:
the **Content** page is the first of the five, and a **Library file** is usually
the right answer, since that keeps the markdown in SharePoint where it can be
versioned, permissioned and edited by people who never touch the page.

> [!TIP] Try it on a page nobody is reading yet
> The settings that matter most, the theme, the width and where the contents
> sit, are judged by looking at a real document in a real column. That is
> quicker on a scratch page than in the abstract.

## Upgrading

Upload the newer `.sppkg` over the old one and choose **Replace**. The solution
and web part IDs never change between versions, so a tenant sees an upgrade
rather than a second app, and pages keep their settings.

Every release ships the file under the same name for this reason. The App
Catalog matches an upload to the solution it replaces by file name, and a
version in the name gets the upload refused with *"A solution with the same
product ID already exists."* The version lives in the release tag and inside the
package, which is where SharePoint reads it.

> [!NOTE] Sites may need the update applied
> A site that had the app added to it individually keeps the version it was
> given until the update is applied there, under *Site contents*, *Details*.
> Deploying to all sites avoids it.

## Building the package yourself

Node.js 22 and a checkout:

```bash
npm install
npm run package          # writes sharepoint/solution/markstrata.sppkg
```

That is the same file the release carries, built from the same sources. The
repository also builds everything else it publishes:

```bash
npm test                 # the unit tests
npm run harness:drive    # the renderer classes driven in a real browser
npm run site             # this website
```

## What is in the package

Everything the web part runs. The markdown parser, the syntax highlighting,
every theme, KaTeX's stylesheet and its fonts, and the diagram renderer are all
inside the `.sppkg`, so a page with Markstrata on it makes no request to any
third party. That matters in a tenant that blocks outbound requests, and it
means no external service can change what executes on your pages.

The diagram renderer is a lazily loaded chunk of the package rather than part of
the main bundle, so a page without a diagram on it never downloads it.

> [!IMPORTANT] Raw HTML is off until you turn it on
> HTML written in the markdown is escaped by default. With **Allow raw HTML in
> markdown** on it is rendered, and sanitised first: no scripting, no event
> handlers, no `javascript:` addresses, and an `<iframe>` only when it points at
> one of a fixed list of embed hosts. The [settings page](../docs/#security)
> lists what survives and what does not.

## Removing it

Delete the package from the App Catalog, or uncheck the deployment. Pages that
had the web part on them show an empty placeholder where it was; the markdown
files are untouched, because they were always just files in a library.

## Then in Teams

A Teams channel's Files are a folder in a SharePoint document library, so the
same web part can read the same documents inside Teams. That needs the `.sppkg`
installed here first, and one more step in the App Catalog.

**[How the Teams tab works](../teams/)**
