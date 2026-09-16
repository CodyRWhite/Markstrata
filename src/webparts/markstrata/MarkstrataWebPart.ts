/**
 * .SYNOPSIS
 * The web part itself: what SharePoint loads, configures and renders.
 *
 * .DESCRIPTION
 * The only file here that knows it is inside SharePoint. It holds the settings
 * an author chose, fetches the document they pointed at, and hands both to the
 * renderers, which know nothing about any of that - which is what lets the same
 * renderers run in a plain browser page under harness/ and on the documentation
 * site.
 *
 * What it still owns after the split is what needs SharePoint or needs to
 * outlive a render: loading and saving the configured file, the auto-refresh
 * watcher, and the collaborators it has to shut down when the page puts the web
 * part away. The reader's theme choice, the document they followed a link to
 * and the lists the property pane offers each live in a file of their own.
 *
 * .USAGE
 *   // SharePoint builds this: it is the web part the manifest points at.
 *   // Everything below is what it does once SPFx has handed it a DOM element.
 *
 *   onInit()      builds the processor, the renderers and the SharePoint service
 *   render()      draws read mode, edit mode, or a version being previewed
 *   onDispose()   stops every listener the renderers started
 *
 * .NOTES
 * Since:     0.0.6
 * Ships in:  the web part bundle
 * Requires:  MarkdownProcessor.ts, imagePaths.ts, wikiLinks.ts, tocWidth.ts,
 *            MermaidRenderer.ts, ContentEnhancer.ts, ViewModeRenderer.ts,
 *            EditModeManager.ts
 * Runs in:   a SharePoint page, through @microsoft/sp-webpart-base
 */

import { Version, DisplayMode } from '@microsoft/sp-core-library';
import { IPropertyPaneConfiguration } from '@microsoft/sp-property-pane';
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
import { DocumentNavigator, ILoadedDocument } from './utils/documentNavigator';
import { documentFromAddress, IWantedDocument } from './utils/documentParameter';
import { ThemeOverride } from './utils/themeOverride';
import { PaneSources } from './paneSources';
import { TocWidthUnit, tocWidthCss, tocWidthForUnit } from './utils/tocWidth';
import { MermaidRenderer } from './utils/MermaidRenderer';
import { ContentEnhancer } from './utils/ContentEnhancer';
import { ViewModeRenderer } from './utils/ViewModeRenderer';
import { EditModeManager } from './utils/EditModeManager';
import { VersionPanel } from './utils/VersionPanel';
import { SharePointService } from './utils/SharePointService';
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
  'showCodeHeader',
  'showLineNumbers',
  'wrapCodeLines',
  'allowHtml'
];

/*
 * Settings that change which other settings the pane shows, or what a control
 * on it looks like: the width fields only appear with the contents in a
 * sidebar, link checking only with wiki links on, the file pickers only with a
 * library, and the width slider's own range moves with its unit. The pane has
 * to be redrawn for any of those to be seen.
 */
const REDRAWS_THE_PANE: string[] = [
  'contentSource',
  'tocPosition',
  'tocWidthMode',
  'tocWidthUnit',
  'enableWikiLinks',
  'showSourceInfo'
];

/** Longest text handed to the search index, to keep the page payload sane. */
const MAX_SEARCH_TEXT: number = 20000;

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
  /**
   * Why the web part could not start, or could not draw. Set instead of
   * thrown: see onInit.
   */
  private startUpError: string | undefined;
  /** The theme this reader chose for themselves, if they chose one. */
  private themeOverride: ThemeOverride;
  private loadError: string | undefined;
  /** Suppresses the extra render on first load; SPFx renders straight after onInit. */
  private contentLoadedOnce: boolean = false;
  private previewBanner: string | undefined;
  private previewContent: string | undefined;

  /** A document the reader followed a link to, and the history that goes with it. */
  private navigator: DocumentNavigator;

  /** What the pane offers to choose from, and where those lists come from. */
  private paneSources: PaneSources;

  // --------------------------------------------------------------- lifecycle

  /**
   * Nothing gets out of here.
   *
   * SharePoint puts many web parts on one page and hosts them in one React
   * tree, so an exception that escapes a web part is not that web part's
   * problem: it is the page's. A failure to start that is thrown lands in the
   * host, which then disposes a half-built web part, and if that throws too it
   * is the disposal the page reports and the real cause is gone. 0.0.17.0 did
   * exactly that, and the page it did it on was whatever page happened to be
   * rendering this web part.
   *
   * So a web part that cannot start says so, in its own box, in its own
   * corner of the page, and the page carries on without it.
   */
  protected async onInit(): Promise<void> {
    await super.onInit();

    try {
      await this.startUp();
    } catch (error) {
      this.startUpError = (error as Error).message || String(error);
      console.error('[Markstrata] The web part could not start', error);
    }
  }

  private async startUp(): Promise<void> {
    this.applyDefaults();
    this.themeOverride = new ThemeOverride(this.context.instanceId);
    this.themeOverride.read();

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
    /* After the service exists, not before: PaneSources keeps the one it is
       given, so building it any earlier hands it undefined for good and leaves
       every dropdown on the property pane empty. */
    this.paneSources = new PaneSources(this.sharePoint, this.properties);

    /*
     * Reading another document is not configuring the page, so none of what it
     * knows goes into the properties: see documentNavigator.ts.
     */
    this.navigator = new DocumentNavigator({
      instanceId: this.context.instanceId,
      load: async (path: string): Promise<ILoadedDocument> => ({
        markdown: await this.sharePoint.getFileContent(path),
        metadata: await this.sharePoint.getFileMetadata(path)
      }),
      onChange: () => {
        this.loadError = undefined;
        this.previewContent = undefined;
        this.previewBanner = undefined;
        /* The folder a document resolves its pictures and links against is its
           own, which is rarely the configured file's. */
        this.processor.updateOptions(this.processorOptions());
        this.render();
      },
      onError: (message: string) => {
        this.loadError = message;
        this.render();
      }
    });

    /* Built after the navigator, because the folder it resolves pictures
       against is the followed document's when there is one. */
    this.processor = new MarkdownProcessor(this.processorOptions());
    this.mermaid = new MermaidRenderer();
    this.enhancer = new ContentEnhancer();

    this.viewRenderer = new ViewModeRenderer(this.processor, this.mermaid, this.enhancer, {
      onReload: () => void (this.navigator.path
        ? this.navigator.open(this.navigator.path, '', false)
        : this.loadContent(true)),
      onShowVersions: () => void this.showVersions(),
      onThemeOverride: (family: ThemeFamily, mode: 'light' | 'dark') => {
        this.themeOverride.set(family, mode);
        this.render();
      },
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

    void this.paneSources.loadAll().then(() => this.context.propertyPane.refresh());
    await this.loadContent(false);
    await this.openDocumentFromAddress();
  }

  /*
   * Every collaborator is checked for, because this can run before there are
   * any. A page that is closed while onInit is still awaiting, or an onInit
   * that threw part of the way down, both leave a half-built web part that
   * SharePoint still disposes - and a disposal that throws takes the whole page
   * down with it, which is a far worse outcome than a listener left attached to
   * an element that is going away regardless.
   */
  protected onDispose(): void {
    this.stopping(() => {
      if (this.themeProvider && this.handleThemeChanged) {
        this.themeProvider.themeChangedEvent.remove(this, this.handleThemeChanged);
      }
    });
    this.stopping(() => { if (this.sharePoint) { this.sharePoint.unwatchFile(); } });
    this.stopping(() => { if (this.navigator) { this.navigator.dispose(); } });
    this.stopping(() => { if (this.enhancer) { this.enhancer.dispose(); } });
    this.stopping(() => { if (this.editManager) { this.editManager.dispose(); } });
    super.onDispose();
  }

  /**
   * One thing being stopped, and whatever it does about it kept to itself.
   *
   * Each is separate so one that fails does not leave the rest running, and
   * none of them throws, because this runs inside the page's own teardown: an
   * exception here is reported as the page's, in place of whatever actually
   * went wrong, and can take the page's other web parts with it.
   */
  private stopping(stop: () => void): void {
    try {
      stop();
    } catch (error) {
      console.error('[Markstrata] Something would not stop', error);
    }
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
      /* Empty, not the sample. A web part that ships showing a document about
         itself is indistinguishable from a configured one, so nobody can tell
         a page that was never set up from a page that was - least of all a
         reader, and least of all in a Teams tab, where there is no property
         pane in sight to suggest otherwise. The sample is one click away in
         the panel below instead. */
      markdownContent: '',
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

  /**
   * Drawing is wrapped for the same reason starting is: this runs inside the
   * page's own render, and an exception here is the page's exception.
   */
  public render(): void {
    /* Before anything is drawn, and on the failure path too: when the only
       report from a host the harness cannot reach is a screenshot, the first
       question is which host it was. */
    this.domElement.setAttribute('data-strata-host', this.hostName());

    if (this.startUpError) {
      this.drawFailure();
      return;
    }

    try {
      this.draw();
    } catch (error) {
      this.startUpError = (error as Error).message || String(error);
      console.error('[Markstrata] The web part could not draw itself', error);
      this.drawFailure();
    }
  }

  /**
   * Opens the document the page's address names, if it names one.
   *
   * This is what lets a SharePoint menu be a menu. Every entry on a navigation
   * bar can only point at a page, and a page shows the one document it was
   * configured with, so without this a wiki's menu works once: a reader
   * reaches the home document and has to find everything else by following
   * links out of it.
   *
   * Last in starting up, and deliberately: a relative address is relative to
   * the configured document's folder, so that document has to have been
   * loaded for the folder to be known.
   *
   * Held to the same two conditions as following a link, because it is the
   * same thing done by a different hand - the web part showing a document
   * other than its own. No history is pushed, because the address already is
   * the history: the reader arrived at it.
   */
  private async openDocumentFromAddress(): Promise<void> {
    if (!this.properties.followDocumentLinks || this.properties.contentSource !== 'library') {
      return;
    }

    const wanted: IWantedDocument | undefined = documentFromAddress(
      window.location.search, this.imageBasePath()
    );
    if (!wanted) {
      return;
    }
    await this.navigator.open(wanted.path, wanted.heading, false);
  }

  /**
   * Which host this is running in, as the host itself reports it.
   *
   * SharePoint pages and Teams tabs are the same web part in different frames,
   * and the differences between them - whether the page theme follows the
   * client, whether printing does anything - are exactly the things the
   * harness cannot reach, because it stands in for SharePoint and there is
   * nothing standing in for Teams. So rather than guess at those differences
   * in code, the host is written onto the element where a tenant test can read
   * it back, and the guessing waits for the answer.
   *
   * Every step is optional. Outside Teams there is no Teams SDK, in an older
   * SPFx there is no sdks at all, and neither is a reason to fail to draw.
   */
  private hostName(): string {
    const teams: { context?: { hostClientType?: string } } | undefined =
      this.context.sdks ? this.context.sdks.microsoftTeams : undefined;

    if (!teams || !teams.context) {
      return 'sharepoint';
    }
    return teams.context.hostClientType
      ? `teams-${teams.context.hostClientType}`
      : 'teams';
  }

  /**
   * What a reader sees instead of a document. Plain DOM on purpose: whatever
   * went wrong may have been the renderer, so nothing here goes through one.
   */
  private drawFailure(): void {
    this.domElement.textContent = '';

    const box: HTMLElement = document.createElement('div');
    box.className = 'strata-status';
    box.setAttribute('data-tone', 'error');
    /* Styled inline as well as by class: the stylesheet dresses this up inside
       the themed root, and there is no themed root to be inside. */
    box.style.padding = '12px 16px';
    box.style.borderRadius = '4px';
    box.style.border = '1px solid #d13438';
    box.style.color = '#a4262c';
    box.style.font = '14px/1.5 -apple-system, BlinkMacSystemFont, "Segoe UI", sans-serif';
    box.textContent = `Markstrata could not start: ${this.startUpError}`;

    this.domElement.appendChild(box);
  }

  /**
   * What a web part nobody has set up should say.
   *
   * Where it says to go depends on the host, because the way in is different
   * and only one of them is obvious. On a SharePoint page an author edits the
   * page and the property pane is right there. In a Teams tab there is no page
   * to edit and no pane to open: the way in is the tab's own settings, and a
   * reader who does not own the tab has no way in at all - so they are told
   * that plainly rather than shown a document about a web part.
   */
  private drawUnconfigured(): void {
    const host: string = this.hostName();
    const inTeams: boolean = host.indexOf('teams') === 0;
    const editing: boolean = this.displayMode === DisplayMode.Edit;

    this.domElement.textContent = '';

    const panel: HTMLElement = document.createElement('div');
    panel.className = 'strata-unconfigured';
    panel.setAttribute('data-strata-host', host);

    const heading: HTMLElement = document.createElement('p');
    heading.className = 'strata-unconfigured-heading';
    heading.textContent = strings.UnconfiguredHeading;
    panel.appendChild(heading);

    const guidance: HTMLElement = document.createElement('p');
    guidance.className = 'strata-unconfigured-body';
    guidance.textContent = inTeams
      ? strings.UnconfiguredInTeams
      : (editing ? strings.UnconfiguredInPane : strings.UnconfiguredOnPage);
    panel.appendChild(guidance);

    /* Only where somebody can act on it. Offering the sample to a reader who
       cannot save it is an offer of nothing. */
    if (editing && !inTeams) {
      const sample: HTMLButtonElement = document.createElement('button');
      sample.type = 'button';
      sample.className = 'strata-unconfigured-sample';
      sample.textContent = strings.UnconfiguredSampleButton;
      sample.addEventListener('click', () => {
        this.properties.contentSource = 'manual';
        this.properties.markdownContent = strings.SampleContent;
        this.updateSearchText();
        this.render();
      });
      panel.appendChild(sample);
    }

    this.domElement.appendChild(panel);
  }

  private draw(): void {
    /* Before anything is built for a document: there is not one. */
    if (this.isConfigured() === false && this.previewContent === undefined
      && this.navigator.markdown === undefined) {
      this.drawUnconfigured();
      return;
    }

    // The panel lives inside the element we are about to rebuild, so drop it
    // rather than leave the toggle thinking it is still open.
    this.versionPanel.close();

    const settings: IThemeSettings = this.themeSettings();
    const mode: ResolvedMode = this.resolvedMode();
    /* A version being previewed wins over a document being read, which wins
       over the one the page is configured to show. */
    const markdown: string = this.previewContent !== undefined
      ? this.previewContent
      : (this.navigator.markdown !== undefined
        ? this.navigator.markdown : this.properties.markdownContent);

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
    const followingAnother: boolean = !!this.navigator.path;

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
      return;
    }

    const landOn: string | undefined = this.navigator.takeHeading();

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
      openDocumentName: this.navigator.name,
      /* The document behind this one, which is the configured document only
         when the reader has followed exactly one link. */
      backDocumentName: this.navigator.previousName
        || (this.properties.fileMetadata ? this.properties.fileMetadata.name : ''),
      onGoBack: () => { void this.navigator.back(true); },
      landOnHeading: landOn,
      /* Only a library can hand over another document, and only a reader is
         reading: in page edit mode a click on a link belongs to the author
         editing the page, not to somebody following it. */
      openDocument: this.properties.followDocumentLinks
        && this.properties.contentSource === 'library'
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

    if (this.displayMode === DisplayMode.Edit && followingAnother) {
      this.showBanner(strings.EditingAnotherDocument, 'info');
    }
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
      themeFamily: this.themeOverride.current
        ? this.themeOverride.current.themeFamily : this.properties.themeFamily,
      colorMode: this.themeOverride.current
        ? this.themeOverride.current.colorMode : this.properties.colorMode,
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
    if (this.navigator.path) {
      return folderOf(this.navigator.path);
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

  // ----------------------------------------------------------------- content

  /**
   * Whether anybody has told this web part what to show.
   *
   * Each source answers it differently, and none of them can be answered by
   * looking at the rendered document: markdown that renders is not the same as
   * markdown somebody chose.
   */
  private isConfigured(): boolean {
    if (this.properties.contentSource === 'library') {
      return !!this.properties.selectedFile;
    }
    if (this.properties.contentSource === 'url') {
      return !!this.properties.fileUrl;
    }
    return !!this.properties.markdownContent;
  }

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
      if (this.navigator.path) {
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

  // The signature is fixed by BaseClientSideWebPart; property values really can
  // be any of the property types.
  // eslint-disable-next-line @typescript-eslint/no-explicit-any
  protected onPropertyPaneFieldChanged(propertyPath: string, oldValue: any, newValue: any): void {
    super.onPropertyPaneFieldChanged(propertyPath, oldValue, newValue);

    if (this.startUpError) {
      /* There is nothing below to tell. The value is kept, so an author who
         fixes whatever broke and reloads the page gets what they set. */
      return;
    }

    if (REBUILDS_THE_PROCESSOR.indexOf(propertyPath) !== -1) {
      this.processor.updateOptions(this.processorOptions());
    }

    /*
     * A width that was sensible in one unit is not in another, and the number
     * outlives the unit: 240 is a reasonable px sidebar and an absurd em one.
     */
    if (propertyPath === 'tocWidthUnit') {
      this.properties.tocWidthValue = tocWidthForUnit(
        newValue as TocWidthUnit, this.properties.tocWidthValue
      );
    }

    /* Typed into the box rather than dragged on the slider, it arrives as a
       string - and only that one redraws the pane, because a pane refresh on
       every tick of a drag is a slider that fights back. */
    if (propertyPath === 'tocWidthValue' && typeof newValue === 'string') {
      const typed: number = Number(newValue);
      if (!isNaN(typed)) {
        this.properties.tocWidthValue = typed;
      }
      this.context.propertyPane.refresh();
    }

    if (propertyPath === 'contentSource') {
      this.previewContent = undefined;
      void this.loadContent(true);
    }

    if (propertyPath === 'selectedLibrary') {
      this.properties.selectedFolder = '';
      this.properties.selectedFile = '';
      void this.paneSources.loadFolders()
        .then(() => this.paneSources.loadFiles())
        .then(() => this.context.propertyPane.refresh());
    }

    if (propertyPath === 'selectedFolder') {
      this.properties.selectedFile = '';
      void this.paneSources.loadFiles().then(() => this.context.propertyPane.refresh());
    }

    if (propertyPath === 'selectedFile' || propertyPath === 'fileUrl') {
      void this.loadContent(true);
    }

    if (propertyPath === 'enableAutoRefresh') {
      this.setupAutoRefresh();
    }

    /* Last, so a setting changed above is drawn in the same refresh. The
       cascading ones are not here: theirs has to wait for a fetch. */
    if (REDRAWS_THE_PANE.indexOf(propertyPath) !== -1) {
      this.context.propertyPane.refresh();
    }

    if (propertyPath === 'themeFamily' || propertyPath === 'colorMode') {
      // An author changing the theme should win over a reader's earlier choice.
      this.themeOverride.clear();
    }
  }

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
