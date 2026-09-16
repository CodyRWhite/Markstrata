/**
 * .SYNOPSIS
 * Regenerates loc/en-us.js.
 *
 * .DESCRIPTION
 * The welcome text a new web part shows is kept in samples/welcome.md so it can
 * be edited as markdown (and previewed by the demo) instead of as an escaped
 * one-line JavaScript string. Run `node scripts/build-strings.js` after editing
 * either that file or the STRINGS table below.
 *
 * .USAGE
 *   node scripts/build-strings.js
 *
 *   The generator is the source of truth: a string added to loc/en-us.js by hand
 *   is deleted the next time this runs. tests/strings.test.js checks the two
 *   agree, so that cannot happen quietly.
 *
 * .NOTES
 * Since:     0.0.6
 * Ships in:  nothing - it builds or drives what ships
 * Requires:  nothing else in this project
 */

const fs = require('fs');
const path = require('path');

const root = path.join(__dirname, '..');
const sample = fs.readFileSync(path.join(root, 'samples', 'welcome.md'), 'utf8');

const STRINGS = {
  ContentPageDescription: 'Choose where the markdown comes from.',
  ContentGroupName: 'Content',
  ContentSourceLabel: 'Source',
  MarkdownContentLabel: 'Markdown',
  MarkdownContentDescription: 'Typed here and stored with the web part. Good for short content; use a library file for anything you want to version.',
  FileUrlLabel: 'File URL',
  FileUrlDescription: 'Any URL that returns markdown. SharePoint URLs are requested with your sign-in; other sites must allow cross-origin requests.',
  LibraryLabel: 'Document library',
  FolderLabel: 'Folder',
  FileLabel: 'Markdown file',
  AutoRefreshLabel: 'Reload when the file changes',
  VersionHistoryLabel: 'Show version history button',

  AppearancePageDescription: 'How the page looks: theme, measure, and pictures.',
  ThemeGroupName: 'Theme',
  ThemeFamilyLabel: 'Theme',
  ColorModeLabel: 'Colour mode',
  ThemeSwitcherLabel: 'Let readers switch theme',
  ThemeHint: 'GitHub, Obsidian and VS Code each bring their own typography, code block styling, callout shape and syntax colours in both light and dark.',
  ReadingGroupName: 'Reading',
  PicturesGroupName: 'Pictures',
  PageGroupName: 'The page',
  ContentWidthLabel: 'Content width',
  DensityLabel: 'Spacing',
  TextSizeLabel: 'Text size',
  ImageAlignLabel: 'Picture alignment',
  ImageAlignHint: 'Applies to a picture that is a paragraph of its own, with or without a caption. One inside a sentence stays on the line it is in. A document can place a single picture itself by giving it a class, ![alt](x.png){.center}.',
  FillHeightLabel: 'Fill the available height',
  FillHeightHint: 'Gives the web part at least the room below it, so a short document does not stop halfway down the page and leave the canvas showing under it. The file name and modified date, if they are shown, sit at the bottom of that. Measured from where the web part starts, so a part placed below other content on a long page is left alone.',
  CodeGroupName: 'Code blocks',
  SyntaxHighlightingLabel: 'Syntax highlighting',
  CodeHeaderLabel: 'Show language header',
  LineNumbersLabel: 'Show line numbers',
  WrapCodeLabel: 'Long lines',
  CodeSizeLabel: 'Code text size',
  CodeHeightLabel: 'Block height',
  CodeHeightHint: 'Caps how tall a code block is and scrolls inside it, so a long listing does not push the rest of the document off the screen. Short is about ten lines and medium about twenty-five, counted in the line height of the theme that is on. A fence can say short, medium or full for itself, and that beats this the way wrap and numbers already do.',

  ContentsPageDescription: 'Finding your way around a document, and between documents.',
  ContentsGroupName: 'Contents',
  LinksGroupName: 'Links between documents',
  TocPositionLabel: 'Table of contents',
  TocLevelLabel: 'Deepest heading in the contents',
  TocWidthUnitLabel: 'Contents width',
  TocWidthUnitsLabel: 'Measured in',
  TocWidthValueLabel: 'Width',
  TocWidthHint: 'Only applies with the contents in a left or right sidebar; stacked above the content they are always full width. Auto fits the longest entry. Em keeps the sidebar in step with the text size, per cent with the width of the web part. Vw measures the browser window rather than the web part, so a narrow column and a full-width one get the same sidebar.',
  AnchorsLabel: 'Heading link anchors',

  CodePageDescription: 'Code blocks, diagrams, tables and maths.',
  ChromePageDescription: 'What is shown around the document.',
  DiagramsGroupName: 'Diagrams',
  MathGroupName: 'Maths and HTML',
  TablesGroupName: 'Tables',
  TableSortLabel: 'Let readers sort a table',
  TableSortHint: 'A click on a column header sorts by it, a second reverses it, and a third puts the rows back in the order the document wrote them. A table with a merged cell in it is left alone, because reordering rows would scramble what the merge says. Long tables keep their header row in view either way.',
  MermaidLabel: 'Mermaid diagrams',
  DiagramWidthLabel: 'Wide diagrams',
  DiagramWidthHint: 'Gantt charts lay out from their time axis rather than wrapping, so they often want more width than a column gives. Fitting compresses the axis and keeps the text readable.',
  ImageZoomLabel: 'Click a picture, diagram or code block to see it full size',
  ImageZoomHint: 'A code block only offers it when there is something to see: one capped by its height, one whose lines run past the column, or one longer than the window. A short block that already fits is left alone.',
  WikiLinksLabel: 'Wiki links',
  CheckWikiLinksLabel: 'Mark links to pages that are not there',
  FollowLinksLabel: 'Open a linked document here',
  FollowLinksHint: 'A link to another markdown file - a wiki link or an ordinary one - opens that document in the web part instead of handing the reader the file, which SharePoint offers as raw text or as a download. A bar above the document says which one is open and goes back, and so does the browser\'s Back button. Opening a link in a new tab still goes to the file itself. Needs a document library, since that is what the other documents are in.',
  TagsLabel: 'Tags',
  TagsHint: 'Shows #tag and #nested/tag as tags rather than as words with a hash in front, the way a note written in Obsidian writes them. They are styled, not searchable: this web part cannot see the other documents in the library, so a tag that looked like a link would go nowhere.',
  WikiLinksHint: 'Turns [[Another page]] into a link to that file in the same folder, the way Obsidian and older wikis write one. [[Page|worded differently]] and [[Page#Heading]] both work. With a library file, links to pages that are not there are marked: the folder is listed once and every link into it answered from that, rather than asked one at a time.',
  MathLabel: 'Math (KaTeX)',
  AllowHtmlLabel: 'Allow raw HTML in markdown',
  AllowHtmlHint: 'Leave off unless you trust everyone who can edit the source. With it on, HTML in the markdown is rendered as-is.',

  ToolbarGroupName: 'Toolbar',
  ToolbarVisibilityLabel: 'Show toolbar',
  ToolbarHint: 'The reload, version history, theme and print controls all live in the toolbar. With "Only while editing the page", readers of the page never see them.',
  PrintButtonLabel: 'Show print button',
  ShareButtonLabel: 'Show share button',
  ShareButtonHint: 'Copies a link to the document on screen. A reader who has '
    + 'followed links to another document is looking at something the page '
    + 'address says nothing about, so sending that address sends somebody to '
    + 'the page\'s own document instead. Needs "Open a linked document here", '
    + 'since the link it copies is the one that setting reads.',
  ReadingTimeLabel: 'Show reading time',
  BackToTopLabel: 'Back to top button',

  FileInfoGroupName: 'File information',
  ShowSourceInfoLabel: 'Show file name and last updated',
  PinMetaLabel: 'Keep it in view while scrolling',
  SourceInfoHint: 'Needs a file from a document library. Markdown typed into the web part, or fetched from a URL, has no file name or modified date to show.',

  SaveShortcutHint: 'Ctrl+S saves while the editor has focus.',

  /*
   * A menu entry named a document and nothing opened it. Both of these are
   * shown only in page edit mode: they name a setting to change, which is not
   * a reader's business and not a reader's to fix. Without them the page shows
   * the document it was configured with, which is indistinguishable from a
   * menu entry pointing at the wrong file.
   */
  AddressIgnored: 'This page address names a document to open, and it was '
    + 'ignored. Opening one needs "Open a linked document here" turned on, and '
    + 'a source other than markdown typed into the web part.',
  AddressNotUnderstood: 'This page address names a document to open, and it '
    + 'could not be used. It has to be a markdown file, and any & # or + in '
    + 'the name has to be written as %26 %23 or %2B.',

  /*
   * A web part nobody has pointed at a document yet. The way in differs by
   * host and only one of them is in front of you, so each host gets its own
   * sentence rather than one that is vague enough to cover all of them.
   */
  /* Shown where the editor would be, when a reader has followed a link and
     the page is in edit mode. The editor is withheld there because it could
     only ever save to the configured file. */
  EditingAnotherDocument: 'You are reading a document this web part links to, '
    + 'not the one it is configured to show. Close it, using the bar above, to '
    + 'edit the configured document.',

  UnconfiguredHeading: 'No document chosen yet',
  UnconfiguredInPane: 'Open the property pane and choose where the markdown '
    + 'comes from: a file in a document library, a file at a URL, or markdown '
    + 'typed straight into the web part.',
  UnconfiguredOnPage: 'Somebody who can edit this page needs to choose a '
    + 'document for it in the web part settings.',
  UnconfiguredInTeams: 'Open this tab\'s settings and choose a markdown file. '
    + 'In a channel that is the arrow beside the tab name, then Settings.',
  UnconfiguredSampleButton: 'Start with the sample document',

  SampleContent: sample
};

/*
 * The generated file's own header.
 *
 * It lives here rather than in the file, because the file is overwritten every
 * time this runs: a header written by hand into en-us.js survived exactly
 * until the next regeneration, which is how it went missing. Every code file
 * in this project opens with one of these and a test says so, so the generator
 * has to write it.
 */
const banner = [
  '/**',
  ' * .SYNOPSIS',
  ' * Every string the property pane shows, in English.',
  ' *',
  ' * .DESCRIPTION',
  ' * Generated, not written: scripts/build-strings.js is the source of truth, and',
  ' * a string added here by hand is deleted the next time it runs.',
  ' * tests/strings.test.js compares the two so that cannot happen quietly.',
  ' *',
  ' * .USAGE',
  ' *   node scripts/build-strings.js    rewrites this file',
  ' *',
  ' *   // In the web part, through the module name SPFx maps to this file:',
  " *   import * as strings from 'MarkstrataWebPartStrings';",
  ' *   label: strings.ContentSourceLabel',
  ' *',
  ' * .NOTES',
  ' * Since:     0.0.6',
  ' * Ships in:  the web part bundle',
  ' * Requires:  nothing else in this project',
  ' * Generated: by scripts/build-strings.js - do not edit by hand',
  ' */',
  '// Generated by scripts/build-strings.js - edit that file or samples/welcome.md,',
  '// then run `node scripts/build-strings.js`.',
  ''
].join('\n');

const body = `define([], function () {\n  return ${JSON.stringify(STRINGS, null, 2).replace(/\n/g, '\n  ')};\n});\n`;

fs.writeFileSync(path.join(root, 'src', 'webparts', 'markstrata', 'loc', 'en-us.js'), banner + body);
console.log('Wrote loc/en-us.js');
