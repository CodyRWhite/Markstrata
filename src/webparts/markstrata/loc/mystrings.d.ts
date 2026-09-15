/**
 * .SYNOPSIS
 * The type of the strings file, so a missing string is a compile error.
 *
 * .DESCRIPTION
 * Declared rather than generated: this is what makes a name that nothing
 * defines fail to compile, instead of rendering as blank in the property pane
 * where only a person looking at it would notice.
 *
 * .USAGE
 *   import * as strings from 'MarkstrataWebPartStrings';
 *   label: strings.ThemeSwitcherLabel
 *
 * .NOTES
 * Since:     0.0.6
 * Ships in:  the web part bundle
 * Requires:  nothing else in this project
 */
declare interface IMarkstrataWebPartStrings {
  ContentPageDescription: string;
  ContentGroupName: string;
  ContentSourceLabel: string;
  MarkdownContentLabel: string;
  MarkdownContentDescription: string;
  FileUrlLabel: string;
  FileUrlDescription: string;
  LibraryLabel: string;
  FolderLabel: string;
  FileLabel: string;
  AutoRefreshLabel: string;
  VersionHistoryLabel: string;

  AppearancePageDescription: string;
  ThemeGroupName: string;
  ThemeFamilyLabel: string;
  ColorModeLabel: string;
  ThemeSwitcherLabel: string;
  ThemeHint: string;
  ReadingGroupName: string;
  PicturesGroupName: string;
  PageGroupName: string;
  ContentWidthLabel: string;
  DensityLabel: string;
  TextSizeLabel: string;
  ImageAlignLabel: string;
  ImageAlignHint: string;
  FillHeightLabel: string;
  FillHeightHint: string;
  CodeGroupName: string;
  SyntaxHighlightingLabel: string;
  CodeHeaderLabel: string;
  LineNumbersLabel: string;
  WrapCodeLabel: string;
  CodeSizeLabel: string;

  ContentsPageDescription: string;
  ContentsGroupName: string;
  LinksGroupName: string;
  TocPositionLabel: string;
  TocLevelLabel: string;
  TocWidthUnitLabel: string;
  TocWidthUnitsLabel: string;
  TocWidthValueLabel: string;
  TocWidthHint: string;
  AnchorsLabel: string;

  CodePageDescription: string;
  ChromePageDescription: string;
  DiagramsGroupName: string;
  MathGroupName: string;
  TablesGroupName: string;
  TableSortLabel: string;
  TableSortHint: string;
  MermaidLabel: string;
  DiagramWidthLabel: string;
  DiagramWidthHint: string;
  ImageZoomLabel: string;
  WikiLinksLabel: string;
  CheckWikiLinksLabel: string;
  FollowLinksLabel: string;
  FollowLinksHint: string;
  WikiLinksHint: string;
  MathLabel: string;
  AllowHtmlLabel: string;
  AllowHtmlHint: string;

  ToolbarGroupName: string;
  ToolbarVisibilityLabel: string;
  ToolbarHint: string;
  PrintButtonLabel: string;
  ReadingTimeLabel: string;
  BackToTopLabel: string;

  FileInfoGroupName: string;
  ShowSourceInfoLabel: string;
  PinMetaLabel: string;
  SourceInfoHint: string;

  SaveShortcutHint: string;

  SampleContent: string;
}

declare module 'MarkstrataWebPartStrings' {
  const strings: IMarkstrataWebPartStrings;
  export = strings;
}
