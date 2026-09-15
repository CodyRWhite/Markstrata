import { Version, DisplayMode } from '@microsoft/sp-core-library';
import {
  IPropertyPaneConfiguration,
  IPropertyPaneDropdownOption,
  IPropertyPaneField,
  PropertyPaneDropdown,
  PropertyPaneSlider,
  PropertyPaneTextField,
  PropertyPaneToggle,
  PropertyPaneLabel
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
import { DiagramWidth } from './utils/mermaidConfig';
import { BackToTop } from './utils/backToTop';
import { TocWidthMode, TocWidthUnit, ITocWidthRange, TOC_WIDTH_RANGES, tocWidthCss,
  tocWidthForUnit } from './utils/tocWidth';
import { MermaidRenderer } from './utils/MermaidRenderer';
import { ContentEnhancer } from './utils/ContentEnhancer';
import { ViewModeRenderer, TocPosition } from './utils/ViewModeRenderer';
import { EditModeManager } from './utils/EditModeManager';
import { VersionPanel } from './utils/VersionPanel';
import { SharePointService, IFileMetadata, ILibraryInfo } from './utils/SharePointService';
import {
  ThemeManager,
  IThemeSettings,
  ResolvedMode,
  ThemeFamily,
  ColorMode,
  THEME_FAMILIES,
  COLOR_MODES,
  CONTENT_WIDTHS,
  DENSITIES,
  TEXT_SIZES,
  CODE_SIZES,
  IThemeChoice
} from './utils/ThemeManager';

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

  // Features
  enableMermaid: boolean;
  diagramWidth: DiagramWidth;
  enableImageZoom: boolean;
  enableWikiLinks: boolean;
  checkWikiLinks: boolean;
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
      onReload: () => void this.loadContent(true),
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
    const markdown: string = this.previewContent !== undefined ? this.previewContent : this.properties.markdownContent;

    if (this.displayMode === DisplayMode.Edit && this.previewContent === undefined) {
      this.editManager.render(this.domElement, markdown, {
        settings: settings,
        resolvedMode: mode,
        enableMermaid: this.properties.enableMermaid,
        diagramWidth: this.properties.diagramWidth,
        enableImageZoom: this.properties.enableImageZoom,
        canSave: this.canSaveToSharePoint(),
        saveTargetName: this.properties.fileMetadata ? this.properties.fileMetadata.name : ''
      });
      // The editor renders a live preview, which is the same rendered text the
      // search index wants - and edit mode is when the page gets saved.
      this.updateSearchText();
      return;
    }

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
      showReadingTime: this.properties.showReadingTime,
      backToTop: this.properties.backToTop,
      /* Only a library file has a folder to look in. Markdown typed into the
         web part, or fetched from a URL, has no neighbours to check against. */
      listFolder: this.properties.enableWikiLinks && this.properties.checkWikiLinks
        && this.properties.contentSource === 'library'
        ? (folder: string) => this.sharePoint.listFolderFileNames(folder)
        : undefined,
      canReload: this.properties.contentSource !== 'manual',
      canShowVersions: this.properties.enableVersionHistory && this.canSaveToSharePoint(),
      isPageEditing: this.displayMode === DisplayMode.Edit,
      fileMetadata: this.properties.fileMetadata
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
  private isTocSidebar(): boolean {
    return this.properties.tocPosition === 'left' || this.properties.tocPosition === 'right';
  }

  /*
   * Slider and box are the same property. The slider is for finding a width by
   * eye, the box for typing one already known; the pane re-reads the property
   * when either changes, so the two stay in step.
   */
  private tocWidthFields(): IPropertyPaneField<unknown>[] {
    const range: ITocWidthRange = this.tocWidthRange();
    return [
      PropertyPaneDropdown('tocWidthUnit', {
        label: strings.TocWidthUnitsLabel,
        options: [
          { key: 'em', text: 'em, follows the text size' },
          { key: '%', text: '%, share of the web part' },
          { key: 'px', text: 'px, a fixed number of pixels' },
          { key: 'vw', text: 'vw, share of the browser window' }
        ],
        selectedKey: this.properties.tocWidthUnit
      }),
      PropertyPaneSlider('tocWidthValue', {
        label: strings.TocWidthValueLabel,
        min: range.min,
        max: range.max,
        step: range.step,
        showValue: true
      }),
      PropertyPaneTextField('tocWidthValue', {
        label: `${strings.TocWidthValueLabel} (${this.properties.tocWidthUnit})`,
        onGetErrorMessage: (raw: string): string => this.checkTocWidth(raw)
      })
    ] as IPropertyPaneField<unknown>[];
  }

  private tocWidthRange(): ITocWidthRange {
    return TOC_WIDTH_RANGES[this.properties.tocWidthUnit] || TOC_WIDTH_RANGES.em;
  }

  /** Keeps a typed width inside the range its unit makes sense in. */
  private checkTocWidth(raw: string): string {
    const range: ITocWidthRange = this.tocWidthRange();
    const value: number = Number(raw);
    if (raw.trim().length === 0 || isNaN(value)) {
      return 'Enter a number.';
    }
    if (value < range.min || value > range.max) {
      return `Between ${range.min} and ${range.max}${this.properties.tocWidthUnit}.`;
    }
    return '';
  }

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
      const raw: string | null = window.localStorage.getItem(this.overrideStorageKey());
      this.themeOverride = raw ? (JSON.parse(raw) as IThemeOverride) : undefined;
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

  private toDropdown(choices: IThemeChoice[]): IPropertyPaneDropdownOption[] {
    return choices.map((choice: IThemeChoice) => ({ key: choice.key, text: choice.text }));
  }

  protected getPropertyPaneConfiguration(): IPropertyPaneConfiguration {
    const isLibrary: boolean = this.properties.contentSource === 'library';
    const isUrl: boolean = this.properties.contentSource === 'url';

    return {
      pages: [
        {
          header: { description: strings.ContentPageDescription },
          groups: [
            {
              groupName: strings.ContentGroupName,
              groupFields: [
                PropertyPaneDropdown('contentSource', {
                  label: strings.ContentSourceLabel,
                  options: [
                    { key: 'manual', text: 'Type it here' },
                    { key: 'library', text: 'File in a document library' },
                    { key: 'url', text: 'File at a URL' }
                  ],
                  selectedKey: this.properties.contentSource
                }),
                ...(this.properties.contentSource === 'manual'
                  ? [
                      PropertyPaneTextField('markdownContent', {
                        label: strings.MarkdownContentLabel,
                        multiline: true,
                        rows: 14,
                        description: strings.MarkdownContentDescription
                      })
                    ]
                  : []),
                ...(isUrl
                  ? [
                      PropertyPaneTextField('fileUrl', {
                        label: strings.FileUrlLabel,
                        description: strings.FileUrlDescription,
                        placeholder: 'https://contoso.sharepoint.com/sites/team/Shared%20Documents/readme.md'
                      })
                    ]
                  : []),
                ...(isLibrary
                  ? [
                      PropertyPaneDropdown('selectedLibrary', {
                        label: strings.LibraryLabel,
                        options: this.libraryOptions,
                        selectedKey: this.properties.selectedLibrary
                      }),
                      PropertyPaneDropdown('selectedFolder', {
                        label: strings.FolderLabel,
                        options: this.folderOptions,
                        selectedKey: this.properties.selectedFolder,
                        disabled: !this.properties.selectedLibrary
                      }),
                      PropertyPaneDropdown('selectedFile', {
                        label: strings.FileLabel,
                        options: this.fileOptions,
                        selectedKey: this.properties.selectedFile,
                        disabled: !this.properties.selectedLibrary
                      }),
                      PropertyPaneToggle('enableAutoRefresh', {
                        label: strings.AutoRefreshLabel,
                        onText: 'On',
                        offText: 'Off'
                      }),
                      PropertyPaneToggle('enableVersionHistory', {
                        label: strings.VersionHistoryLabel,
                        onText: 'On',
                        offText: 'Off'
                      })
                    ]
                  : [])
              ]
            }
          ]
        },
        {
          header: { description: strings.AppearancePageDescription },
          groups: [
            {
              groupName: strings.ThemeGroupName,
              groupFields: [
                PropertyPaneDropdown('themeFamily', {
                  label: strings.ThemeFamilyLabel,
                  options: this.toDropdown(THEME_FAMILIES),
                  selectedKey: this.properties.themeFamily
                }),
                PropertyPaneDropdown('colorMode', {
                  label: strings.ColorModeLabel,
                  options: this.toDropdown(COLOR_MODES),
                  selectedKey: this.properties.colorMode
                }),
                PropertyPaneToggle('showThemeSwitcher', {
                  label: strings.ThemeSwitcherLabel,
                  onText: 'On',
                  offText: 'Off'
                }),
                PropertyPaneLabel('themeHint', { text: strings.ThemeHint })
              ]
            },
            {
              groupName: strings.ReadingGroupName,
              groupFields: [
                PropertyPaneDropdown('contentWidth', {
                  label: strings.ContentWidthLabel,
                  options: this.toDropdown(CONTENT_WIDTHS),
                  selectedKey: this.properties.contentWidth
                }),
                PropertyPaneDropdown('density', {
                  label: strings.DensityLabel,
                  options: this.toDropdown(DENSITIES),
                  selectedKey: this.properties.density
                }),
                PropertyPaneDropdown('textSize', {
                  label: strings.TextSizeLabel,
                  options: this.toDropdown(TEXT_SIZES),
                  selectedKey: this.properties.textSize
                }),
                PropertyPaneDropdown('imageAlign', {
                  label: strings.ImageAlignLabel,
                  options: [
                    { key: 'left', text: 'Left' },
                    { key: 'center', text: 'Centred' },
                    { key: 'right', text: 'Right' }
                  ],
                  selectedKey: this.properties.imageAlign
                }),
                PropertyPaneLabel('imageAlignHint', { text: strings.ImageAlignHint }),
                PropertyPaneToggle('fillHeight', {
                  label: strings.FillHeightLabel,
                  onText: 'On',
                  offText: 'Off'
                }),
                PropertyPaneLabel('fillHeightHint', { text: strings.FillHeightHint })
              ]
            },
            {
              groupName: strings.CodeGroupName,
              groupFields: [
                PropertyPaneToggle('enableSyntaxHighlighting', {
                  label: strings.SyntaxHighlightingLabel,
                  onText: 'On',
                  offText: 'Off'
                }),
                PropertyPaneToggle('showCodeHeader', {
                  label: strings.CodeHeaderLabel,
                  onText: 'On',
                  offText: 'Off'
                }),
                PropertyPaneToggle('showLineNumbers', {
                  label: strings.LineNumbersLabel,
                  onText: 'On',
                  offText: 'Off'
                }),
                PropertyPaneToggle('wrapCodeLines', {
                  label: strings.WrapCodeLabel,
                  onText: 'Wrap',
                  offText: 'Scroll'
                }),
                PropertyPaneDropdown('codeSize', {
                  label: strings.CodeSizeLabel,
                  options: this.toDropdown(CODE_SIZES),
                  selectedKey: this.properties.codeSize
                })
              ]
            }
          ]
        },
        {
          header: { description: strings.ContentsPageDescription },
          groups: [
            {
              groupName: strings.ContentsGroupName,
              groupFields: [
                PropertyPaneDropdown('tocPosition', {
                  label: strings.TocPositionLabel,
                  options: [
                    { key: 'off', text: 'No contents' },
                    { key: 'left', text: 'Sidebar on the left' },
                    { key: 'right', text: 'Sidebar on the right' },
                    { key: 'inline', text: 'Above the content' }
                  ],
                  selectedKey: this.properties.tocPosition
                }),
                PropertyPaneSlider('tocMaxLevel', {
                  label: strings.TocLevelLabel,
                  min: 1,
                  max: 4,
                  step: 1,
                  disabled: this.properties.tocPosition === 'off'
                }),
                PropertyPaneDropdown('tocWidthMode', {
                  label: strings.TocWidthUnitLabel,
                  options: [
                    { key: 'auto', text: 'Auto, fits the longest entry' },
                    { key: 'fixed', text: 'Fixed width' }
                  ],
                  selectedKey: this.properties.tocWidthMode,
                  disabled: !this.isTocSidebar()
                }),
                /* The unit and the number only exist once a fixed width is
                   asked for. Greyed-out controls read as broken; absent ones
                   read as not applicable, which is what they are. */
                ...(this.isTocSidebar() && this.properties.tocWidthMode === 'fixed'
                  ? this.tocWidthFields()
                  : []),
                PropertyPaneLabel('tocWidthHint', { text: strings.TocWidthHint }),
                PropertyPaneToggle('enableAnchors', {
                  label: strings.AnchorsLabel,
                  onText: 'On',
                  offText: 'Off'
                })
              ]
            }
          ]
        },
        {
          header: { description: strings.FeaturesPageDescription },
          groups: [
            {
              groupName: strings.RenderingGroupName,
              groupFields: [
                PropertyPaneToggle('enableMermaid', {
                  label: strings.MermaidLabel,
                  onText: 'On',
                  offText: 'Off'
                }),
                PropertyPaneDropdown('diagramWidth', {
                  label: strings.DiagramWidthLabel,
                  options: [
                    { key: 'fit', text: 'Fit to the column' },
                    { key: 'scroll', text: 'Keep their size and scroll' },
                    { key: 'scale', text: 'Scale down to fit' }
                  ],
                  selectedKey: this.properties.diagramWidth,
                  disabled: !this.properties.enableMermaid
                }),
                PropertyPaneLabel('diagramWidthHint', { text: strings.DiagramWidthHint }),
                PropertyPaneToggle('enableImageZoom', {
                  label: strings.ImageZoomLabel,
                  onText: 'On',
                  offText: 'Off'
                }),
                PropertyPaneToggle('enableWikiLinks', {
                  label: strings.WikiLinksLabel,
                  onText: 'On',
                  offText: 'Off'
                }),
                ...(this.properties.enableWikiLinks
                  ? [
                      PropertyPaneToggle('checkWikiLinks', {
                        label: strings.CheckWikiLinksLabel,
                        onText: 'On',
                        offText: 'Off',
                        disabled: this.properties.contentSource !== 'library'
                      })
                    ]
                  : []),
                PropertyPaneLabel('wikiLinksHint', { text: strings.WikiLinksHint }),
                PropertyPaneToggle('enableMath', {
                  label: strings.MathLabel,
                  onText: 'On',
                  offText: 'Off'
                }),
                PropertyPaneToggle('allowHtml', {
                  label: strings.AllowHtmlLabel,
                  onText: 'On',
                  offText: 'Off'
                }),
                PropertyPaneLabel('htmlHint', { text: strings.AllowHtmlHint })
              ]
            },
            {
              groupName: strings.ToolbarGroupName,
              groupFields: [
                PropertyPaneDropdown('toolbarVisibility', {
                  label: strings.ToolbarVisibilityLabel,
                  options: [
                    { key: 'always', text: 'Always' },
                    { key: 'editing', text: 'Only while editing the page' },
                    { key: 'never', text: 'Never' }
                  ],
                  selectedKey: this.properties.toolbarVisibility
                }),
                // The toolbar carries the print button, so a reader who never
                // sees the toolbar never sees printing either. Saying so here
                // costs a line and saves someone turning the toggle on and
                // wondering why nothing changed.
                PropertyPaneLabel('toolbarHint', { text: strings.ToolbarHint }),
                PropertyPaneToggle('showPrintButton', {
                  label: strings.PrintButtonLabel,
                  onText: 'On',
                  offText: 'Off',
                  disabled: this.properties.toolbarVisibility !== 'always'
                }),
                PropertyPaneToggle('showReadingTime', {
                  label: strings.ReadingTimeLabel,
                  onText: 'On',
                  offText: 'Off',
                  disabled: this.properties.toolbarVisibility === 'never'
                }),
                PropertyPaneDropdown('backToTop', {
                  label: strings.BackToTopLabel,
                  options: [
                    { key: 'off', text: 'No button' },
                    { key: 'left', text: 'Bottom left' },
                    { key: 'right', text: 'Bottom right' }
                  ],
                  selectedKey: this.properties.backToTop
                })
              ]
            },
            {
              groupName: strings.FileInfoGroupName,
              groupFields: [
                PropertyPaneToggle('showSourceInfo', {
                  label: strings.ShowSourceInfoLabel,
                  onText: 'On',
                  offText: 'Off',
                  // The footer is built from the file's metadata, and only a
                  // library file has any.
                  disabled: !isLibrary
                }),
                PropertyPaneToggle('pinMeta', {
                  label: strings.PinMetaLabel,
                  onText: 'On',
                  offText: 'Off',
                  disabled: !isLibrary || !this.properties.showSourceInfo
                }),
                PropertyPaneLabel('sourceInfoHint', { text: strings.SourceInfoHint })
              ]
            }
          ]
        }
      ]
    };
  }
}
