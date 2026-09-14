/**
 * Read mode: toolbar, optional table of contents sidebar, rendered markdown
 * and an optional source footer.
 */

import { MarkdownProcessor } from './MarkdownProcessor';
import { MermaidRenderer } from './MermaidRenderer';
import { DiagramWidth } from './mermaidConfig';
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
  /** What a diagram does when it wants more width than the column gives. */
  diagramWidth?: DiagramWidth;
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
  private readonly uid: string = `strata-${Math.random().toString(36).substring(2, 8)}`;

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

    if (options.showToolbar) {
      host.appendChild(this.buildToolbar(options));
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
      void this.mermaid.render(article, options.settings.themeFamily, options.resolvedMode,
        options.diagramWidth).then(() => this.enhancer.attachDiagramCopyButtons(article));
    }

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

    const entries: ITocEntry[] = this.enhancer.collectHeadings(article, options.tocMaxLevel);
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

  private buildToolbar(options: IViewOptions): HTMLElement {
    const toolbar: HTMLElement = document.createElement('div');
    toolbar.className = 'strata-toolbar';

    if (options.showThemeSwitcher) {
      toolbar.appendChild(this.buildThemeSwitcher(options));
    }

    const spacer: HTMLElement = document.createElement('div');
    spacer.className = 'strata-toolbar-spacer';
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
    wrapper.className = 'strata-switcher';

    const label: HTMLLabelElement = document.createElement('label');
    label.textContent = 'Theme';
    label.htmlFor = `${this.uid}-theme`;
    wrapper.appendChild(label);

    const select: HTMLSelectElement = document.createElement('select');
    select.className = 'strata-select';
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
    info.className = 'strata-meta';

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
    button.className = 'strata-btn';
    button.textContent = text;
    button.title = title;
    button.addEventListener('click', onClick);
    return button;
  }
}
