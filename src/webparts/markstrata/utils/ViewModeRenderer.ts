/**
 * Read mode: toolbar, optional table of contents sidebar, rendered markdown
 * and an optional source footer.
 */

import { MarkdownProcessor } from './MarkdownProcessor';
import { MermaidRenderer } from './MermaidRenderer';
import { ContentEnhancer, ITocEntry } from './ContentEnhancer';
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

export type TocPosition = 'left' | 'right' | 'inline' | 'off';

export interface IViewOptions {
  settings: IThemeSettings;
  resolvedMode: ResolvedMode;
  showToolbar: boolean;
  showThemeSwitcher: boolean;
  showPrintButton: boolean;
  tocPosition: TocPosition;
  tocMaxLevel: number;
  showSourceInfo: boolean;
  enableMermaid: boolean;
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
  onPrint: () => void;
}

export class ViewModeRenderer {
  private processor: MarkdownProcessor;
  private mermaid: MermaidRenderer;
  private enhancer: ContentEnhancer;
  private callbacks: IViewCallbacks;
  /** Ids have to be unique across the whole page, not just this web part. */
  private readonly uid: string = `ink-${Math.random().toString(36).substring(2, 8)}`;

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

  public render(host: HTMLElement, markdown: string, options: IViewOptions): void {
    this.enhancer.stopTracking();
    host.innerHTML = '';
    ThemeManager.apply(host, options.settings, options.resolvedMode);
    host.setAttribute('data-ink-editing', String(options.isPageEditing));

    if (options.showToolbar) {
      host.appendChild(this.buildToolbar(options));
    }

    const layout: HTMLElement = document.createElement('div');
    layout.className = 'ink-layout';
    if (options.tocPosition === 'left' || options.tocPosition === 'right') {
      layout.setAttribute('data-ink-toc', options.tocPosition);
    }

    const article: HTMLElement = document.createElement('article');
    article.className = 'ink-content';

    if (!markdown || markdown.trim().length === 0) {
      const empty: HTMLElement = document.createElement('div');
      empty.className = 'ink-empty';
      empty.textContent = 'No markdown to show yet. Edit this web part to pick a file or type some content.';
      article.appendChild(empty);
    } else {
      article.innerHTML = this.processor.render(markdown);
    }

    // The sidebar has to be built from the rendered article, so render first
    // and insert the aside in front of it afterwards.
    layout.appendChild(article);
    host.appendChild(layout);

    this.addToc(layout, article, host, options);

    if (options.showSourceInfo && options.fileMetadata) {
      host.appendChild(this.buildSourceInfo(options.fileMetadata));
    }

    this.enhancer.attachCopyButtons(article);
    this.enhancer.secureExternalLinks(article);

    if (options.enableMermaid) {
      void this.mermaid.render(article, options.settings.themeFamily, options.resolvedMode);
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

    const entries: ITocEntry[] = this.enhancer.collectHeadings(article, options.tocMaxLevel);
    const nav: HTMLElement | undefined = this.enhancer.buildToc(entries, article);
    if (!nav) {
      return;
    }

    const panel: HTMLDetailsElement = document.createElement('details');
    panel.className = options.tocPosition === 'inline' ? 'ink-toc-inline' : 'ink-toc-sidebar';

    // Collapsed to start with only where it would otherwise crowd the text.
    const width: number = host.clientWidth || 0;
    panel.open = options.tocPosition === 'inline' || width === 0 || width > NARROW_WIDTH;

    const summary: HTMLElement = document.createElement('summary');
    summary.className = 'ink-toc-heading';
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

  private buildToolbar(options: IViewOptions): HTMLElement {
    const toolbar: HTMLElement = document.createElement('div');
    toolbar.className = 'ink-toolbar';

    if (options.showThemeSwitcher) {
      toolbar.appendChild(this.buildThemeSwitcher(options));
    }

    const spacer: HTMLElement = document.createElement('div');
    spacer.className = 'ink-toolbar-spacer';
    toolbar.appendChild(spacer);

    if (options.canReload) {
      toolbar.appendChild(
        this.button('Reload', 'Reload the file from SharePoint', () => this.callbacks.onReload())
      );
    }
    if (options.canShowVersions) {
      toolbar.appendChild(
        this.button('Version history', 'Show previous versions of this file', () => this.callbacks.onShowVersions())
      );
    }
    if (options.showPrintButton) {
      toolbar.appendChild(this.button('Print', 'Print or save as PDF', () => this.callbacks.onPrint()));
    }

    return toolbar;
  }

  /** Reader-side override of the author's theme choice. */
  private buildThemeSwitcher(options: IViewOptions): HTMLElement {
    const wrapper: HTMLElement = document.createElement('div');
    wrapper.className = 'ink-switcher';

    const label: HTMLLabelElement = document.createElement('label');
    label.textContent = 'Theme';
    label.htmlFor = `${this.uid}-theme`;
    wrapper.appendChild(label);

    const select: HTMLSelectElement = document.createElement('select');
    select.className = 'ink-select';
    select.id = `${this.uid}-theme`;
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

    const toggle: HTMLElement = this.button(
      options.resolvedMode === 'dark' ? 'Light mode' : 'Dark mode',
      'Switch between light and dark',
      () =>
        this.callbacks.onThemeOverride(
          options.settings.themeFamily,
          options.resolvedMode === 'dark' ? 'light' : 'dark'
        )
    );
    wrapper.appendChild(toggle);

    return wrapper;
  }

  private buildSourceInfo(metadata: IFileMetadata): HTMLElement {
    const info: HTMLElement = document.createElement('div');
    info.className = 'ink-meta';

    const name: HTMLElement = document.createElement('span');
    name.textContent = metadata.name;
    info.appendChild(name);

    if (metadata.timeLastModified) {
      const modified: HTMLElement = document.createElement('span');
      modified.textContent = `Updated ${new Date(metadata.timeLastModified).toLocaleString()}`;
      info.appendChild(modified);
    }

    if (metadata.author) {
      const author: HTMLElement = document.createElement('span');
      author.textContent = `By ${metadata.author}`;
      info.appendChild(author);
    }

    return info;
  }

  private button(text: string, title: string, onClick: () => void): HTMLButtonElement {
    const button: HTMLButtonElement = document.createElement('button');
    button.type = 'button';
    button.className = 'ink-btn';
    button.textContent = text;
    button.title = title;
    button.addEventListener('click', onClick);
    return button;
  }
}
