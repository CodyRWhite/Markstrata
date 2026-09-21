# Markstrata in Microsoft Teams

A Teams channel's **Files** tab is a folder in a SharePoint document library.
Not a copy of one, not something synchronised with one: the same library, on
the site behind the team. That one fact is the whole of this page. A Markstrata
tab in a channel is the same web part reading the same files as a Markstrata web
part on a page, so a runbook is one document rather than a document and a stale
copy of it.

[[toc]]

## What a tab is made of

The Teams app carries no code. Its manifest names the web part's component id
and points the tab's configuration step at SharePoint's own hosting page, so the
tab loads the web part out of the App Catalog at the moment somebody opens it.

Two consequences, both worth knowing before you start:

- The `.sppkg` has to be installed in the SharePoint App Catalog first. A tenant
  that has only the Teams app gets a tab that never loads.
- There is nothing to host, no app registration, and no API permission to
  approve. The tab runs inside the tenant exactly as the web part does.

## Getting the app into the tenant

The Teams app package rides inside the `.sppkg`. Once the package is in the App
Catalog, select the Markstrata row and choose **Sync to Teams**.

SharePoint looks inside the package for a Teams app of its own and finds one,
so it publishes that rather than generating a manifest itself. The difference is
what the tenant sees. A generated manifest gets its description from the fields
SPFx has, which is one of them, and its tab configuration page from a template,
which cannot pick a document. The one in the package is written by hand: a real
description, a documentation link, and a configuration step that is the web
part's own property pane.

> [!NOTE] An app from an older sync should be removed first
> Earlier versions had no package of their own, so a tenant that pressed Sync to
> Teams before may already hold a generated app. Remove it before publishing
> this one. Two entries with the same name and the same icon is a support call
> waiting to happen.

The app then appears in the Teams admin centre under **Manage apps**, where it
can be allowed, blocked or given an app policy like any other.

> [!TIP] Trying it on one team first
> The same package can be uploaded by hand in the Teams admin centre, or
> sideloaded into a single team from **Apps**, **Manage your apps**, **Upload an
> app**, if sideloading is allowed in your tenant. That reaches one team without
> publishing anything to everybody.

## Two apps, because Teams allows one tab each

Teams permits an app a single configurable tab. The manifest schema says so in
as many words, and a second entry in that list is not a second tab; it is a
manifest Teams refuses, which from the App Catalog reads as Sync to Teams
failing again for no stated reason.

So there are two app packages, and only one of them is the one **Sync to Teams**
deploys.

| App | Package | How it gets there |
|---|---|---|
| **Markstrata** | `TeamsSPFxApp.zip` | Sync to Teams, as above |
| **Markstrata HTML** | `MarkstrataHtmlTeamsApp.zip` | Uploaded by hand in the Teams admin centre |

Both ride inside the `.sppkg`, so an administrator has both to hand without a
second download. SharePoint only knows the first name, so the second is
published the same way any other app package is: **Manage apps**, **Upload new
app**, and choose the zip. Extract it from the `.sppkg`, or build it with
`npm run teams`.

> [!TIP] You may not need the second app at all
> Markstrata - HTML works as a web part on a SharePoint page, and a channel can
> carry a SharePoint page as a tab. That reaches the same document with no
> second app to approve. The separate app is worth it when you want a channel
> tab pointed straight at an HTML file, with nothing in between.

## Adding a tab to a channel

1. In the channel, add a tab and pick **Markstrata** for a markdown document, or
   **Markstrata HTML** for an HTML one.
2. The configure step is the web part's property pane, with the library, folder
   and file pickers in it.
3. Choose a file. The pickers are over the site behind this team, so the
   channel's own Files are where they start, and each app offers only the kind
   of file it draws: `.md` and `.markdown` in one, `.html` and `.htm` in the
   other.
4. Save. The document renders in the tab, with its toolbar and contents.

A tab saved with nothing chosen shows a panel saying so, worded for Teams: it
points at the tab's own settings, which is the arrow beside the tab name, rather
than at a property pane that is not there. Each app words it for the kind of
document it wants.

## Settings that read differently in a tab

Everything on the [settings page](../docs/) applies, but a few of them mean
something slightly different once the host is Teams rather than a page.

| Setting | In a tab |
|---|---|
| **Colour mode** | *Follow the page* takes the theme the host hands the web part. If a tab has to look the same whatever the client is set to, set it to light or dark outright. |
| **Content width** | A tab is the whole frame rather than a column of a page, so *Full width* is wider here than it ever is on a page. *Comfortable* still reads better for prose. |
| **Fill the available height** | Worth turning on. A tab is a frame with nothing under it, so a short document that stops halfway down leaves the frame showing. |
| **Show toolbar** | *Only while editing the page* means the toolbar never appears: there is no page being edited. Use *Always* in a tab. |
| **Open a linked document here** | The reason to point a tab at a folder rather than a file. Links between documents are followed inside the tab. |

## Links between documents inside a tab

This is where a channel of markdown starts behaving like a wiki rather than a
folder. With **Open a linked document here** on, a link from one document to
another opens in the tab, and the trail of documents the reader walked sits in
the toolbar so the way back is the document they came from.

**[How linking between documents works](../linking/)** covers the whole of it,
and none of it is different in Teams.

## Permissions, and where the files actually are

A standard channel's Files are a folder in the document library on the site
behind the team, and everybody in the team can read them. A private channel has
a site of its own, and its Files are in that site's library instead, visible to
the members of that channel.

Both apps can be added to a private channel, and a tab there reads that
channel's own Files rather than the parent team's. Teams counts a private
channel as a non-standard type and hides an app from one unless the app asks
for it, so an app that does not ask is refused with "App isn't supported in
private channels" - both Markstrata apps ask.

Shared channels are deliberately not offered. A shared channel can be shared
with another tenant, and the tab is addressed from the SharePoint tenant the
Teams client is signed in to, which does not resolve across tenants. Offering
the app there would mean external members being shown a tab that cannot load
for them.

Markstrata does not change any of this. It reads the file with the signed-in
reader's own session, so a tab shows a document to exactly the people SharePoint
would show it to, and a reader without access to a file gets nothing rather than
a rendering of it.

## Updating

Upload the newer `.sppkg` to the App Catalog, choose **Replace**, and press
**Sync to Teams** again. Teams refuses an app whose version it already holds, so
the version has to move, and it does: the four-part SharePoint version is folded
into the three parts Teams reads, in a way that only ever goes up.

Tabs already in channels keep their settings. They load the web part fresh each
time they are opened, so they are running the new version as soon as it is
deployed.
