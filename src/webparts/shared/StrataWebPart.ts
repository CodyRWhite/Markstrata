/**
 * .SYNOPSIS
 * Everything a Markstrata web part does that is not about the document's
 * syntax.
 *
 * .DESCRIPTION
 * Two web parts render two kinds of document. What surrounds the document is
 * the same in both, and it is the larger half: starting inside SharePoint
 * without taking the page down, reading the configured file, watching it for
 * changes, saving it back, offering its version history, following a link to a
 * neighbour, answering a `?strataDoc=` address, resolving relative paths
 * against the document's own folder, remembering a reader's theme choice,
 * laying an export out as pages, feeding the search index, and stopping every
 * one of those again when the page puts the web part away.
 *
 * None of that knows what the document is written in, so none of it is
 * duplicated. What each web part supplies is the small part that does know:
 * the renderer, the pane, its own defaults, and which of its settings mean the
 * renderer has to be rebuilt.
 *
 * WHY A BASE CLASS AND NOT A HELPER
 * Because the things being shared are the lifecycle hooks themselves. onInit,
 * onDispose, render and onPropertyPaneFieldChanged are called by SPFx, not by
 * us, and each one has an ordering that took several releases to get right:
 * the navigator is built before the renderer because the renderer resolves
 * pictures against the followed document's folder; the address is read last
 * because a relative one is relative to the configured document's folder. A
 * helper cannot own an order it does not control.
 *
 * WHAT IS DELIBERATELY NOT HERE
 * The document's text under a name. Each web part keeps it as
 * markdownContent or htmlContent, because the property pane and the search
 * index both show that name to somebody. The base reaches it through
 * documentText instead.
 *
 * .USAGE
 *   export default class MarkstrataWebPart
 *     extends StrataWebPart<IMarkstrataWebPartProps> {
 *
 *     protected get documentText(): string { return this.properties.markdownContent; }
 *     protected set documentText(value: string) { this.properties.markdownContent = value; }
 *
 *     protected buildRenderers(): void { ... }
 *     protected drawDocument(): void { ... }
 *   }
 *
 * .NOTES
 * Since:     0.0.22.0
 * Ships in:  both web part bundles
 * Requires:  strataWebPartProps.ts, SharePointService.ts, documentNavigator.ts,
 *            documentParameter.ts, themeOverride.ts, paneSources.ts,
 *            VersionPanel.ts, pdfExport.ts, exportNaming.ts, imagePaths.ts,
 *            wikiLinks.ts, tocWidth.ts, remoteDocuments.ts, ThemeManager.ts
 * Runs in:   a SharePoint page, through @microsoft/sp-webpart-base
 */

import { Version, DisplayMode } from '@microsoft/sp-core-library';
import { BaseClientSideWebPart, IWebPartPropertiesMetadata } from '@microsoft/sp-webpart-base';
import { ThemeProvider, IReadonlyTheme } from '@microsoft/sp-component-base';
import * as strings from 'MarkstrataWebPartStrings';

import { IStrataWebPartProps } from './strataWebPartProps';
import { SharePointService } from '../markstrata/utils/SharePointService';
import { DocumentNavigator, ILoadedDocument } from '../markstrata/utils/documentNavigator';
import {
  documentFromAddress, addressForDocument, addressWithoutDocument, DOCUMENT_EXTENSIONS,
  DOCUMENT_PARAMETER, IWantedDocument
} from '../markstrata/utils/documentParameter';
import { isRemote, fetchableUrl, remoteFailure } from '../markstrata/utils/remoteDocuments';
import { ThemeOverride } from '../markstrata/utils/themeOverride';
import { PaneSources } from '../markstrata/paneSources';
import { VersionPanel } from '../markstrata/utils/VersionPanel';
import { PdfExport } from '../markstrata/utils/pdfExport';
import { documentTitle, exportDate, sourceLabel } from '../markstrata/utils/exportNaming';
import { folderOf } from '../markstrata/utils/imagePaths';
import { fileOf } from '../markstrata/utils/wikiLinks';
import { TocWidthUnit, tocWidthCss, tocWidthForUnit } from '../markstrata/utils/tocWidth';
import { ThemeManager, IThemeSettings, ResolvedMode } from '../markstrata/utils/ThemeManager';

/** Longest text handed to the search index, to keep the page payload sane. */
const MAX_SEARCH_TEXT: number = 20000;

/**
 * Settings that change which other settings the pane shows. Shared because
 * these ones cascade the same way whatever is being rendered: the file pickers
 * only appear with a library, the width fields only with a sidebar.
 */
const SHARED_REDRAWS_THE_PANE: string[] = [
  'contentSource',
  'tocPosition',
  'tocWidthMode',
  'tocWidthUnit',
  'showSourceInfo'
];

/** The two sentences that name the kind of document a web part wants. */
export interface IUnconfiguredGuidance {
  /** An author with the property pane open in front of them. */
  inPane: string;
  /** A Teams tab, where there is no page to edit and no pane to open. */
  inTeams: string;
}

export abstract class StrataWebPart<TProps extends IStrataWebPartProps>
  extends BaseClientSideWebPart<TProps> {

  protected sharePoint: SharePointService;
  /** What the pane offers to choose from, and where those lists come from. */
  protected paneSources: PaneSources;
  /** A document the reader followed a link to, and the history that goes with it. */
  protected navigator: DocumentNavigator;
  protected versionPanel: VersionPanel;
  /** The theme this reader chose for themselves, if they chose one. */
  protected themeOverride: ThemeOverride;
  protected readonly pdfExport: PdfExport = new PdfExport();

  private themeProvider: ThemeProvider;
  /** Kept so the listener can be detached again; SPFx matches on the handler. */
  private handleThemeChanged: (args: { theme?: IReadonlyTheme }) => void;
  protected isInverted: boolean | undefined;

  /**
   * Why the web part could not start, or could not draw. Set instead of
   * thrown: see onInit.
   */
  protected startUpError: string | undefined;
  protected loadError: string | undefined;
  /** Suppresses the extra render on first load; SPFx renders straight after onInit. */
  private contentLoadedOnce: boolean = false;
  protected previewBanner: string | undefined;
  protected previewContent: string | undefined;
  /**
   * A menu entry named a document and nothing opened it. Held rather than
   * shown where it is worked out, because that happens while the web part is
   * starting and every render after it draws its own banner over the top.
   */
  private addressNotice: string | undefined;

  // ----------------------------------------------------------------- contract

  /**
   * The document's own text, under whatever name this web part keeps it.
   *
   * An accessor rather than a property name, because the generic half of this
   * class both reads it (to decide whether anything is configured) and writes
   * it (when the configured file is loaded), and the name differs.
   */
  protected abstract get documentText(): string;
  protected abstract set documentText(value: string);

  /** Defaults for the settings this web part has and the other one does not. */
  protected abstract ownDefaults(): Record<string, unknown>;

  /** Build the renderer and whatever it needs. Called once, while starting. */
  protected abstract buildRenderers(): void;

  /**
   * Tell the renderer its settings moved. Called when a setting that feeds it
   * changed, and whenever the folder the document resolves against changed,
   * which is not the same list.
   */
  protected abstract refreshRendererOptions(): void;

  /** Draw the document. Called only when there is one to draw. */
  protected abstract drawDocument(): void;

  /** Stop anything the renderer started. Must not throw: see stopping. */
  protected abstract disposeRenderers(): void;

  /** Whether an author has typed something that is not saved yet. */
  protected abstract hasUnsavedEdits(): boolean;

  /** Settings that mean the renderer has to be rebuilt rather than told. */
  protected abstract rebuildsRenderer(): string[];

  /** Settings that change what else the pane shows, beyond the shared ones. */
  /**
   * Which extensions this web part's own documents carry.
   *
   * Read when a document is named on the page's address, because that value
   * has to be split into a path and a heading and a # can be in either: the
   * split is made at the extension instead, so this says which ones count.
   *
   * It used to be md and markdown, written into the pattern. That refused
   * every HTML document a menu entry could name.
   */
  protected documentExtensions(): string[] {
    return DOCUMENT_EXTENSIONS;
  }

  /**
   * The file picker's source of libraries, folders and files.
   *
   * Overridden by a web part whose documents are not markdown, because the
   * picker offers files by extension and offering an author a list of markdown
   * files to render as HTML is offering them nothing.
   */
  protected buildPaneSources(): PaneSources {
    return new PaneSources(this.sharePoint, this.properties);
  }

  /**
   * Anything a web part needs fetched before it can draw a document.
   *
   * Awaited inside the same try as the rest of starting up, so a failure here
   * is reported as a web part that could not start rather than thrown into the
   * page. Nothing by default: only the HTML web part has a second file to
   * fetch, its stylesheet.
   */
  protected async startedUp(): Promise<void> {
    /* Nothing by default. */
  }

  /**
   * The element the search index should read the document's text from.
   *
   * The document is inside `.strata-content` in both web parts, except where
   * the HTML one has put it behind a shadow boundary or in a frame - neither
   * of which this query can see into. That web part says where to look
   * instead; see HtmlViewRenderer.indexedContent.
   */
  protected indexedArticle(): HTMLElement | undefined {
    return (this.domElement.querySelector('.strata-content') as HTMLElement) || undefined;
  }

  protected redrawsPane(): string[] {
    return [];
  }

  /**
   * Something to put in an empty web part, offered to an author who can save
   * it. Undefined where there is nothing sensible to offer.
   */
  protected abstract sampleContent(): string | undefined;

  /** What to say when the configured document could not be read. */
  protected abstract loadFailure(error: Error): string;

  /** How this web part names itself in a console message. */
  protected abstract logName(): string;

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
      console.error(`[${this.logName()}] The web part could not start`, error);
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
    this.paneSources = this.buildPaneSources();

    /*
     * Reading another document is not configuring the page, so none of what it
     * knows goes into the properties: see documentNavigator.ts.
     */
    this.navigator = new DocumentNavigator({
      instanceId: this.context.instanceId,
      /* Two kinds of document, because a web part pointed at a URL links to
         documents on that same server. A path is a file in this tenant and is
         read with the reader's own session; an address of its own is fetched,
         and only opens if that server allows this page to read it. */
      load: async (path: string): Promise<ILoadedDocument> => {
        if (isRemote(path)) {
          try {
            return { markdown: await SharePointService.fetchUrl(fetchableUrl(path)) };
          } catch (error) {
            throw new Error(remoteFailure(path, error));
          }
        }
        return {
          markdown: await this.sharePoint.getFileContent(path),
          metadata: await this.sharePoint.getFileMetadata(path)
        };
      },
      onChange: () => {
        this.loadError = undefined;
        this.previewContent = undefined;
        this.previewBanner = undefined;
        /* The folder a document resolves its pictures and links against is its
           own, which is rarely the configured file's. */
        this.refreshRendererOptions();
        this.render();
      },
      onError: (message: string) => {
        this.loadError = message;
        this.render();
      }
    });

    /* Built after the navigator, because the folder it resolves pictures
       against is the followed document's when there is one. */
    this.buildRenderers();

    this.versionPanel = new VersionPanel(this.sharePoint, {
      onPreview: (content: string, label: string) => {
        this.previewContent = content;
        this.previewBanner = `Previewing version ${label}. Reload to go back to the current version.`;
        this.render();
      },
      onRestored: () => void this.loadContent(true)
    });

    this.detached('The property pane could not be told what the site holds.',
      this.paneSources.loadAll().then(() => this.context.propertyPane.refresh()));
    /* Before the document, so that anything a web part needs in order to draw
       one is there for the first draw rather than arriving as a second. */
    await this.startedUp();
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
    this.stopping(() => this.disposeRenderers());
    this.stopping(() => { if (this.pdfExport) { this.pdfExport.dispose(); } });
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
  protected stopping(stop: () => void): void {
    try {
      stop();
    } catch (error) {
      console.error(`[${this.logName()}] Something would not stop`, error);
    }
  }

  protected get dataVersion(): Version {
    return Version.parse('1.0');
  }

  /**
   * Tells SharePoint which properties carry indexable content, so the rendered
   * text is findable in Microsoft Search and links are rewritten when a site is
   * copied. Without this, a document rendered by a client-side web part is
   * invisible to search.
   *
   * The document's own property is added by the web part that owns its name.
   */
  protected get propertiesMetadata(): IWebPartPropertiesMetadata {
    return {
      searchablePlainText: { isSearchablePlainText: true },
      fileUrl: { isLink: true }
    };
  }

  /** Defaults matter here: an unconfigured web part still has to look right. */
  private applyDefaults(): void {
    const shared: Record<string, unknown> = {
      contentSource: 'manual',
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
      enableImageZoom: true,
      enableTableSort: true,
      showReadingTime: false,
      backToTop: 'right',
      followDocumentLinks: true,
      tocPosition: 'off',
      tocMaxLevel: 3,
      tocWidthMode: 'auto',
      tocWidthUnit: 'em',
      tocWidthValue: 15,
      toolbarVisibility: 'always',
      stickyToolbar: false,
      showExportButton: true,
      exportCoverPage: true,
      exportContentsPage: true,
      exportSectionBreaks: false,
      showShareButton: true,
      showSourceInfo: true,
      pinMeta: false,
      fillHeight: false,
      enableVersionHistory: true,
      searchablePlainText: ''
    };

    const properties: Record<string, unknown> = this.properties as unknown as Record<string, unknown>;
    const fallbacks: Record<string, unknown> = { ...shared, ...this.ownDefaults() };

    /* This button printed the page before it exported a document, and the
       setting was called showPrintButton. A page that turned it off meant it,
       so the old answer is carried over rather than the default putting the
       button back on a page somebody deliberately took it off. Read through
       the record, because the old key is not on the interface any more: it
       only exists in what a page saved before this release. */
    if (properties.showExportButton === undefined && properties.showPrintButton !== undefined) {
      properties.showExportButton = properties.showPrintButton;
    }

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
      console.error(`[${this.logName()}] The web part could not draw itself`, error);
      this.drawFailure();
    }
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

    this.drawDocument();
  }

  /**
   * The text to draw: a version being previewed wins over a document being
   * read, which wins over the one the page is configured to show.
   */
  protected textToDraw(): string {
    if (this.previewContent !== undefined) {
      return this.previewContent;
    }
    return this.navigator.markdown !== undefined ? this.navigator.markdown : this.documentText;
  }

  /** Whether the reader is on a document other than the configured one. */
  protected followingAnother(): boolean {
    return !!this.navigator.path;
  }

  /**
   * The banners, in the one order that works.
   *
   * The banner is one slot, and the address notice is last because it is the
   * only one of them nothing else will say: an editor drawing "Editing x.md"
   * over it would leave an author with a menu that silently does nothing and
   * no clue why.
   */
  protected drawBanners(): void {
    if (this.displayMode === DisplayMode.Edit && this.followingAnother()) {
      this.showBanner(strings.EditingAnotherDocument, 'info');
    }
    if (this.previewBanner) {
      this.showBanner(this.previewBanner, 'success');
    }
    if (this.loadError) {
      this.showBanner(this.loadError, 'error');
    }
    this.showAddressNotice();
  }

  /* Only to an author: it names a setting to change, which is not a reader's
     business and not a reader's to fix. */
  protected showAddressNotice(): void {
    if (this.addressNotice && this.displayMode === DisplayMode.Edit) {
      this.showBanner(this.addressNotice, 'info');
    }
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

    const said: IUnconfiguredGuidance = this.unconfiguredGuidance();
    const guidance: HTMLElement = document.createElement('p');
    guidance.className = 'strata-unconfigured-body';
    guidance.textContent = inTeams
      ? said.inTeams
      : (editing ? said.inPane : strings.UnconfiguredOnPage);
    panel.appendChild(guidance);

    /* Only where somebody can act on it. Offering the sample to a reader who
       cannot save it is an offer of nothing. */
    const sample: string | undefined = this.sampleContent();
    if (editing && !inTeams && sample !== undefined) {
      const button: HTMLButtonElement = document.createElement('button');
      button.type = 'button';
      button.className = 'strata-unconfigured-sample';
      button.textContent = strings.UnconfiguredSampleButton;
      button.addEventListener('click', () => {
        this.properties.contentSource = 'manual';
        this.documentText = sample;
        this.updateSearchText();
        this.render();
      });
      panel.appendChild(button);
    }

    this.domElement.appendChild(panel);
  }

  /**
   * What to tell somebody who has not chosen a document yet.
   *
   * Only the two that name the kind of document are asked for. "No document
   * chosen yet" and "somebody who can edit this page needs to choose one" say
   * nothing about markdown or HTML and are the same either way, and a string
   * kept in one place cannot drift from its twin.
   */
  protected unconfiguredGuidance(): IUnconfiguredGuidance {
    return { inPane: strings.UnconfiguredInPane, inTeams: strings.UnconfiguredInTeams };
  }

  protected showBanner(message: string, tone: string): void {
    const banner: HTMLElement = document.createElement('div');
    /* Two classes, and both earn their place. strata-status is what the
       stylesheet paints, and the editor's own status line carries it too, so
       a selector on it alone finds whichever comes first in the document -
       which is how a check here read "Editing x.md" and reported it as a
       banner. strata-banner is what this one is. */
    banner.className = 'strata-status strata-banner';
    banner.setAttribute('data-tone', tone);
    banner.style.display = 'block';
    banner.style.marginBottom = '12px';
    banner.textContent = message;
    // Inside the themed root, or it renders unstyled beside the web part.
    const root: HTMLElement = this.domElement.querySelector('.strata-root') || this.domElement;
    root.insertBefore(banner, root.firstChild);
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
  protected hostName(): string {
    const teams: { context?: { hostClientType?: string } } | undefined =
      this.context.sdks ? this.context.sdks.microsoftTeams : undefined;

    if (!teams || !teams.context) {
      return 'sharepoint';
    }
    return teams.context.hostClientType
      ? `teams-${teams.context.hostClientType}`
      : 'teams';
  }

  /** True when the toolbar should be shown for the current display mode. */
  protected isToolbarVisible(): boolean {
    if (this.properties.toolbarVisibility === 'never') {
      return false;
    }
    if (this.properties.toolbarVisibility === 'editing') {
      return this.displayMode === DisplayMode.Edit;
    }
    return true;
  }

  // ------------------------------------------------------------------- theme

  protected themeSettings(): IThemeSettings {
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
      fillHeight: this.properties.fillHeight,
      /*
       * A toolbar nobody can see cannot be stuck to anything, and a web part
       * whose toolbar is off would otherwise carry an attribute promising a
       * bar that is not there. Resolved here rather than in the stylesheet
       * because the visibility answer depends on the display mode.
       */
      stickyToolbar: this.properties.stickyToolbar && this.isToolbarVisible()
    };
  }

  protected resolvedMode(): ResolvedMode {
    const settings: IThemeSettings = this.themeSettings();
    return ThemeManager.resolveMode(settings.colorMode, this.isInverted);
  }

  // ------------------------------------------------------------------- paths

  /**
   * The folder relative sources are resolved against: the one holding the
   * document, not the one holding the page. Content typed into the web part
   * has no folder of its own, so it falls back to the site, which is what
   * someone writing a path by hand in a web part most likely means.
   */
  protected documentBasePath(): string | undefined {
    /* A followed document resolves its own pictures and links against its own
       folder, which is rarely the configured file's. */
    if (this.navigator.path) {
      return folderOf(this.navigator.path);
    }
    return this.configuredFolder();
  }

  /**
   * The folder the page itself reads from, whatever is open on top of it.
   *
   * Kept apart from documentBasePath because the two answer different
   * questions. That one asks what the document on screen resolves against,
   * which moves as a reader follows links. This one asks what the page
   * resolves against when it is handed an address and has not opened anything
   * yet, which is what a shared link is resolved against on the way back in,
   * and so what a shared link has to be written against on the way out.
   */
  protected configuredFolder(): string | undefined {
    if (this.properties.contentSource === 'library' && this.properties.selectedFile) {
      return folderOf(this.properties.selectedFile);
    }
    if (this.properties.contentSource === 'url' && this.properties.fileUrl) {
      return folderOf(this.properties.fileUrl);
    }
    return this.context.pageContext.web.serverRelativeUrl;
  }

  // ----------------------------------------------------------------- content

  /**
   * Whether anybody has told this web part what to show.
   *
   * Each source answers it differently, and none of them can be answered by
   * looking at the rendered document: a document that renders is not the same
   * as a document somebody chose.
   */
  protected isConfigured(): boolean {
    if (this.properties.contentSource === 'library') {
      return !!this.properties.selectedFile;
    }
    if (this.properties.contentSource === 'url') {
      return !!this.properties.fileUrl;
    }
    return !!this.documentText;
  }

  protected canSaveToSharePoint(): boolean {
    return this.properties.contentSource === 'library' && !!this.properties.selectedFile;
  }

  protected async loadContent(userInitiated: boolean): Promise<void> {
    this.loadError = undefined;
    this.previewContent = undefined;
    this.previewBanner = undefined;

    try {
      if (this.properties.contentSource === 'library' && this.properties.selectedFile) {
        this.documentText = await this.sharePoint.getFileContent(this.properties.selectedFile);
        this.properties.fileMetadata = await this.sharePoint.getFileMetadata(this.properties.selectedFile);
        this.setupAutoRefresh();
      } else if (this.properties.contentSource === 'url' && this.properties.fileUrl) {
        this.documentText = await SharePointService.fetchUrl(this.properties.fileUrl);
        this.properties.fileMetadata = undefined;
      }
    } catch (error) {
      this.loadError = this.loadFailure(error as Error);
    }

    // The base path follows the chosen file, and the property list that
    // rebuilds the renderer does not include the properties that change it -
    // so refresh it here, or a newly picked file goes on resolving its images
    // against the folder of the previous one. Cheap when nothing moved.
    this.refreshRendererOptions();

    if (userInitiated || this.contentLoadedOnce) {
      this.render();
    }
    this.contentLoadedOnce = true;
  }

  protected setupAutoRefresh(): void {
    this.sharePoint.unwatchFile();
    if (!this.properties.enableAutoRefresh || !this.properties.selectedFile) {
      return;
    }
    this.sharePoint.watchFile(this.properties.selectedFile, () => {
      if (this.displayMode === DisplayMode.Edit && this.hasUnsavedEdits()) {
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

  protected async saveToSharePoint(text: string): Promise<boolean> {
    if (!this.canSaveToSharePoint()) {
      return false;
    }

    const lastModified: string = this.properties.fileMetadata
      ? this.properties.fileMetadata.timeLastModified : '';
    if (lastModified) {
      const changed: boolean = await this.sharePoint.hasChangedSince(
        this.properties.selectedFile, lastModified
      );
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

    await this.sharePoint.saveFileContent(this.properties.selectedFile, text);
    this.properties.fileMetadata = await this.sharePoint.getFileMetadata(this.properties.selectedFile);
    return true;
  }

  protected async showVersions(): Promise<void> {
    if (this.versionPanel.isOpen) {
      this.versionPanel.close();
      return;
    }
    await this.versionPanel.open(this.domElement, this.properties.selectedFile);
  }

  // --------------------------------------------------------------- addresses

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
   */
  protected async openDocumentFromAddress(): Promise<void> {
    const asked: boolean = window.location.search
      .indexOf(`${DOCUMENT_PARAMETER}=`) !== -1;

    if (!this.properties.followDocumentLinks || this.properties.contentSource === 'manual') {
      /* A menu entry named a document and the page is not set up to open one,
         so nothing happens and the configured document appears instead -
         which looks exactly like a menu entry pointing at the wrong place.
         Said only to somebody editing the page, because it is a setting to
         change rather than news for a reader. */
      this.noticeAboutAddress(asked ? strings.AddressIgnored : undefined);
      return;
    }

    const wanted: IWantedDocument | undefined = documentFromAddress(
      window.location.search, this.documentBasePath(), this.documentExtensions()
    );
    if (!wanted) {
      this.noticeAboutAddress(asked ? strings.AddressNotUnderstood : undefined);
      return;
    }
    await this.navigator.open(wanted.path, wanted.heading, false);
  }

  /**
   * The address of the document on screen.
   *
   * A reader deep in a wiki is looking at something the page's own address
   * says nothing about: it still reads Wiki.aspx, so sending it to a colleague
   * sends them to the front page. The configured document is the exception and
   * needs no parameter, because the page address already is its address.
   */
  protected addressToShare(): string {
    const here: string = window.location.href;
    return this.navigator.path
      ? addressForDocument(here, this.navigator.path, undefined, this.configuredFolder())
      : addressWithoutDocument(here);
  }

  /* Drawn on a render of its own, because working this out is the last thing
     startUp does and the render that would have carried it has already been
     and gone. Nothing is drawn for a reader, so nothing is redrawn for one. */
  private noticeAboutAddress(notice: string | undefined): void {
    this.addressNotice = notice;
    if (notice && this.displayMode === DisplayMode.Edit) {
      this.render();
    }
  }

  // ------------------------------------------------------------------ export

  /**
   * The document on screen, laid out as pages and handed to the print dialog.
   *
   * Falls back to printing the page as it stands wherever the pages cannot be
   * worked out. A reader who asked for a PDF should get one: a worse PDF is
   * better than a button that did nothing and said nothing.
   */
  protected async exportPdf(): Promise<void> {
    const article: HTMLElement | null = this.domElement.querySelector('.strata-content');
    if (!article) {
      window.print();
      return;
    }

    const path: string = this.navigator.path
      || (this.properties.contentSource === 'url'
        ? this.properties.fileUrl
        : this.properties.selectedFile)
      || '';

    const exported: boolean = await this.pdfExport.run(
      article,
      this.domElement.querySelector<HTMLElement>('.strata-root') || undefined,
      {
        title: documentTitle(article, fileOf(path)),
        source: sourceLabel(path),
        taken: exportDate(new Date()),
        cover: this.properties.exportCoverPage,
        contents: this.properties.exportContentsPage,
        /* The same depth the contents sidebar is set to, so the two agree
           about how deep this document goes. */
        contentsMaxLevel: this.properties.tocMaxLevel,
        sectionBreaks: this.properties.exportSectionBreaks
      }
    );

    if (!exported) {
      window.print();
    }
  }

  /**
   * A promise nobody is waiting on, and somewhere for it to fail.
   *
   * These are the calls made for their effect rather than their result: the
   * lists the property pane offers, the version panel, an export. Failing,
   * none of them is worth taking the page down for, and none of them has
   * anybody left to tell.
   *
   * What they must not do is fail silently into the page. `void` on a promise
   * says the result is not wanted; it does not say a rejection is not wanted,
   * and an unhandled one surfaces as an error on somebody's SharePoint page
   * with nothing in it to say which web part it came from.
   */
  protected detached(what: string, work: Promise<unknown>): void {
    work.catch((error: unknown) => {
      console.error(`[${this.logName()}] ${what}`, error);
    });
  }

  // ------------------------------------------------------------ search index

  /**
   * Copies the rendered text into a searchable property. Read from the DOM so
   * the source syntax never reaches the index.
   *
   * On a SharePoint page only, and that is not a nicety.
   *
   * A page keeps a web part's properties in its own canvas, server side, where
   * twenty thousand characters of document text is nothing. A Teams tab keeps
   * them in the tab's configuration, which is small and is not a place to put
   * a document. Written there it did not survive: what came back was truncated,
   * and SPFx reads it with JSON.parse and then walks the result, so the tab
   * died before any of this ran, with
   *
   *   Error initializing application.
   *   TypeError: JSON.parse is not a function or its return value is not iterable
   *
   * and a reader saw "Sorry, something went wrong". Nothing about the tab
   * looked wrong until it was reloaded: configuring one worked, the document
   * rendered, and closing the pane is what saved the properties and broke it.
   */
  protected updateSearchText(): void {
    if (!this.indexable()) {
      /* Cleared rather than left alone: a tab configured by an older build has
         the text in its settings already, and this is the one chance to take
         it back out. */
      if (this.properties.searchablePlainText) {
        this.properties.searchablePlainText = '';
      }
      return;
    }

    const article: HTMLElement | undefined = this.indexedArticle();
    if (!article) {
      return;
    }
    const text: string = (article.textContent || '').replace(/\s+/g, ' ').trim();
    this.properties.searchablePlainText = text.substring(0, MAX_SEARCH_TEXT);
  }

  /**
   * Whether this web part's properties are somewhere a document's text can go.
   *
   * A SharePoint page, and nothing else. Read from the host rather than from a
   * setting, because it is a fact about where the web part is running.
   */
  private indexable(): boolean {
    return this.hostName() === 'sharepoint';
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

    if (this.rebuildsRenderer().indexOf(propertyPath) !== -1) {
      this.refreshRendererOptions();
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
      this.detached('The folders in that library could not be listed.',
        this.paneSources.loadFolders()
          .then(() => this.paneSources.loadFiles())
          .then(() => this.context.propertyPane.refresh()));
    }

    if (propertyPath === 'selectedFolder') {
      this.properties.selectedFile = '';
      this.detached('The files in that folder could not be listed.',
        this.paneSources.loadFiles().then(() => this.context.propertyPane.refresh()));
    }

    if (propertyPath === 'selectedFile' || propertyPath === 'fileUrl') {
      void this.loadContent(true);
    }

    if (propertyPath === 'enableAutoRefresh') {
      this.setupAutoRefresh();
    }

    this.onOwnPropertyChanged(propertyPath, oldValue, newValue);

    /* Last, so a setting changed above is drawn in the same refresh. The
       cascading ones are not here: theirs has to wait for a fetch. */
    if (SHARED_REDRAWS_THE_PANE.indexOf(propertyPath) !== -1
      || this.redrawsPane().indexOf(propertyPath) !== -1) {
      this.context.propertyPane.refresh();
    }

    if (propertyPath === 'themeFamily' || propertyPath === 'colorMode') {
      // An author changing the theme should win over a reader's earlier choice.
      this.themeOverride.clear();
    }
  }

  /**
   * A setting only this web part has, changed. Called before the pane is
   * redrawn, so a value corrected here is drawn in the same refresh.
   */
  // eslint-disable-next-line @typescript-eslint/no-explicit-any, @typescript-eslint/no-unused-vars
  protected onOwnPropertyChanged(propertyPath: string, oldValue: any, newValue: any): void {
    /* Nothing by default. */
  }
}
