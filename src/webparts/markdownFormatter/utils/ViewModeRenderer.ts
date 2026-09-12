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
import { IFileMetadata } from './SharePointService';

export interface IViewOptions {
  settings: IThemeSettings;
  resolvedMode: ResolvedMode;
  showToolbar: boolean;
  showThemeSwitcher: boolean;
  showToc: boolean;
  tocMaxLevel: number;
  showSourceInfo: boolean;
  enableMermaid: boolean;
  canReload: boolean;
  canShowVersions: boolean;
  fileMetadata?: IFileMetadata;
}

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
    host.innerHTML = '';
    ThemeManager.apply(host, options.settings, options.resolvedMode);

    if (options.showToolbar) {
      host.appendChild(this.buildToolbar(options));
    }

    const layout: HTMLElement = document.createElement('div');
    layout.className = 'mdf-layout';

    const article: HTMLElement = document.createElement('article');
    article.className = 'mdf-content';

    if (!markdown || markdown.trim().length === 0) {
      const empty: HTMLElement = document.createElement('div');
      empty.className = 'mdf-empty';
      empty.textContent = 'No markdown to show yet. Edit this web part to pick a file or type some content.';
      article.appendChild(empty);
    } else {
      article.innerHTML = this.processor.render(markdown);
    }

    // The sidebar has to be built from the rendered article, so render first
    // and insert the aside in front of it afterwards.
    layout.appendChild(article);
    host.appendChild(layout);

    if (options.showToc) {
      const entries: ITocEntry[] = this.enhancer.collectHeadings(article, options.tocMaxLevel);
      const nav: HTMLElement | undefined = this.enhancer.buildToc(entries, article);
      if (nav) {
        const aside: HTMLElement = document.createElement('aside');
        aside.className = 'mdf-toc-sidebar';
        const heading: HTMLElement = document.createElement('div');
        heading.className = 'mdf-toc-heading';
        heading.textContent = 'On this page';
        aside.appendChild(heading);
        aside.appendChild(nav);
        layout.insertBefore(aside, article);
      }
    }

    if (options.showSourceInfo && options.fileMetadata) {
      host.appendChild(this.buildSourceInfo(options.fileMetadata));
    }

    this.enhancer.attachCopyButtons(article);
    this.enhancer.secureExternalLinks(article);

    if (options.enableMermaid) {
      void this.mermaid.render(article, options.settings.themeFamily, options.resolvedMode);
    }
  }

  private buildToolbar(options: IViewOptions): HTMLElement {
    const toolbar: HTMLElement = document.createElement('div');
    toolbar.className = 'mdf-toolbar';

    if (options.showThemeSwitcher) {
      toolbar.appendChild(this.buildThemeSwitcher(options));
    }

    const spacer: HTMLElement = document.createElement('div');
    spacer.className = 'mdf-toolbar-spacer';
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
    toolbar.appendChild(this.button('Print', 'Print or save as PDF', () => this.callbacks.onPrint()));

    return toolbar;
  }

  /** Reader-side override of the author's theme choice. */
  private buildThemeSwitcher(options: IViewOptions): HTMLElement {
    const wrapper: HTMLElement = document.createElement('div');
    wrapper.className = 'mdf-switcher';

    const label: HTMLLabelElement = document.createElement('label');
    label.textContent = 'Theme';
    label.htmlFor = 'mdf-theme-select';
    wrapper.appendChild(label);

    const select: HTMLSelectElement = document.createElement('select');
    select.className = 'mdf-select';
    select.id = 'mdf-theme-select';
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
    info.className = 'mdf-meta';

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
    button.className = 'mdf-btn';
    button.textContent = text;
    button.title = title;
    button.addEventListener('click', onClick);
    return button;
  }
}
