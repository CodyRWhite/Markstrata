/**
 * .SYNOPSIS
 * The HTML web part: an author's HTML document, drawn in a SharePoint page or
 * a Teams tab with the same chrome the markdown web part has.
 *
 * .DESCRIPTION
 * Everything about a Markstrata web part that is not about rendering is in
 * StrataWebPart: starting up, loading the file, the theme, the toolbar's
 * callbacks, following links, exporting, the search index. What is here is what
 * is particular to HTML.
 *
 * WHAT IS PARTICULAR TO HTML
 * A second file. A stylesheet is chosen separately from the document and
 * fetched separately, because one stylesheet in a library is meant to dress
 * every HTML web part in a site. So this web part has two cascades of
 * library, folder and file pickers rather than one, and two things it can fail
 * to load - and a stylesheet that will not load is a document that looks wrong
 * rather than a document that is missing, so it is reported as its own banner
 * and never as a failure to draw.
 *
 * A render mode. How much of the page the document is allowed to be part of
 * is the central decision here and has no equivalent in markdown; see
 * HtmlViewRenderer for what each of the three costs and gives.
 *
 * WHAT IS DELIBERATELY DIFFERENT FROM THE MARKDOWN WEB PART
 * The document's own text is not declared searchable. In the markdown web part
 * it is, so a document that failed to render is still findable by what it says.
 * Here the text is markup: feeding it to the index would fill the search
 * results with tag names and attribute values. The rendered text is indexed
 * instead, which the base already does.
 *
 * And "fit content" is withheld from a frame that runs scripts, rather than
 * quietly behaving as one of the other heights. Such a frame is an opaque
 * origin and there is no reading its height from the page.
 *
 * .USAGE
 *   Add "Markstrata - HTML" to a page, then open the property pane and choose
 *   where the HTML comes from.
 *
 * .NOTES
 * Since:     0.0.22.0
 * Ships in:  the HTML web part bundle
 * Requires:  StrataWebPart.ts, HtmlViewRenderer.ts, ContentEnhancer.ts,
 *            HtmlEditModeManager.ts, htmlPropertyPane.ts, paneSources.ts,
 *            SharePointService.ts
 * Runs in:   a SharePoint page or a Teams tab, through @microsoft/sp-webpart-base
 */

import { DisplayMode } from '@microsoft/sp-core-library';
import { IPropertyPaneConfiguration } from '@microsoft/sp-property-pane';
import * as strings from 'MarkstrataWebPartStrings';

/* The chrome, the themes and the typography are the markdown web part's
   stylesheets, because the chrome is the same chrome. Loaded in this order
   because later rules override earlier ones, and html.css last of all.

   Four of the markdown stylesheets are absent on purpose: code.css and
   syntax.css dress the wrappers markdown-it builds around a fence, callouts.css
   the blockquote syntax, and none of the three has anything to select in an
   HTML document. KaTeX's stylesheet is absent for the same reason, which also
   keeps its fonts out of this bundle. */
import '../markstrata/styles/base.css';
import '../markstrata/styles/typography.css';
import '../markstrata/styles/tables-lists.css';
import '../markstrata/styles/extras.css';
import '../markstrata/styles/chrome.css';
import '../markstrata/styles/themes/github.css';
import '../markstrata/styles/themes/obsidian.css';
import '../markstrata/styles/themes/vscode.css';
import '../markstrata/styles/modifiers.css';
import '../markstrata/styles/print.css';
import './styles/html.css';

import { StrataWebPart, IUnconfiguredGuidance } from '../shared/StrataWebPart';
import { ContentEnhancer } from '../markstrata/utils/ContentEnhancer';
import { SharePointService } from '../markstrata/utils/SharePointService';
import { ThemeFamily } from '../markstrata/utils/ThemeManager';
import { PaneSources, IPickedFile } from '../markstrata/paneSources';
import { addressForDocument } from '../markstrata/utils/documentParameter';
import { resolveAgainst } from '../markstrata/utils/imagePaths';
import { fileOf } from '../markstrata/utils/wikiLinks';
import { IMarkstrataHtmlWebPartProps } from './htmlWebPartProps';
import { HtmlViewRenderer, IHtmlViewOptions } from './utils/HtmlViewRenderer';
import { HtmlEditModeManager } from './utils/HtmlEditModeManager';
import { htmlPaneConfiguration } from './htmlPropertyPane';

/** Which files the document picker offers. */
const HTML_EXTENSIONS: string[] = ['.html', '.htm'];

/** And the stylesheet picker. */
const CSS_EXTENSIONS: string[] = ['.css'];

/** The three properties the stylesheet's own cascade of pickers reads. */
const THE_STYLESHEET: IPickedFile = {
  library: 'selectedStyleLibrary',
  folder: 'selectedStyleFolder',
  file: 'selectedStyleFile'
};

/**
 * Settings that change which other settings the pane shows, beyond the ones
 * every web part cascades.
 *
 * Scripts are only offered in frame mode; the height a frame can be told to
 * take depends on whether its scripts run; the stylesheet's own pickers depend
 * on where it comes from; and the number of pixels only exists once a fixed
 * height is asked for.
 */
const REDRAWS_THE_PANE: string[] = [
  'renderMode',
  'runScripts',
  'heightMode',
  'cssSource'
];

/**
 * Settings that change what the renderer is given rather than how it draws.
 *
 * The renderer here is handed every option afresh on each draw, so unlike the
 * markdown web part there is nothing to rebuild - but the folder a document
 * resolves its links and pictures against is worked out once, and these are
 * the settings that move it.
 */
const MOVES_THE_DOCUMENT: string[] = [
  'contentSource',
  'selectedLibrary',
  'selectedFolder',
  'selectedFile',
  'fileUrl'
];

export default class MarkstrataHtmlWebPart extends StrataWebPart<IMarkstrataHtmlWebPartProps> {
  private enhancer: ContentEnhancer;
  private viewRenderer: HtmlViewRenderer;
  private editManager: HtmlEditModeManager;
  /** The stylesheet's own cascade of pickers, which is not the document's. */
  private styleSources: PaneSources;
  /** The stylesheet as fetched, empty when there is none or it would not load. */
  private sharedCss: string = '';
  /** Why the stylesheet is not there, when it should have been. */
  private cssError: string | undefined;

  // ----------------------------------------------------------------- contract

  protected get documentText(): string {
    return this.properties.htmlContent;
  }

  protected set documentText(value: string) {
    this.properties.htmlContent = value;
  }

  protected logName(): string {
    return 'Markstrata HTML';
  }

  protected rebuildsRenderer(): string[] {
    return MOVES_THE_DOCUMENT;
  }

  protected redrawsPane(): string[] {
    return REDRAWS_THE_PANE;
  }

  protected loadFailure(error: Error): string {
    return `Could not load the HTML: ${error.message}`;
  }

  protected sampleContent(): string | undefined {
    return strings.HtmlSampleContent;
  }

  protected unconfiguredGuidance(): IUnconfiguredGuidance {
    return {
      inPane: strings.UnconfiguredInPaneHtml,
      inTeams: strings.UnconfiguredInTeamsHtml
    };
  }

  /**
   * Where the search index reads the document from.
   *
   * Not `.strata-content` in the page, because in two of the three render modes
   * it is not there to be found: behind a shadow boundary the page's own
   * querySelector cannot see through, or in a frame the page cannot reach into
   * at all. The renderer keeps the element it actually drew.
   */
  protected indexedArticle(): HTMLElement | undefined {
    return this.viewRenderer ? this.viewRenderer.indexedContent() : undefined;
  }

  /**
   * Defaults HTML has and markdown does not.
   *
   * htmlContent is empty rather than the sample, for the same reason the
   * markdown web part's is: a web part that ships showing a document about
   * itself is indistinguishable from a configured one.
   *
   * Inline, because it is the mode that works with the most of the rest of the
   * web part and the one an author who has not thought about isolation wants.
   * Scripts off, because the opposite is not a default anybody should get
   * without choosing it.
   */
  protected ownDefaults(): Record<string, unknown> {
    return {
      htmlContent: '',
      cssSource: 'none',
      cssContent: '',
      selectedStyleLibrary: '',
      selectedStyleFolder: '',
      selectedStyleFile: '',
      cssFileUrl: '',
      renderMode: 'inline',
      runScripts: false,
      fullBleed: false,
      heightMode: 'fit',
      /* Only read when the height is fixed, and this is a screenful on a
         laptop rather than a number with nothing behind it. */
      fixedHeight: 600,
      showOnNarrowScreens: true
    };
  }

  // --------------------------------------------------------------- renderers

  /** The document picker offers HTML files, not markdown ones. */
  protected buildPaneSources(): PaneSources {
    return new PaneSources(this.sharePoint, this.properties, HTML_EXTENSIONS);
  }

  protected buildRenderers(): void {
    this.enhancer = new ContentEnhancer();
    /* The stylesheet's pickers are built here rather than in buildPaneSources,
       which the base calls for the document's. Same cascade, different three
       properties. */
    this.styleSources = new PaneSources(
      this.sharePoint, this.properties, CSS_EXTENSIONS, THE_STYLESHEET
    );

    this.viewRenderer = new HtmlViewRenderer(this.enhancer, {
      onReload: () => void (this.navigator.path
        ? this.navigator.open(this.navigator.path, '', false)
        : this.reloadEverything()),
      onShowVersions: () => this.detached('The version history could not be shown.',
        this.showVersions()),
      onThemeOverride: (family: ThemeFamily, mode: 'light' | 'dark') => {
        this.themeOverride.set(family, mode);
        this.render();
      },
      onExport: () => this.detached('The document could not be exported.', this.exportPdf())
    });

    this.editManager = new HtmlEditModeManager(this.viewRenderer, this.enhancer, {
      onChange: (html: string) => {
        this.properties.htmlContent = html;
      },
      /* Kept on the web part rather than saved anywhere: a stylesheet typed
         into the pane is stored with the part, and SharePoint writes it when
         the page is written. */
      onStyleChange: (css: string) => {
        this.properties.cssContent = css;
      },
      onSave: async (html: string) => {
        const saved: boolean = await this.saveToSharePoint(html);
        this.updateSearchText();
        return saved;
      }
    });
  }

  /**
   * Nothing to refresh, and that is not an oversight.
   *
   * The markdown web part rebuilds markdown-it here, because a setting changed
   * in the pane changes how the source is parsed. Nothing here parses
   * anything: the renderer is handed every option afresh on each draw, so a
   * changed setting is simply drawn.
   */
  protected refreshRendererOptions(): void {
    /* Nothing to do. See above. */
  }

  protected disposeRenderers(): void {
    this.stopping(() => { if (this.enhancer) { this.enhancer.dispose(); } });
    this.stopping(() => { if (this.editManager) { this.editManager.dispose(); } });
  }

  protected hasUnsavedEdits(): boolean {
    return !!this.editManager && this.editManager.hasUnsavedChanges;
  }

  // -------------------------------------------------------------- stylesheet

  /** The stylesheet, before the first draw rather than after it. */
  protected async startedUp(): Promise<void> {
    await this.loadStylesheet();
    this.detached('The stylesheet pickers could not be filled in.',
      this.styleSources.loadAll());
  }

  /**
   * Fetches the stylesheet, if there is one to fetch.
   *
   * A stylesheet that will not load never stops the document being drawn. The
   * document is the thing somebody came to read, and it is readable unstyled;
   * saying so in a banner is the whole of the right answer.
   */
  private async loadStylesheet(): Promise<void> {
    this.cssError = undefined;

    try {
      if (this.properties.cssSource === 'library' && this.properties.selectedStyleFile) {
        this.sharedCss = await this.sharePoint.getFileContent(this.properties.selectedStyleFile);
      } else if (this.properties.cssSource === 'url' && this.properties.cssFileUrl) {
        this.sharedCss = await SharePointService.fetchUrl(this.properties.cssFileUrl);
      } else {
        /* Typed in the pane, or none at all. Neither needs fetching, and
           whatever was fetched before must not be left behind. */
        this.sharedCss = '';
      }
    } catch (error) {
      this.sharedCss = '';
      this.cssError = `Could not load the stylesheet: ${(error as Error).message}`;
    }
  }

  /** What the renderer is given, which is the fetched sheet or the typed one. */
  private stylesheet(): string {
    if (this.properties.cssSource === 'manual') {
      return this.properties.cssContent || '';
    }
    return this.sharedCss;
  }

  /** The document and its stylesheet, both, which is what Reload should mean. */
  private async reloadEverything(): Promise<void> {
    await this.loadStylesheet();
    await this.loadContent(true);
  }

  // ------------------------------------------------------------------ drawing

  protected drawDocument(): void {
    const html: string = this.textToDraw();
    const editing: boolean = this.displayMode === DisplayMode.Edit;
    const options: IHtmlViewOptions = this.viewOptions(editing);

    /*
     * Not while another document is open.
     *
     * The editor would have shown the followed document's text and saved it
     * over the configured file, because that is the only file this web part is
     * configured to write to. Closing the document, which the bar above it
     * does, gives the editor back. The markdown web part withholds it here for
     * the same reason.
     */
    if (editing && this.previewContent === undefined && !this.followingAnother()) {
      this.editManager.render(this.domElement, html, {
        view: options,
        canSave: this.canSaveToSharePoint(),
        saveTargetName: this.properties.fileMetadata ? this.properties.fileMetadata.name : '',
        css: this.stylesheet(),
        /* Only a stylesheet typed into the pane belongs to this web part.
           One in a library or at an address belongs to that file, and several
           web parts are probably reading it. */
        canEditCss: this.properties.cssSource === 'manual',
        cssOrigin: this.cssOrigin(),
        scriptsPaused: this.properties.runScripts && this.properties.renderMode === 'frame'
      });
      /* The editor draws a live preview, which is the same rendered text the
         search index wants - and edit mode is when the page gets saved. */
      this.updateSearchText();
      /* This is the only banner that is for an author rather than a reader,
         which is exactly why it would otherwise never be seen. */
      this.showAddressNotice();
      this.sayStylesheetTrouble();
      return;
    }

    /* Taken here rather than in viewOptions, because taking it consumes it. */
    options.landOnHeading = this.navigator.takeHeading();

    this.viewRenderer.render(this.domElement, html, options);

    this.updateSearchText();
    this.drawBanners();
    this.sayStylesheetTrouble();
  }

  /**
   * Everything the document is drawn from, whether it is drawn in the page or
   * in the editor's preview.
   *
   * One object rather than two, so the preview cannot be drawn from settings
   * the page is not using. The editor overrides the stylesheet, because in
   * there the stylesheet is whatever the author has just typed.
   */
  private viewOptions(editing: boolean): IHtmlViewOptions {
    return {
      settings: this.themeSettings(),
      resolvedMode: this.resolvedMode(),
      showToolbar: this.isToolbarVisible(),
      showThemeSwitcher: this.properties.showThemeSwitcher,
      /* An export is laid out from the rendered document, and there is no
         reaching into a frame to lay anything out. Absent rather than
         disabled: a button that does nothing is worse than no button. */
      showExportButton: this.properties.showExportButton
        && this.properties.renderMode !== 'frame',
      tocPosition: this.properties.tocPosition,
      tocMaxLevel: this.properties.tocMaxLevel,
      showSourceInfo: this.properties.showSourceInfo,
      enableImageZoom: this.properties.enableImageZoom,
      enableTableSort: this.properties.enableTableSort,
      showReadingTime: this.properties.showReadingTime,
      backToTop: this.properties.backToTop,
      documentBase: this.documentBasePath(),
      renderMode: this.properties.renderMode,
      sharedCss: this.stylesheet(),
      /*
       * Never while the page is being edited.
       *
       * An author arranging a page is clicking on web parts to select them,
       * not reading a document, and a script that moved things under them
       * would make the page hard to lay out. It is also the one time the
       * document on screen is one somebody is still writing.
       */
      runScripts: this.properties.runScripts && !editing,
      fullBleed: this.properties.fullBleed,
      /* A frame running scripts cannot be measured from out here, so "fit
         content" is not an answer it can be given. Fixed is the nearest thing
         that means something; the pane does not offer the choice at all, and
         this is what an older page saved with it lands on. */
      heightMode: this.properties.renderMode === 'frame' && this.properties.runScripts
        && this.properties.heightMode === 'fit'
        ? 'fixed'
        : this.properties.heightMode,
      fixedHeight: this.properties.fixedHeight,
      showOnNarrowScreens: this.properties.showOnNarrowScreens,
      openDocumentName: this.navigator.name,
      documentTrail: this.navigator.path
        ? [this.properties.fileMetadata ? this.properties.fileMetadata.name : 'Start']
          .concat(this.navigator.trailNames, [this.navigator.name])
        : undefined,
      onGoToCrumb: (index: number) => { void this.navigator.goTo(index - 1, true); },
      /* Taken by the read path, never here: takeHeading consumes it, and an
         author in edit mode has no document on screen to land on. Consumed
         here it would be gone by the time they left edit mode. */
      landOnHeading: undefined,
      shareAddress: this.properties.showShareButton
        && this.properties.followDocumentLinks
        && this.properties.contentSource !== 'manual'
        ? () => this.addressToShare()
        : undefined,
      /* Inline and shadow mode hand a click back to the web part. A frame
         cannot: nothing in one can call out to a handler, so it is given the
         address instead and the link carries the reader there itself. */
      openDocument: this.followingLinks() && !editing
        ? (path: string, heading: string) => void this.navigator.open(path, heading, true)
        : undefined,
      documentAddress: this.followingLinks() && !editing
        ? (href: string) => this.addressForNeighbour(href)
        : undefined,
      canReload: this.properties.contentSource !== 'manual',
      canShowVersions: !this.navigator.path
        && this.properties.enableVersionHistory && this.canSaveToSharePoint(),
      isPageEditing: editing,
      fileMetadata: this.navigator.metadata || this.properties.fileMetadata
    };
  }

  /**
   * Where the stylesheet comes from, in a sentence, for the editor's read-only
   * tab. Empty when the author typed it in the pane, which is when it can be
   * edited here.
   */
  private cssOrigin(): string {
    if (this.properties.cssSource === 'library' && this.properties.selectedStyleFile) {
      return `the file ${fileOf(this.properties.selectedStyleFile)} in a document library`;
    }
    if (this.properties.cssSource === 'url' && this.properties.cssFileUrl) {
      return 'a file at the address set in the property pane';
    }
    return '';
  }

  /**
   * Whether a link to a neighbouring document opens here.
   *
   * The same three conditions as the markdown web part: the setting is on, and
   * there is a folder for a relative link to mean something against.
   */
  private followingLinks(): boolean {
    return this.properties.followDocumentLinks
      && this.properties.contentSource !== 'manual';
  }

  /**
   * The address that opens a neighbouring document, for a link in a frame.
   *
   * Inline and shadow mode hand the click back to the web part, which resolves
   * the link itself. A frame cannot: nothing in one can call out to a handler,
   * so the link has to carry a complete address before it ever reaches the
   * reader. Which means doing here what the click handler would have done -
   * resolving the href against the folder the document is in, then naming it
   * relative to the configured folder, which is the form the page reads back.
   *
   * A heading on the link is carried over rather than dropped: a link to
   * `rollback.html#undo` should land on the section it names.
   */
  private addressForNeighbour(href: string): string {
    const [path, heading]: string[] = href.split('#');
    const base: string | undefined = this.documentBasePath();
    const resolved: string | undefined = base ? resolveAgainst(base, path) : undefined;

    return addressForDocument(
      window.location.href,
      resolved || path,
      heading,
      this.configuredFolder()
    );
  }

  /**
   * A stylesheet that should have been there and is not.
   *
   * A warning rather than a failure, and shown to a reader as well as to an
   * author: the document is readable unstyled, and a reader who can see it
   * looks wrong is better told why than left to think the document is broken.
   *
   * The scripts-paused notice is not here. It belongs to the editor, which is
   * the only place it applies and which draws it above the panes.
   */
  private sayStylesheetTrouble(): void {
    if (this.cssError) {
      this.showBanner(this.cssError, 'warning');
    }
  }

  // --------------------------------------------------------- property change

  // eslint-disable-next-line @typescript-eslint/no-explicit-any
  protected onOwnPropertyChanged(propertyPath: string, oldValue: any, newValue: any): void {
    /*
     * The height an author chose and the one the theme reads are the same
     * decision, and fillHeight is what the stylesheets and the layout already
     * key off. Kept in step here rather than shown to an author as two
     * controls that can disagree about the same thing.
     */
    if (propertyPath === 'heightMode') {
      this.properties.fillHeight = newValue === 'window';
    }

    if (propertyPath === 'cssSource' || propertyPath === 'cssFileUrl'
      || propertyPath === 'selectedStyleFile') {
      this.detached('The stylesheet could not be loaded.',
        this.loadStylesheet().then(() => this.render()));
    }

    if (propertyPath === 'selectedStyleLibrary') {
      this.properties.selectedStyleFolder = '';
      this.properties.selectedStyleFile = '';
      this.detached('The folders in that library could not be listed.',
        this.styleSources.loadFolders()
          .then(() => this.styleSources.loadFiles())
          .then(() => this.context.propertyPane.refresh()));
    }

    if (propertyPath === 'selectedStyleFolder') {
      this.properties.selectedStyleFile = '';
      this.detached('The files in that folder could not be listed.',
        this.styleSources.loadFiles().then(() => this.context.propertyPane.refresh()));
    }
  }

  // --------------------------------------------------------- property pane

  /**
   * A web part that could not start still has a pane, because an author will
   * open one to find out why. Nothing here may assume the web part got as far
   * as building the things that fetch these lists.
   */
  protected getPropertyPaneConfiguration(): IPropertyPaneConfiguration {
    const empty: { libraries: []; folders: []; files: [] } =
      { libraries: [], folders: [], files: [] };
    const documents: PaneSources | typeof empty = this.paneSources || empty;
    const styles: PaneSources | typeof empty = this.styleSources || empty;

    return htmlPaneConfiguration(
      this.properties,
      { libraries: documents.libraries, folders: documents.folders, files: documents.files },
      { libraries: styles.libraries, folders: styles.folders, files: styles.files }
    );
  }
}
