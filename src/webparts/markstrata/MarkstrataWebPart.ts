/**
 * .SYNOPSIS
 * The markdown web part: what it renders, and nothing else.
 *
 * .DESCRIPTION
 * Everything that is not about markdown lives in StrataWebPart, which this
 * extends and the HTML web part extends too: starting inside SharePoint,
 * reading and saving the configured file, watching it, following links,
 * answering a `?strataDoc=` address, themes, exports, the search index, and
 * shutting all of it down again.
 *
 * What is left here is the part that knows markdown. The processor built from
 * markdown-it and the settings that rebuild it. The two renderers, one for
 * reading and one for editing, and the choice between them. The property pane,
 * which is markdown's own because most of its pages are about fences,
 * diagrams and wiki links.
 *
 * The split is not cosmetic. A fix to how a followed document resolves its
 * pictures, or to what a Teams tab may store, now happens once rather than
 * twice, which is the whole reason the base exists.
 *
 * .USAGE
 *   // SharePoint builds this: it is the web part the manifest points at.
 *   //
 *   // buildRenderers()    the processor and the two renderers
 *   // drawDocument()      read mode, edit mode, or a version being previewed
 *   // processorOptions()  every setting markdown-it is built from
 *
 * .NOTES
 * Since:     0.0.6
 * Ships in:  the markdown web part bundle
 * Requires:  StrataWebPart.ts, MarkdownProcessor.ts, MermaidRenderer.ts,
 *            ContentEnhancer.ts, ViewModeRenderer.ts, EditModeManager.ts,
 *            propertyPane.ts
 * Runs in:   a SharePoint page, through @microsoft/sp-webpart-base
 */

import { DisplayMode } from '@microsoft/sp-core-library';
import { IPropertyPaneConfiguration } from '@microsoft/sp-property-pane';
import { IWebPartPropertiesMetadata } from '@microsoft/sp-webpart-base';
import * as strings from 'MarkstrataWebPartStrings';

// KaTeX's stylesheet and its fonts are bundled with the solution: no part of
// this web part loads anything from a third-party CDN at runtime.
import 'katex/dist/katex.min.css';

// Content styles. Loaded in this order: tokens, structure, then themes, then
// the reader options that override them.
import './styles/base.css';
import './styles/typography.css';
import './styles/code.css';
import './styles/syntax.css';
import './styles/callouts.css';
import './styles/tables-lists.css';
import './styles/extras.css';
import './styles/chrome.css';
import './styles/themes/github.css';
import './styles/themes/obsidian.css';
import './styles/themes/vscode.css';
import './styles/modifiers.css';
import './styles/print.css';

import { StrataWebPart } from '../shared/StrataWebPart';
import { trailFromSearch, withTrail } from '../shared/pageTrail';
import { MarkdownProcessor, IMarkdownProcessorOptions } from './utils/MarkdownProcessor';
import { MermaidRenderer } from './utils/MermaidRenderer';
import { ContentEnhancer } from './utils/ContentEnhancer';
import { ViewModeRenderer } from './utils/ViewModeRenderer';
import { EditModeManager } from './utils/EditModeManager';
import { SharePointService } from './utils/SharePointService';
import { IThemeSettings, ResolvedMode, ThemeFamily } from './utils/ThemeManager';
import { PaneSources } from './paneSources';

/* Re-exported so the web part is still the one name to import for its own
   shape, wherever the declaration lives. */
export { IMarkstrataWebPartProps } from './webPartProps';
import { IMarkstrataWebPartProps } from './webPartProps';
import { paneConfiguration } from './propertyPane';

/*
 * Settings the markdown pipeline is built from: changing one of these means
 * markdown-it has to be rebuilt, which updateOptions only does when a value
 * really moved.
 */
const REBUILDS_THE_PROCESSOR: string[] = [
  'enableSyntaxHighlighting',
  'enableMath',
  'enableMermaid',
  'enableAnchors',
  'enableWikiLinks',
  'enableTags',
  'showCodeHeader',
  'showLineNumbers',
  'wrapCodeLines',
  'codeHeight',
  'allowHtml'
];

/*
 * Settings that change which other settings the pane shows, beyond the ones
 * every web part cascades. Link checking only appears with wiki links on.
 */
const REDRAWS_THE_PANE: string[] = [
  'enableWikiLinks'
];

export default class MarkstrataWebPart extends StrataWebPart<IMarkstrataWebPartProps> {
  private processor: MarkdownProcessor;
  private mermaid: MermaidRenderer;
  private enhancer: ContentEnhancer;
  private viewRenderer: ViewModeRenderer;
  private editManager: EditModeManager;

  // ----------------------------------------------------------------- contract

  protected get documentText(): string {
    return this.properties.markdownContent;
  }

  protected set documentText(value: string) {
    this.properties.markdownContent = value;
  }

  protected logName(): string {
    return 'Markstrata';
  }

  protected rebuildsRenderer(): string[] {
    return REBUILDS_THE_PROCESSOR;
  }

  protected redrawsPane(): string[] {
    return REDRAWS_THE_PANE;
  }

  protected loadFailure(error: Error): string {
    return `Could not load the markdown: ${error.message}`;
  }

  protected sampleContent(): string | undefined {
    return strings.SampleContent;
  }

  /**
   * The markdown itself is searchable as well as the rendered text, so a
   * document that failed to render is still findable by what it says.
   */
  protected get propertiesMetadata(): IWebPartPropertiesMetadata {
    return {
      ...super.propertiesMetadata,
      markdownContent: { isSearchablePlainText: true }
    };
  }

  /**
   * Defaults markdown has and HTML does not.
   *
   * markdownContent is empty rather than the sample. A web part that ships
   * showing a document about itself is indistinguishable from a configured
   * one, so nobody can tell a page that was never set up from a page that was
   * - least of all a reader, and least of all in a Teams tab, where there is
   * no property pane in sight to suggest otherwise. The sample is one click
   * away in the panel below instead.
   */
  protected ownDefaults(): Record<string, unknown> {
    return {
      markdownContent: '',
      enableSyntaxHighlighting: true,
      showCodeHeader: true,
      showLineNumbers: false,
      wrapCodeLines: false,
      codeHeight: 'full',
      enableMermaid: true,
      diagramWidth: 'fit',
      enableWikiLinks: false,
      checkWikiLinks: true,
      enableTags: false,
      enableMath: true,
      enableAnchors: true,
      allowHtml: false
    };
  }

  // --------------------------------------------------------------- renderers

  protected buildRenderers(): void {
    this.processor = new MarkdownProcessor(this.processorOptions());
    this.mermaid = new MermaidRenderer();
    this.enhancer = new ContentEnhancer();

    this.viewRenderer = new ViewModeRenderer(this.processor, this.mermaid, this.enhancer, {
      onReload: () => void (this.navigator.path
        ? this.navigator.open(this.navigator.path, '', false)
        : this.loadContent(true)),
      onShowVersions: () => this.detached('The version history could not be shown.',
        this.showVersions()),
      onThemeOverride: (family: ThemeFamily, mode: 'light' | 'dark') => {
        this.themeOverride.set(family, mode);
        this.render();
      },
      onExport: () => this.detached('The document could not be exported.', this.exportPdf())
    });

    this.editManager = new EditModeManager(this.processor, this.mermaid, this.enhancer, {
      onChange: (markdown: string) => {
        this.properties.markdownContent = markdown;
      },
      onSave: async (markdown: string) => {
        const saved: boolean = await this.saveToSharePoint(markdown);
        this.updateSearchText();
        return saved;
      }
    });
  }

  protected refreshRendererOptions(): void {
    /* Guarded because the base refreshes options while loading the configured
       file, which it does before the renderers exist on the very first pass
       through a web part that failed to build them. */
    if (this.processor) {
      this.processor.updateOptions(this.processorOptions());
    }
  }

  protected disposeRenderers(): void {
    this.stopping(() => { if (this.enhancer) { this.enhancer.dispose(); } });
    this.stopping(() => { if (this.editManager) { this.editManager.dispose(); } });
  }

  protected hasUnsavedEdits(): boolean {
    return !!this.editManager && this.editManager.hasUnsavedChanges;
  }

  // ------------------------------------------------------------------ drawing

  protected drawDocument(): void {
    const settings: IThemeSettings = this.themeSettings();
    const mode: ResolvedMode = this.resolvedMode();
    const markdown: string = this.textToDraw();

    /*
     * Not while another document is open.
     *
     * The editor would have shown the followed document's text and saved it
     * over the configured file, because that is the only file the web part is
     * configured to write to: the name on the button said Home.md while the
     * text in the box was somebody's runbook. Saving would have replaced one
     * with the other and said nothing.
     *
     * Version history is already withheld here for the same reason - the
     * versions it lists are the configured file's - so this is the same rule
     * applied to the more dangerous of the two operations. Closing the
     * document, which the bar above it does, gives the editor back.
     */
    const followingAnother: boolean = this.followingAnother();

    if (this.displayMode === DisplayMode.Edit && this.previewContent === undefined
      && !followingAnother) {
      this.editManager.render(this.domElement, markdown, {
        settings: settings,
        resolvedMode: mode,
        enableMermaid: this.properties.enableMermaid,
        diagramWidth: this.properties.diagramWidth,
        enableImageZoom: this.properties.enableImageZoom,
        enableTableSort: this.properties.enableTableSort,
        canSave: this.canSaveToSharePoint(),
        saveTargetName: this.properties.fileMetadata ? this.properties.fileMetadata.name : ''
      });
      // The editor renders a live preview, which is the same rendered text the
      // search index wants - and edit mode is when the page gets saved.
      this.updateSearchText();
      /* Edit mode returns here, before the banners below, so anything an
         author has to be told has to be said on this path as well. This is
         the only one of them that is for an author rather than for a reader,
         which is exactly why it would otherwise never be seen. */
      this.showAddressNotice();
      return;
    }

    const landOn: string | undefined = this.navigator.takeHeading();

    this.viewRenderer.render(this.domElement, markdown, {
      settings: settings,
      resolvedMode: mode,
      showToolbar: this.isToolbarVisible(),
      showThemeSwitcher: this.properties.showThemeSwitcher,
      showExportButton: this.properties.showExportButton,
      tocPosition: this.properties.tocPosition,
      tocMaxLevel: this.properties.tocMaxLevel,
      showSourceInfo: this.properties.showSourceInfo,
      enableMermaid: this.properties.enableMermaid,
      diagramWidth: this.properties.diagramWidth,
      enableImageZoom: this.properties.enableImageZoom,
      enableTableSort: this.properties.enableTableSort,
      showReadingTime: this.properties.showReadingTime,
      backToTop: this.properties.backToTop,
      /* Only a library file has a folder to look in. Markdown typed into the
         web part, or fetched from a URL, has no neighbours to check against. */
      listFolder: this.properties.enableWikiLinks && this.properties.checkWikiLinks
        && this.properties.contentSource === 'library'
        ? (folder: string) => this.sharePoint.listFolderFileNames(folder)
        : undefined,
      /* A fence that named an address is fetched through the same service the
         "File URL" source uses, so it is one place that knows how this page
         asks another server for a file. */
      fetchCode: (url: string) => SharePointService.fetchUrl(url),
      documentBase: this.documentBasePath(),
      /* Drawn by the renderer with everything else on the page, rather than
         pushed in over the top of it afterwards. */
      openDocumentName: this.navigator.name,
      /* The whole trail, so it can be drawn as breadcrumbs: the configured
         document first, every document followed through after it, and the one
         being read last. The configured document is in here rather than in
         the navigator because its name comes from the page's own settings. */
      documentTrail: this.navigator.path
        ? [this.properties.fileMetadata ? this.properties.fileMetadata.name : 'Start']
          .concat(this.navigator.trailNames, [this.navigator.name])
        : undefined,
      /* Crumb zero is the configured document, which sits before the trail
         the navigator keeps, so everything after it is offset by one. */
      onGoToCrumb: (index: number) => { void this.navigator.goTo(index - 1, true); },
      /* And the pages walked before this one, which arrived on the address
         because a navigation is the only thing that can carry them. */
      pageTrail: trailFromSearch(window.location.search),
      hereName: this.navigator.name
        || (this.properties.fileMetadata ? this.properties.fileMetadata.name : undefined),
      /* This page, with any trail already on it taken off: a crumb pointing
         here has the trail as far as here written onto it when it is drawn,
         and a trail nested inside a trail grows without end. */
      pageAddress: withTrail(`${window.location.pathname}${window.location.search}`, []),
      trailVisibility: this.properties.trailVisibility,
      landOnHeading: landOn,
      /* Only from a library: a preview is addressed by a file's id in this
         site, and a document fetched from a URL has neither. */
      officeFileId: this.properties.contentSource === 'library'
        ? (path: string) => this.sharePoint.getFileId(path)
        : undefined,
      webUrl: this.context.pageContext.web.serverRelativeUrl,
      /* Only where the address it builds would be honoured on the way back in.
         A button that copies a link leading somewhere else is worse than no
         button, and following being off is exactly that. */
      shareAddress: this.properties.showShareButton
        && this.properties.followDocumentLinks
        && this.properties.contentSource !== 'manual'
        ? () => this.addressToShare()
        : undefined,
      /* A library or a URL can hand over another document; markdown typed
         into the web part cannot, because there is no folder for a link in it
         to mean anything against. And only a reader is reading: in page edit
         mode a click on a link belongs to the author editing the page, not to
         somebody following it. */
      openDocument: this.properties.followDocumentLinks
        && this.properties.contentSource !== 'manual'
        && this.displayMode !== DisplayMode.Edit
        ? (path: string, heading: string) => void this.navigator.open(path, heading, true)
        : undefined,
      canReload: this.properties.contentSource !== 'manual',
      /* Versions are the configured file's. While another document is open the
         button would offer that file's history for the one on screen. */
      canShowVersions: !this.navigator.path
        && this.properties.enableVersionHistory && this.canSaveToSharePoint(),
      isPageEditing: this.displayMode === DisplayMode.Edit,
      fileMetadata: this.navigator.metadata || this.properties.fileMetadata
    });

    this.updateSearchText();
    this.drawBanners();
  }

  // ------------------------------------------------------------- markdown-it

  private processorOptions(): IMarkdownProcessorOptions {
    return {
      enableSyntaxHighlighting: this.properties.enableSyntaxHighlighting,
      enableMath: this.properties.enableMath,
      enableMermaid: this.properties.enableMermaid,
      enableToc: true,
      /* The same number the sidebar contents uses, so a document carrying
         [[toc]] and a sidebar does not show two contents that disagree about
         how deep it goes. */
      tocMaxLevel: this.properties.tocMaxLevel,
      enableAnchors: this.properties.enableAnchors,
      enableWikiLinks: this.properties.enableWikiLinks,
      enableTags: this.properties.enableTags,
      showCodeHeader: this.properties.showCodeHeader,
      showLineNumbers: this.properties.showLineNumbers,
      wrapCodeLines: this.properties.wrapCodeLines,
      codeHeight: this.properties.codeHeight,
      allowHtml: this.properties.allowHtml,
      imageBasePath: this.documentBasePath()
    };
  }

  // --------------------------------------------------------- property pane

  /**
   * A web part that could not start still has a pane, because an author will
   * open one to find out why. Nothing here may assume the web part got as far
   * as building the thing that fetches these lists: an exception thrown while
   * describing the pane lands in the page, not in the pane.
   */
  protected getPropertyPaneConfiguration(): IPropertyPaneConfiguration {
    const sources: PaneSources | { libraries: []; folders: []; files: [] } =
      this.paneSources || { libraries: [], folders: [], files: [] };

    return paneConfiguration(this.properties, {
      libraries: sources.libraries,
      folders: sources.folders,
      files: sources.files
    });
  }
}
