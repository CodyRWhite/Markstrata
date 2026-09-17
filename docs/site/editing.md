# Editing in the page

Put the SharePoint page into edit mode and the web part stops being a document
and becomes an editor: markdown on the left, a live preview on the right, and a
button that writes the file back to the library.

This page is the other half of [reading a document](../reading/). The same web
part, the same settings, the same file, seen by somebody who is allowed to
change it.

[[toc]]

## Reading, and then authoring

A reader gets the document, with the toolbar above it:

<div class="site-specimen" data-specimen="toolbar"></div>

An author who opens the editor gets the same web part with the document
replaced. The toolbar is a different toolbar, because the things there are to do
are different ones:

<div class="site-specimen" data-specimen="editor"></div>

Reload, version history, share, export and the theme switcher are all about
reading a document that is finished. Edit, Split and Preview, and the button that writes
the file back, are about one that is not.

### What else changes underneath

Two things move that a still cannot show, and neither is a setting. While the
SharePoint page itself is being edited, the contents sidebar stops sticking to
the top of the screen: sticky positioning fights the page canvas SharePoint
draws around a page being edited, and the result is a panel floating over the
author's own controls. **Fill the available height** stops applying for the same
reason, since the room below the web part is being measured against a page that
is currently growing a toolbar of its own.

> [!NOTE] Readers can be given none of this
> **Show toolbar** set to *only while editing the page* leaves readers with no
> toolbar at all and gives whoever is editing the page the full one. That is the
> right setting for a document embedded as page content rather than offered as a
> document.

## The split editor

**Edit**, **Split** and **Preview** decide how much of each half is on screen.
Split is the default, and on a narrow column the two halves stack rather than
squeezing into columns nobody can read.

The preview is the real renderer, not an approximation of it: the same pipeline,
the same theme, the same stylesheets as the document it will become. It redraws
a quarter of a second after you stop typing, so a long document is not
re-rendered on every keystroke.

The two halves scroll together. Reading the source and reading the preview are
the same act of reading, and a split view whose halves go their own ways is a
split view nobody uses on a document long enough to need one.

### It is a textarea, deliberately

Not Monaco, and not a rich text box. A large editor bundle is hard to justify
for the short edits that actually happen on a SharePoint page, and a plain text
box always loads: no loader shim, no lazy chunk that might not arrive, nothing
that behaves differently in a Teams tab than on a page.

The trade is real and it is worth saying rather than hiding. There is no syntax
highlighting in the editing half and no autocomplete. What there is instead is a
preview showing exactly what the document will look like, which is the thing the
highlighting would have been standing in for.

## Saving

**Save to SharePoint** writes the text back to the file. `Ctrl+S` does the same
while the editor has focus, which matters most in a narrow column where the
toolbar has wrapped. The status beside the buttons says what happened: saving,
saved, or the reason it did not.

The button is only there when there is somewhere to save to. Markdown typed into
the web part is stored with the web part and saved when the page is, and content
fetched from a URL cannot be written back at all, so in both cases the editor
says it is editing web part content and leaves the button off.

### If somebody else saved it first

The file's modified time is checked before the write. If it has moved since the
document was opened, the save stops and asks:

> Someone else has saved this file since you opened it.
>
> OK overwrites their version (the old text stays in version history), Cancel
> keeps it.

The parenthesis is the important half. SharePoint keeps versions of a file in a
document library, so overwriting is recoverable and the other person's text is
still there to go back to. Cancelling keeps their version and leaves yours in the
editor, unsaved, so nothing is lost either way.

## Editing a document you followed a link to

A reader can follow a link from one document to another, and an author editing
the page can too. What they cannot do is edit the document they arrived at: the
web part is still configured to show a different file, and saving would write
the text of one document over another.

So while a followed document is open, the editor says so and points at the way
back. Closing the followed document returns to the configured one, which is the
file the editor is allowed to write.

## Where the settings are

Everything the editor does is decided in the property pane, which is the pane
SharePoint opens when the web part is selected on a page being edited. The
[settings page](../docs/) covers every field in it, and the
[demo](../demo/) has a working copy of the pane that changes a real document as
you move through it.
