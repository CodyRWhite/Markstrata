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
  ContentWidthLabel: string;
  DensityLabel: string;
  TextSizeLabel: string;
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
  TocPositionLabel: string;
  TocLevelLabel: string;
  TocWidthUnitLabel: string;
  TocWidthUnitsLabel: string;
  TocWidthValueLabel: string;
  TocWidthHint: string;
  AnchorsLabel: string;

  FeaturesPageDescription: string;
  RenderingGroupName: string;
  MermaidLabel: string;
  DiagramWidthLabel: string;
  DiagramWidthHint: string;
  ImageZoomLabel: string;
  WikiLinksLabel: string;
  CheckWikiLinksLabel: string;
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
