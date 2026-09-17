# Linking one document to another

A document library full of markdown is a set of documents that point at each
other. This page is about what happens at the moment somebody clicks one of
those pointers: what a link is allowed to look like, what it resolves to, what
opens, and how a reader gets back.

The panels below are not pictures. Each one is markup the web part's own
renderer produced while this page was being built, dropped onto the page with
the same stylesheets a SharePoint page uses. They are stills, so nothing in one
responds to a click, but nothing in one is drawn by hand either.

[[toc]]

## Wiki links

**Wiki links** turns `[[Another page]]` into a link to that file, the way
Obsidian, Logseq and every wiki since the first one write one. It is off by
default, because the brackets mean nothing in ordinary markdown and a document
using them for something else should keep them.

| Written | Links to |
|---|---|
| `[[Firewall]]` | `Firewall.md` in this document's own folder |
| `[[Firewall\|the perimeter]]` | the same file, worded for the sentence |
| `[[Firewall#Rules]]` | that heading in that file |
| `[[../Applications/Timesheets]]` | a file in a folder beside this one |
| `[[#Wiki links]]` | a heading in this document |

That last one is live: [[#Wiki links]] is a wiki link on this page, pointing at
the heading above.

### A bare name is not a search

This is the one place where Markstrata and Obsidian disagree, and it is worth
being plain about it. In Obsidian, `[[Firewall]]` searches the whole vault and
finds the file wherever it lives. Here, it does not. The name resolves against
the folder the document is in, and nowhere else.

So a document at `Network/Site to site links.md` writing `[[Firewall]]` means
`Network/Firewall.md`. If the file is in `Applications/` instead, the link finds
nothing, and it finds nothing quietly: there is no second place to look.

The reason is that there is no vault to search. Obsidian holds an index of every
note; a web part has a document library, a reader's permissions and one HTTP
request at a time, and searching a library on every link would be a request per
link against folders the reader may not even be allowed to list. Resolving
against the folder is the same rule images already follow, and it is the rule
that can be answered without asking anybody.

A link across folders is written out: `[[../Applications/Timesheets]]`, or a
path from the library root. `.md` is added when the name has no extension.

### Embedding a picture

`![[picture.png]]` puts the picture on the page, resolved against the same
folder and taking the same sizes a markdown image does. The one below is written
`![[brand/mark.svg|96]]`, and the number is the width in pixels:

![[brand/mark.svg|96]]

`![[picture.png|120x80]]` tells the page the picture's shape as well, so nothing
jumps as it loads, and wording that is not a size becomes the alt text instead.

An embed of anything that is not a picture, another document, a PDF, a sound
file, is rendered as a link marked as an embed rather than as the thing itself.
Putting one on the page would mean fetching it, and nothing can be fetched while
a document is being turned into HTML.

### A link to a page that is not there

**Mark links to pages that are not there** checks them against the library. The
folder is listed once and every link into it is answered from that listing, so
it costs one request per folder rather than one per link.

<div class="site-specimen" data-specimen="wiki-links"></div>

A marked link still goes where it said it would, because following a broken link
is how the missing page gets written. It is marked in colour, with a raised
question mark, and it carries a note a screen reader reads out.

> [!NOTE] A folder that cannot be read leaves its links alone
> Not knowing whether a page is there is different from knowing it is not, so a
> folder that fails to list marks nothing. A reader without access to a folder
> is never told the author's links are broken. For the same reason a marked link
> says the page was not found *in this library*, which covers both not being
> there and not being visible to whoever is reading.

## Following a link

**Open a linked document here** is what turns a folder of markdown into
something readable as a set. Without it, clicking a link to another `.md` hands
the reader the file: SharePoint shows raw markdown or downloads it, and the page
they were reading is gone. With it, the linked document is fetched and rendered
in the web part, and a link that names a heading lands on that heading.

It applies to any link to a markdown file, a wiki link or an ordinary one, and
it needs a document library, since that is where the other documents are.

Opening a link in a new tab, with Ctrl, Shift or the middle button, still goes to
the file itself. Taking that away would be worse than what this fixes.

### The trail back out

Once one link has been followed, the toolbar carries the trail of documents the
reader has walked. The first entry is the document the page is configured to
show, and the last is where they are now.

<div class="site-specimen" data-specimen="trail-one"></div>

Following a second link from inside that document extends it rather than
replacing it:

<div class="site-specimen" data-specimen="trail-two"></div>

<div class="site-specimen" data-specimen="trail-three"></div>

Every entry but the last is a button. Clicking one reopens that document and
drops everything after it, so going back to *Firewall* from three documents deep
leaves a trail of two rather than a trail of three with the reader standing in
the middle of it.

The trail rides inside the browser's history entry rather than beside it, so the
browser's own Back button walks the same path. The two cannot disagree about
where the reader has been, which is what happened when the bar simply said
"Back" and always meant the beginning.

> [!NOTE] Nothing about this is saved into the page
> The web part is still configured to show the file somebody chose for it, and
> the next reader starts there. Version history is hidden while a followed
> document is open, because the versions it would list belong to the configured
> file. If the configured file changes underneath while somebody is reading a
> document they followed to, they get the new text when they come back rather
> than having the page pulled out from under them.

## Pointing a menu at a document

A wiki has a menu, and a menu is links. Without something more than the page
address, every entry on a SharePoint navigation bar can only point at the page,
which shows the one document it was configured with, so the menu stops being a
menu after the first item.

Adding `?strataDoc=` to the page address names the document the web part should
open:

```text
/sites/it-wiki/SitePages/Wiki.aspx?strataDoc=Network/Firewall.md
/sites/it-wiki/SitePages/Wiki.aspx?strataDoc=/sites/it-wiki/Documents/Network/Firewall.md
/sites/it-wiki/SitePages/Wiki.aspx?strataDoc=Network/Firewall.md%23Rules
```

A path with no leading slash is read relative to the folder the configured
document lives in, so a menu can name documents the short way instead of
repeating the site and the library in every entry. One that starts with a slash
is taken as it is, which is what somebody pasting a path out of SharePoint will
have. A heading goes on the end after `%23`, which is how a `#` is written in an
address, and it can be written the way the heading reads rather than as the id
it was given: `%23Rules` and `%23rules` both find `## Rules`.

The [share button](../reading/#share) writes exactly this, in the short form,
for whichever document a reader has reached. Copying a link out of the toolbar
and writing a menu entry by hand produce the same kind of address.

The document opens the same way one a reader followed a link to does, with the
same trail back to the configured document.

Two things it needs:

- **Open a linked document here** on. The parameter opens a document the same
  way a link does, so without that setting there is nothing to open it into.
- A library file as the content source. A URL or markdown typed into the web
  part has no library behind it to find the document in.

> [!NOTE] The address is written by whoever wrote the link
> Which means it is not trusted. Only a markdown file is accepted, and the path
> is then handed to SharePoint and fetched with the reader's own session, so
> SharePoint decides what they may read. A renderer is not the place to point at
> arbitrary files either.

Writing that menu by hand is fine for a handful of documents and tedious for a
library. [MarkstrataSiteBuilder](../site-builder/) generates it, along with the
category pages the menu points at, from the folders the documents are already
in.

## Relative links that are not wiki links

A relative link resolves from the folder the document is in, not from the page
that hosts the web part. A document in `Network/` saying `[rules](rules.md)`
means `Network/rules.md`.

That sounds obvious and it is not what a browser does. Left alone, the browser
resolves a relative link against the address of the `.aspx` page, which is in
SitePages, and lands somewhere the document never meant. This applies to every
relative link rather than only ones to markdown: a link to `notes/spec.pdf`
finds the PDF beside the document.

## Addresses with spaces in them

SharePoint names pages and files after their titles, so the address you copy
out of the address bar usually has spaces in it. Markdown says a link address
may not, and left to itself the whole thing arrives on the page as brackets and
a stray half-link:

```markdown
[POL0042 - Starter Checklist](https://contoso.sharepoint.com/sites/handbook/SitePages/POL0042 - Starter Checklist.aspx)
```

Markstrata reads that as the link you meant. It only steps in where markdown
has already given up, so nothing that renders today renders differently, and a
sentence in brackets followed by one in parentheses is still a sentence.

The form that is actually correct, and that works everywhere rather than only
here, is angle brackets around the address. Worth teaching if you write a lot
of these, because you can paste the address exactly as SharePoint gives it:

```markdown
[POL0042 - Starter Checklist](<https://contoso.sharepoint.com/sites/handbook/SitePages/POL0042 - Starter Checklist.aspx>)
```

Both produce the same link. The same goes for a picture whose file name has
spaces in it, `![A screenshot](screenshots/The first run.png)`.

## Settings this page is about

| Setting | Where it is |
|---|---|
| **Wiki links** | Contents page of the pane, under *Links between documents* |
| **Mark links to pages that are not there** | beside it, and needs a library file |
| **Open a linked document here** | beside those, and needs a library file |

The [settings page](../docs/) covers the rest of the pane, and the
[syntax page](../syntax/) lists every shape of link with what it turns into.
