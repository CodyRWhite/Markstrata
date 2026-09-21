# Settings

Every field in the property pane, in the order the pane puts them. Most of this
page is about **Markstrata - Markdown**, whose pane has five pages, and follows
them: **Content**, **Appearance**, **Code**, **Contents** and **Chrome**.

**Markstrata - HTML** shares almost all of those, and
[the HTML web part](#the-html-web-part) near the end covers what is its own.

Three subjects have pages of their own here, because they are behaviours rather
than settings and explaining them properly takes more than a table row:
[linking between documents](../linking/),
[what a reader sees around a document](../reading/), and
[editing in the page](../editing/). This page names the settings and says where
they are; those pages say what happens.

[[toc]]

## Content

Where the markdown comes from. Three sources, one of which is usually right.

| Source | What it does |
|---|---|
| **Markdown** | Typed into the web part and stored with it. Good for a page-specific note, and versioned with the page rather than on its own. |
| **Library file** | A `.md` file in a document library, chosen with **Document library**, **Folder** and **Markdown file**. **Folder** lists the folders inside other folders too, as paths like `Runbooks/Database`, so a wiki kept more than one level deep can be pointed at. |
| **File URL** | Any address that returns markdown. SharePoint addresses are requested with your sign-in; other sites have to allow cross-origin requests. |

A library file is usually the right answer. The markdown stays in SharePoint
where it can be versioned, permissioned and edited by people who never touch the
page, and it is the only source that can do any of the things on the
[linking page](../linking/), because those need a folder of other documents to
look in.

Two settings come with it:

- **Reload when the file changes** keeps the page in step with edits.
- **Show version history button** lets a reader browse the file's versions, with
  preview and restore.

## Appearance

### Theme

**Theme** is GitHub, Obsidian or VS Code. Each brings its own typography, code
block styling, callout shape and syntax colours, in light and in dark.

**Colour mode** is light, dark, or *Match SharePoint page*, which takes its cue
from the site theme so a dark intranet gets a dark web part.

**Let readers switch theme** puts a theme list and a dark mode switch in the
toolbar. A reader's choice is remembered in their own browser and never changes
what anybody else sees. [More about the toolbar](../reading/#the-toolbar).

### Reading

**Content width**, **Spacing** and **Text size** are independent of the theme,
so GitHub's look can be run at a narrower measure or a larger size without
editing anything.

### Pictures

**Picture alignment** places any picture that is a paragraph of its own: left,
centred or right. Left is the default, which is how markdown has always rendered
a block image and what GitHub and Obsidian both do. A picture inside a sentence
is not moved: it sits on the baseline of the text around it, and shifting it
would take the sentence with it.

A document can place one picture itself, whatever the page is set to, by giving
it a class:

```markdown
![A deployment flow](flow.png){.center}
```

`{.left}`, `{.center}` and `{.right}` all work.

**Click a picture or diagram to see it full size** opens a picture over the
page, and covers diagrams too.
[What that looks like](../reading/#pictures-and-diagrams).

### The page

**Fill the available height** gives the web part at least the room below where
it starts, so a short document does not stop halfway down and leave the page
canvas showing under it.

## Code

### Code blocks

````markdown
```typescript title="ThemeManager.ts"
export function resolveMode(mode: ColorMode): ResolvedMode {
  return mode === 'light' || mode === 'dark' ? mode : 'light';
}
```
````

- **Syntax highlighting** covers around forty languages, including PowerShell,
  Dockerfile, batch and HTTP on top of the common set.
- **Show language header** labels the block with its language and, with
  `title="app.ts"`, a filename.
- **Show line numbers** puts them in a gutter that stays put while a long line
  scrolls under it, and that wrapped lines indent past rather than run under. A
  copy button copies the source and never the numbers.
- **Long lines** decides what a line too wide for the column does: wrap, or
  scroll sideways.
- **Code text size** sets code independently of body text, so a dense block can
  come down a notch without shrinking the prose around it.

Any block can override the page on its own fence, and can call out the lines
that matter, which is the convention Docusaurus and VitePress use:

| Flag | Effect |
|---|---|
| `wrap` / `nowrap` | Soft wrap, or horizontal scroll |
| `numbers` / `nonumbers` | Line numbers on or off for this block |
| `title="name.ts"` | Filename in the header |
| `{2,4-6}` | Call out those lines and fade the rest |

Single lines, ranges and both together all work. The rest of the block is faded
rather than the called lines being tinted, because a tint has to be a colour and
a colour behind syntax highlighting either fights it or is too faint to see.
Hovering the block brings all of it back, and printing never fades anything,
since there is no hover on paper.

Diff blocks tint whole lines, so `+` and `-` read at a glance.

### Diagrams

**Mermaid diagrams** renders fenced `mermaid` blocks, themed to match the page
and redrawn when the theme changes.

**Wide diagrams** decides what happens when a diagram asks for more width than
the column gives, which gantt charts do because they lay out from their time
axis rather than wrapping:

| Setting | What it does |
|---|---|
| Fit to the column | Lays the chart out at the column width, compressing the axis. The text stays full size and there is no scrollbar. The default. |
| Keep their size and scroll | The chart keeps its natural width and the box scrolls sideways. |
| Scale down to fit | Shrinks the whole drawing, text included. Mermaid's own behaviour. |

> [!NOTE] Diagrams need a current browser
> Mermaid 12 targets ES2024 and Safari 17.4, which means iOS 17 or later. On an
> older browser the diagram library does not load and each diagram shows a
> message in its place; the rest of the document renders normally.

### Maths and HTML

**Math (KaTeX)** typesets `$inline$` and `$$display$$` maths. The
[syntax page](../syntax/#diagrams-and-maths) lists every form it accepts.

**Tags** shows `#recipe` and a nested `#work/urgent` as tags rather than as
words with a hash in front, the way a note written in Obsidian writes them. It
is off by default. A tag holds letters, digits, `_`, `-` and `/`, has to contain
at least one character that is not a digit, and cannot be joined onto the end of
a word, so `C#` and `#1984` are not tags. They are styled and nothing more: this
web part cannot see the other documents in a library, so a tag that looked like
a link would go nowhere.

**Allow raw HTML in markdown** is off by default and is covered under
[Security](#security) below.

### Tables

**Let readers sort a table** puts sorting on the column headers.
[How a column's type is worked out](../reading/#sorting).

A long table keeps its header row in view while the rows go past whether sorting
is on or not.

## Contents

### Contents

**Table of contents** puts the list of headings in a left or right column, above
the content, or switches it off. **Deepest heading in the contents** decides how
far down it reaches, and **Contents width** how much room a sidebar takes.
**Heading link anchors** put a link beside each heading.

All four are covered at length under
[the contents](../reading/#the-contents), including what happens when the
document writes a contents of its own, which is that the document wins.

### Links between documents

**Wiki links** turns `[[Another page]]` into a link. **Mark links to pages that
are not there** checks them against the library. **Open a linked document here**
makes a link to another `.md` open in the web part rather than handing the
reader the file.

All three are the subject of [linking documents](../linking/), along with the
`?strataDoc=` parameter that lets a SharePoint navigation menu point at any
document in the library.

## Chrome

### Toolbar

**Show toolbar** decides whether the strip above the document is drawn at all,
and whether readers see it or only somebody editing the page does. **Show export
button**, **Show share button**, **Show reading time** and **Back to top button**
decide what is in it and what floats above the page.

**Keep the toolbar in view** sticks the toolbar to the top while the document
scrolls under it. It rests below the page's own bars rather than behind them,
and headings scrolled to land below it.

[What each control does](../reading/#the-toolbar).

### Export

**Show export button** puts the export control in the toolbar. It lays the
document out as pages and hands them to the browser's print dialog, where
**Save as PDF** writes the file.

**Cover page** and **Contents page** decide what goes in front of the document.
The contents carries the page number each heading landed on, which is the thing
a printed document cannot otherwise have: nothing knows what page a heading is
on until the pages exist.

**Start each section on a new page** is off by default. It suits a reference
read a section at a time and wastes paper on a short runbook.

[What an export contains](../reading/#export).

### Share

**Show share button** copies a link to the document on screen, which is not the
same as the page's own address once a reader has followed a link. It needs
**Open a linked document here**, since that setting is what opens the link at
the other end.

[What the link looks like](../reading/#share).

### File information

**Show file name and last updated** puts a footer under the document with the
file's name, when it was last changed and by whom. **Keep it in view while
scrolling** pins it to the bottom of the web part rather than leaving it at the
end of the document.

Both need a file from a document library, since that is the only source with any
of those to show.

## The HTML web part

**Markstrata - HTML** draws an HTML document instead of a markdown one. It is a
separate web part with a separate entry in the toolbox, and you can put one of
each on a page.

Everything around the document is the same: the theme, the toolbar, the contents
list, the trail through linked documents, the file footer, the export options,
reading time, the button back to the top. Every setting above that is not about
markdown itself applies here too, in the same place in the pane.
[See it running](../html/).

What is different is on two pages of its own.

### The stylesheet

The stylesheet is chosen separately from the document, on its own page of the
pane, with its own library, folder and file pickers. That is the point of it:
one file in a library can dress every HTML web part in a site, and changing that
one file changes all of them at once.

| Source | What it does |
|---|---|
| None | The document styles itself, or takes the theme's |
| Type it here | A stylesheet stored with this one web part |
| File in a document library | The shared case. Several web parts, one file |
| File at a URL | A stylesheet kept outside SharePoint |

A document's own `<style>` block still applies on top of whatever the pane
names, so one document can vary without the rest of them moving.

A stylesheet that will not load is a message above the document, never a failure
to draw it. The document is what somebody came to read and it is readable
unstyled.

### Render mode

How much of the page the document is allowed to be part of. The three answers
are different bargains rather than three ways of doing one thing.

| Mode | What you get | What it costs |
|---|---|---|
| Inline | The document is part of the page. Markstrata's typography styles it, pictures zoom, tables sort, the contents sidebar works, links to neighbouring documents open in the web part | The page's own styling reaches the document |
| Shadow DOM | The document is behind a boundary, so it looks exactly as written and nothing on the page can restyle it. Everything built from the rendered document still works | Markstrata's typography does not reach in either: the author owns the look |
| Frame | A document of its own, in a sandbox. Nothing in the page can reach it and nothing in it can reach the page. The only mode where scripts can run | No zooming, no sorting, nothing to export, and the contents list is drawn inside the frame |

In inline mode the stylesheet is rewritten so that it applies only inside the
web part: an author's `body { background: black }` becomes a rule about their own
document. In shadow mode no rewriting is needed, because the boundary is what
contains it. The theme's custom properties do cross a boundary, so a document
there can use `var(--strata-bg)` and follow the reader's light or dark choice on
purpose.

Headings are given ids in every mode, using the same rule markdown uses, so a
contents list, a `#fragment` and a shared link all have something to land on.
Hand-written HTML rarely carries any. An id the author wrote is never rewritten.

### Scripts

Off by default. Offered in frame mode only, because a sandboxed frame is the
only place a script can run without being able to reach the page around it or
your SharePoint sign-in.

> [!IMPORTANT] Turning scripts on stops the document being cleaned up
> Sanitising is what removes the scripts, so with the setting on, everything in
> the file runs. The sandbox is what contains it. Only turn it on for a file you
> trust, from a library you control.

With scripts off, the frame is given `allow-same-origin`, which is safe because
there is no script in it to use it, and useful because it is what lets the web
part measure the document and fit the frame to it. Links to neighbouring
documents replace the page, which is what following a link should do.

With scripts on, the frame is an opaque origin instead: it cannot see the page
and the page cannot see in. `allow-same-origin` and `allow-scripts` are never
granted together, because together they are not a sandbox at all. Top navigation
is withheld as well, since a script could rewrite a link's address, so links
open in a new tab. And **Fit content** is not offered, because a frame that
cannot be read cannot be measured.

Scripts are also paused while the page is being edited. An author arranging a
page is clicking on web parts to select them, not reading a document.

### Height, full bleed and narrow screens

| Setting | What it does |
|---|---|
| Fit content | As tall as the document is |
| Fixed | A set number of pixels, and the rest scrolls |
| Full window | At least the room left below it on the page |
| Full bleed | Takes the reading measure off, so the document uses the whole width. Worth it for a dashboard, a wide table or a diagram; not for prose |
| Show on narrow screens | Off hides the whole web part below 600px |

**Show on narrow screens** is a width and not a device. SPFx does not say
whether a web part is being drawn in the mobile app or in an email, so nothing
here claims to know. Use it for a document laid out wide, which reads better
hidden than squeezed.

### Writing a stylesheet that follows light and dark

There is one format, and it works in all three render modes. Two rules to it.

**Take colours from the theme's own tokens** rather than writing them out. They
are custom properties on the web part, the full list is in
[THEMES.md](https://github.com/CodyRWhite/Markstrata/blob/main/THEMES.md), and
they change with the theme and the mode on their own. A fallback after the comma
is worth writing: it is what a reader sees if a token is ever renamed.

```css
.card {
  background: var(--strata-bg-elevated, #f6f8fa);
  color: var(--strata-text, #1f2328);
  border: 1px solid var(--strata-border, #d1d9e0);
}
```

**Select on `[data-strata-mode]`** for anything the tokens do not cover, a
shadow or a picture swap being the usual reasons. The attribute is on the
element your stylesheet applies to, so start the selector with it:

```css
[data-strata-mode="dark"] .card { box-shadow: none; }
[data-strata-mode="light"] .card { box-shadow: 0 1px 3px rgba(0, 0, 0, 0.08); }
```

`[data-strata-theme="github"]`, `"obsidian"` and `"vscode"` work the same way
if a document needs to differ by theme as well.

> [!TIP] Writing the stylesheet with a language model
> [css-for-an-llm.md](../css-for-an-llm.md) is one file written to be handed to
> one: the two rules above, what each render mode changes, what the scoping does
> to a selector, what the sanitiser removes, and the complete token list. Paste
> it or point the model at it. The token list is generated from the stylesheets,
> so it cannot go stale behind you.

> [!IMPORTANT] Do not use `prefers-color-scheme`
> It follows the operating system, and the web part follows the setting in the
> pane and the reader's own choice in the toolbar. On a dark laptop showing a
> page an author set to light, the two disagree and the document comes out half
> in each. `[data-strata-mode]` is the same question asked of the right thing.

Both rules work inline, behind a shadow boundary and in a frame. A frame is a
document of its own and nothing inherits into one, so the web part copies the
theme's tokens and the two attributes into it; there is nothing to write
differently.

### Editing an HTML document

The same split editor: the source on one side, a live preview on the other,
Edit / Split / Preview, Ctrl+S, and one button that writes the document back to
SharePoint.

The stylesheet is a tab beside the HTML rather than a third column, so whichever
you are working on gets the whole width and the preview beside it is the same
preview either way. That tab edits a stylesheet typed into the pane. One from a
library or a URL belongs to that file, and other web parts are probably reading
it, so it is shown read only with a line saying where it lives.

The preview is the page's own rendering with the furniture switched off, so the
render mode, the sanitising and the stylesheet narrowing are all the real ones.
The one thing it cannot show is a document whose scripts run, because those are
paused for anybody editing the page; the editor says so above the panes.

### What is not in the HTML web part

Everything that is markdown syntax rather than a rendered document: syntax
highlighting, the code block header and line numbers, Mermaid diagrams, KaTeX
maths, wiki links, tags, heading anchors as a setting, and **Allow raw HTML**.
The last one would be a switch allowing the web part to do its job.

There is no **Fill the available height** toggle either. Height is one setting
with three answers here, and two controls that can disagree about the same thing
are worse than one.

### Security in the HTML web part

The document is sanitised every time, in every mode, with one exception: a frame
with scripts turned on, where the sandbox is the safety and the pane says so.
The same sanitiser, with the same list, as the markdown web part's raw HTML
setting above.

A `<style>` block is the one thing handled differently. The sanitiser removes
one, and silently, so the styles are lifted out of the file before it is
sanitised and put back where they belong: narrowed to the web part in inline
mode, inside the boundary in shadow mode, and inside the document in a frame.
Without that step an author's document would render with none of their styling
and nothing anywhere to explain it.

## Frontmatter

YAML frontmatter at the top of a file, the way Obsidian, Hugo and Jekyll write
it, is taken off rather than rendered as a heading of its own keys. `title`,
`author` and `tags` are shown in the file footer instead. `+++` works too.

## Defaults

A web part you have just added starts on the **VS Code** theme in light mode,
comfortable width, compact spacing, contents above the content, and line numbers
on. It is as tall as its content, wiki links are off, tags are off and raw HTML
is off. Every one of those is a setting.

## Security

> [!IMPORTANT] Raw HTML is off by default
> Unless you deliberately turn **Allow raw HTML in markdown** on, HTML in the
> markdown is escaped. Callout titles are escaped either way. Mermaid runs with
> `securityLevel: 'strict'` and HTML labels disabled, so diagram text can never
> become markup.

With the setting on, the rendered page is sanitised before anybody sees it. That
matters because in a document library the author is everybody with write access
to the library, which is not the same set of people as the readers.

Gone: `<script>` in every spelling, every `on*` handler, a `javascript:` address
in an `href` or a `src` however it is written, and `<object>`, `<embed>`,
`<base>`, `<form>`, `<meta>`, `<style>`, `<select>` and `<textarea>`.

Kept: ordinary formatting HTML. `<sub>`, `<sup>`, `<kbd>`, `<br>`, `<details>`,
`<summary>`, tables, and a `<div>` or `<span>` with a class.

`<iframe>` is kept as well, because an embedded video is usually the reason the
setting is on at all, but only when it points at a host on a fixed list: YouTube
and its no-cookie address, Vimeo, Microsoft Stream, Forms, Power BI, Teams, any
SharePoint address on any tenant, and the site the page itself is on. Anywhere
else and the frame is dropped.

The host is read from the parsed address rather than matched in the text, so a
URL that merely mentions an allowed host is not one. An `srcdoc` is dropped
whatever the host, because a frame carrying its own document never visits the
host it names.

Sanitising is done with DOMPurify rather than by hand. HTML sanitisation by
regular expression is the most reliably-got-wrong thing in this field: the
parser, not the pattern, decides what a tag is, and only a parser can see
through an encoded `javascript:` or a stray control character.

`npm audit --omit=dev` reports no advisories: nothing that ships to the browser
has a known vulnerability.

## Going further

| Where | What is there |
|---|---|
| [Install](../install/) | The package, the App Catalog, upgrades |
| [Microsoft Teams](../teams/) | The same web part as a channel tab |
| [The HTML web part](../html/) | Markstrata - HTML, running in your browser |
| [css-for-an-llm.md](../css-for-an-llm.md) | The CSS authoring rules, in one file to give a language model |
| [Syntax](../syntax/) | Every piece of markdown, with what it turns into |
| [THEMES.md](https://github.com/CodyRWhite/Markstrata/blob/main/THEMES.md) | The token contract, and how to add a fourth theme |
| [CONTRIBUTING.md](https://github.com/CodyRWhite/Markstrata/blob/main/CONTRIBUTING.md) | Branches, commits, releases |
| [Issues](https://github.com/CodyRWhite/Markstrata/issues) | Bugs and requests |
