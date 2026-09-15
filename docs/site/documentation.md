# Documentation

Everything the web part does, and how to configure it.

[[toc]]

## Install

Download `markstrata.sppkg` from the
[latest release](https://github.com/CodyRWhite/Markstrata/releases/latest).

1. Upload it to your tenant **App Catalog** (`/sites/appcatalog`, the *Apps for
   SharePoint* library).
2. When prompted, choose **Enable this app and add it to all sites**, or leave
   it unticked and add it per site from *Site contents → New → App*.
3. Edit a page, add a web part, and pick **Markstrata** from the
   **Content** group.

> [!TIP] Upgrading
> Upload the newer `.sppkg` over the old one and choose **Replace**. The
> solution and web part IDs never change between versions, so a tenant sees an
> upgrade rather than a second app, and pages keep their settings.
>
> Every release ships the file under the same name for this reason: the App
> Catalog matches an upload to the solution it replaces by file name, and a
> version in the name gets it refused with *"A solution with the same product
> ID already exists."* The version lives in the release tag and inside the
> package, which is where SharePoint reads it.

To build the package yourself you need Node.js 22:

```bash
npm install
npm run package          # writes sharepoint/solution/markstrata.sppkg
```

## Where the content comes from

The **Content** page of the property pane, the first of its four, offers three
sources.

| Source | What it does |
|---|---|
| **Typed in** | Markdown lives in the web part itself. Good for a page-specific note. |
| **Library file** | **Markdown file** picks a `.md` file from a document library, with folder browsing. **Reload when the file changes** keeps the page in step with edits, and **Show version history button** lets a reader browse the file's versions, with preview and restore. |
| **URL** | **File URL** takes any address that returns markdown. |

A library file is usually the right answer: the markdown stays in SharePoint
where it can be versioned, permissioned and edited by people who never touch
the page.

## Appearance

**Theme**: GitHub, Obsidian or VS Code.

**Colour mode**: light, dark, or *follow the page*, which takes its cue from
the SharePoint site theme so a dark intranet gets a dark web part.

**Let readers switch theme**: adds a control to the rendered page. A reader's
choice is remembered per web part in their own browser and never changes what
anyone else sees.

**Content width, spacing and text size**: independent of theme, so you can run
GitHub's look at a narrower measure or a larger size without editing anything.

**Fill the available height**: gives the web part at least the room below where
it starts, so a short document does not stop halfway down and leave the page
canvas showing under it. With the file name and modified date shown, they sit at
the bottom of that rather than under a gap, which is usually the reason for
turning it on.

> [!NOTE]
> The room is measured on the page, not written as `100vh`. A SharePoint page
> does not scroll the window: it scrolls an inner container under a header and a
> command bar, so a viewport unit overshoots by however tall that chrome is.
> It is measured from where the web part starts too, so a part placed under
> other content on a long page has no room below it and is left as it is.

## The toolbar and the file footer

Both are on the **Features** page of the pane, under **Toolbar** and **File
information**: they are what shows around the document rather than part of it.

**Show toolbar** carries the reload, version history, theme and print controls,
and **Show print button** decides whether the print one is among them. Set the
toolbar to *only while editing the page* and readers never see any of them, that
button included.

**Show reading time** puts an estimate beside the theme control, from the text
a reader actually reads: code blocks and diagram source are left out of the
count, because neither is read at the speed of prose. It needs the toolbar.

**Back to top button** floats a button above the page once the reader is a
screenful or so past the top of the document, at the bottom **left** or bottom
**right**, or **No button** to leave it out. It goes back to the top of the web
part rather than the top of the page, which is what "back to top" means from
inside a document that is one section of somebody's page.

**Show file name and last updated**: a footer with the file's name, when it was
last changed and by whom. It needs a file from a document library, since that is
the only source with any of those to show. **Keep it in view while scrolling**
pins it to the bottom of the web part rather than leaving it at the end of the
document, which in a long one means a reader never reaches it.

## Code blocks

````markdown
```typescript title="ThemeManager.ts"
export function resolveMode(mode: ColorMode): ResolvedMode {
  return mode === 'light' || mode === 'dark' ? mode : 'light';
}
```
````

- Syntax highlighting for around forty languages, including PowerShell,
  Dockerfile, batch and HTTP on top of the common set.
- **Show language header** labels the block with its language and, with
  `title="app.ts"`, a filename.
- A copy button that copies the source and never the line numbers.
- **Show line numbers** puts them in a gutter that stays put while a long line
  scrolls under it, and that wrapped lines indent past rather than run under.
- Diff blocks tint whole lines, so `+` and `-` read at a glance.

**Long lines** decides what a line too wide for the column does: wrap, or scroll
sideways. It applies to every block on the page, and any block can override it,
or the line numbers, on its fence:

A fence can also call out the lines that matter, which is the convention
Docusaurus and VitePress use:

````markdown
```typescript {3,6-7}
````

Single lines, ranges and both together all work: `{2}`, `{4-6}`, `{2,4-6}`. The
rest of the block is faded rather than the called lines being tinted, because a
tint has to be a colour and a colour behind syntax highlighting either fights it
or is too faint to see. Hovering the block brings all of it back, and printing
never fades anything, since there is no hover on paper.

| Flag | Effect |
|---|---|
| `wrap` / `nowrap` | Soft wrap, or horizontal scroll |
| `numbers` / `nonumbers` | Line numbers on or off for this block |
| `title="name.ts"` | Filename in the header |

**Code text size** sets code independently of body text, so a dense block can
be brought down a notch without shrinking the prose around it.

## Linking between pages

**Wiki links** turns `[[Another page]]` into a link to that file, the way
Obsidian and older wikis write one. It is off by default, since the brackets
mean nothing in ordinary markdown and a document that uses them for something
else should keep them.

| Written | Links to |
|---|---|
| `[[Deploy runbook]]` | `Deploy runbook.md` in the same folder |
| `[[Deploy runbook\|how we ship]]` | the same file, worded for the sentence |
| `[[Deploy runbook#Rollback]]` | straight to that heading in that file |
| `[[#Rollback]]` | a heading in this document |

The name resolves against the folder the document lives in, the same rule
images follow, and `.md` is added when the name has no extension.

> [!NOTE]
> Whether the page exists is not checked. Finding out means asking SharePoint
> once per link, which cannot happen while the document is being rendered, so
> every link is written and a missing page is a 404 when it is followed.

## Callouts

Three syntaxes, one rendering, so markdown written for GitHub, for Obsidian or
for an older SharePoint web part all render correctly without editing.

```markdown
> [!NOTE]
> GitHub alert syntax: NOTE, TIP, IMPORTANT, WARNING, CAUTION.

> [!tip] Obsidian callout with a title of your own
> Types: note, abstract, info, todo, tip, important, success, question,
> warning, caution, failure, danger, bug, example, quote, and their aliases.

> [!warning]- Foldable, collapsed by default
> `-` starts collapsed, `+` starts open.

> Wiki.js classes still render.
{.is-info}
```

Foldable callouts are a `<details>` element, so they need no JavaScript, work
with a keyboard, and print expanded.

## Also rendered

Tables (including colspan, rowspan and alignment), task lists, footnotes,
definition lists, abbreviations, emoji, sub/sup, `==highlighted==` text, heading
anchors, [Mermaid](https://mermaid.js.org/) diagrams themed to match the page,
and KaTeX maths.

```mermaid
flowchart LR
  A[Markdown in a library] --> B[Markstrata]
  B --> C[GitHub]
  B --> D[Obsidian]
  B --> E[VS Code]
```

## Images

`![Alt text](path/to/image.png "Optional title")` works the way it does on
GitHub. A relative path is resolved against the folder holding the markdown
file, not the page the web part sits on, so a document library laid out like
this renders as written:

```text
Shared Documents/runbooks/
  deploy.md          <- ![Flow](images/flow.png)
  images/flow.png
```

Absolute URLs, protocol-relative URLs, data URIs and paths that already start
with `/` are left untouched. Content typed into the web part has no folder of
its own, so its relative paths resolve against the site root.

Images are given `loading="lazy"` and `decoding="async"`, so a long document
fetches them as the reader reaches them rather than all at once.

### Sizing an image

A width goes after a pipe, the way Obsidian writes it:

| Written | Result |
|---|---|
| `![Diagram\|300](flow.png)` | 300 pixels wide |
| `![Diagram\|300x200](flow.png)` | 300 wide, and told the picture is 3:2 |

The number becomes the image's `width` attribute rather than a style, which
gives it an intrinsic size. That matters because every image here loads lazily,
and a lazily loaded image with no intrinsic size reserves no room: the text
below it jumps as each picture arrives. **The aspect ratio is always kept** and
the height follows the width, so a second number describes the picture rather
than stretching it. An image still shrinks to fit a narrow column.

### Where a picture sits

**Picture alignment** places any image that is a paragraph of its own, left,
centred or right. Left is the default, which is how markdown has always
rendered a block image and what GitHub and Obsidian both do. An image inside a
sentence is not moved: it sits on the baseline of the text around it, and
shifting it would take the sentence with it.

A document can place one picture itself, whatever the page is set to, by giving
the image a class:

```markdown
![A deployment flow](flow.png){.center}
```

`{.left}`, `{.center}` and `{.right}` all work.

### Captions

An image that is a paragraph of its own and carries a title becomes a figure,
with the title as its caption:

```markdown
![A deployment flow](flow.png "How a release reaches the tenant")
```

An image inside a sentence keeps its title as a tooltip instead, since lifting
it out into a block would break the sentence around it.

### Seeing an image full size

**Click an image to see it full size** opens it over the page, which is worth
having because documentation is mostly screenshots and a column is narrower
than the screen. Escape closes it, or a click anywhere outside the picture. An
image that is a link is left alone: it already does something when clicked.

> [!NOTE]
> Readers see only the images they have permission to open. A relative path
> resolves to a real SharePoint URL, and SharePoint still applies the
> library's permissions to it.

## Diagrams

Mermaid diagrams are themed to match the page and re-drawn when the theme
changes. Each one carries a copy button in its top right corner that puts the
diagram on the clipboard as a PNG, drawn at twice its size on the page so it
stays sharp when it is pasted into a deck or a document. Selecting a diagram
would only get you its source, which is rarely what you want.

A gantt chart lays out from its time axis rather than wrapping, so it asks for
more width than a column usually has. **Wide diagrams** decides what happens
then:

| Setting | What it does |
|---|---|
| Fit to the column | Lays the chart out at the column width, compressing the axis. The text stays full size and there is no scrollbar. The default. |
| Keep their size and scroll | The chart keeps its natural width and the box scrolls sideways. |
| Scale down to fit | Shrinks the whole drawing, text included. Mermaid's own behaviour. |

## Table of contents

Built from the headings, or placed inline with `[[toc]]`. It can sit in a left
or right column, above the content, or be switched off. It has a pane page of
its own, **Contents**, since between the position, the depth and the width
there is more to it than one setting.

### A contents the document writes itself

If the document has its own contents, that one is used and the generated one is
not built, so the page never carries two. Either of these counts:

- `[[toc]]` on a line of its own.
- A list of links to headings in this document, under a heading that reads
  *Contents*, *Table of contents* or *On this page*.

A hand-written list is usually a deliberate subset, naming the sections worth
jumping to and leaving out the rest, so it is treated as a decision rather than
as something to improve on. It is lifted out of the text into whichever position
the setting gives it, and gets the same indentation, smooth scrolling and
reading-position tracking as a generated one. **Deepest heading in the contents**
does not apply to it, since the document has already said what belongs.

With the contents set to **No contents**, nothing is taken over: an authored one
stays exactly where it was written.

**Deepest heading in the contents** decides how far down it goes, from top-level
headings only through to every level. A long document with four levels of
heading usually reads better listing two or three of them.

**Heading link anchors** put a link beside each heading, so a section can be
linked to directly. They are reserved a gutter of their own rather than sitting
in the margin, where a SharePoint page canvas clips them.

It is a column of the layout or a block above the text, never an overlay, so
it cannot cover the content or the page's own editing controls. In a narrow
column it collapses to a single line you can expand, and while the page is being
edited it stops sticking to the top of the screen. The entry for the heading you
are reading is highlighted as you scroll.

### How wide the sidebar is

With the contents in a left or right sidebar, **Contents width** decides how
much room they take. Stacked above the content in a narrow column the setting
does not apply: there they are always full width.

**Auto** fits the sidebar to its longest entry, so there is no gap beside short
headings and no wrapping of long ones. It is floored and capped, so a document
with three short headings still reads as a column and one deep heading cannot
take the page.

**Fixed** adds **Measured in** for the unit and a **Width**, given as both a
slider and a box:

| Unit | What it measures | Worth knowing |
|---|---|---|
| `em` | The contents' own text size | Keeps the same characters per line as the text size changes. The best choice for most documents. |
| `%` | A share of the web part | Adapts to the column the web part is placed in. |
| `px` | A fixed number of pixels | Predictable, but ignores both text size and column width. |
| `vw` | A share of the browser window | Measures the window rather than the web part, so a narrow column and a full-width one get the same sidebar. Rarely what you want. |

## Editing in the page

Put the page in edit mode and the web part becomes a split editor: markdown on
the left, live preview on the right, with **Edit / Split / Preview** layouts. If
the content came from a library file, **Save to SharePoint** writes it back,
warning you first if someone else has saved it since you opened it. `Ctrl+S`
saves.

It is a plain textarea rather than Monaco, deliberately: it always loads, and a
large editor bundle is hard to justify for the short edits that happen on a
SharePoint page.

## Defaults

A web part you have just added starts on the **VS Code** theme in light mode,
comfortable width, compact spacing, contents above the content, and line numbers
on. It is as tall as its content, and raw HTML is off. Every one of those is a
setting.

## Security

> [!IMPORTANT] Raw HTML is off by default
> Unless you deliberately turn **Allow raw HTML in markdown** on, HTML in the
> markdown is escaped. Callout titles are escaped either way. Mermaid runs with
> `securityLevel: 'strict'` and HTML labels disabled, so diagram text can never
> become markup.

`npm audit --omit=dev` reports no advisories: nothing that ships to the browser
has a known vulnerability.

## Going further

| Where | What is there |
|---|---|
| [README](https://github.com/CodyRWhite/Markstrata#readme) | Features, configuration, deployment |
| [THEMES.md](https://github.com/CodyRWhite/Markstrata/blob/main/THEMES.md) | The token contract, and how to add a fourth theme |
| [CONTRIBUTING.md](https://github.com/CodyRWhite/Markstrata/blob/main/CONTRIBUTING.md) | Branches, commits, releases |
| [Issues](https://github.com/CodyRWhite/Markstrata/issues) | Bugs and requests |
