# Changelog

All notable changes to this project are recorded here. Versions are written the
way SharePoint writes them, four-part, because that is the number a tenant
compares when deciding whether a package is an upgrade. The first three parts
follow [semantic versioning](https://semver.org/); the fourth is the build and
is normally zero. `scripts/set-version.js` stamps it when a release is cut.

Entries below 0.0.10.0 were written before the switch and are three-part.

## 0.0.22.0

A second web part: **Markstrata - HTML**. The markdown one is renamed
**Markstrata - Markdown**, so the two can be told apart in the toolbox, and the
solution is now "Markstrata - Markdown and HTML for SharePoint and Teams".

### The HTML web part

It draws an author's HTML document with the same chrome the markdown one has:
the same toolbar, theme controls, contents list, trail through linked documents
and source footer. A page can carry one of each and read as one thing.

Three render modes, which are three different bargains rather than three ways
of doing the same thing.

- **Inline** puts the document in the page. Markstrata's typography styles it,
  pictures zoom, tables sort, the contents sidebar works, and links to
  neighbouring documents open in the web part. The author's stylesheet is
  rewritten so it applies only inside this web part: their
  `body { background: black }` becomes a rule about their own document.
- **Shadow DOM** puts it behind a boundary. The stylesheet needs no rewriting
  because the boundary is what contains it, the page's CSS cannot reach in
  either, and the document looks exactly as written. Inherited properties do
  cross a boundary, so the theme's colours and text size still arrive, and an
  author can use `var(--strata-...)` to match the page deliberately.
- **Frame** makes it a document of its own, in a sandbox, and is the only mode
  where the author's own scripts can run.

### What the sandbox allows, and why

`allow-same-origin` and `allow-scripts` are never granted together. Together
they are not a sandbox: a script with both can read the reader's SharePoint
session and remove its own sandbox attribute.

With scripts off the frame is granted same-origin, which is safe because there
is no script in it to use it, and useful because it is what lets the web part
measure the document and fit the frame to it. It is also granted top navigation
by user activation, which is what lets a link to a neighbouring document
replace the page rather than open a tab.

With scripts on the frame is an opaque origin instead: nothing in it can see
the page and the page cannot see in. Top navigation is withheld, because a
script could rewrite a link's address and the reader's own click would carry
them off to it, so links open in a new tab. "Fit content" is not offered at all
in that mode rather than quietly behaving as something else, because a frame
that cannot be read cannot be measured.

Scripts are off by default, off in the preconfigured entry, and paused while
the page is being edited. Turning them on also means the document is no longer
sanitised, because sanitising is what removes the scripts. The property pane
says that in those words.

### A stylesheet several pages can share

The stylesheet is chosen separately from the document, with its own library,
folder and file pickers, because one file in a library is meant to dress every
HTML web part in a site and an author editing one document should not be able to
restyle the other nineteen. A document's own `<style>` block still applies on
top of it, so one document can vary without the rest of them moving. A
stylesheet that will not load is a banner and never a failure to draw: the
document is what somebody came to read, and it is readable unstyled.

### Editing an HTML document

The same split editor the markdown web part has: the source on one side, a live
preview on the other, Edit / Split / Preview, the panes scrolling together,
Ctrl+S, and one button that writes the document back to SharePoint.

The stylesheet is a tab beside the HTML rather than a third column, so whichever
an author is working on gets the whole width and the preview beside it is the
same preview either way. That tab edits a stylesheet typed into the pane; one
from a library or a URL belongs to that file, and other web parts are probably
reading it, so it is shown read only with a line saying where it lives.

The preview is the page's own rendering with the furniture switched off, not a
second way of drawing a document. A preview that rendered differently would be
worth less than no preview, because an author would tune a document against one
renderer and ship it to another. The one thing it cannot show is a document
whose scripts run, since those are paused for anybody editing the page, and the
editor says so above the panes.

### Also in the HTML web part

- **Full bleed** takes the reading measure off, for a document that is a
  dashboard or a wide table rather than prose.
- **Height**: fit content, a fixed number of pixels that scrolls, or the room
  left on the page.
- **Show on narrow screens**, off, hides the web part below 600px. It is a
  width and not a device: SPFx does not say whether it is being drawn in the
  mobile app or in an email, so nothing here claims to know.
- Headings are given ids by walking the rendered document, using the same slug
  rule markdown uses. Hand-written HTML rarely has any, and without them the
  contents list comes out empty and no link can reach a section. An id the
  author wrote is never rewritten, only counted.

### Teams

Teams allows an app one configurable tab. The manifest schema says so in as many
words, and a second entry in that list is not a second tab; it is a manifest
Teams refuses, which from the App Catalog reads as Sync to Teams failing again
for no stated reason.

So there are two app packages now. `TeamsSPFxApp.zip` is the markdown one and
keeps that name, because it is the exact name SharePoint looks for inside the
`.sppkg` when somebody presses Sync to Teams. `MarkstrataHtmlTeamsApp.zip` is
the HTML web part's, with its own app id and its own name in the store, and
SharePoint will not deploy it because it only knows the one name: it is uploaded
by hand in the Teams admin centre. Both ride inside the `.sppkg`, so an
administrator has both to hand without a second download.

A team that would rather not approve a second app does not have to. Markstrata -
HTML works as a web part on a SharePoint page, and a channel can carry that page
as a tab.

The second manifest was written by copying the first, which is why it is
validated rather than trusted: against the whole v1.17 schema, and for the two
mistakes a copy makes first - a tab still pointing at the other web part's
component, and two apps sharing an id or a name.

### Under both web parts

The lifecycle was already shared. What moved this time is the furniture and the
pane.

- `documentChrome` holds the toolbar, the theme controls, the document trail,
  the contents list and the source footer. All of it is built from the rendered
  document rather than from markdown, so none of it belonged to the markdown
  renderer. `ViewModeRenderer` drops from 620 lines to 229 and keeps only what
  is markdown.
- `paneFields` holds every property pane control both web parts show, so there
  is one theme control rather than two that drift. Each pane still lays out its
  own pages, because the pages are where the two genuinely differ.
  `propertyPane.ts` drops from about 600 lines to 282.

### On the website, and in the toolbox

`/html/` is the HTML web part running rather than a page about it: the real web
part, the real property pane, the real editor, against a stand-in library
holding a whole HTML file and a stylesheet several web parts could share. Open
the properties there and the document is on the first page with the stylesheet
on a page of its own, which answers what the separation is for in a way prose
cannot.

The HTML web part has a toolbox tile of its own as well. The markdown one has
always carried a rendered tile, and shipping the second web part with only a
Fluent glyph undid half the point of giving the two separate names. Same editor,
same tilt, same palette; one shows markdown source and the other an HTML file
with a `<style>` block in it.

### Driven in a real browser

Everything that matters about the HTML web part is a question only a browser can
answer. Whether a shadow root really keeps an author's stylesheet off the page.
Whether a sandboxed frame really is the opaque origin its sandbox claims. Whether
the stylesheet narrowing survives Chromium's own parser rather than a test that
reads strings. So there is a third harness page running the real web part, and
eighteen driver steps against it.

The first run earned it. Shadow mode threw and took the whole render with it:
the contents list is inserted into the layout before the article, and in shadow
mode the article is inside a shadow root, which the layout has never heard of.
The harness page also never loaded the HTML web part's own stylesheet, so the
frame, the shadow mount and full bleed had no styling at all on the page that
exists to check them.

And one check was worth nothing. The stylesheet leak check measured a paragraph
the page had given an id and a background of its own, and it passed with the
narrowing switched off: an id beats a bare element selector, so what it measured
was CSS precedence. The probe is an unstyled paragraph now, and it was verified
the other way round before being trusted.

### A table header that hid a row

Reported from a tenant against the first test build: a table came out with a
blank band where its header should be, the header partway down, and a row
invisible underneath it.

Two faults, one cause. markdown-it wraps every table it renders in a box that
scrolls sideways, so for as long as markdown was the only kind of document, "a
table is inside a box" was true by accident and the stylesheet could rely on it.
An author's HTML arrives as the author wrote it, so no table in it had one. The
table enhancer looked for boxes, found none and returned, which left those
tables with no fit measurement, no sorting, and a sticky header with nothing to
stick to but the web part itself.

A sticky cell cannot leave its containing block, which for a header cell is the
table. Stuck to the page - or to a fixed-height web part, which is its own
scroll container - the header was pushed the chrome offset's worth down and
parked on the last row, which z-index then hid. It needed no scrolling at all
to happen.

So the enhancer puts the box on every table now rather than hoping one is
there, and the header sticks to that box at the top, where it cannot be pushed
anywhere else. What that gives up is a header that follows the reader down a
long table. What it buys is that a header can never hide a row, and hiding a
row is not a matter of taste. If following is wanted back, the way to have both
is a scrolling box with a height of its own, which is a change to how a
document is laid out rather than a fix.

Sorting an author's table works for the first time as a result, since the
enhancer never reached it before.

Both faults are driven now, in the arrangement that showed them, and the
diagnosis was checked against the old stylesheet rather than assumed.

### A document named on the page's address

`?strataDoc=folder/page.html` was refused. The value carries the heading inside
it rather than as the page's own fragment, and once it is decoded a `#` in a
file name looks exactly like the one that starts the heading - so the split is
made at the extension instead, and the extensions were `md` and `markdown`
written into the pattern. Every HTML document a menu entry could name came back
as an address the web part could not understand.

Which extensions count is the caller's to say now, and the split is a walk
rather than a pattern, because a pattern assembled from a list of extensions is
the kind of thing that works until one of them has a dot in it. The awkward
cases the old pattern was built for are kept and now checked for both kinds of
document: a `#` inside a file name stays part of the name, `notes.md#see-a.md`
is one document and a heading, and a folder that ends in an extension is still
a folder.

Each web part refuses the other's documents, which is not pedantry: opening the
wrong kind would draw a document of tag names or a page of escaped angle
brackets.

### A table's bottom edge

Reported after the first fix: the bottom of a table read as longer than its
data, like a row that was there and could not be seen.

`overflow-x: auto` was declared on the box and `overflow-y` was not, and CSS
computes an undeclared `visible` to `auto` when the other axis scrolls - so the
box could scroll vertically as well. On any device that draws classic
scrollbars rather than overlay ones, the horizontal bar comes out of the box's
own height, the table is then taller than what is left, and a vertical bar
appears beside it: the bottom of the table ends up behind the one and reachable
only through the other. The fix before this had also made every box a scroll
container, so a table that fits its column was getting all of that for nothing.

The box is sideways-only now, said rather than left to be worked out, and a
table that fits is out of the box altogether: no scrollbars, nothing clipped,
no gutter taken. Its header is simply not sticky, which costs nothing, there
being nothing to scroll it.

This one could not be reproduced here. The headless browser the harness drives
uses overlay scrollbars, which take no space, so the fault is invisible to it -
worth knowing rather than glossing, because it means the check that would have
caught it cannot be written in this harness.

### Two build fixes worth recording

The scroll walk that finds what is actually scrolling on a page was written
with `parentElement`, and the topmost element in a shadow root has none. It
stopped at the boundary, found no scrolling container, and answered as though
the window scrolled, which is the wrong answer on every real SharePoint page.
It steps out through the shadow host now.

The demo and test builds compiled into a flat folder and loaded the result with
`require`. Once the renderer's imports crossed into a second source folder the
output stopped being flat, and every `require` went on finding the copy a
previous build had left at the old path. A site build passed that way against
code that was no longer the source. Both builds now name their root explicitly
and empty the output folder first, so that cannot happen again quietly.

## 0.0.21.2

No change to the web part. The version exists so that Teams will accept the
release, and that is worth writing down rather than leaving as an unexplained
bump.

The Teams manifest version is three parts where SharePoint's is four, so the
build number is folded into the patch at a thousand: 0.0.21.1 reaches Teams as
0.0.21001. A hand-patched manifest built while the channel tab fault was being
diagnosed had already been installed under that exact number, and Teams refuses
an app whose version it already holds, with nothing in the catalog to say why
beyond a sync that fails again. So 0.0.21.1 could not be installed over the
thing used to diagnose it.

0.0.21.2 reaches Teams as 0.0.21002 and installs. The package it carries is the
same one, byte for byte in everything but the stamped version.

Worth knowing for next time: a version tried by hand is a version spent. The
number cannot be reused, so a diagnostic build is better cut from a build
number nobody intends to release from, well above the next real one.

## 0.0.21.1

Three fixes for Teams, where a tab could be added and configured and then
would not survive being reloaded.

- A tab in a channel now keeps working after its settings pane is closed. It
  loaded, let an author pick a document, showed it, and then died on the reload
  that closing the pane causes, with "Sorry, something went wrong" and
  `TypeError: JSON.parse is not a function or its return value is not iterable`
  behind it.
  - The cause was a property this web part fills in for SharePoint search: up
    to twenty thousand characters of the rendered document, copied in so a page
    can be indexed. A page keeps its web parts' properties in its own canvas,
    server side, where that is nothing. A Teams tab keeps them in the tab's
    configuration, which is small. What came back was truncated, SPFx reads it
    with `JSON.parse` and then walks the result, and the tab was dead before
    any of this web part's own code ran, which is why nothing in the error
    named it.
  - The text is written on a SharePoint page and nowhere else now. Nothing is
    lost: a Teams tab is not a page SharePoint indexes, so it was being stored
    at a cost that bought nothing even when it fitted. A tab an older build
    configured has it cleared on the next start, which is the one chance to
    take it back out of settings that already carry it.

- A tab's settings open against the site the team is behind rather than the
  root of the tenant. The configuration address named the tenant host and left
  the site path out, so the document picker offered the root site's libraries
  and not the ones anybody in that channel would be looking for.

- The example in the link documentation is an invented document rather than one
  taken from a real library. Comments, examples and assertions only, and no
  behaviour changed.

## 0.0.21.0

- The toolbar can be kept in view while the document scrolls under it, which
  suits a long document somebody reads a section at a time. Off by default: a
  short document scrolls past the toolbar once and does not want it back.
  - It comes to rest below whatever the page keeps stuck across the top of the
    window rather than behind it. On a SharePoint page that is the suite bar
    and the command bar, and the web part measures them rather than guessing,
    because a toolbar stuck at the top of the window is a toolbar nobody can
    reach.
  - A heading scrolled to lands below the toolbar as well. The offset a heading
    lands at was written when nothing of this web part's own was ever stuck up
    there, so it counted the page's bars and nothing else, and clicking a
    contents entry would have put the heading neatly behind the new toolbar.
    Sticky table headers read the same offset, so they come to rest under the
    toolbar without being told about it, and the contents sidebar is brought
    down to meet it.

- A picture opened full size can be zoomed further and panned around. Full size
  meant the size of the window, which is the whole of it for a diagram and not
  enough for a screenshot: a screenshot of a settings page is legible at the
  size it was taken and a blur at the size a column allows.
  - Three ways in, because readers are not all holding the same thing. A wheel
    or a pinch zooms toward the pointer, the way a map does; a double click
    goes between fitting the window and twice that, which is the whole gesture
    on a touchscreen; and buttons in the corner are what a keyboard reaches
    for. Dragging moves a zoomed picture around, and it cannot be dragged so
    far that none of it is left on screen.
  - Zooming toward the pointer rather than the middle is the part worth having.
    A reader points at the thing they want bigger, and a zoom that walks it off
    the screen makes them chase it.
  - The picture now sits in a panel that fills the overlay, so a zoomed picture
    has somewhere to be panned to. The dark area beside it still puts the
    picture away, the way clicking outside always has; the picture and its
    buttons do not.

- A link whose address has spaces in it is read as the link it plainly is.
  SharePoint names pages and files after their titles, so the address somebody
  copies out of the address bar usually has spaces, and markdown says a link
  address may not: markdown-it read to the first space, failed to find the
  closing bracket, and gave up, so the whole thing reached the page as brackets
  with a stray half-link in the middle of them.
  - The rule runs only where markdown has already given up, so nothing that
    rendered before renders differently, and a sentence in brackets followed by
    one in parentheses is still two sentences. Pictures too, since the same
    paste breaks them one character away.
  - Angle brackets around the address remain the form that is actually correct
    and that works everywhere rather than only here, and the documentation
    still teaches it.

- The site has a page about MarkstrataSiteBuilder, the companion PowerShell
  module that publishes a folder of markdown as a browsable SharePoint site:
  one renderer page serving every document, generated category pages, and a
  menu built from the folders. Separate repository, separate release cycle, and
  either one works without the other.

## 0.0.20.2

- The Teams tab is offered in a channel and not in a chat. The manifest asked
  for the groupChat scope as well as team, and Teams took it at its word: the
  app could be added to a 1:1 or group chat, and configuring it there answered
  HTTP 500. The configuration address is anchored on the `{teamSiteDomain}`
  token, which Teams fills in from the SharePoint site behind a team, and a
  chat has no team behind it and so no site: there is no host for the
  configuration page to be requested from at all.
  - Dropping the scope is right whatever the address says, because there is no
    SPFx host for a chat tab to begin with. A web part names the hosts it can
    be shown in, and the Teams ones are a channel tab and a personal app;
    there is no chat tab among them. The 500 was SharePoint being asked for a
    page by a name that resolved to nothing.
  - The tab also reads its document out of a channel's Files, which is that
    channel's document library, so there would have been nothing to point it
    at even if the page had opened. Files shared in a chat do exist, in the
    OneDrive of whoever shared them, but reaching those is Graph rather than
    the SharePoint calls this reads a library with.

- Draft-04 schemas are read with ajv 8 rather than ajv 6, which brings two
  fixes worth having: prototype pollution through a `$data` reference on the
  format keyword, and the ReDoS in the pattern keyword, CVE-2025-69873. ajv 8
  dropped draft-04, so the Teams manifest check that validates against it now
  reads the dialect from ajv-draft-04 and the one format in that schema from
  ajv-formats. Neither is optional: without the first the require throws, and
  without the second ajv refuses the schema rather than quietly stopping
  checking the key, which is the failure that check exists to catch.

- The Pages workflow configures itself with actions/configure-pages v6.

## 0.0.20.1

- An export is in the theme the document is read in. It came out as a flat wall
  of text: headings at body size, tables with no rules, callouts with no accent
  and code with no ground under it, correctly paginated and looking like a
  different product. The copy the pages are laid into carried the web part's
  root class and none of its attributes, and the class is not the theme. Every
  token a theme declares is declared against an attribute on the root,
  `.strata-root[data-strata-theme='github']` and, for the colours,
  `[data-strata-mode='light']` with it, so a copy carrying `strata-root` and
  nothing else resolved not one of them. CSS says nothing about that:
  `font-size: var(--strata-h2-size)` with nothing behind the variable is an
  invalid declaration and is dropped, so the heading inherits body size, and a
  border built the same way goes the same way, so the table loses its rules.
  - The attributes come across with the class now, and the four that answer to
    a window rather than to a theme are set to what a sheet of paper needs: the
    light half of whatever theme the reader chose, because a printer fills a
    dark page edge to edge and a photocopier does worse; no filled height and
    no pinned metadata, both of them lengths measured off a screen; and not
    editing, because the page being edited is not something the export is part
    of.
  - A long line of code wraps onto the page rather than running off the side of
    it. A listing scrolls sideways on screen and a sheet of paper does not, so
    a line wider than the text block simply left the page and the half past the
    margin was never printed.

- A code block opened full size opens below the bars a SharePoint page keeps
  stuck across the top of the window. The overlay is built inside the web part
  so that what it shows is painted from the reader's own theme, and that is
  also why it cannot be raised above them: they are in a stacking context it is
  not in, and no z-index reaches them from a child of the web part. They
  covered the close button and the block's filename, which left the overlay
  openable and then neither readable nor dismissable except with Escape. The
  close button is measured from the same figure as the panel, because padding
  on its own would not have moved it: an absolutely positioned element takes
  its offsets from the padding box.

- The documentation and the site say what ships. Export replaces Print
  throughout, Share says that it copies a relative address with only the
  guarded characters escaped, and anchors say that a link to a heading scrolls
  inside the document rather than being handed to SharePoint's router. Nested
  folders in the library picker and wiki links inside table cells are written
  up with the settings that go with them.

## 0.0.20.0

- The Print button is an Export button, and what it produces is a document
  rather than a page cut into paper-sized pieces. A cover with the document's
  name and where it came from, a contents page carrying the page number each
  heading actually landed on, running headers naming the document and the
  section, and breaks that keep a heading with the text under it and a table
  row off the fold.
  - The page numbers are the point. Nothing knows what page a heading is on
    until the pages exist, which is why the old print put the contents sidebar
    on the front as a bare list of headings. Paged.js works the pages out
    first, and then `target-counter` can say. It is CSS Paged Media, which
    print engines implement and browsers do not, so it arrives as a polyfill.
  - It is a chunk of its own, not part of the bundle, the same arrangement
    Mermaid has had since the beginning. A reader who never exports never
    downloads it.
  - What it does not do is write a PDF outline, the bookmarks pane a reader
    navigates from, because nothing a page is allowed to ask the browser for
    produces one. `window.print()` takes no arguments and the Save as PDF
    dialog has no such option; Chrome will write an outline, but only when it
    is driven over the DevTools Protocol, which is a headless browser on a
    server rather than a web part in a tenant. The contents page answers the
    same need, as something a reader turns to rather than navigates from.
  - Three settings decide what an export contains: a cover page, a contents
    page, and whether each top level section starts on a page of its own. The
    last is off by default, being right for a reference somebody reads a
    section of at a time and wasteful for a runbook that is two pages long.
  - The document on screen is never touched. Everything happens to a copy,
    which is laid out, printed from and thrown away, so the reader's scroll
    position and the document they were reading are where they left them. The
    copy's ids are renamed for the same reason: two elements answering to one
    id would have the contents counting the page of the heading still on
    screen, which is on no page at all.
  - The export still opens the browser's print dialog, because that is the
    only way a page is allowed to make a PDF. Choose "Save as PDF" in it.
  - A page that turned the print button off keeps it off. The setting was
    called `showPrintButton` and is carried over, rather than a new default
    putting a button back that somebody deliberately took away.

- A shared link is one somebody can read. The Share button copied the whole
  server-relative path with every character in it escaped, so a link to a
  document three folders down arrived as a wall of per cent signs carrying the
  site and the library whether or not they said anything:

  ```text
  ?strataDoc=%2Fsites%2Fwiki%2FDocuments%2FRunbooks%2FDeploy%20notes.md
  ?strataDoc=Runbooks/Deploy%20notes.md
  ```

  It is named against the folder the page reads from now, which is the short
  form `?strataDoc=` has always accepted and the documentation has always
  recommended, and escaped only where a query value has to be: a per cent
  sign, an ampersand, a hash and a plus. A space is escaped as well, which is
  not one of the four and does not need to be, because Teams and Outlook stop
  autolinking at a raw space and what arrives is half an address. Relative only
  where relative is clearer: another site, an address rather than a path, or
  anything more than one folder up is still written out in full.

- A library that will not answer is reported rather than thrown into the page.
  The lists the property pane offers are fetched for their effect rather than
  their result, so the call was made and not waited on. `void` on a promise
  says the result is not wanted; it does not say a rejection is not wanted, and
  a library the reader may not list rejected that lookup into nothing. What
  arrived was an unhandled error on the SharePoint page, at whatever moment the
  promise happened to settle, with nothing in it to say which web part it came
  from. It is caught and reported now, along with the other calls made the same
  way: the version panel and an export.

  This is what had been failing the browser harness on and off, and only ever
  on CI: whether it landed during a check or after the last one was a matter of
  timing. Three pull requests were held up by it before the change above made
  it legible.

- The browser harness says what failed rather than failing silently. It printed
  its summary, then closed the browser, then read the tally again to decide the
  exit code, and those two readings could disagree: a page error arriving
  during teardown made a run report "No failures and no page errors." and then
  exit 1. It happened twice and cost a round of investigation both times,
  because the run was green everywhere a person would look. Nothing new counts
  as a problem; whatever turns up is now in the list that gets printed.

## 0.0.19.4

- A folder inside a folder can be chosen. Picking a library asked SharePoint
  for its folders once, which answers with the folders at the root and says
  nothing about what is inside them, so an author could choose `Runbooks` and
  never `Runbooks/Database`. A wiki kept more than one level deep could not be
  pointed at at all, which is most wikis by the time they are worth calling
  one. SharePoint describes one folder at a time, so the rest are walked: five
  levels down and five hundred folders at most, breadth first, so the shallow
  folders are the ones that survive a library too big to describe. A folder a
  reader cannot open is taken as empty rather than ending the walk, because
  being denied one subfolder out of twenty should not cost them the other
  nineteen. A folder chosen before this still reads correctly.
- A wiki link written in a table stays a link. A pipe inside a row ends the
  cell, so the pipe in `[[Deploy runbook|how we ship]]` ended it too: the link
  came apart across two cells, both halves reached the reader as literal
  brackets, and the row carried one cell more than the table had columns.
  Obsidian documents the escaped form, `[[Page\|Label]]`, and that has always
  worked here, but the bare pipe is what a folder of notes arrives full of,
  because it is what Obsidian itself writes everywhere outside a table. The
  pipe inside a wiki link's brackets is content now, the same way a pipe inside
  a code span already was. `[[1,2],[3,4]]` is still an array and the pipe after
  it still ends the cell, since a bracket between the pairs means these are not
  a link's brackets, and an opening pair with no closing one protects nothing.
  With wiki links off, a row splits where its pipes are, exactly as before.
- An anchor goes to the heading it names. Two faults, and both ended with the
  reader at the top of a document rather than at the heading they asked for.
  - An anchor inside the document was left to the browser, and on a SharePoint
    page that is not a scroll: the page is a single-page application with a
    router listening for clicks, a fragment is a navigation as far as it is
    concerned, and what came back was the page's own address with the anchor on
    it and the configured document on screen, which has no such heading. The
    click is taken before the router now, the same way a click on a document
    link already is. The permalink beside every heading is an anchor into this
    document too and had the same fault, so it is mended by the same change.
  - And a heading was looked up by exactly the text the link carried. A wiki
    link has already been through the slug rule, so `[[Runbook#Rollback]]`
    asked for `rollback` and found it; a heading named on the page's own
    address has not, so `?strataDoc=Runbook.md%23Rollback` asked for
    `Rollback`, which is the id of nothing. The lookup now asks for each
    spelling in turn and takes the first that is on the page: as written, so an
    author's own `{#custom-id}` still wins, then decoded, then slugged, then
    slugged the way headings were named before the rule changed.
  - A link to a heading this document has not got does nothing now, rather than
    sending the reader home. Nothing writes to the address bar: the web part
    keeps its history entries at the page's own URL so the router treats them
    as the same page, and putting a fragment there would hand it the navigation
    all of this is avoiding.
- Every release has its own notes again. The 0.0.18.4 section had accumulated
  the notes for everything released after it, so eight versions shared one
  heading and seven published releases fell back to a one-liner giving their
  own number and where to download the package. Nothing was rewritten: every
  line is where it was, under the heading for the release it shipped in. Which
  release that was is the whole of the work, because the tags cannot answer it
  and this changelog says why, so the file headers answered it instead, being
  the one record reconstructed from what each release actually contained.
- And a way to keep the releases in step with it. A release body is written
  once, out of the section for that version, and does not follow the changelog
  afterwards. `scripts/sync-release-notes.ps1` reads the changelog the way the
  release workflow reads it and writes each body back, leaving the tag, the
  commit, the assets and the pre-release flag alone. It is PowerShell and run
  by hand because a release write is refused outright to the environment the
  rest of this was done in.

## 0.0.19.3

- A real site name is out of the repository's history, not just out of its
  working tree. 0.0.18.4 took the name out of the files; every commit made
  before that still carried it, so anybody cloning the repository got it back
  in full. The history has been rewritten: the name, the tenant host and the
  internal folder names it appeared beside are replaced everywhere they occur,
  in file contents and in commit messages alike.
- The rewrite changed no content. The tree at the tip is byte for byte what it
  was before, all 279 commits are still there, and the full test suite passes
  against the rewritten history. What changed is every commit's identifier,
  because a commit names its parent and rewriting one rewrites all of them
  after it.
- The five pre-releases that were cut while the name was still in the tests,
  0.0.18.7 through 0.0.19.2, have been withdrawn along with their tags. A tag
  is a reference, and leaving those in place would have kept the old commits
  reachable and the name with them. They were superseded pre-releases of a
  pre-1.0 product and this release replaces all of them.
- Every commit is signed again, all 283 of them. The rewrite had stripped the
  signatures, because a signature covers the commit object and changing the
  object invalidates it, so the whole history came through unverified. It was
  re-signed afterwards, which is only possible because every commit here has
  one author and that author holds the key; it would not be possible for work
  somebody else wrote. The trees are untouched: the tip's tree hashes the same
  before and after, and the tests pass either side.
- One name on the history. Twenty-eight commits were authored from a work
  address and two from a tool's, none of them on a branch: they sat on the
  v1.0.x line, which only a tag reaches. That address names the company the
  rest of this scrub spent its time taking out of the files, and half of those
  commits were already published. The scrub could not have caught it: replacing
  text rewrites what is in a file, replacing messages rewrites what is written
  about it, and who wrote it is a third field that neither one reads. Nor could
  the guard in the tests, which reads files and has no view of commit metadata
  at all.
- Dependabot still wrote what Dependabot wrote. Its twenty commits keep their
  author, because the point of the change above is for the history to say who
  did the work, and rewriting those would make it say something false.

- Tags are annotated and signed now, rather than lightweight. A lightweight tag
  is a name pointing at a commit and carries no signature of its own, so there
  is nothing on it to verify and nothing to repair when it reads as unverified.
  An annotated tag is an object in its own right and can be signed, which is
  what a released version should be.

- The app is called "Markstrata - Markdown for SharePoint and Teams" in the App
  Catalog, and both its descriptions describe what it does now. The name said
  "Markdown Web Part for SharePoint Online", which was written before any of the
  Teams work and had become half the product; the descriptions were a version
  behind that, listing themes and diagrams and none of the linking, embedding or
  sharing. The Teams manifest and the website had said the fuller thing for some
  time, so the SharePoint package was the last place still describing the old
  scope.
- A pre-release carries the Teams app zip again, and a recommended release does
  not. It was dropped when Sync to Teams started working, and then turned out to
  be the only way to test the Teams half on its own the day the sync refused the
  app and SharePoint reported nothing useful. On a recommended release it stays
  off: a Teams app that installs without the SharePoint half it talks to is a
  liability, and one kept in a tenant goes stale.
- Every file header names the version it first shipped in. Twelve still said
  `unreleased`.

## 0.0.19.2

- The Teams app carries the web part's own component id, so an upload is an
  upgrade of the app a tenant already has rather than a stranger claiming its
  place. Teams keys an installed app by the id in its manifest, and SPFx's own
  generated Teams app uses the component id, so that is what any tenant already
  had registered from an earlier Sync to Teams. The hand-written manifest
  invented a new id, and every upload since was refused:
  "Tenant app external.id doesn't match existing tenant app external.id." The
  rest of the package had always keyed on the component id, the icons included,
  because that is how Sync to Teams finds them. Only the manifest disagreed, and
  nothing compared the two.
- The Teams manifest is validated against the whole v1.17 schema now, by a real
  validator, rather than by a hand-written check of the fields somebody
  remembered. That check was written after a manifest carrying a `packageName`
  reached a tenant and was refused, and it was left partial on the grounds that
  the schema is draft-04 and nothing here read that draft. ajv does, given its
  draft-04 meta-schema, and it had been installed the whole time. It is pinned
  in devDependencies rather than left as somebody else's transitive dependency,
  because a check that stops running when an unrelated package is upgraded is
  worse than no check. The friendlier hand-written check stays beside it: it
  names the offending key in words.

## 0.0.19.1

- The Share button has a setting of its own, beside the print button, and is
  greyed out where following is off because the link it copies is the one that
  setting reads.
- A code fence that cannot reach the file it names says "file" rather than
  "document". It reuses the wording written for a document that would not open,
  and telling somebody their code block could not read a document sends them
  looking for the wrong thing.
- Support has moved out of the navigation and into the footer, beside the
  privacy policy and the terms. Nobody deciding whether to install this is
  reading about ways to help; it is a page somebody arrives at on purpose.
- The rule deciding when a code block offers to open full size can be checked
  without a browser. It is split from the measuring, because jsdom has no
  layout: every measurement there is zero, so a test written against an element
  would have passed while testing nothing, which is worse than no test. The
  browser still does the measuring and the harness still drives it against real
  blocks in all three themes.

## 0.0.19.0

- The website is rebuilt. It served two readers as though they were one: an
  administrator deciding whether to install this and somebody who has to write
  a document in it were offered the same seven links in the same bar. The
  navigation is two labelled sections now, Evaluate and Documentation, and both
  are drawn on every page, the privacy policy and the terms of use included,
  since those are named in the SharePoint package and the app catalog sends
  people straight to them.

  Five pages are new. **Install** is what a tenant has to have, which is an App
  Catalog and nothing else, and what happens to the package once it is there.
  **Teams** is the half the site had never caught up with: a channel's Files are
  a SharePoint document library, so the same web part reads the same documents
  as a tab, and Sync to Teams publishes the app package that already rides
  inside the .sppkg. **Linking**, **Reading** and **Editing** cover the three
  behaviours no single rendered document can show: wiki links and what a bare
  `[[Firewall]]` resolves to, following a link and the trail back out,
  `?strataDoc=` on the page address, what a reader gets around a document, and
  what changes when the page goes into edit mode. The front page is rewritten
  around the split, and the old documentation page is a settings reference
  following the five pages of the property pane.

  Those pages say plainly where this and Obsidian disagree: a bare wiki link
  resolves against the folder the document is in and nowhere else, because there
  is no vault to search, only a library, a reader's permissions and one request
  at a time.
- A guided page carries specimens: panels of markup that ViewModeRenderer and
  EditModeManager produced at build time, over a jsdom document, dropped onto
  the page where the web part's own stylesheets already are. The toolbar, the
  trail of documents a reader has walked, a wiki link marked as not being in the
  library, and the split editor are all built against a SharePoint library, so
  none of them can be shown by rendering one markdown file, and a screenshot of
  each would be four pictures to keep in step by hand. A specimen cannot drift,
  because it is the shipping code's own output. It also cannot work: the
  handlers are properties on the elements and do not survive being written to a
  file, so the panel refuses the pointer, everything in it is out of the tab
  order, and the note under it says so.
- The site follows the reader's light or dark mode rather than being a dark band
  at either end of a light page, and the switch that decides it is in the header
  on every page. It used to be a dropdown in a bar of theme controls that
  appeared above every page whether or not the page was about the rendering; on
  a phone that bar filled the screen before the first sentence. The bar is now
  only on the theme preview and on `npm run demo`, which exist for nothing else.
- The theme preview was rendering `[[deploy]]` as literal brackets and
  `#kitchen-sink` as a word with a hash in front, in the same sentences that say
  what each of them becomes. Wiki links and tags are both off by default in the
  web part, and the page that claims to exercise everything was being built with
  the defaults. It is built with them on, so the document shows what it says.
- The README and CONTRIBUTING.md described a Teams flow that stopped being true
  at 0.0.18.2. Both named a zip at a path the builder does not write, from a
  manifest at a path that does not exist, and CONTRIBUTING said Sync to Teams
  was not used any more and should not be. Sync to Teams is exactly how the app
  reaches a tenant: SPFx copies everything under `teams/` into the .sppkg, and
  the sync looks inside the package for `./teams/TeamsSPFxApp.zip` and publishes
  ours instead of generating one.
- A code block with more to show than it is showing opens at the size of the
  window, in the same overlay a picture and a Mermaid diagram already use. A
  capped block is the obvious case, since it is showing ten lines of a hundred,
  but a block whose lines run past the column has the same problem without
  anybody having asked for a cap.
  - Which blocks offer it is decided by measuring the rendered block, never by
    reading the markdown. The rule in full: a block offers **Expand** when its
    `<pre>` has more to show than it is showing, in either direction, or when
    the block is taller than the window. One measurement, three cases - a
    capped block scrolls down, a wide block scrolls across, and a block with
    two hundred lines and no cap overflows neither because it is as tall as its
    code. A two line fence that fits is caught by none of it and is left alone:
    a control on every tiny fence is clutter, and clutter on the thing a
    document is mostly made of is worse than clutter anywhere else.
  - The button sits beside Copy. Clicking the block opens it too, because that
    is what a reader tries first on something they can see is cut off, but not
    when the click ended a drag that selected some of the code, and not on
    Copy: copying copies and opens nothing.
  - What opens is a copy of the block with its cap and its buttons taken off.
    The buttons because a cloned button has no listener behind it, and one that
    says Copy and does nothing is worse than no Copy at all. The block on the
    page keeps its own, and the text in the overlay is real text that selects.
  - The **Click a picture or diagram to see it full size** setting now reads
    **Click a picture, diagram or code block to see it full size** and turns
    all three off together. One switch for one idea.
- A code block can be capped in height and scroll inside instead of running
  down the page. A fence says `short`, `medium` or `full` beside `wrap` and
  `numbers`, and there is a **Block height** setting in the **Code blocks**
  group for the page default, so a page can make every block medium without
  touching the documents. A word on a fence beats the setting, the way
  `wrap` and `nowrap` already beat it.

  ````markdown
  ```python short
  ```
  ````

  - `full` is the default and is what a block has always been: as tall as its
    code. It carries no class of its own, so nothing in the stylesheet has to
    undo anything for the case that has not changed.
  - Short is ten lines and medium twenty-five, counted rather than written in
    pixels. The three themes disagree about both numbers that decide how tall a
    line is - GitHub sets 0.85em at line-height 1.45, Obsidian 0.875em at 1.5,
    VS Code 0.9em at 1.5 on a 15px body rather than 16px - and the code size
    setting moves the first of those again. Written in pixels a cap would be a
    different number of lines in every theme. Written in the block's own line
    height and code font size it is the same number of lines in all of them.
    Measured in a browser, a short block is 229px in GitHub, 238px in Obsidian
    and 227px in VS Code: roughly a paragraph of prose. A medium one is about
    525px, 553px and 530px, which is over half the content area of a laptop
    window, so a capped block still has the text before and after it on screen
    with it. That is the whole reason to cap one.
  - A capped block prints whole. Nothing scrolls on paper, and printing the
    first ten lines of a listing and losing the rest says something false about
    the listing.
- A fenced code block can name a file instead of carrying one. A fence with no
  body and a `src="..."` on it shows the file at that address, and a runbook
  that quotes twenty lines of code no longer has to carry a copy of them - a
  copy is wrong from the first release after it was pasted.

  ````markdown
  ```ts src="https://github.com/contoso/tools/blob/main/src/cache.ts#L10-L20"
  ```
  ````

  - `#L10-L20` and `#L10` take the named lines out of the fetched file. That is
    most of the value: a whole file in the middle of a runbook is not what
    anybody wanted, and both spellings are what GitHub puts in the address bar
    when you click a line number.
  - The address is translated by the same code a link to a remote document
    uses, so a `github.com/.../blob/...` link works. That is the address a
    browser gives you when you copy a link to a file, so it is the one people
    paste; the file itself is on the raw host.
  - Fetched after the document is drawn, not during it. Rendering is a string
    going in and a string coming out and stays that way, so the block is drawn
    saying which server it is waiting on and filled in when that server
    answers, the same shape as wiki link checking and Mermaid.
  - A fetch that fails says why in the block, in the same words a remote
    document uses: the file is either not there or that server does not allow
    pages on this site to read it, and a browser cannot tell those apart. A
    block that stayed empty and silent would read as a fence the author left
    blank.
  - What comes back is somebody else's file, so it goes in as text. It is
    highlighted with the language on the fence and escaped exactly as a block
    typed into the document is, never rendered as markup.
  - A fence with both a body and a `src` shows the body and says nothing about
    the `src`. Quietly dropping what an author typed in favour of a file
    somewhere else is the one outcome nobody would choose.
  - A fence that opens with an attribute rather than a language no longer takes
    that attribute for one. `` ```src="https://..." `` was headed
    `SRC="HTTPS://GITHUB.COM/..."`, and the colon in `https://` was read as the
    `lang:filename` shorthand. The same slip was there for a fence opening with
    a bare `title="app.ts"`.
- The release refuses to publish a package with no Teams app inside it. Without
  the app the package still builds, still installs, and Sync to Teams either
  does nothing or deploys something SPFx generated instead. That is silent from
  the outside and it is the failure that cost an evening once already, so it
  fails the release now rather than a tenant.

## 0.0.18.8

- A Word, Excel or PowerPoint file named by `![[Quarterly report.docx]]` is
  drawn as a card rather than as a link to a download. The card carries the
  file's name, a link that opens it in Word for the web, and SharePoint's own
  preview of it in a frame underneath. The document is never copied anywhere:
  the frame is SharePoint's page and it answers with the reader's own session,
  so somebody who may not open the file sees SharePoint refuse rather than
  seeing the contents.
  - The link is the feature and the preview is the enhancement, deliberately.
    Office for the web sets frame-ancestors and a tenant can be configured in
    ways that refuse the frame, with no way to detect that from the outside. If
    the preview never appears the name and the way into the editor are still
    there, which is better than the link this replaced either way.
  - The link goes to the file itself rather than to an edit address, so
    SharePoint decides whether a reader gets the editor or the viewer. It opens
    in a new tab, because the document being read is the page.
  - A file the library cannot answer for keeps its card and loses the empty box
    under it: a blank frame reads as a document with nothing in it, which is a
    different and wrong thing to say.
- A link inside a document fetched from a URL opens here, the way a link
  inside a document from a library does. The **File URL** source reads markdown
  from anywhere that will answer, and everything relative inside that document
  resolves against the folder its address is in, so a wiki link in it names a
  real file on that server. Following one used to leave the page for the file
  itself, which on a raw host hands the reader markdown as plain text: the
  source of the page they were reading rather than the page.
  - A GitHub address is translated to the one that holds the file.
    `github.com/org/repo/blob/main/a.md` is a page about the document; the
    document is on `raw.githubusercontent.com`. The blob address is the one a
    browser gives you when you copy a link, so it is the one that has to work.
  - Only the server the document came from counts. A link from it to anywhere
    else is still an outside link and still opens in a new tab.
  - When the other server refuses, the reader is told which it was. A browser
    reports a blocked cross-origin read as a bare failure and says no more, so
    the message names both possibilities rather than picking one: the file is
    not there, or that server does not let pages on this site read it. What it
    never says is "not found", which sends somebody looking for a file that is
    exactly where they put it.
  - `?strataDoc=` takes a whole address too, but only on a page already reading
    from one. Otherwise it would be a way to point a SharePoint page at any
    server on the internet, written by whoever wrote the menu entry.
- A heading five or six levels deep can be linked to. Only h1 to h4 were given
  an id, for no reason anybody had written down, so a document that went deeper
  had a floor nothing could reach: no `#fragment`, no `[[Page#Heading]]`, no
  `?strataDoc=...#heading`, no contents entry. Nothing said so either, the link
  simply did not move the page. Every level gets one now.
- And the contents a `[[toc]]` writes reads the same setting the sidebar
  contents reads. It was fixed at the second and third levels whatever
  "Deepest heading in the contents" said, so one page could show two contents
  that disagreed about how deep the document went. The setting now goes to six
  as well, which it could not sensibly do while the deeper headings had no ids
  to point at. The inline contents still starts at the second level, because
  the first heading is the document's own title.
- Every release tag in this series pointed at the wrong commit. The workflow
  is dispatched on a branch, builds that branch, and then asked `gh` to create
  the release without saying which commit it was for - so the tag landed on the
  repository's default branch instead. v0.0.18.0 through v0.0.18.6 all name one
  commit, and it is not one any of them was built from. The packages are what
  they always were, built from the right code; it is the tags beside them that
  answer "what shipped?" with a straight face and get it wrong, so checking one
  out or bisecting through it gives you a build nobody released. Fixed for
  every release from here. The tags already written are left where they are,
  because moving one changes what a version means to anybody who has already
  fetched it; this entry is the record of where they really point.
- Every file header that said `Since: unreleased` now names the version it
  first shipped in, worked out from which release actually contained it rather
  than from the tags, which could not be trusted for it.

## 0.0.18.7

- The Teams app package was refused by Teams, which is why Sync to Teams kept
  failing and why uploading the package by hand failed the same way: the
  manifest carried a `packageName` property, which the v1.17 schema does not
  define and does not allow, so Teams rejected the whole thing before reading
  any of it. One cause, both symptoms. It is gone.
- The schema is now vendored beside the manifest and read by the test rather
  than remembered by me. The limits were previously copied into the test by
  hand, which is exactly how a key Teams does not allow got in: I checked the
  fields I could remember and never asked the schema what it permits. The
  check walks every key in the manifest, and every key in the objects inside
  it, against what the schema defines, and reads the length limits from the
  schema too. It is not a full JSON Schema validator and says so: the schema is
  draft-04, the validator to hand does not read that draft, and a validator
  that quietly disagreed with Teams would be worse than an honest partial
  check.
- The way back out of a followed document goes back one document, not out to
  the start. The bar above a document always said "Back to" whatever the page
  was configured with and always went there, so every link after the first was
  a one-way trip: four pages into a wiki the only way back was the beginning,
  and the trail the reader had walked was gone. It now names the document
  behind this one and returns there, then the one behind that, and the
  configured document last. The trail rides inside the browser history entry
  rather than beside it, so the browser's own Back button walks the same path
  and the two cannot disagree about where the reader has been.
- The cell after a `||` is on the page again. A doubled pipe is how a
  MultiMarkdown table says a cell runs across the column to its right, and the
  cell that came after one was deleted: not mis-spanned, not mis-placed, gone,
  with nothing said about it. A row that was nothing but a span lost all of it.
  markdown-it-attrs did it rather than the table plugin. attrs has a way of
  writing a span where the author writes every cell and the covered ones are
  hidden afterwards, and it hides by blanking the text; `||` is the other way
  round, the covered cell is never written and the span is already set by the
  time attrs looks, so it found a span, assumed the cells it covers were still
  in the row, and blanked a real one. Both syntaxes are documented, so neither
  plugin could go: the span is set aside for the length of attrs' own rule and
  put back after, which leaves attrs an ordinary row and nothing to do in it.
  `^^` rowspans and tables with no spans in them are untouched.
- A release publishes one file again, the `.sppkg`. The Teams app zip was a
  second asset from when Sync to Teams was failing and the only way into Teams
  was to upload the zip by hand in the admin centre. Sync works now, and the zip
  that matters is the one inside the package, which is where SharePoint looks
  for it. A second copy on the release is the Teams half of the app installable
  on its own, without the SharePoint half it talks to, and stale the first time
  anybody uses it. It is still built, because the package needs it; it is no
  longer handed out.
- Display maths written the way almost everybody writes it now renders as
  maths. A `$$` block placed straight under the line that introduces it, with
  no blank line between, was not maths at all: the whole thing came out as one
  paragraph with the dollars and the LaTeX showing, and nothing said why. The
  block rule had never been given permission to interrupt a paragraph, which is
  also what kept it from working inside a list item or a quote. Three more
  forms are recognised with it: `$$x$$` inside a sentence, which used to leave
  a stray dollar either side of the maths; GitHub's `` $`x`$ ``, whose
  backticks were being typeset as two quote glyphs; and a fence labelled
  `math`, which GitHub and VS Code both render as display maths and which came
  out here as a code block headed MATH.
- An address written as `www.github.com`, with no scheme in front of it, is now
  a link, which is what GitHub does with one. The switch that allows it also
  links every bare word ending in something domain shaped, and `md` is the
  country code for Moldova, so a sentence naming `notes.md` would have been
  turned into a link to a website. It is narrowed back to the `www.` form that
  GitHub documents: a file name in a sentence is still a file name.
- Punctuation is left exactly as the document wrote it. The renderer had the
  typographer on, which is a setting for making prose look typeset: straight
  quotes became curly ones and `--` became an en dash. A runbook is not prose.
  "Run it with --force" was shown as "-force" and a reader who copied that
  line got a dash no shell will accept, and a JSON key shown as "name" got
  quotes no parser will read. Code spans were never affected, but the sentence
  around them was, which is where half of a runbook's commands are written.
  GitHub and VS Code both leave punctuation alone, and so does this now.
- A heading gets the id GitHub gives it. `## Step 1: Install` was
  `step-1%3A-install`, `## C# and .NET` was `c%23-and-.net` and `## What's new?`
  was `what%E2%80%99s-new%3F`, none of which any other tool produces: an
  anchor written against the same document on GitHub, in VS Code or in Obsidian
  landed nowhere here, and one written here travelled nowhere else. The rule is
  now theirs - lower case, drop the punctuation, spaces to hyphens - and it
  lives in one function, shared by the heading ids, the generated table of
  contents and `[[Page#Heading]]`, because a heading whose id is made one way
  and linked another way is a link to nothing.
- Anchors already written against the old ids still land. Every
  `[[Page#Heading]]` and every `#fragment` in a library was written against the
  old rule, so the old id is kept on an empty anchor inside the heading and a
  link written last year still finds its paragraph. Where the two forms agree,
  which is most headings, only the heading is emitted.

## 0.0.18.6

- Raw HTML no longer means raw scripting. With "Allow raw HTML in markdown" on,
  whatever an author wrote went onto the page untouched, so `<script>`,
  `<img onerror=...>` and `<a href="javascript:...">` all ran - in the next
  reader's browser, in that reader's SharePoint session. In a document library
  the author is anyone with write access to the library, which is not the same
  set of people as the reader, whatever the property pane hint says. Rendered
  HTML is now sanitised with DOMPurify before it reaches the page.

  Gone: `<script>` in every spelling, every `on*` handler, a `javascript:`
  address in an `href` or a `src` however it is obfuscated, and `<object>`,
  `<embed>`, `<base>`, `<form>` and `<meta>`.

  `<iframe>` stays, because an embedded video is the reason most people turn
  the setting on, but only pointed at a host on a fixed list: YouTube and
  YouTube-nocookie, Vimeo, Microsoft Stream, Forms, Power BI, Teams, any
  `*.sharepoint.com`, and the site the page itself is served from. The host is
  read off the parsed address, so `https://evil.example/?x=www.youtube.com` is
  not YouTube. An `srcdoc` is refused whatever the host, since an iframe
  carrying its own document never visits the host it names.

  Ordinary formatting HTML is untouched: `<sub>`, `<sup>`, `<kbd>`, `<br>`,
  `<details>`, `<summary>`, tables, and a `<div>` or `<span>` with a class.
  With the setting off nothing changes and nothing runs, because markdown-it
  has already escaped every tag.
- A block identifier names its block instead of being shown to the reader.
  Obsidian ends a paragraph, a list item, a quote or a table with a caret and a
  short name, `The build fails on a clean checkout. ^37066d`, hides the marker,
  and links to it as `[[Runbook#^37066d]]`. Here the marker was printed as a
  stray `^37066d` at the end of the sentence and the link that named it had
  nothing to find. The marker now comes off and the block carries the name as
  its id, through the same slug rule a heading id goes through, so the link and
  the block agree without either having to know about the other. It follows the
  **Wiki links** setting, since it is the other half of one. A heading keeps
  the id made from its own words, and a marker with no block in front of it is
  left on the page rather than quietly removed.
- `![[picture.png]]` puts the picture on the page. Obsidian's embed was not
  supported at all: the `!` was printed as a stray character and the brackets
  after it became a link, and `![[Engelbart.jpg|100]]` rendered as a link whose
  wording was "100", because the size was read as the link's label. An embedded
  picture is now an ordinary image, so the folder it resolves against, the
  `|300` and `|300x200` sizes, the lazy loading and the click to see it full
  size all work as they do for a picture written the markdown way. Wording
  after the pipe that is not a size is the alt text.
- An embed of anything that is not a picture is marked as an embed and linked.
  Another document, a PDF or a sound file all have to be fetched to be put on a
  page, and nothing can be fetched while a document is being rendered, so the
  page says what was meant to be here and links to it rather than pretending.
  PDF and audio embeds are not supported; this is what they render as.
- Tags, under a new **Tags** setting beside the wiki links. `#recipe` and a
  nested `#work/urgent` are how a note written in Obsidian says what it is
  about, and here they were plain words with a hash in front. They are now
  marked as tags so a theme can show them as the pills they are, following
  Obsidian's own rules for what may be one: letters, digits, `_`, `-` and `/`,
  at least one character that is not a digit, and nothing joined onto the end
  of a word, so `C#` and `#1984` are not tags. Styled and nothing more: this
  web part cannot see the other documents in a library, so a tag that looked
  like a link would go nowhere. Off by default, like the wiki links, because it
  restyles any word in a document that starts with a hash. There is no argument
  with headings: a heading needs a space after its hashes and a tag cannot
  contain one.
- Tags written down the page in the frontmatter are read at last. The form
  Obsidian's own documentation uses and its editor writes,

  ```
  tags:
    - recipe
    - cooking
  ```

  was being dropped entirely: nothing after the colon was read as no value, so
  the key was skipped, and the indented lines under it were skipped too by the
  rule that only reads top level keys. A document whose properties were written
  in Obsidian arrived with no tags at all. `tags: [a, b]` and `tags: a, b`
  worked before and still do.

## 0.0.18.5

- A line that ends in braces keeps them. `${HOME}` at the end of a list item,
  `{env}` at the end of a heading, a shell variable in the last cell of a table
  and the `\end{align}` closing a LaTeX environment were all being deleted, and
  what was left was a stray `$` or nothing at all. The attribute syntax reads a
  brace group at the end of a block as a list of classes and ids, and it took
  the braces before looking inside them: anything it could not use was dropped,
  along with the text it was holding. Shell variables, template placeholders,
  config keys and LaTeX environments are what a runbook is made of, and all of
  them end a line in braces. The syntax still works, because `{.class}` and
  `{#id}` are documented here and somebody's document uses them; it is now only
  offered a brace group whose every part is a class, an id or a `key=value`
  pair. Anything else is text that happens to end in braces, and stays text.
- A table row with a single backtick in it is a row again. A backtick was read
  as opening a code span, so every pipe after it was taken for part of that
  span and the rest of the row became one cell with a raw pipe showing in it.
  The table GitHub's own documentation uses to explain tables - a column of
  characters, one of them a backtick - came out wrong here. A pipe inside a
  closed code span still stays in its cell, which is the table plugin's own
  extension and worth keeping.
- `\|` inside a code span in a table cell is a pipe. It kept its backslash and
  the reader saw `\|`, because a code span reads no escapes of its own and the
  backslash has to come off before the cell is read as markdown. It is the only
  escape a table cell has, so it is the one that had to work.
- A row with the wrong number of cells is now squared up with the table: a
  short row is padded out and the excess of a long row is dropped, which is
  what every other renderer does with one. A ragged row put cells under no
  heading at all and walked a sortable column out of step with its header. A
  row using the rowspan or colspan syntax is left alone, since how wide it is
  is that syntax's answer to give.
- `~struck~` with one tilde is now struck through, and `H~2~O` is no longer a
  subscript. One tilde used to be Pandoc's subscript, a reading GitHub,
  Obsidian and VS Code all lack: GitHub Flavoured Markdown says one tilde or
  two is strikethrough, and GitHub renders `~deprecated~` struck. So a document
  written anywhere else and read here turned a struck out word into a tiny
  subscript that said the opposite of what it meant, with no error and nothing
  to notice. The collision only runs one way, since nobody writes `H~2~O`
  meaning struck through, and it is settled in GitHub's favour. A subscript is
  now written `$H_2O$` with **Math (KaTeX)** on, or `<sub>2</sub>` with raw
  HTML allowed, both of which work in GitHub, Obsidian and VS Code as well as
  here. `~~this~~`, `10^6^` and a `~~~` code fence are all unchanged.
- An Obsidian comment is no longer published. Anything between a pair of `%%`,
  inline or over several lines, is where an author writes what the reader is
  not meant to read: a note to themselves, a name, a number they have not
  checked. It was rendered verbatim, so a folder of notes moved into a document
  library published every one of those notes along with the documents. Nothing
  gates it, because there is no reading of a comment under which showing it is
  what the author wanted. A `%%` with nothing closing it is left on the page
  rather than hiding everything after it, which is what Obsidian does with one:
  a document that quietly comes back shorter than it is would be the worse
  failure.

## 0.0.18.4

- A real site name is out of the tests, out of a source file's header and out
  of this changelog. It arrived the way these always do: a fault was reported
  against a real document, and the reproduction was pasted in as the test case
  for it. The paths are invented now and still exercise what they were written
  for, which is spaces surviving encoding.
- The guard that was supposed to stop that has been widened, because it had two
  holes and the name went through both. It never knew this name, and it only
  read prose: samples, the README, the site pages. Tests and source were not
  covered, and those are exactly where a reproduction lands. The name check now
  reads everything that ships or is read by a person. The host check stays on
  prose, because source names real hosts on purpose - the sanitiser's iframe
  allowlist is a list of them - and running it over code would fail on the code
  doing its job.
- A Share button in the toolbar, which copies the address of the document on
  screen. A reader three links into a wiki is looking at something the page's
  own address says nothing about: it still reads Wiki.aspx, so sending it to a
  colleague sends them to the front page. The button builds the same
  `?strataDoc=` address a menu entry uses, so what arrives is the document they
  were looking at. At the page's configured document there is nothing to add,
  because the page address already is its address. It appears only where that
  address would be honoured coming back in: a button that copies a link leading
  somewhere else is worse than no button.
- A document whose name contains a `#` can be named in an address. The value is
  decoded before it is read, at which point a `#` in a file name looks exactly
  like the one that separates a heading, so `What is #1 + why.md` was read as a
  document called "What is " and refused for not being markdown. The split is
  made at the extension now rather than at the first `#`.
- A page address naming a document that cannot be opened now says so, to
  whoever can fix it. `?strataDoc=` is ignored unless "Open a linked document
  here" is on and the source is a library or a URL, and unless the value names
  a markdown file with its `&`, `#` and `+` written as `%26`, `%23` and `%2B`.
  It was ignored in silence, so the page showed the document it was configured
  with, which is exactly what a menu entry pointing at the wrong file looks
  like. Shown only in page edit mode: it names a setting to change, which is
  not a reader's business and not a reader's to fix.

## 0.0.18.3

- The split editor is one editor again. The box you typed in stopped at its own
  minimum height while the preview beside it ran on to the bottom of the row, so
  the source ended halfway down with an empty area under it. The two halves did
  not start level either: the MARKDOWN label sat above its box while PREVIEW sat
  inside the preview's border, which put every line of source a label's height
  below its own rendering. Each pane is now a label above a box, both boxes are
  stretched into the same row, and the textarea has lost its drag handle because
  the pane decides how tall it is. They also scroll together, by the proportion
  of the way down each one is rather than by pixels, because the source is
  monospace text and the preview is headings, code and pictures and the same
  line is never at the same height in both.
- A page can be told which document to show in its address, so a SharePoint
  menu is a menu again. Every entry on a navigation bar can only point at a
  page, and a page showed the one document it was configured with, so a wiki's
  menu worked exactly once: a reader reached the home document and had to find
  everything else by following links out of it. A menu entry can now name a
  document, `Wiki.aspx?strataDoc=/sites/wiki/Shared%20Documents/Runbooks/Database.md`
  or the short form relative to the configured document, with `%23Heading` on
  the end to land on one. The document opens exactly as a followed link does,
  with the bar above it going back to the page's own. The value is written by
  whoever wrote the menu, so it is checked rather than trusted: only a markdown
  file is accepted, and anything else is ignored quietly, because a menu entry
  somebody mistyped is not the reader's problem to read about.
- Opening the editor while a reader had followed a link put that document's
  text in the box with the configured file's name on the save button. The
  editor writes to the configured file, so saving would have replaced one
  document with another without a word, and typing corrupted the configured
  content whether or not anybody saved. The editor is withheld there now, and
  says why.

- A click on a link to another document went to the page before it went to the
  web part. A modern SharePoint page is a single-page application with a router
  listening for clicks on the whole document, and capture runs from the root
  downwards, so a listener on the link lost the race however it was
  registered. The router put the .md file's address in the address bar and
  handed the reader the download this feature exists to replace, while the
  document quietly opened underneath - which is why a single click downloaded
  and a second click appeared to work, why the address bar ended up pointing at
  a file, and why refreshing downloaded it again. The click is now taken on the
  window, which is above the document on that path, so the router never learns
  it happened. Opening in a new tab is untouched: the address is still on the
  element and only a plain left click is taken.
- Sync to Teams works again, and now deploys the manifest written here rather
  than one SharePoint generates. SharePoint looks inside the .sppkg for
  ./teams/TeamsSPFxApp.zip and, when it is there, publishes that instead - so
  the descriptions, the documentation link and the tab's configuration page are
  all ours, and an update to the Teams app arrives the way an update to the web
  part does, by uploading one package. The manifest also carries the
  webApplicationInfo entry the documentation requires, without which an API
  call from the Teams desktop and mobile clients fails.
- The app catalog listing says which language it is in. `supportedLocales` had
  never been set, so the store page read "Supported languages are not
  specified".

- A table row written in brackets is no longer swallowed. A row whose first
  cell opens with `[` and whose last cell closes with `]` was read as the
  table's caption, which left a caption nobody wrote, a table with no body at
  all, and no sign on the page that a row had ever been there. `[x] | [y]` is
  one shape it happened to; `[[Wiki]] | ![[Embed]]` is another, and that is how
  Obsidian's own documentation writes a table of links. When the swallowed line
  was the header rather than a data row the whole table was lost and the block
  rendered as a paragraph of raw pipes. Captions still work, because they are a
  real feature of the table syntax and a caption is worth keeping: they are now
  only read on a line that holds no pipe, which is a line that could never have
  been a row.
- A wiki link written with an escaped pipe points at the document it names. A
  pipe inside a table cell ends the cell, so `[[Basic formatting syntax\|Markdown
  syntax]]` is how Obsidian documents writing a labelled wiki link in a table.
  The backslash was being left on the page name, so the link asked for
  `Basic%20formatting%20syntax%5C.md` and could only ever be a 404.

## 0.0.18.2

- A wiki link to a document whose name has a space in it could never open it.
  The link is written as a page name and turned into a href, which is
  percent-encoded because a href has to be - and that encoded string was then
  handed to SharePoint as a file path, which SharePoint encodes again, so it
  asked for a file nobody has ever named. The same fault ran through link
  checking: the folder was asked for encoded, found nothing, and every link in
  the library went unchecked in silence. A library called "Shared Documents"
  was enough to trigger it, which is most of them.
- Nothing caught it because every document in the tests and the harness had an
  ASCII name, where the encoded and unencoded strings are the same string. The
  harness library now has an index at its root, a subfolder, and a document
  called "Deploy notes.md", and a browser check clicks the wiki link and reads
  what comes back. One of the existing tests had the fault written into it as
  the expected answer, and now says why it does not.

- A web part nobody has configured now says so. It used to render the sample
  document, which looks exactly like a configured web part showing a document
  about Markstrata, so the one state that needs an instruction was the one
  state that gave none. It now starts empty and says where the way in is, and
  because that differs by host it is worded per host: on a page being edited,
  the property pane, with the sample one click away for anyone who wants it; on
  a published page, that somebody who can edit the page has to choose a
  document; in a Teams tab, the tab's own settings, because a tab has no
  property pane and telling somebody to open one is telling them to do
  something impossible.
- The Teams app package is written here now, by hand, rather than generated
  from the solution by Sync to Teams. Sync to Teams writes a manifest nothing
  in this repository can influence, and what it wrote was wrong in three ways
  that all showed: the short and full descriptions were both the word
  "Markstrata", so the app described itself by repeating its name; the
  Documentation link was empty and could not be filled, because SPFx has no
  field that maps to the manifest's `publisherDocsUrl`; and the tab's
  configuration page - the step where a document is chosen - was a placeholder,
  which meant a tab could be added to a channel and then never pointed at
  anything. `teams/manifest.json` is the manifest, written against the v1.17
  schema, and seven tests hold it to the limits that schema states, since a
  short name over 30 characters is refused at upload and the admin centre is a
  slow place to learn that.
- `npm run teams` builds it: the manifest and the two icons, zipped into
  `dist/teams/markstrata-teams.zip`, with the version stamped from
  `package.json`. A tenant uploads that zip in the Teams admin centre instead
  of pressing Sync to Teams, and removes an app an earlier sync left behind so
  there are not two of them. Nothing new is hosted - the tab loads the
  component already in the app catalog, through SharePoint's own Teams hosting
  page, so the `.sppkg` is still what has to be installed first.
- The app catalog's About page has screenshots on it. `screenshotPaths` had
  been left empty because the SPFx schema says only that relative paths are
  resolved against "the base package directory" without saying which directory
  that is; it is `sharepoint/`, the same base as `iconPath`, so the three
  images now live in `sharepoint/screenshots/` and are carried into the package
  beside the icon. A test fails if the config names a file that is not there,
  because a missing screenshot fails the whole package and release time is
  where that would have surfaced.
- `scripts/build-strings.js` writes the generated file's own header. Every code
  file here opens with one and a test says so, but `en-us.js` is overwritten
  every time the generator runs, so the header that had been added to it by
  hand survived exactly until the next regeneration.

## 0.0.18.1

- The app now tells a tenant the truth about itself. Its website, privacy
  policy and terms of use all pointed at the same private GitHub repository,
  which is a 404 for everyone who installs it, and it carried no category at
  all, so it arrived filed under nothing. The three addresses are now three
  real pages on markstrata.com, and the categories are Content management,
  Productivity and Collaboration. This is what the SharePoint app catalog shows
  an administrator and what Teams shows on the app's About page.
- Which meant writing the two pages that were being linked to and did not
  exist. The privacy page says what the web part reads, that your documents
  never leave your tenant, that there is no telemetry in it, that nothing is
  fetched from a third party while it runs, and that the only thing remembered
  is a reader's own theme choice in their own browser - and, separately, that
  this website counts visits with Google Analytics. The terms page says MIT,
  as is, and not a Microsoft product. Both are linked from the site footer and
  kept out of the navigation, which is for pages somebody is looking for.
- A test reads the package metadata and fails on an address that is not https,
  that points into the private repository, or that is the same page as one of
  the other two, and on a category the SPFx schema will not accept - checked
  against the list in the schema rather than a copy of it.

## 0.0.18.0

- Markstrata runs as a **Teams tab**. A channel's Files are a SharePoint
  document library, so the same web part pointed at the same libraries works
  in a channel with nothing new underneath it: the Teams app package is
  generated from the solution by Sync to Teams in the app catalog, using the
  two icons now built into it from the brand package. The colour one is
  delivered at 192; the outline one is drawn here, because Teams wants
  something the brand package has no reason to hold - 32 square, transparent,
  and white all through, since Teams tints it itself.
- It stopped claiming to be a Teams **personal app**. That was in the manifest
  for four versions and never worked: a personal app has no site behind it, and
  every picker in the property pane is a picker over a site, so installing it
  personally got a pane that could not configure anything. Supporting it
  properly means a different content source, not a different manifest line.
- The web part records which host it is running in, as the host reports it, on
  its own element as `data-strata-host`: `sharepoint`, or `teams-desktop` and
  the like. The differences between the two - whether the page theme follows
  the client, whether printing does anything - are the ones nothing here can
  reach, so rather than guess at them in code the question is made answerable
  from a tenant. Nothing has been changed on a guess.
- Which is the other half: the hosts the harness cannot reach now have a manual
  check list in CONTRIBUTING.md, to be run in a tenant before a release is
  recommended. A host nobody checked is a host nobody supports, whatever the
  manifest says - which is how the personal app claim survived four versions.

## 0.0.17.2

- Working out how far below the page's chrome a heading has to land no longer
  reads the whole page to do it. It asked every element in the document where
  it sat, which on a page holding a long document is mostly that document -
  and it asked again on every resize event, of which dragging a window edge
  raises tens between two frames. On a four hundred item document that was 452
  elements measured per event and 9,040 in a burst of twenty; it is 15 either
  way now. The web part's own content is skipped as a subtree rather than
  element by element, and a burst of resizes measures once, on the next frame,
  because nothing the browser has not drawn yet can have moved.

- Printing a SharePoint page that has this web part on it no longer reformats
  the rest of the page. SharePoint loads a web part's stylesheets into the page
  itself, beside its own, so three rules that named elements rather than this
  web part's classes were rules about everything there: every table and every
  heading on the page took the web part's page-break handling, and every
  external link on it - SharePoint's own navigation included - printed with its
  address spelled out after it. On screen nothing showed, which is why it sat
  there since 0.0.6.
- Every selector in every stylesheet is now checked to be scoped to the web
  part, and a browser check prints a page and looks at a link outside the web
  part to prove it.

- Whatever happens to this web part now happens to this web part. SharePoint
  hosts many of them in one page and one React tree, so an exception that
  escapes a web part is the page's exception, not the web part's - which is
  how 0.0.17.0 managed to take whole pages down rather than just showing
  nothing where it was. Starting, drawing and stopping are each wrapped now: a
  web part that cannot start draws a short message in its own box and says why
  on the console, the page carries on around it, and an author can still open
  the property pane on it to see what is set.
- The pane and the settings on it survive that too. Describing the pane read
  the lists it offers straight off the thing that fetches them, which a web
  part that failed to start never built, so opening the pane on a broken web
  part threw a second exception into the page. It now offers empty lists.

- The harness can now run the web part, not only the classes underneath it.
  `npm run harness` builds a second page that starts `MarkstrataWebPart` the
  way a SharePoint page starts it - onInit awaited, render called, onDispose on
  the way out - against stand-ins for SharePoint small enough to read in one
  sitting. Nothing about the web part is stood in for; it is compiled from src.
  This is the gap 0.0.17.0 went out through: the lifecycle had never run
  outside a tenant, so a web part that could not start at all passed every test
  and every browser check there was.
- The page also runs the settings pane, drawn from the description the web part
  returns rather than a copy of it, so the lists SharePoint fills in are
  visible - the other half of the same release, where they came up empty.
- Eleven browser checks go with it, including the ones for a web part put away
  while it is still starting, and one put away having never started at all.
  Against 0.0.17.0 every one of them fails, with the two errors that release
  produced and in the order it produced them.

## 0.0.17.1

- Fixes a web part that did not load at all in 0.0.17.0. It built its markdown
  processor from settings that ask which document is open, and did not build
  the thing that answers that until fifty lines further down, so starting up
  threw every time. SharePoint then put away a web part that had got half way
  through starting, the shutdown assumed everything had been built and threw as
  well, and that second error - `Cannot read properties of undefined (reading
  'dispose')` - was the only one anybody saw. Shutting down now checks for what
  it is shutting down, so a failure to start shows what actually failed instead
  of being replaced by a failure to stop.
- The property pane's library, folder and file lists come back. They were built
  from a connection to SharePoint that had not been made yet, so they were
  asking nothing and came up empty.
- Both of those were mine, from the refactoring in 0.0.17.0, and neither was
  something a compiler could see: every field was declared, and the order they
  are filled in is not a thing a type checker reads. So the order is now read
  by a test, which follows a helper down to the field it reads and fails if
  anything in the start-up sequence uses something built later. It fails on
  0.0.17.0, both times.

## 0.0.17.0

- A link to another markdown document opens that document in the web part
  instead of handing the reader the file. Wiki links, link checking and
  `[[Page#Heading]]` all shipped already; what none of them did was let you
  read the page at the other end, because SharePoint answers a click on a .md
  with raw text or a download. A bar above the document says which one is open
  and goes back to the configured one, the browser's Back button works, and a
  link naming a heading lands on it. Opening in a new tab still goes to the
  file. New on the Contents page of the pane as **Open a linked document here**;
  it needs a document library.
- Nothing about following a link is written into the page's configuration. The
  web part still shows the file it was configured with, and the next reader
  starts there. Version history is hidden while another document is open, since
  the versions it lists are the configured file's, and auto-refresh no longer
  pulls a reader off a document they followed to.
- A relative link now points from the folder the document is in rather than
  from the page hosting the web part. `[deploy](deploy.md)` in a document in
  /Runbooks meant /Runbooks/deploy.md and resolved to /SitePages/deploy.md.
  Images have been resolved against the document's folder from the start;
  links never were. This applies to every relative link, not only markdown
  ones.

- A long table keeps its header row in view while the rows go past, so the
  columns still mean something halfway down. It holds under whatever is stuck
  above the page, the same offset a heading scrolled to clears itself by. A
  table too wide for its column keeps its sideways scroll box, and a header
  inside a scroll box has nothing to stick to, so those are unchanged; which
  tables are which is measured rather than assumed, and measured again when the
  column changes width.
- **Let readers sort a table**, new on the Code page of the pane. A click on a
  column header sorts by it, a second reverses it, and a third puts the rows
  back in the order the document wrote them. What a column holds is read from
  the column, since markdown has no types: numbers only if every filled cell is
  one, dates only if every filled cell is an unambiguous date, text otherwise.
  01/02/2024 is deliberately not a date - it means two different days to two
  halves of the world, and sorting it as either is a confident wrong answer.
  Empty cells go to the end either way, ties keep the document's order, and a
  table with a merged cell in it is left alone.

- A diagram opens full size when it is clicked, the way a picture already did.
  It was the one thing on a page most likely to be too small to read and the
  one thing that did nothing when clicked. It opens as a drawing rather than as
  a picture of one, so it is as sharp at full width as it was in the column,
  and it is given a background of its own, because a diagram carries none and a
  light-theme one would otherwise open as an empty rectangle. There is an
  **Expand** button beside **Copy** for a keyboard, and the setting is the one
  that already governed pictures, now named for both.

- The toolbar is laid out by what its controls do. What the document is sits on
  the left - the theme list and how long the document takes to read - and what
  you can do to it sits together at the right in one bordered group: reload,
  history, print, and light or dark. Three loose buttons of whatever width
  their words needed now read as a single control.
- Reading time is a pill with a clock in it and reads "4 min" rather than
  "4 min read" in plain grey text. The whole phrase is still there for a
  pointer and a screen reader.
- The reload, history and print buttons carry icons, drawn inline so nothing is
  fetched and each follows the theme it sits in. In a narrow column the labels
  step aside and the icons carry the buttons, but the words stay in the markup,
  so a screen reader still says "Reload" rather than announcing an unnamed
  button.
- Light and dark is one button at the far right, named for what it switches
  and reporting whether it is on, rather than a button that renames itself. Its
  icon shows the mode the page is in - a sun on a light page, a moon on a dark
  one - and travels between the two rather than swapping one glyph for another,
  so the icon and the page turn together. A reader who has asked for less
  movement gets the new icon and none of the travel.
- The toolbar is padded evenly above and below. It carried 6px above and 10px
  below, which read as a bar hung high in its own strip.

Under the hood, with nothing to see in a tenant:

- ContentEnhancer was one class of 1,482 lines holding thirteen unrelated
  behaviours; each now lives in a file named for what it does, behind a facade
  with the same methods, so no caller changed. The property pane, the reader's
  theme choice, the document a reader followed a link to and the lists the pane
  offers all moved out of the web part in the same way, taking it from 823
  lines to 680. Following a link and the browser's Back button are now driven in
  a browser, which they never were.
- Every abbreviated name was given its word back - idx, cls, btn, el, bg, buf,
  cfg and the single letters - and every file opens with a header saying what it
  is, how it is used, which release it dates from and what it needs. A test
  keeps that true, and it caught a real one on the way in: a string in the
  property pane's generator carried an unescaped apostrophe, so
  `node scripts/build-strings.js` had not run since the day it was added.

## 0.0.16.0

- The property pane is laid out in five pages of comparable length instead of
  four that ran 8, 16, 5 and 18 fields. Settings that belong together are
  together now: picture alignment sat under Reading while opening a picture
  full size sat two pages away under Features, and Features itself was a grab
  bag holding diagrams, maths, raw HTML, wiki links, the toolbar and the file
  footer. Nothing changed its meaning or its default, only where it is found.
- Mermaid 12. Flowcharts, state and class diagrams are laid out by ELK now
  rather than dagre, which routes edges as right angles instead of curves and
  rounds the node corners. Every diagram this project ships was rendered
  through both versions first: all of them render, the gantt is unchanged, and
  the theme colours survive because the palette sets its own `nodeBorder`,
  which turns off the gradient the new look would otherwise paint.
- The flowchart `curve` setting is gone, because ELK routes its own edges and
  ignored it: asked for `basis` and not asked at all produced identical paths.
  A setting that does nothing is worse than no setting.
- Diagrams now need a current browser. Mermaid 12 targets ES2024 and Safari
  17.4, so on iOS 16 and earlier the library does not load and each diagram
  shows a message in its place, while the rest of the document renders as
  usual. The package grows from 2.07MB to 2.58MB, and a page carrying a
  diagram fetches about 460KB more.
- The theme screenshots are regenerated, since the layouts they show changed.

## 0.0.15.0

- A heading scrolled to no longer lands under whatever is stuck above it. The
  clearance was a fixed 24px in the stylesheet, which is right for a bare page
  and too small for any real one: on the site a header and a controls bar
  covered the heading, and on a SharePoint page the suite header and command
  bar do the same. It is measured now, from whatever is actually stuck there,
  and re-measured when the window changes.
- The last few entries in the contents can be reached. A heading was marked
  when it passed the reading line, which needs a screenful of document below it
  to get there, and the last headings never have one: the page runs out first,
  so the highlight stopped short of the end however far you scrolled. At the
  end of a document the last entry is what is being read.
- A page opens in the reader's colour mode instead of flashing. Both builders
  decided the mode at the foot of the page, so a page was drawn light, painted,
  and then repainted dark: a white flash on every load for anyone reading in
  the dark. It is decided in the head now, before anything is painted.
- Clicking a contents entry marks it even when there is no scroll left to make.
  Near the end of a document, clicking one of the last entries moved nothing
  and changed nothing, so the contents appeared to ignore them.

## 0.0.14.0

- A **Syntax** page on the site lists everything the web part renders, with the
  markdown you write beside what it turns into. It is built through the same
  pipeline as any other page, so an example that stops working stops working in
  public, and a test renders it and fails on anything it claims but does not
  show or a setting it names that the pane does not have.
- The site's own pages run the web part's behaviour instead of a subset of it.
  They were rendered ahead of time and given none of what happens after a
  render, so a documentation page had a contents that did not follow the
  reading position, code blocks with no copy button, no way back to the top,
  and external links that navigated the whole page away. The real class is
  bundled and called now rather than the site keeping its own copy of each
  behaviour.
- Documentation caught up with the features added since it was last read
  through: frontmatter, sizing and placing pictures, captions, the full size
  view, called-out code lines, wiki links and checking them, reading time and
  the back to top button were all in the product and not on the site.

- **Picture alignment** places block images left, centred or right, left by
  default. It also fixes an inconsistency: a captioned image centred itself
  while a plain one sat left, so whether a picture was centred depended on
  whether its author had given it a title. A document can still place one
  picture itself with `![alt](x.png){.center}`.
- The documentation page no longer shows two tables of contents. The site's
  pages are built by a different builder from the web part, with its own
  contents code, so preferring a contents the document wrote for itself had to
  be taught to it separately.

- Wiki links to pages that are not there are marked, the way Obsidian marks an
  unresolved link. The links are grouped by folder first, so a document
  pointing at its neighbours costs one folder listing rather than one request
  per link, and the listing is cached per folder. A folder that cannot be read
  leaves its links alone: not knowing whether a page is there is different from
  knowing it is not, and a reader without access to a folder must not be told
  the author's links are broken.
- The documentation site shows the contents in a left sidebar on every page,
  rather than stacked above the text.

- A fence can call out the lines that matter, ```` ```js {2,4-6} ````, the
  convention Docusaurus and VitePress use. The rest of the block is faded
  rather than the called lines tinted, because a tint has to be a colour and a
  colour behind syntax highlighting either fights it or cannot be seen; hover
  brings the block back, and paper never fades it.
- **Wiki links**, off by default, turns `[[Another page]]` into a link to that
  file, with `[[Page|worded differently]]`, `[[Page#Heading]]` and `[[#Heading]]`
  all understood. The name resolves against the folder the document lives in,
  the same rule images follow. Whether the page exists is not checked, since
  that is a request to SharePoint for every link on the page.

- **Back to top button** floats above the page once the reader is a screenful
  past the top of the document, at the bottom left or bottom right, or off. It
  goes back to the top of the web part rather than the top of the page, which
  is what back to top means from inside a document that is one section of
  somebody's page, and it moves whichever thing is actually scrolling: a
  SharePoint page scrolls an inner container, not the window.
- **Show reading time** puts an estimate in the toolbar, counted from the text
  a reader actually reads. Code blocks and diagram source are left out, since
  neither is read at the speed of prose; on the kitchen sink that is close to
  half the words on the page.

- YAML frontmatter is taken off the front of a document instead of rendered.
  Markdown has no frontmatter: the opening `---` is a thematic break and the
  closing one is a setext underline, so a file from Obsidian, Hugo, Jekyll or
  Docusaurus opened with a rule and then a title-size heading made of its own
  metadata, which also led the table of contents above the document's real
  title. What the block held is offered to the file footer instead: a title
  names the document better than a file name that is usually a slug, an author
  in the document wrote it rather than merely saved it, and tags show as chips.
- Images can be given a width, after a pipe, the way Obsidian writes it:
  `![alt|300]` or `![alt|300x200]`. Unsupported, that syntax did not simply
  fail to resize, it left the digits in the alt text for a screen reader to
  read out. The number is set as the width attribute rather than as a style,
  which gives a lazily loaded image an intrinsic size, so the text below it no
  longer jumps as each picture arrives. The aspect ratio is always kept.
- An image that is a paragraph of its own and carries a title becomes a figure
  with that title as its caption, rather than a tooltip a touch screen never
  shows and a printed page loses. An image inside a sentence stays there.
- **Click an image to see it full size** opens it over the page, which
  documentation wants because it is mostly screenshots and a column is
  narrower than a screen. Escape or a click outside closes it, focus returns
  to the image, and an image that is a link is left alone.
- A contents the document wrote for itself is used instead of a generated one.
  A document with `[[toc]]`, or a hand-written list of heading links under a
  Contents heading, used to show two: its own in the text and ours beside it.
  A hand-written list is usually a deliberate subset, so it is taken as a
  decision and adopted whole, keeping the indentation, smooth scrolling and
  reading-position tracking. With the contents switched off, an authored one
  is left where it was written.

## 0.0.13.0

- The web part can take the height it is given rather than only the height of
  its content. **Fill the available height**, on the Appearance page under
  Reading, gives it at least the room below where it starts, so a short
  document no longer stops halfway down and leaves the page canvas showing
  under it. With the file name and modified date shown they sit at the bottom
  of that, which is usually the reason for turning it on. The room is measured
  on the page rather than written as `100vh`: a SharePoint page scrolls an
  inner container under a header and a command bar, so a viewport unit
  overshoots by however tall that chrome is, the same reason the contents
  sidebar stopped guessing at its own cap. A web part placed under other
  content on a long page has no room below it and is left as it is, and the
  default is off, so nothing already on a page changes.

## 0.0.12.0

- The property pane has four pages instead of three, grouped by what you came
  to change. The table of contents has a page of its own, since between its
  position, its depth and its width there is more to it than one setting.
  Appearance keeps the theme, reading and code blocks. Features is what is
  rendered and what is drawn around it, split into **Rendering**, **Toolbar**
  and **File information**; the toolbar and the file footer used to sit under
  Reading, between content width and text size. Content is unchanged. No
  setting changed its meaning or its default, only where it is found.
- Fixed a fault that would have emptied the pane's labels. `loc/en-us.js` is
  generated, and nine strings had been added to the generated file and never to
  the generator that writes it, so the next run of the generator would have
  deleted all nine and nothing would have failed until the pane opened in
  SharePoint with blank labels. The two are back in step and a test holds them
  there, along with the typings and what the web part actually reads.
- The demo page's property pane matches the real one, and gained **Wide
  diagrams**, which it had never carried. The two panes are separate literals
  in separate files, so a test now compares them page by page and group by
  group, and the pane is driven in a real browser along with the rest.
- The kitchen sink shows everything it is meant to. Seven documented features
  were missing from it: spanning table cells, emoji, abbreviations, subscript
  and superscript, the `wrap` and `numbers` fence flags, and an inline
  `[[toc]]`. It is the document the theme screenshots, the demo and the themes
  page are all built from, so a feature absent from it was invisible in all
  three. A test now renders it and fails on anything documented that it does
  not show.
- Documented the settings that had never been written up: code text size, the
  contents depth, heading link anchors, and the pinned file footer.


- The contents sidebar no longer runs off the bottom of the page. Its height was
  capped at the viewport height less a fixed allowance for whatever sits above
  the web part, which is a guess, and on a SharePoint page it is the wrong one:
  the page scrolls an inner container under a header and a command bar, so the
  sidebar was sized past the bottom of the visible area and its last entries
  could not be reached until the page was scrolled to the end, when they
  appeared all at once. The cap is now measured from where the sidebar actually
  is and from the container that actually scrolls, and it is re-measured while
  scrolling and on resize.
- The file name and modified date can be kept in view. **Keep it in view while
  scrolling** pins them to the bottom of the web part instead of leaving them at
  the end of the document, where a long document means never seeing them.


- The contents sidebar has a width setting. **Auto** fits it to its longest
  entry, floored so a short document still reads as a column and capped so one
  deep heading cannot take the page; that is the default. **Fixed** adds a unit
  and a width, as a slider for finding one by eye and a box for typing one you
  already know, in `em`, `%`, `px` or `vw`. The slider's range follows the unit,
  since 240 is a reasonable width in pixels and an absurd one in em, and a width
  that stops making sense when the unit changes is replaced rather than kept.
  The unit and width only appear once a fixed width is chosen, and the whole
  setting only appears with the contents in a sidebar.


- Every diagram carries a copy button in its top right corner, which puts it on
  the clipboard as a PNG drawn at twice its size on the page, so it stays sharp
  pasted into a deck or a document. A diagram was the one thing on the page
  nobody could copy out: selecting it gets the source, not the picture. The
  button stays faint until the diagram is hovered, and is always there on touch
  and for a keyboard.
- Wide diagrams fit the column instead of scrolling or shrinking. A gantt lays
  out from its time axis rather than wrapping, so it asks for more width than an
  article column has. It is now laid out at the column width, which compresses
  the axis and leaves the text the size it is set to: no scrollbar, no shrunken
  labels. **Wide diagrams** in the property pane offers the other two if they
  suit a document better, keeping their size and scrolling, or scaling down.
- The documentation site's pages configure each diagram the same way, from the
  same function, rather than initialising mermaid once for the page.

## 0.0.11.0

- Gantt charts are readable, which 0.0.8 and 0.0.9 both claimed and neither
  delivered. The size in the stylesheet was never the size on screen: an SVG
  with a viewBox is scaled to fit its box, and a gantt lays out wider than the
  column it sits in, so the labels arrived shrunk by a factor that depends on
  the column. It ran about 0.85 where it was measured and 0.67 in the harness,
  which is how 16px reached a page at nearer 10px, beside 15px body text.
  Raising the number could not fix that reliably because the scale moves.
  The chart now keeps its natural size and a wide one scrolls, so the text is
  exactly the size it is set to, at any column width.
- A wide diagram no longer loses its left edge. The container centred its
  contents, and a centred flex item that overflows cannot be scrolled back to,
  so about 30px of a wide chart was unreachable. Centring is now done with an
  auto margin, which collapses when the diagram is wider than the column.
- The harness measures what reaches the screen rather than what the stylesheet
  says, and compares it against the page's own body text. The previous check
  read the computed font size, which is what let two releases go out reporting
  a fix that readers could not see.

## 0.0.10.0

- Versions are four-part from here on, matching what SharePoint compares when
  it decides whether an uploaded package is an upgrade. The same number goes
  into the tag, the release, `package.json` and the solution manifest, so there
  is one version to read rather than a three-part one and a four-part one that
  have to be kept in step. npm accepts it because this package is private and
  never published to a registry. A three-part tag still works and is treated as
  build zero.
- Release notes are matched to their changelog section by the whole version
  rather than by a substring of it. Asking for 0.0.1 returned the 0.0.10.0
  notes, which four-part numbers make easy to hit since every version is a
  prefix of a longer one. Both spellings of a version now find their section,
  so the entries written before this still resolve.
- `scripts/set-version.js` can be pointed at another directory, so the test
  that checks what it writes cannot rewrite the real manifests. It could, and
  it did.

## 0.0.9

- Gantt text is readable next to body text, which 0.0.8 did not manage. Two
  things were missing. A gantt lays itself out wider than its container and
  `useMaxWidth` then scales the whole SVG down to fit, so 13px was landing at
  about 11px on screen beside 15px body text. And `gantt.fontSize`, which sets
  the size the layout is measured at, was not being set alongside the size that
  is actually drawn, so the two could disagree. The text is now 16px with the
  layout measured at the same, which lands at or just above body text once the
  scaling is applied.

- The gantt fix reaches the documentation site. The site's static pages
  initialise mermaid in an inline script rather than through the renderer
  class, and carried their own copy of the configuration, so 0.0.8 fixed gantt
  legibility on a deployed web part and left the site as it was. Both now read
  `utils/mermaidConfig.ts`, and a test fails if either starts spelling the
  options out for itself again.
- Full width works on the demo page. The page caps the web part at 1100px the
  way a SharePoint section caps it, which made full width identical to wide
  there while working correctly on a real page. The cap now steps aside when
  full width is chosen.

## 0.0.8

- Room at the sides of the web part, matching the room already at the top and
  bottom. The toolbar's last button and a left contents sidebar sat hard against
  the edge of the panel, which reads as clipped rather than as a margin. It
  follows the spacing setting like the block padding does, and the content
  column still centres in what is left.
- The property pane says what the toolbar setting takes with it. The print
  button lives in the toolbar, so "Only while editing the page" hides it from
  readers while the toggle still reads On. The toggle is now disabled unless the
  toolbar is set to Always, and a line under the setting explains what else goes
  with it.
- The file name and last modified footer is disabled in the pane unless the
  content comes from a document library, which is the only source that has a
  file name and a modified date to show. It read as On and did nothing for
  content typed into the web part or fetched from a URL.

- The site follows the reader's system colour scheme. Every page starts in dark
  mode on a machine set to dark, the surface around the web part moves with it
  rather than leaving a dark document on a white page, and a mode chosen on the
  page is remembered and wins from then on. Storage is guarded, so a private
  window still gets the right mode, just not the memory of it.
- The README is about half its length. Everything the website documents now
  links to the website instead of being repeated: syntax, settings, the theme
  detail and the reasons behind the project. What stays is what a reader of the
  repository needs and cannot get from the site: what it is, how to build it,
  the security posture, how to work on it and where things live.

- Gantt charts are legible. Mermaid draws their axis at 10px and their task and
  section labels at 11px, and unlike a flowchart a gantt re-lays out to the
  container rather than scaling, so the text stayed that size however wide the
  column was. Mermaid's own `gantt.fontSize` does not reach those elements: its
  generated stylesheet targets them by diagram id, which outranks our
  stylesheet, so the override goes through `themeCSS` instead.
- The demo page has a property pane. It mirrors the web part's own, three pages
  with the same groups and the same labels, docked to the right the way
  SharePoint docks it, and everything on the Appearance and Features pages
  changes the web part as you would expect. The Content page is filled in for
  appearance only, which the pane says on the page rather than leaving a
  visitor to discover it. The reader's theme switcher starts off there, since
  the pane already sets the theme; the bare development harness keeps it.
- The demo page also has a way into the editor. The intro text had invited
  people to "switch to the editor and type" since the page was written, but the
  only way in was a console call.
- The kitchen sink exercises images and a gantt chart: a relative source, a data
  URI and a reference-style definition. Note that markdown-it allows `data:`
  only for png, gif, jpeg and webp, so an SVG data URI is refused; an SVG can
  carry script.

## 0.0.7

- No em dashes in anything this project ships. They were in the README, the
  contributing guide, the theme guide, the changelog, the sample documents and
  the web part's own sample content, which is the copy a reader meets first
  inside SharePoint. Each one was rewritten rather than swapped for a hyphen,
  so the punctuation still suits the sentence. The site guard that already
  checked this now covers the prose files too, and it fails with the file and
  the surrounding words.

- The App Catalog lists the app as "Markstrata - Markdown Web Part for
  SharePoint Online" rather than the scaffold's `markstrata-client-side-
  solution`, and the feature is titled Markstrata.
- The toolbox and full-page apps picker show the web part tile - markdown open
  in an editor - instead of the brand mark. The mark is already the app catalog
  icon, so showing it in both places said nothing about what the web part does.
  It is inlined into the manifest, which loads with the web part on every page,
  so it is re-encoded at a lower quality than the copy the site uses: 12 KB
  against the 690 characters the SVG took, and a test caps it at 20 KB.
- The app tile shows. The packager writes `<AppIconPath>` as the base name of
  `iconPath` but copies the file to `iconPath` itself, so a tile under a folder
  shipped to `assets/icon.png` while the manifest asked SharePoint for
  `icon.png`. Nothing failed: the upload succeeded and the app simply wore the
  generic package tile. The icon is now `sharepoint/icon.png`, flat, where both
  agree, and a test rejects any `iconPath` containing a separator.

## 0.0.6

- Markdown images render. A relative source is resolved against the folder the
  markdown came from rather than the page the web part sits on, which is what
  `![Flow](images/flow.png)` means on GitHub and in every editor, and what a
  browser gets wrong on a SharePoint page. Absolute URLs, protocol-relative
  URLs, data URIs and server-relative paths pass through untouched, and paths
  are encoded a segment at a time so a folder called `Q&A` survives. Images are
  given `loading="lazy"` and `decoding="async"`.
- Changing a processor option no longer rebuilds markdown-it when the value is
  the same as the one already set.
- Renamed to **Markstrata**. The solution, web part and feature GUIDs are
  unchanged, so pages keep their settings; the package is now
  `markstrata.sppkg`, the CSS prefix is `strata-` and the token prefix
  `--strata-`.
- The brand system is delivered in `assets/markstrata-brand-v1/` and is the
  master for everything visual. `npm run brand` no longer cuts assets from a
  single SVG: it copies the right file out of the package into each place the
  build expects, and renders only the two composites made from brand artwork.
- The release workflow can replace a release. Re-running a version that
  already exists used to re-upload the package but leave the tag where it
  was, which strands it if the history has moved since. The new `replace`
  input deletes the release and its tag first, so the re-cut tags the commit
  actually being released.
- Renumbered onto a pre-1.0 line. Nothing here has been released as final, so
  the versions that read 1.0.0 to 1.0.5 are now 0.0.0 to 0.0.5 and this is
  0.0.6. The first stable release will be 1.0.0. Because SharePoint compares
  solution versions, a tenant already running the 1.0.5.0 package will not be
  offered 0.0.6.0 as an upgrade: remove the old app from the App Catalog and
  upload this one.

## 0.0.5

- Room at the top and bottom of the web part. The first heading sat almost on
  the edge of the panel, which reads as cramped next to the spacing SharePoint
  gives its own web parts. It follows the spacing setting, so compact gets 23px
  and relaxed 29px rather than one fixed value.

## 0.0.4

- The web part has a tile of its own: a markdown document open in an editor, at
  an angle, in VS Code's Dark+ palette. SharePoint shows it in the toolbox and
  on the full-page apps picker, where the alternatives were a Fluent glyph and a
  grey gradient. It is generated by `npm run brand` from
  `scripts/webpart-tile.js` and inlined into the manifest as a JPEG, which is
  six times smaller than the same image as a PNG and rides along in every page
  that loads the web part.

## 0.0.3

- Released packages keep one file name, `markstrata.sppkg`, instead of
  carrying the version. The App Catalog matches an upload to the solution it
  replaces by file name, so a versioned name was refused with "A solution with
  the same product ID already exists. Please upload the file with the same name
  and replace the existing solution." The version is still in the tag, the
  release title and the package itself, which is where SharePoint reads it.

## 0.0.2

- Fixed dark mode showing as dark text on a white background once a page was
  published, while edit mode looked right. The themed root was the web part's
  own element, which SharePoint also styles when `supportsThemeVariants` is on;
  in display mode its background won. The web part now renders into an element
  of its own one level in, so nothing SharePoint does to its container reaches
  the theme.
- The content column is centred rather than stranded against the left edge when
  it is narrower than the web part, which is how a SharePoint page lays out its
  own content. With a contents sidebar the pair centre together.
- The web part carries its own icon in the manifest, so the toolbox and the
  full-page apps tile show the mark instead of a Fluent glyph and a grey
  placeholder.

- Badges in the README: CI, latest release, SPFx version, licence, live demo
  and Buy Me a Coffee. The first two read the repository through GitHub's
  public endpoints, so they render once the repository is public.

- No em dashes in the site's prose, and a test that keeps them out.


- The documentation site has pages: home, demo, themes, documentation, about and
  support, with a shared header and footer. The pages, their order and the
  navigation between them are declared once in `scripts/site.js`, so adding one
  is an entry there and a markdown file. The working demo moves from `/app/` to
  `/demo/`.
- Ways to support the project: a Buy Me a Coffee link and GitHub Sponsors, on
  the site's support page and in `.github/FUNDING.yml`, which is what puts the
  Sponsor button on the repository.
- Fixed the stacked layout overflowing the web part. `.strata-layout` aligns its
  children to the start so a short contents sidebar does not stretch to the
  height of the text; once the container query stacks the layout, that same
  value aligns horizontally and shrink-wrapped the content column to its widest
  line, pushing it outside the web part. At 400px the content column came out
  748px wide.

## 0.0.1

- Fixed the solution package being rejected by the App Catalog. SharePoint
  requires the app icon to be exactly 96x96 and refuses the upload otherwise
  ("The height of the app package icon does not meet the required size of '96'
  pixels"); the tile had been copied from the 192px icon. `npm run brand` now
  generates it at the right size, and a test asserts it, since the only other
  thing that checks is a tenant rejecting the upload.

## 0.0.0

First build, and the baseline the pre-releases are cut against.

### Toolchain, naming and assets

- The theme screenshots are generated by `npm run screenshots` rather than made
  by hand, so they cannot show something the code no longer does.

- A brand asset set in `assets/`, cut from the logo master (`assets/Markstrata.svg`)
  by `npm run brand`: the mark on its own, the stacked and horizontal lockups,
  the wordmark, single-colour and dark-surface variants, the favicon and app
  icon PNGs, and a 1200x630 social card. `assets/brand.md` records the palette
  and which file belongs where. The docs site and the harness now carry the
  favicon and the logo, the README leads with the lockup, and the solution
  package ships the mark as its app catalog tile.

- Repository renamed to `Markstrata`, matching the solution and package
  names. Every link in the repository now points at the new path, including
  the documentation site, which moves from `/Markdown-Formatter-SPO/` to
  `/Markstrata/`. GitHub redirects the old repository URL but not the
  old Pages paths, so any bookmark to the demo needs updating. Pages paths are
  case-sensitive, so the site links keep the repository's own capitalisation.

- Renamed to **Markstrata**. The solution and web part GUIDs are
  unchanged, so a tenant still sees one app rather than two; the package is now
  `markstrata.sppkg` and the CSS prefix is `strata-`.

- SharePoint Framework 1.21.1 -> 1.23.2, which clears every advisory against
  the packages that ship to the browser (`npm audit --omit=dev` reports none).
  SPFx 1.23 resolves stylesheet `url()` as a module request, so KaTeX's bundled
  fonts need the resolver alias now in `gulpfile.js`.
- gulp 4 -> 5, TypeScript 5.3 -> 5.9, and the GitHub Actions in both workflows
  to their current majors, which also clears the Node 20 deprecation warnings.
- Dropped `@pnp/logging` and `ajv`: both came from the project scaffold and
  neither was imported or needed.

### Rendering

- Markdown rendered with markdown-it: tables (including colspan, rowspan and
  alignment), task lists, footnotes, definition lists, abbreviations, emoji,
  sub/sup, heading anchors, and a table of contents.
- Callouts in three syntaxes: GitHub alerts (`> [!NOTE]`), Obsidian callouts
  with custom titles and foldable `+`/`-` variants, and the Wiki.js
  `{.is-info}` classes used by earlier SharePoint markdown web parts.
- Code blocks with a language header, optional filename
  (` ```ts title="app.ts" `), a copy button that never copies line numbers,
  and per-fence `wrap` / `nowrap` / `numbers` / `nonumbers` flags.
- Mermaid diagrams, themed to match the selected theme, KaTeX maths, and
  `==highlighted==` text.

### Themes

- GitHub, Obsidian and VS Code, each in light and dark, plus a mode that
  follows the SharePoint page theme.
- Themes are CSS custom property sets: colours, typography, code block shape,
  callout shape and syntax token colours. Adding one is a file and a dropdown
  entry, not a change to the structural CSS.
- Reading options independent of theme: content width, spacing, text size and
  code text size.
- Optional reader-side theme switcher, remembered per web part per browser.

### SharePoint

- Content from a document library (with folder browsing, reload-on-change and
  version history with preview and restore), from any URL, or typed into the
  web part.
- Rendered text is published to Microsoft Search through
  `isSearchablePlainText`, so markdown content is findable - a client-side web
  part renders after the crawler has seen the page, so without this the content
  is invisible to search.
- Split editor with live preview while the page is in edit mode, Ctrl+S to save
  back to the source file, and a warning if someone else saved it first.
- No runtime dependency on a third-party CDN: Mermaid is a lazily loaded chunk
  of the solution and KaTeX's stylesheet and fonts are bundled.

### Accessibility and layout

- The table of contents is a column of the layout or a block above the content,
  never an overlay, and it can be placed left, right, inline or switched off.
  It collapses in narrow columns and never covers the page's editing controls.
- Layout decisions use container queries, so a web part in a one-third column
  behaves like a narrow layout however wide the window is.
- Every theme and mode was checked for contrast; light-mode accents that fell
  below WCAG AA were darkened with their hue preserved (see THEMES.md).
