/*
 * Regenerates loc/en-us.js.
 *
 * The welcome text a new web part shows is kept in samples/welcome.md so it can
 * be edited as markdown (and previewed by the demo) instead of as an escaped
 * one-line JavaScript string. Run `node scripts/build-strings.js` after editing
 * either that file or the STRINGS table below.
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
  ImageZoomLabel: 'Click a picture or diagram to see it full size',
  WikiLinksLabel: 'Wiki links',
  CheckWikiLinksLabel: 'Mark links to pages that are not there',
  WikiLinksHint: 'Turns [[Another page]] into a link to that file in the same folder, the way Obsidian and older wikis write one. [[Page|worded differently]] and [[Page#Heading]] both work. With a library file, links to pages that are not there are marked: the folder is listed once and every link into it answered from that, rather than asked one at a time.',
  MathLabel: 'Math (KaTeX)',
  AllowHtmlLabel: 'Allow raw HTML in markdown',
  AllowHtmlHint: 'Leave off unless you trust everyone who can edit the source. With it on, HTML in the markdown is rendered as-is.',

  ToolbarGroupName: 'Toolbar',
  ToolbarVisibilityLabel: 'Show toolbar',
  ToolbarHint: 'The reload, version history, theme and print controls all live in the toolbar. With "Only while editing the page", readers of the page never see them.',
  PrintButtonLabel: 'Show print button',
  ReadingTimeLabel: 'Show reading time',
  BackToTopLabel: 'Back to top button',

  FileInfoGroupName: 'File information',
  ShowSourceInfoLabel: 'Show file name and last updated',
  PinMetaLabel: 'Keep it in view while scrolling',
  SourceInfoHint: 'Needs a file from a document library. Markdown typed into the web part, or fetched from a URL, has no file name or modified date to show.',

  SaveShortcutHint: 'Ctrl+S saves while the editor has focus.',

  SampleContent: sample
};

const banner = [
  '// Generated by scripts/build-strings.js - edit that file or samples/welcome.md,',
  '// then run `node scripts/build-strings.js`.',
  ''
].join('\n');

const body = `define([], function () {\n  return ${JSON.stringify(STRINGS, null, 2).replace(/\n/g, '\n  ')};\n});\n`;

fs.writeFileSync(path.join(root, 'src', 'webparts', 'markstrata', 'loc', 'en-us.js'), banner + body);
console.log('Wrote loc/en-us.js');
