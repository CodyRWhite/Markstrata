import { Version, DisplayMode } from '@microsoft/sp-core-library';
import {
  IPropertyPaneConfiguration,
  IPropertyPaneDropdownOption
} from '@microsoft/sp-property-pane';
import { BaseClientSideWebPart, IWebPartPropertiesMetadata } from '@microsoft/sp-webpart-base';
import { ThemeProvider, IReadonlyTheme } from '@microsoft/sp-component-base';
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

import { MarkdownProcessor, IMarkdownProcessorOptions } from './utils/MarkdownProcessor';
import { folderOf } from './utils/imagePaths';
import { fileOf } from './utils/wikiLinks';
import { TocWidthUnit, tocWidthCss, tocWidthForUnit } from './utils/tocWidth';
import { MermaidRenderer } from './utils/MermaidRenderer';
import { ContentEnhancer } from './utils/ContentEnhancer';
import { ViewModeRenderer } from './utils/ViewModeRenderer';
import { EditModeManager } from './utils/EditModeManager';
import { VersionPanel } from './utils/VersionPanel';
import { SharePointService, IFileMetadata, ILibraryInfo } from './utils/SharePointService';
import {
  ThemeManager,
  IThemeSettings,
  ResolvedMode,
  ThemeFamily
} from './utils/ThemeManager';

/* Re-exported so the web part is still the one name to import for its own
   shape, wherever the declaration lives. */
export { IMarkstrataWebPartProps } from './webPartProps';
import { IMarkstrataWebPartProps } from './webPartProps';
import { paneConfiguration } from './propertyPane';

/** Longest text handed to the search index, to keep the page payload sane. */
const MAX_SEARCH_TEXT: number = 20000;

interface IThemeOverride {
  themeFamily: ThemeFamily;
  colorMode: 'light' | 'dark';
}

export default class MarkstrataWebPart extends BaseClientSideWebPart<IMarkstrataWebPartProps> {
  private processor: MarkdownProcessor;
  private mermaid: MermaidRenderer;
  private enhancer: ContentEnhancer;
  private viewRenderer: ViewModeRenderer;
  private editManager: EditModeManager;
  private versionPanel: VersionPanel;
  private sharePoint: SharePointService;
  private themeProvider: ThemeProvider;
  /** Kept so the listener can be detached again; SPFx matches on the handler. */
  private handleThemeChanged: (args: { theme?: IReadonlyTheme }) => void;

  private isInverted: boolean | undefined;
  private themeOverride: IThemeOverride | undefined;
  private loadError: string | undefined;
  /** Suppresses the extra render on first load; SPFx renders straight after onInit. */
  private contentLoadedOnce: boolean = false;
  private previewBanner: string | undefined;
  private previewContent: string | undefined;

  /*
   * A document the reader followed a link to.
   *
   * Kept apart from the properties on purpose. Properties are the page's
   * configuration and are saved with it, so writing a followed document into
   * selectedFile would change what everyone sees the next time the page is
   * saved. Reading is not configuring.
   */
  private openPath: string | undefined;
  private openMarkdown: string | undefined;
  private openMetadata: IFileMetadata | undefined;
  /** A heading to land on once the followed document has been drawn. */
  private openHeading: string | undefined;
  private onPopState: ((event: PopStateEvent) => void) | undefined;

  private libraryOptions: IPropertyPaneDropdownOption[] = [];
  private folderOptions: IPropertyPaneDropdownOption[] = [];
  private fileOptions: IPropertyPaneDropdownOption[] = [];

  // --------------------------------------------------------------- lifecycle

  protected async onInit(): Promise<void> {
    await super.onInit();

    this.applyDefaults();
    this.readThemeOverride();

    this.themeProvider = this.context.serviceScope.consume(ThemeProvider.serviceKey);
    const theme: IReadonlyTheme | undefined = this.themeProvider.tryGetTheme();
    this.isInverted = theme ? theme.isInverted : undefined;
    this.handleThemeChanged = (args: { theme?: IReadonlyTheme }): void => {
      this.isInverted = args.theme ? args.theme.isInverted : undefined;
      if (this.properties.colorMode === 'auto') {
        this.render();
      }
    };
    this.themeProvider.themeChangedEvent.add(this, this.handleThemeChanged);

    this.sharePoint = new SharePointService(this.context);
    this.processor = new MarkdownProcessor(this.processorOptions());
    this.mermaid = new MermaidRenderer();
    this.enhancer = new ContentEnhancer();

    this.viewRenderer = new ViewModeRenderer(this.processor, this.mermaid, this.enhancer, {
      onReload: () => void (this.openPath
        ? this.openDocument(this.openPath, '', false)
        : this.loadContent(true)),
      onShowVersions: () => void this.showVersions(),
      onThemeOverride: (family: ThemeFamily, mode: 'light' | 'dark') => this.setThemeOverride(family, mode),
      onPrint: () => window.print()
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

    this.versionPanel = new VersionPanel(this.sharePoint, {
      onPreview: (content: string, label: string) => {
        this.previewContent = content;
        this.previewBanner = `Previewing version ${label}. Reload to go back to the current version.`;
        this.render();
      },
      onRestored: () => void this.loadContent(true)
    });

    void this.loadPropertyPaneSources();
    await this.loadContent(false);
  }

  protected onDispose(): void {
    if (this.themeProvider && this.handleThemeChanged) {
      this.themeProvider.themeChangedEvent.remove(this, this.handleThemeChanged);
    }
    this.sharePoint.unwatchFile();
    if (this.onPopState) {
      window.removeEventListener('popstate', this.onPopState);
      this.onPopState = undefined;
    }
    this.enhancer.dispose();
    this.editManager.dispose();
    super.onDispose();
  }

  protected get dataVersion(): Version {
    return Version.parse('1.0');
  }

  /**
   * Tells SharePoint which properties carry indexable content, so the rendered
   * text is findable in Microsoft Search and links are rewritten when a site is
   * copied. Without this, markdown rendered by a client-side web part is
   * invisible to search.
   */
  protected get propertiesMetadata(): IWebPartPropertiesMetadata {
    return {
      searchablePlainText: { isSearchablePlainText: true },
      markdownContent: { isSearchablePlainText: true },
      fileUrl: { isLink: true }
    };
  }

  /** Defaults matter here: an unconfigured web part still has to look right. */
  private applyDefaults(): void {
    const defaults: Partial<IMarkstrataWebPartProps> = {
      contentSource: 'manual',
      markdownContent: strings.SampleContent,
      fileUrl: '',
      selectedLibrary: '',
      selectedFolder: '',
      selectedFile: '',
      enableAutoRefresh: false,
      themeFamily: 'github',
      colorMode: 'light',
      contentWidth: 'comfortable',
      density: 'normal',
      textSize: 'normal',
      codeSize: 'normal',
      imageAlign: 'left',
      showThemeSwitcher: false,
      enableSyntaxHighlighting: true,
      showCodeHeader: true,
      showLineNumbers: false,
      wrapCodeLines: false,
      enableMermaid: true,
      diagramWidth: 'fit',
      enableImageZoom: true,
      enableTableSort: true,
      followDocumentLinks: true,
      enableWikiLinks: false,
      checkWikiLinks: true,
      showReadingTime: false,
      backToTop: 'right',
      enableMath: true,
      enableAnchors: true,
      tocPosition: 'off',
      tocMaxLevel: 3,
      tocWidthMode: 'auto',
      tocWidthUnit: 'em',
      tocWidthValue: 15,
      toolbarVisibility: 'always',
      showPrintButton: true,
      showSourceInfo: true,
      pinMeta: false,
      fillHeight: false,
      enableVersionHistory: true,
      allowHtml: false,
      searchablePlainText: ''
    };

    const properties: Record<string, unknown> = this.properties as unknown as Record<string, unknown>;
    const fallbacks: Record<string, unknown> = defaults as Record<string, unknown>;

    Object.keys(fallbacks).forEach((key: string) => {
      if (properties[key] === undefined || properties[key] === null) {
        properties[key] = fallbacks[key];
      }
    });
  }

  // ------------------------------------------------------------------ render

  public render(): void {
    // The panel lives inside the element we are about to rebuild, so drop it
    // rather than leave the toggle thinking it is still open.
    this.versionPanel.close();

    const settings: IThemeSettings = this.themeSettings();
    const mode: ResolvedMode = this.resolvedMode();
    /* A version being previewed wins over a document being read, which wins
       over the one the page is configured to show. */
    const markdown: string = this.previewContent !== undefined
      ? this.previewContent
      : (this.openMarkdown !== undefined ? this.openMarkdown : this.properties.markdownContent);

    if (this.displayMode === DisplayMode.Edit && this.previewContent === undefined) {
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
      return;
    }

    /* Read once and cleared here: a re-render for a theme change must not send
       the reader back to a heading they have since scrolled away from. */
    const landOn: string | undefined = this.openHeading;
    this.openHeading = undefined;

    this.viewRenderer.render(this.domElement, markdown, {
      settings: settings,
      resolvedMode: mode,
      showToolbar: this.isToolbarVisible(),
      showThemeSwitcher: this.properties.showThemeSwitcher,
      showPrintButton: this.properties.showPrintButton,
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
      documentBase: this.imageBasePath(),
      /* Drawn by the renderer with everything else on the page, rather than
         pushed in over the top of it afterwards. */
      openDocumentName: this.openMetadata ? this.openMetadata.name : fileOf(this.openPath || ''),
      homeDocumentName: this.properties.fileMetadata
        ? this.properties.fileMetadata.name : '',
      onCloseDocument: () => this.closeDocument(true),
      landOnHeading: landOn,
      /* Only a library can hand over another document, and only a reader is
         reading: in page edit mode a click on a link belongs to the author
         editing the page, not to somebody following it. */
      openDocument: this.properties.followDocumentLinks
        && this.properties.contentSource === 'library'
        && this.displayMode !== DisplayMode.Edit
        ? (path: string, heading: string) => void this.openDocument(path, heading, true)
        : undefined,
      canReload: this.properties.contentSource !== 'manual',
      /* Versions are the configured file's. While another document is open the
         button would offer that file's history for the one on screen. */
      canShowVersions: !this.openPath
        && this.properties.enableVersionHistory && this.canSaveToSharePoint(),
      isPageEditing: this.displayMode === DisplayMode.Edit,
      fileMetadata: this.openMetadata || this.properties.fileMetadata
    });

    this.updateSearchText();

    if (this.previewBanner) {
      this.showBanner(this.previewBanner, 'success');
    }
    if (this.loadError) {
      this.showBanner(this.loadError, 'error');
    }
  }

  /** The contents are only a sidebar on two of the four placements. */
  /** True when the toolbar should be shown for the current display mode. */
  private isToolbarVisible(): boolean {
    if (this.properties.toolbarVisibility === 'never') {
      return false;
    }
    if (this.properties.toolbarVisibility === 'editing') {
      return this.displayMode === DisplayMode.Edit;
    }
    return true;
  }

  /**
   * Copies the rendered text into a searchable property. Read from the DOM so
   * markdown syntax, code fences and HTML never reach the index.
   */
  private updateSearchText(): void {
    const article: HTMLElement | null = this.domElement.querySelector('.strata-content');
    if (!article) {
      return;
    }
    const text: string = (article.textContent || '').replace(/\s+/g, ' ').trim();
    this.properties.searchablePlainText = text.substring(0, MAX_SEARCH_TEXT);
  }

  private showBanner(message: string, tone: string): void {
    const banner: HTMLElement = document.createElement('div');
    banner.className = 'strata-status';
    banner.setAttribute('data-tone', tone);
    banner.style.display = 'block';
    banner.style.marginBottom = '12px';
    banner.textContent = message;
    // Inside the themed root, or it renders unstyled beside the web part.
    const root: HTMLElement = this.domElement.querySelector('.strata-root') || this.domElement;
    root.insertBefore(banner, root.firstChild);
  }

  private themeSettings(): IThemeSettings {
    return {
      themeFamily: this.themeOverride ? this.themeOverride.themeFamily : this.properties.themeFamily,
      colorMode: this.themeOverride ? this.themeOverride.colorMode : this.properties.colorMode,
      contentWidth: this.properties.contentWidth,
      density: this.properties.density,
      textSize: this.properties.textSize,
      codeSize: this.properties.codeSize,
      imageAlign: this.properties.imageAlign,
      tocWidth: tocWidthCss(this.properties.tocWidthMode, this.properties.tocWidthUnit,
        this.properties.tocWidthValue),
      pinMeta: this.properties.pinMeta,
      fillHeight: this.properties.fillHeight
    };
  }

  private resolvedMode(): ResolvedMode {
    const settings: IThemeSettings = this.themeSettings();
    return ThemeManager.resolveMode(settings.colorMode, this.isInverted);
  }

  private processorOptions(): IMarkdownProcessorOptions {
    return {
      enableSyntaxHighlighting: this.properties.enableSyntaxHighlighting,
      enableMath: this.properties.enableMath,
      enableMermaid: this.properties.enableMermaid,
      enableToc: true,
      enableAnchors: this.properties.enableAnchors,
      enableWikiLinks: this.properties.enableWikiLinks,
      showCodeHeader: this.properties.showCodeHeader,
      showLineNumbers: this.properties.showLineNumbers,
      wrapCodeLines: this.properties.wrapCodeLines,
      allowHtml: this.properties.allowHtml,
      imageBasePath: this.imageBasePath()
    };
  }

  /**
   * The folder relative image sources are resolved against: the one holding
   * the markdown, not the one holding the page. Content typed into the web
   * part has no folder of its own, so it falls back to the site, which is what
   * someone writing a path by hand in a web part most likely means.
   */
  private imageBasePath(): string | undefined {
    /* A followed document resolves its own pictures and links against its own
       folder, which is rarely the configured file's. */
    if (this.openPath) {
      return folderOf(this.openPath);
    }
    if (this.properties.contentSource === 'library' && this.properties.selectedFile) {
      return folderOf(this.properties.selectedFile);
    }
    if (this.properties.contentSource === 'url' && this.properties.fileUrl) {
      return folderOf(this.properties.fileUrl);
    }
    return this.context.pageContext.web.serverRelativeUrl;
  }

  // ------------------------------------------------------------ reader theme

  private overrideStorageKey(): string {
    return `strata-theme-${this.context.instanceId}`;
  }

  private readThemeOverride(): void {
    try {
      const stored: string | null = window.localStorage.getItem(this.overrideStorageKey());
      this.themeOverride = stored ? (JSON.parse(stored) as IThemeOverride) : undefined;
    } catch {
      // Storage can be blocked; the author's theme is then simply used as-is.
      this.themeOverride = undefined;
    }
  }

  private setThemeOverride(family: ThemeFamily, mode: 'light' | 'dark'): void {
    this.themeOverride = { themeFamily: family, colorMode: mode };
    try {
      window.localStorage.setItem(this.overrideStorageKey(), JSON.stringify(this.themeOverride));
    } catch {
      // Private browsing or blocked storage: the choice just will not stick.
    }
    this.render();
  }

  // ----------------------------------------------------------------- content

  private canSaveToSharePoint(): boolean {
    return this.properties.contentSource === 'library' && !!this.properties.selectedFile;
  }

  private async loadContent(userInitiated: boolean): Promise<void> {
    this.loadError = undefined;
    this.previewContent = undefined;
    this.previewBanner = undefined;

    try {
      if (this.properties.contentSource === 'library' && this.properties.selectedFile) {
        this.properties.markdownContent = await this.sharePoint.getFileContent(this.properties.selectedFile);
        this.properties.fileMetadata = await this.sharePoint.getFileMetadata(this.properties.selectedFile);
        this.setupAutoRefresh();
      } else if (this.properties.contentSource === 'url' && this.properties.fileUrl) {
        this.properties.markdownContent = await SharePointService.fetchUrl(this.properties.fileUrl);
        this.properties.fileMetadata = undefined;
      }
    } catch (error) {
      this.loadError = `Could not load the markdown: ${(error as Error).message}`;
    }

    // The image base path follows the chosen file, and the property list that
    // rebuilds the processor does not include the properties that change it -
    // so refresh it here, or a newly picked file goes on resolving its images
    // against the folder of the previous one. Cheap when nothing moved:
    // updateOptions only rebuilds when a value actually changed.
    this.processor.updateOptions(this.processorOptions());

    if (userInitiated || this.contentLoadedOnce) {
      this.render();
    }
    this.contentLoadedOnce = true;
  }

  /*
   * Opens a document the reader followed a link to.
   *
   * A history entry is pushed at the same URL rather than at the document's, so
   * Back comes here rather than to SharePoint's router, which would treat a new
   * URL as a page of its own and leave. The entry carries this web part's own
   * id, so two of them on one page do not answer for each other.
   *
   * Nothing is written to the properties: see openPath.
   */
  private async openDocument(path: string, heading: string, push: boolean): Promise<void> {
    if (!path) {
      return;
    }

    let markdown: string;
    let metadata: IFileMetadata | undefined;
    try {
      markdown = await this.sharePoint.getFileContent(path);
      metadata = await this.sharePoint.getFileMetadata(path);
    } catch (error) {
      /* The link stays where it is and so does the reader: a document that
         cannot be opened is not a reason to lose the one being read. */
      this.loadError = `Could not open ${fileOf(path) || path}: ${(error as Error).message}`;
      this.render();
      return;
    }

    this.loadError = undefined;
    this.previewContent = undefined;
    this.previewBanner = undefined;
    this.openPath = path;
    this.openMarkdown = markdown;
    this.openMetadata = metadata;
    this.openHeading = heading;

    if (push) {
      this.pushHistory(path);
    }
    this.processor.updateOptions(this.processorOptions());
    this.render();
  }

  /** Back to the document the page is configured to show. */
  private closeDocument(push: boolean): void {
    if (!this.openPath) {
      return;
    }
    this.openPath = undefined;
    this.openMarkdown = undefined;
    this.openMetadata = undefined;
    this.openHeading = undefined;
    if (push) {
      this.pushHistory(undefined);
    }
    this.processor.updateOptions(this.processorOptions());
    this.render();
  }

  private pushHistory(path: string | undefined): void {
    try {
      window.history.pushState(
        { strata: this.context.instanceId, path: path },
        '',
        window.location.href
      );
      this.watchHistory();
    } catch {
      /* Some hosts refuse to be pushed to. The bar above the document is the
         way back either way; this only adds the browser's own button to it. */
    }
  }

  private watchHistory(): void {
    if (this.onPopState) {
      return;
    }
    /*
     * Back and forward both arrive here. An entry of ours names the document to
     * show; anything else means the reader has stepped back past the point
     * where they started following links, so the configured document comes
     * back. Two navigated web parts on one page share the browser's single
     * history, so one stepping back can send the other home as well - which is
     * recoverable, and the alternative is a history entry per web part per
     * click.
     */
    this.onPopState = (event: PopStateEvent): void => {
      const state: { strata?: string; path?: string } =
        (event.state || {}) as { strata?: string; path?: string };
      const mine: boolean = state.strata === this.context.instanceId;
      const path: string | undefined = mine ? state.path : undefined;

      if (!path) {
        this.closeDocument(false);
        return;
      }
      if (path !== this.openPath) {
        void this.openDocument(path, '', false);
      }
    };
    window.addEventListener('popstate', this.onPopState);
  }

  private setupAutoRefresh(): void {
    this.sharePoint.unwatchFile();
    if (!this.properties.enableAutoRefresh || !this.properties.selectedFile) {
      return;
    }
    this.sharePoint.watchFile(this.properties.selectedFile, () => {
      if (this.displayMode === DisplayMode.Edit && this.editManager.hasUnsavedChanges) {
        // Never overwrite what the author is typing.
        return;
      }
      if (this.openPath) {
        /* The configured file changed, but the reader is reading another one.
           Loading it now would pull the page out from under them; they will
           get the new text when they come back to it. */
        return;
      }
      void this.loadContent(true);
    });
  }

  private async saveToSharePoint(markdown: string): Promise<boolean> {
    if (!this.canSaveToSharePoint()) {
      return false;
    }

    const lastModified: string = this.properties.fileMetadata ? this.properties.fileMetadata.timeLastModified : '';
    if (lastModified) {
      const changed: boolean = await this.sharePoint.hasChangedSince(this.properties.selectedFile, lastModified);
      if (changed) {
        const overwrite: boolean = window.confirm(
          'Someone else has saved this file since you opened it.\n\n' +
            'OK overwrites their version (the old text stays in version history), Cancel keeps it.'
        );
        if (!overwrite) {
          return false;
        }
      }
    }

    await this.sharePoint.saveFileContent(this.properties.selectedFile, markdown);
    this.properties.fileMetadata = await this.sharePoint.getFileMetadata(this.properties.selectedFile);
    return true;
  }

  private async showVersions(): Promise<void> {
    if (this.versionPanel.isOpen) {
      this.versionPanel.close();
      return;
    }
    await this.versionPanel.open(this.domElement, this.properties.selectedFile);
  }

  // --------------------------------------------------------- property pane

  private async loadPropertyPaneSources(): Promise<void> {
    const libraries: ILibraryInfo[] = await this.sharePoint.getDocumentLibraries();
    this.libraryOptions = libraries.map((library: ILibraryInfo) => ({
      key: library.serverRelativeUrl,
      text: library.title
    }));

    if (this.properties.selectedLibrary) {
      await this.loadFolderOptions();
      await this.loadFileOptions();
    }

    this.context.propertyPane.refresh();
  }

  private async loadFolderOptions(): Promise<void> {
    const folders: string[] = await this.sharePoint.getFolders(this.properties.selectedLibrary);
    this.folderOptions = [{ key: '', text: '(root)' }].concat(
      folders.map((folder: string) => ({ key: folder, text: folder }))
    );
  }

  private async loadFileOptions(): Promise<void> {
    const files: IFileMetadata[] = await this.sharePoint.getMarkdownFiles(
      this.properties.selectedLibrary,
      this.properties.selectedFolder
    );
    this.fileOptions = files.map((file: IFileMetadata) => ({ key: file.serverRelativeUrl, text: file.name }));
  }

  // The signature is fixed by BaseClientSideWebPart; property values really can
  // be any of the property types.
  // eslint-disable-next-line @typescript-eslint/no-explicit-any
  protected onPropertyPaneFieldChanged(propertyPath: string, oldValue: any, newValue: any): void {
    super.onPropertyPaneFieldChanged(propertyPath, oldValue, newValue);

    const rebuildProcessor: string[] = [
      'enableSyntaxHighlighting',
      'enableMath',
      'enableMermaid',
      'enableAnchors',
      'enableWikiLinks',
      'showCodeHeader',
      'showLineNumbers',
      'wrapCodeLines',
      'allowHtml'
    ];

    if (rebuildProcessor.indexOf(propertyPath) !== -1) {
      this.processor.updateOptions(this.processorOptions());
    }

    /*
     * A width that was sensible in one unit is not in another, and the number
     * outlives the unit: 240 is a reasonable px sidebar and an absurd em one.
     * The slider's own range moves too, so the pane is refreshed to redraw it.
     */
    if (propertyPath === 'tocWidthMode') {
      this.context.propertyPane.refresh();
    }

    if (propertyPath === 'tocWidthUnit') {
      this.properties.tocWidthValue = tocWidthForUnit(
        newValue as TocWidthUnit, this.properties.tocWidthValue
      );
      this.context.propertyPane.refresh();
    }

    /* Typed into the box, it arrives as a string. */
    if (propertyPath === 'tocWidthValue' && typeof newValue === 'string') {
      const typed: number = Number(newValue);
      if (!isNaN(typed)) {
        this.properties.tocWidthValue = typed;
      }
      this.context.propertyPane.refresh();
    }

    /* The width controls only mean anything with the contents in a sidebar. */
    if (propertyPath === 'showSourceInfo') {
      this.context.propertyPane.refresh();
    }

    if (propertyPath === 'enableWikiLinks') {
      this.context.propertyPane.refresh();
    }

    if (propertyPath === 'tocPosition') {
      this.context.propertyPane.refresh();
    }

    if (propertyPath === 'contentSource') {
      this.previewContent = undefined;
      void this.loadContent(true);
      this.context.propertyPane.refresh();
    }

    if (propertyPath === 'selectedLibrary') {
      this.properties.selectedFolder = '';
      this.properties.selectedFile = '';
      void this.loadFolderOptions()
        .then(() => this.loadFileOptions())
        .then(() => this.context.propertyPane.refresh());
    }

    if (propertyPath === 'selectedFolder') {
      this.properties.selectedFile = '';
      void this.loadFileOptions().then(() => this.context.propertyPane.refresh());
    }

    if (propertyPath === 'selectedFile' || propertyPath === 'fileUrl') {
      void this.loadContent(true);
    }

    if (propertyPath === 'enableAutoRefresh') {
      this.setupAutoRefresh();
    }

    if (propertyPath === 'themeFamily' || propertyPath === 'colorMode') {
      // An author changing the theme should win over a reader's earlier choice.
      this.themeOverride = undefined;
      try {
        window.localStorage.removeItem(this.overrideStorageKey());
      } catch {
        // Nothing stored, or storage is blocked; either way there is no override.
      }
    }
  }

  protected getPropertyPaneConfiguration(): IPropertyPaneConfiguration {
    return paneConfiguration(this.properties, {
      libraries: this.libraryOptions,
      folders: this.folderOptions,
      files: this.fileOptions
    });
  }
}
