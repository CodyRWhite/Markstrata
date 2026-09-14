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
  ToolbarVisibilityLabel: string;
  ToolbarHint: string;
  PrintButtonLabel: string;
  ShowSourceInfoLabel: string;
  SourceInfoHint: string;
  CodeGroupName: string;
  SyntaxHighlightingLabel: string;
  CodeHeaderLabel: string;
  LineNumbersLabel: string;
  WrapCodeLabel: string;
  CodeSizeLabel: string;

  FeaturesPageDescription: string;
  FeaturesGroupName: string;
  TocPositionLabel: string;
  TocLevelLabel: string;
  AnchorsLabel: string;
  MermaidLabel: string;
  MathLabel: string;
  AllowHtmlLabel: string;
  AllowHtmlHint: string;
  SaveShortcutHint: string;

  SampleContent: string;
}

declare module 'MarkstrataWebPartStrings' {
  const strings: IMarkstrataWebPartStrings;
  export = strings;
}
