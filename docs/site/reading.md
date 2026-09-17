# Reading a document

Everything on this page is about what surrounds the document rather than what is
in it: the strip of controls above it, the list of headings beside it, the
button back to the top, and the line at the bottom saying where the file came
from and when it last changed.

This page is also the demonstration. It is long and its headings nest, so the
panel beside these words is the same contents sidebar a SharePoint page draws,
built by the same code and following the same rules: it indents by heading
level, scrolls smoothly, and highlights the heading you are reading as you go
past it. Narrow the window and watch it move above the text and fold itself into
a line you can open.

[[toc]]

## The toolbar

The toolbar is the strip above the document. It holds the controls a reader can
use without being able to edit anything, and it is drawn only when there is
something to put in it.

<div class="site-specimen" data-specimen="toolbar"></div>

Left to right, with everything turned on: the theme list, then the reading time,
then reload, version history, share, export, and the light and dark switch.

Every one of those is a setting, and a web part with all of them off has no
toolbar at all rather than an empty strip where one used to be.

### Keeping it in view

**Keep the toolbar in view** leaves the toolbar at the top while the document
scrolls under it, which suits a long document somebody reads a section at a
time. Off by default, because a short document scrolls past the toolbar once
and never wants it again.

It comes to rest below whatever the page keeps stuck across the top of the
window, rather than behind it: on a SharePoint page that is the suite bar and
the command bar, and the web part measures them rather than guessing. A heading
scrolled to lands below the toolbar for the same reason, so clicking a contents
entry still puts the heading where you can read it. Long tables keep their
header rows below the toolbar as well.

The contents sidebar comes down to meet it, so the two do not overlap. Nothing
changes for a web part that has not turned this on.

### Letting readers switch theme

**Let readers switch theme** adds the theme list on the left and the dark mode
switch on the right. The switch shows a sun on a light page and a moon on a dark
one, which is the thing it will do rather than the thing it is.

A reader's choice is remembered per web part, in their own browser, and never
changes what anybody else sees. It is a preference about how they read, not a
change to the page: the author's theme is still what the next person gets.

### Reading time

**Show reading time** puts an estimate beside the theme control. It is counted
from the text a reader actually reads, so code blocks and diagram source are
left out: neither is read at the speed of prose, and a runbook that is mostly
shell commands would otherwise claim twenty minutes of reading that nobody
does.

It needs the toolbar, since that is where it goes.

### Reload and version history

**Reload when the file changes** keeps the page in step with edits, and the
reload button in the toolbar fetches the file again on demand.

**Show version history button** lets a reader open the file's versions, preview
one and restore it. Both need a file from a document library, since a URL and
typed-in markdown have no versions to show.

Version history is hidden while the reader is looking at a document they
followed a link to, because the versions it would list belong to the configured
file rather than the one on screen.

### Share

**Show share button** puts a button in the toolbar that copies a link to the
document on screen. A reader three links into a wiki is looking at something the
page's own address says nothing about, so sending that address sends somebody to
the front page instead.

What it copies is the page address with the document named on it, written the
short way against the folder the page reads from:

```text
https://contoso.sharepoint.com/sites/wiki/SitePages/Wiki.aspx?strataDoc=Runbooks/Deploy%20notes.md
```

Only the characters that would be misread on the way back are escaped: a per
cent sign, an ampersand, a hash and a plus, and a space, which is escaped
because Teams and Outlook stop autolinking at a raw one and deliver half an
address. Everything else, the slashes included, is left as written, so the link
says which document it points at.

At the page's own configured document there is nothing to add, because the page
address already is its address, and the button does not appear where the link
would not be honoured coming back in. It needs **Open a linked document here**,
since that setting is what reads the link at the other end.

### Export

**Show export button** decides whether the export control is in the toolbar.
What it produces is a document rather than the page cut into paper-sized pieces:

- a **cover** with the document's title, where it came from and the date it was
  taken
- a **contents page** carrying the page number each heading actually landed on,
  with dot leaders, indented by heading level
- **running headers** naming the document on the left and the section on the
  right, and a page number at the foot
- breaks that keep a heading with the text under it, keep a table row off the
  fold, and let a listing longer than a page break rather than fit nowhere

The toolbar, the contents sidebar and the SharePoint chrome are all left off,
called-out code lines stop being faded because there is no hover on paper,
foldable callouts print open, and a capped code block prints whole. A long line
of code wraps onto the page rather than scrolling off the side of it, because a
sheet of paper does not scroll.

The export is in the theme you are reading in, and in the light half of it
whatever mode you are in: dark text on white is what a printer and a photocopier
can both make sense of.

**Cover page** and **Contents page** decide whether the first two are included.
**Start each section on a new page** is off by default: it suits a reference
somebody reads a section of at a time and wastes paper on a runbook that is two
pages long.

> [!NOTE] The browser's print dialog is what saves the file
> A page is not allowed to write a PDF directly, so the export opens the
> browser's own print dialog and you choose **Save as PDF** in it. The document
> has already been laid out into pages by the time the dialog appears, which is
> what the dialog is being handed.

The document on screen is not touched. The export is a copy, laid out, printed
from and thrown away, so where you were in the document is where you still are
afterwards.

### Hiding all of it from readers

**Show toolbar** set to *only while editing the page* means readers never see
any of the above, the export and share buttons included. That is the right setting for a
document embedded in a page as content rather than offered as a document: a
notice on an intranet home page does not need a reload button.

## The contents

The list of headings can sit in a left or a right column, above the content, or
be switched off. It has a page of its own in the property pane, **Contents**,
because between the position, the depth and the width there is more to it than
one setting.

It is a column of the layout or a block above the text, and never an overlay, so
it cannot cover the document or the page's own editing controls. In a narrow
column it collapses to a single line that opens, and while the page is being
edited it stops sticking to the top of the screen.

### How deep it goes

**Deepest heading in the contents** decides how far down the list reaches, from
top-level headings only through to every level. A long document with four levels
of heading usually reads better listing two or three of them: a contents that
repeats the document is not a summary of it.

### A contents the document writes itself

If the document has a contents of its own, that one is used and no second one is
built, so a page never carries two. Either of these counts:

- `[[toc]]` on a line of its own.
- A list of links to headings in this document, under a heading that reads
  *Contents*, *Table of contents* or *On this page*.

A hand-written list is usually a deliberate subset, naming the sections worth
jumping to and leaving out the rest, so it is treated as a decision rather than
as something to improve on. It is lifted out of the text into whichever position
the setting gives it, and gets the same indentation, smooth scrolling and
reading-position tracking a generated one gets. **Deepest heading in the
contents** does not apply to it, since the document has already said what
belongs.

With the contents set to **No contents**, nothing is taken over and an authored
one stays exactly where it was written.

### How wide the sidebar is

With the contents in a left or right sidebar, **Contents width** decides how
much room it takes. Stacked above the content the setting does not apply: there
it is always full width.

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

### Heading anchors

**Heading link anchors** put a link beside each heading so a section can be
linked to directly. They are given a gutter of their own rather than sitting in
the margin, where a SharePoint page canvas clips them.

Heading ids follow GitHub's rule: lower case, punctuation dropped, spaces to
hyphens, so `## Step 1: Install` is `#step-1-install`. The point of matching it
is that anchors are written by hand, often by somebody reading the same document
on GitHub, and a link that works there has to work here. A heading also answers
to the id it was given before this web part moved to GitHub's rule, so an anchor
written against an older version still lands.

Following one scrolls. A SharePoint page is a single page application with a
router of its own, and a fragment is a navigation as far as it is concerned, so
an anchor left to the browser took the reader back to the page's configured
document with the fragment still on the address, pointing at a heading that
document has not got. The click is taken before the router now, both for the
anchor beside a heading and for any `[[#Heading]]` or `[text](#heading)` written
in the document. Nothing is added to the address bar, so a heading is not
separately shareable; the share button copies the document.

A heading can be named the way a person writes it. `?strataDoc=Runbook.md%23Rollback`
finds the heading whose id is `rollback`, as does `[[Runbook#Rollback]]`, and so
does an id an author gave a heading themselves. A link to a heading this document
has not got does nothing rather than sending the reader somewhere else.

## Getting back to the top

**Back to top button** floats a button above the page once the reader is a
screenful or so past the top of the document, at the bottom left or the bottom
right, or **No button** to leave it out.

It goes back to the top of the web part rather than the top of the page, which
is what "back to top" means from inside a document that is one section of
somebody else's page.

## Tables a reader can use

A long table loses its header the moment you scroll past it, and after that
every column is a guess. The header row stays in view instead while the rows go
past, and it holds itself under whatever SharePoint has stuck above the page
rather than behind it.

That works for a table that fits its column. One too wide for the column keeps
the sideways scroll box it has always had, and inside a scroll box a stuck
header has nothing to stick to, so a wide table's header scrolls away as before.

### Sorting

**Let readers sort a table** puts sorting on the column headers. A click sorts
by that column, a second reverses it, and a third puts the rows back in the
order the document wrote them, which matters for a table of steps where the
author's order is the answer and there is otherwise no way back to it short of
reloading the page.

What a column holds is worked out from the column itself, since markdown has no
types. It sorts as numbers only if every filled cell is a number, as dates only
if every filled cell is an unambiguous date, and as text otherwise. A column of
mostly numbers with one "n/a" in it sorts as text, which is honest rather than a
guess about where the odd one out belongs. Empty cells go to the end whichever
way the column is sorted.

> [!NOTE]
> Dates are read narrowly on purpose. `01/02/2024` is the second of January to
> half the world and the first of February to the other half, so a column of
> them sorts as text rather than into a confident wrong order. Written
> `2024-01-02`, or `2 January 2024`, they sort as dates.

A table with a merged cell in it is left as the document wrote it: a row that
spans two of them says something about its neighbours, and moving it away from
them turns a table into a mess.

## Pictures and diagrams

**Click a picture or diagram to see it full size** opens the picture over the
page. It is worth having because documentation is mostly screenshots and a
column is narrower than a screen. Escape closes it, or a click anywhere outside
it. A picture that is already a link is left alone: it does something when
clicked.

### Closer than the window

A screenshot is legible at the size it was taken and a blur at the size a
column allows, so full size means the window and sometimes the window is not
enough. Once a picture is open it can be zoomed further, three ways, because
readers are not all holding the same thing:

| | |
| --- | --- |
| Wheel or pinch | Zooms toward the pointer, the way a map does |
| Double click | Between fitting the window and twice that |
| The buttons, bottom left | Zoom in, zoom out, and back to fitting |

Dragging moves a zoomed picture around. It cannot be dragged so far that none
of it is left on screen, and a drag is never mistaken for the click that closes
the overlay. The buttons are what a keyboard reaches for, since a wheel is not
something every reader has.

A diagram is drawn rather than photographed, so it is already as sharp as the
screen allows at full width and opens without this.

The same setting covers diagrams, which are the likeliest thing on a page to be
too small to read. A diagram opens as a drawing rather than as a picture of one,
so it is as sharp at full width as it was in the column, and it is given a
background of its own: a light-theme diagram is drawn in dark ink and would
otherwise open as an empty rectangle.

Each diagram also carries a copy button that puts it on the clipboard as a PNG,
drawn at twice its size on the page so it stays sharp when it is pasted into a
deck. Selecting a diagram would only get you its source, which is rarely what
anybody wants.

> [!NOTE]
> Readers see only the pictures they have permission to open. A relative path
> resolves to a real SharePoint address, and SharePoint still applies the
> library's permissions to it.

## Code blocks a reader can use

Every code block carries a copy button that copies the source and never the line
numbers. **Show line numbers** puts them in a gutter that stays put while a long
line scrolls under it, and that wrapped lines indent past rather than run under.

**Long lines** decides what a line too wide for the column does, wrap or scroll
sideways, and any block can override it on its own fence. The
[syntax page](../syntax/) lists the fence flags.

## The line at the bottom

**Show file name and last updated** puts a footer under the document with the
file's name, when it was last changed and by whom. It needs a file from a
document library, since that is the only source with any of those to show.

**Keep it in view while scrolling** pins it to the bottom of the web part rather
than leaving it at the end of the document, which in a long one means a reader
never reaches it.

**Fill the available height** is usually turned on for the same reason: it gives
the web part at least the room below where it starts, so a short document does
not stop halfway down and leave the page canvas showing under it, and the file
footer sits at the bottom of that rather than under a gap.

The room is measured on the page rather than written as `100vh`. A SharePoint
page does not scroll the window: it scrolls an inner container under a header
and a command bar, so a viewport unit overshoots by however tall that chrome is.
It is measured from where the web part starts too, so a part placed under other
content on a long page has no room below it and is left as it is.

## What changes when the page is being edited

Everything above is what a reader gets. An author editing the SharePoint page
gets something different in the same space: the toolbar changes, the contents
stops sticking, and the document becomes a text box with a preview beside it.

**[What editing in the page looks like](../editing/)**
