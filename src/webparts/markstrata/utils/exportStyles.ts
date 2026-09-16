/**
 * .SYNOPSIS
 * The two stylesheets an export needs, and why they cannot be one.
 *
 * .DESCRIPTION
 * Written here as strings rather than kept in styles/ with the others, because
 * only one of them is a stylesheet in the ordinary sense.
 *
 * PAGED is handed to Paged.js rather than to the browser. Everything in it is
 * CSS the browser does not implement: `@page` margin boxes, `string-set` and
 * the running heads that read them, and `target-counter`, which is what puts a
 * real page number beside a contents entry. Paged.js reads that sheet, works
 * out the pages, and rewrites it into rules a browser does understand. Loaded
 * into the page as an ordinary stylesheet it would do nothing at all.
 *
 * PAGE is a stylesheet in the ordinary sense and is loaded into the document.
 * Its whole job is the moment of printing: everything on the page except the
 * laid-out export is hidden, and the export, which is hidden on screen, is
 * shown. It is gated on an attribute the export puts on the root element, so
 * nothing in it applies to an ordinary print of an ordinary page, and taking
 * the attribute off is enough to put the page back.
 *
 * .USAGE
 *   import { PAGED, PAGE } from './utils/exportStyles';
 *
 *   previewer.preview(content, [{ 'strata-export': PAGED }], target);
 *
 * .NOTES
 * Since:     0.0.20.0
 * Ships in:  the web part bundle
 * Requires:  nothing else in this project
 */

/**
 * The paged sheet, read by Paged.js and never by the browser.
 *
 * The three classes that gate the optional parts are put on by pdfExport.ts
 * from the author's settings, so a document exported without a cover simply
 * has no element carrying `strata-export-cover` and the rules below never
 * match anything.
 */
export const PAGED: string = `
@page {
  size: A4;
  margin: 20mm 18mm 18mm 18mm;

  @top-left  { content: string(strata-doc);     font: 9pt/1 system-ui, sans-serif; color: #666; }
  @top-right { content: string(strata-section); font: 9pt/1 system-ui, sans-serif; color: #666; }
  @bottom-right { content: counter(page);       font: 9pt/1 system-ui, sans-serif; color: #666; }
}

/* A cover has no running head: it is the head. */
@page strata-cover {
  @top-left { content: none }
  @top-right { content: none }
  @bottom-right { content: none }
}

/* And the contents carries the document's name but not a section, since the
   section it is on is itself. */
@page strata-contents {
  @top-right { content: none }
}

.strata-export-cover    { page: strata-cover;    break-after: page; }
.strata-export-contents { page: strata-contents; break-after: page; }

/* What the running heads read. Set from the cover rather than from the
   document's own first heading, so a document with no heading still names
   itself on every page. */
.strata-export-title   { string-set: strata-doc content(text); }
.strata-export-content h2 { string-set: strata-section content(text); }

/* ---------------------------------------------------------------- the cover */

.strata-export-cover {
  display: flex;
  flex-direction: column;
  justify-content: center;
  height: 100%;
}
.strata-export-title {
  font: 700 30pt/1.15 system-ui, -apple-system, "Segoe UI", sans-serif;
  letter-spacing: -0.01em;
  margin: 0 0 6mm;
}
.strata-export-source {
  font: 11pt/1.5 system-ui, sans-serif;
  color: #555;
  margin: 0 0 24mm;
  word-break: break-word;
}
.strata-export-taken {
  font: 9.5pt/1.6 system-ui, sans-serif;
  color: #777;
  border-top: 1px solid #ddd;
  padding-top: 4mm;
}

/* ------------------------------------------------------------- the contents */

.strata-export-contents-heading {
  font: 700 15pt/1.2 system-ui, sans-serif;
  margin: 0 0 8mm;
}
.strata-export-contents ol {
  list-style: none;
  margin: 0;
  padding: 0;
  font: 10.5pt/1.9 system-ui, sans-serif;
}
.strata-export-contents li.strata-lvl-3 { padding-left: 8mm; font-size: 10pt; }
.strata-export-contents li.strata-lvl-4 { padding-left: 16mm; font-size: 9.5pt; color: #555; }
.strata-export-contents li.strata-lvl-5,
.strata-export-contents li.strata-lvl-6 { padding-left: 24mm; font-size: 9pt; color: #666; }

.strata-export-contents a {
  display: flex;
  align-items: baseline;
  text-decoration: none;
  color: #111;
}
.strata-export-contents a .strata-export-label {
  white-space: nowrap;
  overflow: hidden;
  text-overflow: ellipsis;
}
.strata-export-contents a .strata-export-dots {
  flex: 1 1 auto;
  border-bottom: 1.2pt dotted #bbb;
  margin: 0 2mm;
  transform: translateY(-3pt);
}

/* The page number. This is the line a browser cannot do on its own, and the
   reason Paged.js is here at all. */
.strata-export-contents a::after {
  content: target-counter(attr(href), page);
  font-variant-numeric: tabular-nums;
  color: #444;
}

/* -------------------------------------------------------------- the document */

.strata-export-content { max-width: none; }

/* Only where the author asked for it: a syntax reference wants a page per
   section and a two page runbook does not. */
.strata-export-sections .strata-export-content h2 { break-before: page; }
.strata-export-sections .strata-export-content h2:first-of-type { break-before: avoid; }

.strata-export-content h1,
.strata-export-content h2,
.strata-export-content h3,
.strata-export-content h4 { break-after: avoid; }

.strata-export-content p,
.strata-export-content li { orphans: 3; widows: 3; }

/*
 * Nothing that scrolls, and nothing capped.
 *
 * This is the difference between an export that works and one that stops
 * halfway, and the reason is that Paged.js lays out in screen media. The web
 * part already lifts the height cap off a code block for print, and that rule
 * is inside @media print, so during pagination it does not apply: the block
 * is still ten lines tall with the rest of the listing scrolled away, the
 * wrapper is still overflow:hidden, and a box whose content cannot be
 * measured is a box Paged.js cannot break. It laid out five pages of a
 * seventeen page document and stopped, silently, because there was nowhere to
 * put the next thing.
 */
.strata-export-content .strata-code { overflow: visible; }
.strata-export-content .strata-code-pre {
  max-height: none;
  overflow: visible;
}
.strata-export-content .strata-table-scroll { overflow: visible; }

/*
 * What may be broken across a page, and what may not.
 *
 * A listing longer than a page has to be allowed to break, or it fits nowhere
 * and takes the rest of the document with it. So does a long table. Both break
 * cleanly, being made of lines and rows, and a row is kept whole so a cell
 * never straddles the fold. A diagram is one picture and cannot usefully be
 * cut, so it stays whole and takes a page of its own where it must.
 */
.strata-export-content .strata-code,
.strata-export-content table { break-inside: auto; }
.strata-export-content tr { break-inside: avoid; }
.strata-export-content thead { display: table-header-group; }

.strata-export-content .strata-callout,
.strata-export-content .strata-mermaid,
.strata-export-content figure { break-inside: avoid; }

/*
 * Nothing wider or taller than the page it has to go on.
 *
 * A picture is one thing and cannot be broken, so a picture larger than the
 * printable area fits nowhere: Paged.js looks for somewhere to put it, finds
 * nowhere, and stops with the rest of the document still in its hands. It laid
 * out five pages and stopped at a figure. On screen the same picture is fine,
 * because a page scrolls and a sheet of paper does not.
 *
 * 200mm against a printable height of 259mm, so a picture still has its
 * caption and a line of text for company rather than sitting alone on a page
 * it only just fits.
 */
.strata-export-content img,
.strata-export-content svg,
.strata-export-content .strata-mermaid svg {
  max-width: 100%;
  max-height: 200mm;
  height: auto;
}

/*
 * Long lines wrap rather than run off the edge of the sheet.
 *
 * A listing scrolls sideways on screen, and a sheet of paper does not: a line
 * wider than the text block simply leaves the page, and the half of it past
 * the margin is not printed. The rule that has to give way is
 * the white-space: pre that code.css puts on .strata-code pre code, which is
 * on the code element rather than on the pre, so a rule aimed at the pre loses
 * to it and the line was still cut off at the margin. Breaking anywhere is for
 * the token with no break in it at all, usually the long URL or the base64
 * that caused this in the first place.
 */
.strata-export-content .strata-code pre,
.strata-export-content .strata-code pre code {
  white-space: pre-wrap;
  overflow-wrap: anywhere;
}
.strata-export-content .strata-code-line { width: auto; }

/* Controls that cannot be used on paper, and a closed callout that would
   otherwise print as a heading with nothing under it. */
.strata-export-content .strata-code-actions,
.strata-export-content .strata-anchor,
.strata-export-content .strata-to-top { display: none !important; }
.strata-export-content details.strata-callout:not([open]) .strata-callout-content { display: block; }
`;

/**
 * The document sheet, loaded into the page and gated on the root attribute.
 *
 * Scoped to that attribute throughout, for the reason the web part's own print
 * sheet is scoped to its root: SharePoint loads this into the page itself, so
 * a bare `body > *` would be every web part on somebody's page, printed or
 * otherwise. With the attribute off, nothing here matches anything.
 */
export const PAGE: string = `
html[data-strata-export='on'] .strata-export-root {
  position: absolute;
  left: 0;
  top: 0;
  width: 100%;
  background: #ffffff;
}

/*
 * On screen the export is being laid out, which takes a moment and is not
 * something to watch. It is moved off the side rather than hidden, because
 * Paged.js works the pages out by measuring them and it does that here, in
 * screen media, before anything is printed.
 *
 * Given height:0 and overflow:hidden it measured every page inside a box
 * with no room in it, decided the document had ended, and laid out five pages
 * of a seventeen page document without reporting anything wrong. A box with no
 * height is not a hidden box, it is a box whose contents do not fit.
 *
 * So: off to the side, full size, laid out properly, and not on screen.
 */
@media screen {
  html[data-strata-export='on'] .strata-export-root {
    left: -100000px;
    pointer-events: none;
  }
}

@media print {
  /* The page belongs to the export for the length of the print. Everything
     else on it, SharePoint's own chrome and every other web part included,
     has nothing to do with the document being exported. */
  html[data-strata-export='on'] body > *:not(.strata-export-root) {
    display: none !important;
  }
  html[data-strata-export='on'] .strata-export-root {
    position: static !important;
    left: auto !important;
    display: block !important;
  }
}
`;
