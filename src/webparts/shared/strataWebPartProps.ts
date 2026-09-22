/**
 * .SYNOPSIS
 * The settings every Markstrata web part has, whatever it renders.
 *
 * .DESCRIPTION
 * Two web parts render two different kinds of document and share almost
 * everything around the document: where it comes from, how it is themed, what
 * the toolbar offers, how an export is laid out, and whether a link to a
 * neighbouring document opens here or downloads.
 *
 * This is that shared part, and it is a contract rather than a convenience.
 * StrataWebPart is written against these names and no others, so a field that
 * is not here is a field the base class cannot read. That is deliberate: it is
 * what stops the shared lifecycle quietly growing a dependency on something
 * only one of the two web parts has.
 *
 * What is NOT here is anything a single renderer owns. Markdown's code fences,
 * diagrams, maths, wiki links and front matter mean nothing to an HTML
 * document; HTML's render mode and stylesheet mean nothing to markdown. Those
 * live on the interface that extends this one.
 *
 * The document's own text is the one exception, and it is absent on purpose.
 * Each web part keeps it under its own name - markdownContent, htmlContent -
 * because the property pane and the search index both show it to somebody, and
 * "content" would read as neither. The base reaches it through an accessor
 * instead. See StrataWebPart.documentText.
 *
 * .USAGE
 *   import { IStrataWebPartProps } from '../shared/strataWebPartProps';
 *
 *   export interface IMarkstrataWebPartProps extends IStrataWebPartProps {
 *     markdownContent: string;
 *     enableMermaid: boolean;
 *   }
 *
 * .NOTES
 * Since:     0.0.22.0
 * Ships in:  both web part bundles
 * Requires:  ThemeManager.ts, backToTop.ts, documentChrome.ts, tocWidth.ts,
 *            SharePointService.ts
 */

import { ThemeFamily, ColorMode } from '../markstrata/utils/ThemeManager';
import { BackToTop } from '../markstrata/utils/backToTop';
import { TocPosition, TrailVisibility } from './documentChrome';
import { TocWidthMode, TocWidthUnit } from '../markstrata/utils/tocWidth';
import { IFileMetadata } from '../markstrata/utils/SharePointService';

export interface IStrataWebPartProps {
  // ------------------------------------------------------------------ content

  /**
   * Where the document comes from. The three answers are not interchangeable:
   * only a library file has a folder to resolve neighbours against and a
   * version history to offer, and only manual content has nowhere to save to.
   */
  contentSource: 'manual' | 'library' | 'url';
  fileUrl: string;
  selectedLibrary: string;
  selectedFolder: string;
  selectedFile: string;
  enableAutoRefresh: boolean;

  // --------------------------------------------------------------- appearance

  themeFamily: ThemeFamily;
  colorMode: ColorMode;
  contentWidth: string;
  density: string;
  textSize: string;
  codeSize: string;
  imageAlign: string;
  showThemeSwitcher: boolean;
  fillHeight: boolean;

  // ----------------------------------------------- enhancements on the output

  /*
   * These act on the rendered DOM rather than on any one syntax, so they are
   * as true of an HTML document as of a markdown one: a table is sortable and
   * a picture is zoomable whoever wrote the markup.
   */
  enableImageZoom: boolean;
  enableTableSort: boolean;
  showReadingTime: boolean;
  backToTop: BackToTop;

  tocPosition: TocPosition;
  tocMaxLevel: number;
  tocWidthMode: TocWidthMode;
  tocWidthUnit: TocWidthUnit;
  tocWidthValue: number;

  // -------------------------------------------------------------------- chrome

  toolbarVisibility: 'always' | 'editing' | 'never';
  /**
   * When the trail of documents and pages is drawn.
   *
   * `followed` is what this has always done and stays the default: the bar
   * appears once a reader has gone somewhere. `always` suits a wiki built as a
   * SharePoint page per document, where a reader arrives from search as often
   * as from a link and the bar is navigation rather than a record of a
   * journey.
   */
  trailVisibility: TrailVisibility;
  /** Keep the toolbar in view while the document scrolls under it. */
  stickyToolbar: boolean;
  showExportButton: boolean;
  /** A title page in front of an export. */
  exportCoverPage: boolean;
  /** A contents page, with the page number each heading landed on. */
  exportContentsPage: boolean;
  /** Start each top level section of an export on a page of its own. */
  exportSectionBreaks: boolean;
  showShareButton: boolean;
  showSourceInfo: boolean;
  pinMeta: boolean;
  enableVersionHistory: boolean;

  /**
   * Whether a link to a neighbouring document opens in the web part.
   *
   * Shared because the behaviour is shared; only the file extensions that
   * count as a document differ, and each web part declares its own.
   */
  followDocumentLinks: boolean;

  // ----------------------------------------------- runtime state kept with it

  fileMetadata?: IFileMetadata;
  /**
   * Plain text of the rendered document, declared searchable by the web part,
   * which is what puts the content into the Microsoft Search index: a
   * client-side web part renders long after the crawler has read the page, so
   * the text has to be stored with the part to be findable at all.
   *
   * Written on a SharePoint page and nowhere else. See
   * StrataWebPart.updateSearchText for why a Teams tab must not carry it.
   */
  searchablePlainText: string;
}
