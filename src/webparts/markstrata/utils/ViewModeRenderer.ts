/**
 * .SYNOPSIS
 * Read mode: toolbar, optional table of contents sidebar, rendered markdown
 * and an optional source footer.
 *
 * .USAGE
 *   import { ViewModeRenderer } from './utils/ViewModeRenderer';
 *
 *   const view: ViewModeRenderer = new ViewModeRenderer(processor, mermaid, enhancer, {
 *     onReload: () => load(), onShowVersions: () => versions(),
 *     onThemeOverride: (family, mode) => override(family, mode), onExport: () => exportPdf()
 *   });
 *   view.render(container, markdown, options);
 *
 * .NOTES
 * Since:     0.0.6
 * Ships in:  the web part bundle
 * Requires:  MarkdownProcessor.ts, MermaidRenderer.ts, mermaidConfig.ts,
 *            ContentEnhancer.ts, ThemeManager.ts, SharePointService.ts,
 *            frontMatter.ts, backToTop.ts
 */

import { MarkdownProcessor } from './MarkdownProcessor';
import { MermaidRenderer } from './MermaidRenderer';
import { DiagramWidth } from './mermaidConfig';
import { ContentEnhancer, ITocEntry } from './ContentEnhancer';
import { landOnHeading } from './headingLanding';
import {
  ThemeManager,
  IThemeSettings,
  ResolvedMode,
  ThemeFamily,
  THEME_FAMILIES,
  IThemeChoice
} from './ThemeManager';
// Type only: the view renderer knows nothing about SharePoint at runtime, so
// it can be exercised in a plain browser page without the SPFx host.
import type { IFileMetadata } from './SharePointService';
import { splitFrontMatter, IFrontMatter } from './frontMatter';
import { BackToTop } from './backToTop';
import {
  CLOCK_ICON, RELOAD_ICON, HISTORY_ICON, LINK_ICON, PRINT_ICON, themeIcon
} from './icons';

export type TocPosition = 'left' | 'right' | 'inline' | 'off';

export interface IViewOptions {
  settings: IThemeSettings;
  resolvedMode: ResolvedMode;
  showToolbar: boolean;
  showThemeSwitcher: boolean;
  showExportButton: boolean;
  tocPosition: TocPosition;
  tocMaxLevel: number;
  showSourceInfo: boolean;
  enableMermaid: boolean;
  /** What a diagram does when it wants more width than the column gives. */
  diagramWidth?: DiagramWidth;
  enableImageZoom?: boolean;
  enableTableSort?: boolean;
  showReadingTime?: boolean;
  /* Given only when there is a library behind the page to ask. */
  listFolder?: (folder: string) => Promise<string[] | undefined>;
  /**
   * How a fence that named a `src` reaches that address. Given by the host,
   * because only the host knows whether it is talking to SharePoint or to a
   * stand-in; without it such a fence stays as it rendered, saying which
   * server it was waiting for.
   */
  fetchCode?: (url: string) => Promise<string>;
  /** The folder this document is in, which its relative links point from. */
  documentBase?: string;
  /** Given when a link to another document should open here rather than leave. */
  openDocument?: (path: string, heading: string) => void;
  /** The followed document being read, when one is: empty when at home. */
  openDocumentName?: string;
  /**
   * Every document from the configured one to the one being read, in order.
   * Drawn as breadcrumbs, so the last entry is where the reader is now.
   */
  documentTrail?: string[];
  /** A crumb was clicked, by its place in documentTrail. */
  onGoToCrumb?: (index: number) => void;
  /**
   * Asked for a file's unique id, so an `![[Report.docx]]` embed can be drawn
   * with SharePoint's own preview in it. Undefined leaves those embeds as the
   * marked links they render as.
   */
  officeFileId?: (path: string) => Promise<string | undefined>;
  /** The site the page is on, server relative: the preview is addressed from it. */
  webUrl?: string;
  /**
   * The address of what is on screen, to put on the clipboard. Undefined
   * leaves the share button out, which is right wherever the address would
   * not bring somebody back to the same document.
   */
  shareAddress?: () => string;
  /** A heading in the document to land on once it is drawn, from a link. */
  landOnHeading?: string;
  backToTop?: BackToTop;
  canReload: boolean;
  canShowVersions: boolean;
  /** True while the SharePoint page itself is being edited. */
  isPageEditing: boolean;
  fileMetadata?: IFileMetadata;
}

/** Below this width the contents collapse instead of sitting open beside the text. */
const NARROW_WIDTH: number = 720;

export interface IViewCallbacks {
  onReload: () => void;
  onShowVersions: () => void;
  onThemeOverride: (family: ThemeFamily, mode: 'light' | 'dark') => void;
  /** Lay the document out as pages and hand it to the print dialog. */
  onExport: () => void;
}

export class ViewModeRenderer {
  private processor: MarkdownProcessor;
  private mermaid: MermaidRenderer;
  private enhancer: ContentEnhancer;
  private callbacks: IViewCallbacks;
  /** Ids have to be unique across the whole page, not just this web part. */
  private readonly uid: string = `strata-${Math.random().toString(36).substring(2, 8)}`;
  /** The colour mode this renderer last painted, or undefined before the first. */
  private lastMode: ResolvedMode | undefined;

  constructor(
    processor: MarkdownProcessor,
    mermaid: MermaidRenderer,
    enhancer: ContentEnhancer,
    callbacks: IViewCallbacks
  ) {
    this.processor = processor;
    this.mermaid = mermaid;
    this.enhancer = enhancer;
    this.callbacks = callbacks;
  }

  public render(container: HTMLElement, markdown: string, options: IViewOptions): void {
    this.enhancer.stopTracking();
    const host: HTMLElement = ThemeManager.mount(container, options.settings, options.resolvedMode);
    host.setAttribute('data-strata-editing', String(options.isPageEditing));

    let toolbar: HTMLElement | undefined;
    if (options.showToolbar) {
      toolbar = this.buildToolbar(options);
      host.appendChild(toolbar);
    }

    /* Inside the toolbar, on a line of its own under the controls and above
       the rule that closes it. The trail is part of the same furniture - it
       says where the reader is, the controls say what they can do about it -
       and a line between them would separate two halves of one thing. The
       toolbar wraps, so a full-width child falls to its own row.

       Without a toolbar there is nothing to sit inside, and it stands where
       the toolbar would have been. */
    if (options.openDocumentName && options.onGoToCrumb) {
      (toolbar || host).appendChild(this.buildOpenDocumentBar(options));
    }

    const layout: HTMLElement = document.createElement('div');
    layout.className = 'strata-layout';
    if (options.tocPosition === 'left' || options.tocPosition === 'right') {
      layout.setAttribute('data-strata-toc', options.tocPosition);
    }

    const article: HTMLElement = document.createElement('article');
    article.className = 'strata-content';

    if (!markdown || markdown.trim().length === 0) {
      const empty: HTMLElement = document.createElement('div');
      empty.className = 'strata-empty';
      empty.textContent = 'No markdown to show yet. Edit this web part to pick a file or type some content.';
      article.appendChild(empty);
    } else {
      article.innerHTML = this.processor.render(markdown);
    }

    /* Read here rather than inside the processor, because the footer wants the
       values and the processor only hands back HTML. */
    const front: IFrontMatter = splitFrontMatter(markdown || '').data;

    // The sidebar has to be built from the rendered article, so render first
    // and insert the aside in front of it afterwards.
    layout.appendChild(article);
    host.appendChild(layout);

    this.addToc(layout, article, host, options);

    if (options.showSourceInfo && options.fileMetadata) {
      host.appendChild(this.buildSourceInfo(options.fileMetadata, front));
    }

    this.enhancer.attachCopyButtons(article);
    /* After the article is in the page, because which blocks get a full size
       view is decided by measuring them rather than by reading the markdown. */
    this.enhancer.attachCodeZoom(article, options.enableImageZoom !== false);
    this.enhancer.secureExternalLinks(article);
    this.enhancer.followDocumentLinks(
      article,
      options.documentBase,
      options.openDocument,
      /* An anchor into this document scrolls here rather than being handed to
         the page's router, which would take the reader back to the configured
         document with the fragment still on the address. Smoothly, so it
         arrives the way the contents list already arrives. */
      (heading: string) => { landOnHeading(article, heading, true); }
    );
    this.enhancer.enhanceImages(article, options.enableImageZoom !== false);
    this.enhancer.enhanceTables(article, options.enableTableSort !== false);

    /* Measured from the rendered document rather than the markdown, so code
       and diagram source are not counted as prose, which means it can only be
       filled in once the article exists. */
    const readingTime: HTMLElement | null = toolbar
      ? toolbar.querySelector('.strata-reading-time-value') : null;
    if (readingTime) {
      const spent: string = this.enhancer.readingTime(article);
      readingTime.textContent = spent.replace(/ read$/, '');
      /* Nothing to say about an empty document, and a lone clock says less
         than nothing. */
      const pill: HTMLElement | null = toolbar
        ? toolbar.querySelector('.strata-reading-time') : null;
      if (pill) {
        pill.hidden = !spent;
        pill.title = spent ? `About ${spent.replace(' read', '')} to read` : '';
      }
    }

    this.enhancer.attachBackToTop(host, options.backToTop || 'off');
    /* So a heading scrolled to clears whatever SharePoint has stuck above the
       web part, by any route: the contents, a link, or a restored fragment. */
    this.enhancer.trackScrollOffset(host);

    /* A link that named a heading in another document: the document is here
       now, so this is the moment it can be scrolled to. The offset above is
       what keeps it clear of the chrome, so it has to be set first. */
    if (options.landOnHeading) {
      /* By every spelling the name might have, not just the one written. A
         wiki link arrives already slugged; a heading named on the page's own
         address arrives as somebody typed it, so `#Rollback` was looked up as
         `Rollback` and matched nothing, and the reader was left at the top of
         the right document. */
      landOnHeading(article, options.landOnHeading);
    }

    /* Left to settle in on its own: the document is readable while this is in
       flight, and a link that turns out to be missing is marked when the
       answer arrives rather than the page waiting on it. */
    if (options.listFolder) {
      void this.enhancer.validateWikiLinks(article, options.listFolder);
    }

    /* Also left to settle in on its own. The card is drawn synchronously with
       everything a reader needs on it; only the preview inside it waits on
       SharePoint, and a document is readable without it. */
    if (options.officeFileId && options.webUrl) {
      void this.enhancer.buildOfficeCards(article, options.webUrl, options.officeFileId);
    }

    /* And the same bargain for a fence that named an address: the block is
       drawn waiting, the document is readable around it, and the code arrives
       when the other server answers. A fence that named a line range has
       already reserved the height it will need, so the document around it does
       not move when it fills. */
    if (options.fetchCode) {
      void this.enhancer.fillRemoteCode(article, options.fetchCode)
        /* Round again, because a block that was one line of prose when the
           blocks were measured is now as tall as a file. */
        .then(() => this.enhancer.attachCodeZoom(article, options.enableImageZoom !== false));
    }

    if (options.enableMermaid) {
      void this.mermaid.render(article, options.settings.themeFamily, options.resolvedMode,
        options.diagramWidth)
        .then(() => this.enhancer.attachDiagramTools(article, options.enableImageZoom !== false));
    }

    /* Read by the next render to tell a mode the reader just chose from one
       the page simply opened with. */
    this.lastMode = options.resolvedMode;

    // Last, so the height is measured against the finished layout.
    if (options.settings.fillHeight) {
      this.enhancer.fillHeight(host);
    } else {
      this.enhancer.stopFilling();
    }
  }

  /**
   * Adds the table of contents as a column of the layout or as a block above
   * the text. It is never positioned over the content: an overlay sidebar is
   * exactly what makes a page awkward to edit.
   */
  private addToc(layout: HTMLElement, article: HTMLElement, host: HTMLElement, options: IViewOptions): void {
    if (options.tocPosition === 'off') {
      return;
    }

    /* A contents the document wrote for itself is a decision, and a
       hand-written one is often a deliberate subset of the headings. Taking it
       over also stops the page carrying two: the document's, in the text, and
       ours beside it. With the contents switched off this is never reached, so
       an authored one is left exactly where the author put it. */
    const authored: ITocEntry[] | undefined = this.enhancer.adoptAuthoredToc(article);
    const entries: ITocEntry[] = authored
      || this.enhancer.collectHeadings(article, options.tocMaxLevel);
    const nav: HTMLElement | undefined = this.enhancer.buildToc(entries, article);
    if (!nav) {
      return;
    }

    const panel: HTMLDetailsElement = document.createElement('details');
    panel.className = options.tocPosition === 'inline' ? 'strata-toc-inline' : 'strata-toc-sidebar';

    // Collapsed to start with only where it would otherwise crowd the text.
    const width: number = host.clientWidth || 0;
    panel.open = options.tocPosition === 'inline' || width === 0 || width > NARROW_WIDTH;

    const summary: HTMLElement = document.createElement('summary');
    summary.className = 'strata-toc-heading';
    summary.textContent = 'On this page';
    panel.appendChild(summary);
    panel.appendChild(nav);

    if (options.tocPosition === 'inline') {
      article.insertBefore(panel, article.firstChild);
    } else {
      layout.insertBefore(panel, article);
    }

    this.enhancer.trackActiveHeading(article, nav);
  }

  /*
   * The bar over a document the reader followed a link to.
   *
   * It is the reliable way back. The browser's own Back button works too, but
   * that depends on a history the host page also writes to, and this does not.
   */
  private buildOpenDocumentBar(options: IViewOptions): HTMLElement {
    const bar: HTMLElement = document.createElement('nav');
    bar.className = 'strata-open-doc';
    bar.setAttribute('aria-label', 'Document trail');

    const list: HTMLElement = document.createElement('ol');
    list.className = 'strata-crumbs';

    const trail: string[] = options.documentTrail && options.documentTrail.length
      ? options.documentTrail
      : [options.openDocumentName as string];
    const goTo: (index: number) => void = options.onGoToCrumb as (index: number) => void;

    trail.forEach((name: string, index: number) => {
      const item: HTMLElement = document.createElement('li');
      item.className = 'strata-crumb';

      /* The last crumb is where the reader already is, so it is text. A
         button that does nothing is worse than no button: it reads as a way
         somewhere and then is not one. */
      if (index === trail.length - 1) {
        const here: HTMLElement = document.createElement('span');
        here.className = 'strata-crumb-here';
        here.setAttribute('aria-current', 'page');
        here.textContent = withoutMarkdownExtension(name);
        here.title = name;
        item.appendChild(here);
      } else {
        const step: HTMLButtonElement = document.createElement('button');
        step.type = 'button';
        step.className = 'strata-crumb-link';
        step.textContent = withoutMarkdownExtension(name);
        /* The file name in full on hover. The trail reads as a path, and a
           path of file names is noisier than a path of pages, but the file is
           still what a reader is being sent to. */
        step.title = `Go back to ${name}`;
        step.onclick = () => goTo(index);
        item.appendChild(step);
      }

      list.appendChild(item);
    });

    bar.appendChild(list);
    return bar;
  }

  private buildToolbar(options: IViewOptions): HTMLElement {
    const toolbar: HTMLElement = document.createElement('div');
    toolbar.className = 'strata-toolbar';

    if (options.showThemeSwitcher) {
      toolbar.appendChild(this.buildThemeSwitcher(options));
    }

    /* Beside the theme control rather than with the actions: how long the
       document is describes the document, it is not something to do to it.
       Filled in after the article renders, since that is what it counts. */
    if (options.showReadingTime) {
      const time: HTMLElement = document.createElement('span');
      time.className = 'strata-reading-time';
      /* The clock is markup rather than a character, so it matches the other
         icons in weight and follows the theme's colour. */
      time.innerHTML = CLOCK_ICON;
      const value: HTMLElement = document.createElement('span');
      value.className = 'strata-reading-time-value';
      time.appendChild(value);
      toolbar.appendChild(time);
    }

    /* The things you can do to the document, in one group at the end, so the
       bar reads as "what this is" on the left and "what you can do" on the
       right instead of six controls of equal weight in a row. */
    const actions: HTMLElement = document.createElement('div');
    actions.className = 'strata-toolbar-actions';

    if (options.canReload) {
      actions.appendChild(this.button('Reload', 'Reload the file from SharePoint',
        () => this.callbacks.onReload(), RELOAD_ICON));
    }
    if (options.canShowVersions) {
      actions.appendChild(this.button('History', 'Show previous versions of this file',
        () => this.callbacks.onShowVersions(), HISTORY_ICON));
    }
    /*
     * A reader who has followed links into a wiki is looking at a document the
     * page's own address says nothing about: the address bar still reads
     * Wiki.aspx, so sending it to somebody sends them to the front page. This
     * copies the address of the document actually on screen.
     *
     * Only where that address would work. It is built out of ?strataDoc=, so
     * it needs a page that will honour one, and a button that copies a link
     * leading somewhere else is worse than no button.
     */
    if (options.shareAddress) {
      const share: HTMLButtonElement = this.button(
        'Share', 'Copy a link to this document', () => {
          this.enhancer.copyToClipboard((options.shareAddress as () => string)(), share);
        }, LINK_ICON
      );
      actions.appendChild(share);
    }
    if (options.showExportButton) {
      /* "Export" rather than "Print", because what it produces is a document
         with a cover, a contents and page numbers rather than the page cut
         into paper-sized pieces. The dialog that opens is still the browser's
         print dialog, since that is the only way a page is allowed to make a
         PDF, so the title says where to go in it. */
      actions.appendChild(this.button('Export', 'Export as a PDF, with a contents page. Choose "Save as PDF" in the dialog',
        () => this.callbacks.onExport(), PRINT_ICON));
    }
    /* Last in the group, at the far right of the bar. It belongs with the
       things you do to the page rather than with the theme list: choosing a
       theme is a setting you pick from, light and dark is one switch you
       flick, and the two read as different kinds of control. */
    if (options.showThemeSwitcher) {
      actions.appendChild(this.buildModeToggle(options));
    }
    if (actions.childElementCount) {
      toolbar.appendChild(actions);
    }

    return toolbar;
  }

  /** Reader-side override of the author's theme choice. */
  private buildThemeSwitcher(options: IViewOptions): HTMLElement {
    const wrapper: HTMLElement = document.createElement('div');
    wrapper.className = 'strata-switcher';

    /* The word "Theme" beside a list of theme names said it twice. The name is
       still there for anyone who cannot see the list. */
    const select: HTMLSelectElement = document.createElement('select');
    select.className = 'strata-select';
    select.id = `${this.uid}-theme`;
    select.setAttribute('aria-label', 'Theme');
    THEME_FAMILIES.forEach((choice: IThemeChoice) => {
      const option: HTMLOptionElement = document.createElement('option');
      option.value = choice.key;
      option.text = choice.text;
      option.selected = choice.key === options.settings.themeFamily;
      select.appendChild(option);
    });
    select.addEventListener('change', () => {
      this.callbacks.onThemeOverride(select.value as ThemeFamily, options.resolvedMode);
    });
    wrapper.appendChild(select);

    return wrapper;
  }

  /**
   * Light and dark, as one button at the end of the bar.
   *
   * The icon shows what the click gives, not what the page currently is: a sun
   * on a dark page, a moon on a light one.
   */
  private buildModeToggle(options: IViewOptions): HTMLButtonElement {
    const dark: boolean = options.resolvedMode === 'dark';
    /* A switch, so it is named for the thing it switches and says whether that
       thing is on, rather than renaming itself every time it is used. The icon
       shows the mode the page is in and the tooltip says what a click does, so
       nothing on the button contradicts anything else on it. */
    const toggle: HTMLButtonElement = this.button(
      'Dark mode',
      dark ? 'Switch to the light theme' : 'Switch to the dark theme',
      () =>
        this.callbacks.onThemeOverride(
          options.settings.themeFamily,
          dark ? 'light' : 'dark'
        ),
      themeIcon(`${this.uid}-mode-mask`)
    );
    toggle.classList.add('strata-mode-toggle');
    toggle.setAttribute('aria-pressed', String(dark));

    /* The sun and the moon are one drawing that travels between the two, and a
       transition only runs on a change. Choosing a mode re-renders the whole
       web part, so this button is new every time and would otherwise land in
       its finished state with nothing to animate. When the mode is what
       changed, it is mounted in the state the reader is leaving and moved to
       the new one once the browser has drawn it - two frames, because a style
       set in the first one is still the element's first style. The sun setting
       as the page goes dark is the point of it: the icon and the page turn
       together. A first load has no previous mode and simply paints the mode
       it opens in. */
    const settled: () => void = () =>
      toggle.classList.toggle('strata-mode-toggle--dark', dark);
    if (this.lastMode !== undefined && this.lastMode !== options.resolvedMode) {
      toggle.classList.toggle('strata-mode-toggle--dark', !dark);
      window.requestAnimationFrame(() => window.requestAnimationFrame(settled));
    } else {
      settled();
    }

    return toggle;
  }

  private buildSourceInfo(metadata: IFileMetadata, front: IFrontMatter): HTMLElement {
    const info: HTMLElement = document.createElement('div');
    info.className = 'strata-meta';

    /* A document that titled itself in its frontmatter is better named by that
       than by its file name, which is often a slug. */
    const name: HTMLElement = document.createElement('span');
    name.textContent = front.title || metadata.name;
    if (front.title) {
      name.title = metadata.name;
    }
    info.appendChild(name);

    if (metadata.timeLastModified) {
      const modified: HTMLElement = document.createElement('span');
      modified.textContent = `Updated ${new Date(metadata.timeLastModified).toLocaleString()}`;
      info.appendChild(modified);
    }

    /* The file's author is who saved it; the document's is who wrote it, and
       when a document says so it is the more useful of the two. */
    const author: string = front.author || metadata.author;
    if (author) {
      const byline: HTMLElement = document.createElement('span');
      byline.textContent = `By ${author}`;
      info.appendChild(byline);
    }

    (front.tags || []).forEach((tag: string) => {
      const chip: HTMLElement = document.createElement('span');
      chip.className = 'strata-tag';
      chip.textContent = tag;
      info.appendChild(chip);
    });

    return info;
  }

  /*
   * The label stays in the markup whether or not it is on screen: a narrow
   * column hides it with CSS, which keeps the button readable to a screen
   * reader and searchable on the page, where an icon-only button with a title
   * is neither.
   */
  private button(text: string, title: string, onClick: () => void,
    icon?: string): HTMLButtonElement {
    const button: HTMLButtonElement = document.createElement('button');
    button.type = 'button';
    button.className = 'strata-btn';
    if (icon) {
      button.innerHTML = icon;
      button.classList.add('strata-btn--icon');
    }

    const label: HTMLElement = document.createElement('span');
    label.className = 'strata-btn-label';
    label.textContent = text;
    button.appendChild(label);

    button.title = title;
    button.addEventListener('click', onClick);
    return button;
  }
}

/**
 * A crumb reads as a page, not as a file: "Deploy notes", not
 * "Deploy notes.md". Every document here is markdown, so the extension is on
 * every crumb and tells a reader nothing.
 *
 * Only markdown is dropped. A trail through a linked .txt or .pdf keeps its
 * extension, because there the extension is the one thing that says this
 * entry is not like the others. The full name stays in the title attribute
 * either way.
 */
function withoutMarkdownExtension(name: string): string {
  return name.replace(/\.(md|markdown)$/i, '') || name;
}
