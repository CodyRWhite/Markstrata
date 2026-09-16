# Changelog

All notable changes to this project are recorded here. Versions are written the
way SharePoint writes them, four-part, because that is the number a tenant
compares when deciding whether a package is an upgrade. The first three parts
follow [semantic versioning](https://semver.org/); the fourth is the build and
is normally zero. `scripts/set-version.js` stamps it when a release is cut.

Entries below 0.0.10.0 were written before the switch and are three-part.

## 0.0.18.4

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
