# Publishing a library as a site

The web part renders one document. A folder of documents is a different problem:
somebody has to decide what the menu says, what a category landing page lists,
and what address each document lives at.

**MarkstrataSiteBuilder** is a PowerShell module that does that part. It is a
separate tool with its own repository and its own release cycle, not something
inside the `.sppkg`, and the web part does not need it. Reach for it when a
handful of pages has turned into a library somebody has to find their way
around.

```powershell
Install-Module MarkstrataSiteBuilder
Initialize-MarkstrataConfig          # asks for the site and the folder
Connect-MarkstrataSite               # offers to create the app registration it signs in with
Invoke-MarkstrataRefresh             # builds the whole site
```

[The module on GitHub](https://github.com/CodyRWhite/MarkstrataSiteBuilder)

## What it builds

**One page, not one page per document.** A single renderer page holds one
Markstrata web part and takes the document to show from its query string, which
is the [`?strataDoc=` address](../linking/#pointing-a-menu-at-a-document) this
web part already answers to:

```text
https://contoso.sharepoint.com/sites/docs/Wiki.aspx?strataDoc=Networking/VPN Setup.md
```

A library of five hundred documents is still one page. Adding a document does
not mean creating a page, and deleting one does not leave a dead page behind.

**A menu from the folder structure.** Top-level folders become categories, and
categories are gathered into named groups so the header stays readable: a
SharePoint menu shows five or six entries before hiding the rest behind a `...`
nobody clicks.

**Generated index pages.** Each category gets an index listing its documents and
its subfolders. They carry no document counts, because a count written onto a
generated page is wrong the moment somebody adds a document without re-running.

**Links that survive.** Internal links can be written as
[wiki links](../linking/), which address the document rather than a page
address, so they keep working when pages move.

## What it asks for

| | |
| --- | --- |
| PowerShell | 7.2 or later |
| PnP.PowerShell | 3.0 or later |
| Markstrata | installed in the tenant App Catalog and available on the target site |
| SharePoint | an existing site with a document library holding the `.md` files |
| Entra ID | an account that may create app registrations, once, for the setup |

The local folder is normally a synced copy of the library, which is the whole
authoring model: edit a file in your editor, save, and OneDrive carries it up.
Editing a document needs nothing else, because the page renders the file rather
than holding a copy of it. Adding, moving or renaming one changes the indexes
and the menu, so that is when it is re-run.

## Unattended runs

A scheduled refresh with nobody signed in uses an app-only registration with a
certificate, granted `Sites.Selected` and then access to the target site alone
rather than `Sites.FullControl.All`. A documentation publisher has no business
being able to rewrite every site in a tenant, and a leaked certificate should
reach exactly one site.

## Where the line is

Markstrata renders markdown inside a page. The site builder arranges pages
around it. They are versioned separately and either one works without the
other: a web part on a page you made yourself needs no module, and the module
does nothing a person could not do by hand in the SharePoint UI, slowly, every
time a document moves.

Both are MIT licensed.
