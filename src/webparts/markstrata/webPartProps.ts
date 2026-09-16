/**
 * .SYNOPSIS
 * What an author has configured, as one shape.
 *
 * .DESCRIPTION
 * Apart on its own because two files need it and neither should have to import
 * the other for it: the web part, which owns the values, and the property
 * pane, which draws them. It is also the one place to read to see everything
 * the web part can be told to do.
 *
 * .USAGE
 *   import { IMarkstrataWebPartProps } from './webPartProps';
 *
 *   // The web part owns the values; the property pane draws them.
 *   export default class MarkstrataWebPart
 *     extends BaseClientSideWebPart<IMarkstrataWebPartProps> { }
 *
 * .NOTES
 * Since:     0.0.17.0
 * Ships in:  the web part bundle
 * Requires:  ThemeManager.ts, mermaidConfig.ts, backToTop.ts, codeBlocks.ts,
 *            ViewModeRenderer.ts, tocWidth.ts, SharePointService.ts
 */

import { ThemeFamily, ColorMode } from './utils/ThemeManager';
import { DiagramWidth } from './utils/mermaidConfig';
import { BackToTop } from './utils/backToTop';
import { CodeHeight } from './utils/codeBlocks';
import { TocPosition } from './utils/ViewModeRenderer';
import { TocWidthMode, TocWidthUnit } from './utils/tocWidth';
import { IFileMetadata } from './utils/SharePointService';

export interface IMarkstrataWebPartProps {
  // Content
  contentSource: 'manual' | 'library' | 'url';
  markdownContent: string;
  fileUrl: string;
  selectedLibrary: string;
  selectedFolder: string;
  selectedFile: string;
  enableAutoRefresh: boolean;

  // Appearance
  themeFamily: ThemeFamily;
  colorMode: ColorMode;
  contentWidth: string;
  density: string;
  textSize: string;
  codeSize: string;
  imageAlign: string;
  showThemeSwitcher: boolean;
  fillHeight: boolean;

  // Code blocks
  enableSyntaxHighlighting: boolean;
  showCodeHeader: boolean;
  showLineNumbers: boolean;
  wrapCodeLines: boolean;
  codeHeight: CodeHeight;

  // Features
  enableMermaid: boolean;
  diagramWidth: DiagramWidth;
  enableImageZoom: boolean;
  enableTableSort: boolean;
  followDocumentLinks: boolean;
  enableWikiLinks: boolean;
  checkWikiLinks: boolean;
  enableTags: boolean;
  showReadingTime: boolean;
  backToTop: BackToTop;
  enableMath: boolean;
  enableAnchors: boolean;
  tocPosition: TocPosition;
  tocMaxLevel: number;
  tocWidthMode: TocWidthMode;
  tocWidthUnit: TocWidthUnit;
  tocWidthValue: number;
  toolbarVisibility: 'always' | 'editing' | 'never';
  showPrintButton: boolean;
  showShareButton: boolean;
  showSourceInfo: boolean;
  pinMeta: boolean;
  enableVersionHistory: boolean;
  allowHtml: boolean;

  // Runtime state kept with the web part
  fileMetadata?: IFileMetadata;
  /**
   * Plain text of the rendered document. Declared searchable below, which is
   * what puts the content into the Microsoft Search index - a client-side web
   * part renders after the crawler has seen the page, so the text has to be
   * stored with the part to be findable.
   */
  searchablePlainText: string;
}
