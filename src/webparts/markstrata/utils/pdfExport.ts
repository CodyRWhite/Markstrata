/**
 * .SYNOPSIS
 * Exporting the document on screen as a paginated PDF.
 *
 * .DESCRIPTION
 * A browser will save a page as a PDF, and what it saves is the page: one long
 * column cut wherever the paper runs out, with the contents sidebar dumped on
 * the front as a list of headings and no page numbers, because nothing knows
 * what page anything is on until the pages exist.
 *
 * Paged.js works the pages out first. Given the document and a sheet of paged
 * CSS it lays the content into page boxes, and once it has done that
 * `target-counter` can say which page a heading landed on, `string-set` can
 * put the section a page belongs to in its running head, and a break can be
 * asked for before a section rather than hoped for. None of those exist in a
 * browser: they are CSS Paged Media, which is implemented by print engines and
 * not by browsers, and this is the polyfill.
 *
 * What it cannot do is write a PDF outline, the bookmarks pane a reader
 * navigates from. Nothing a page is allowed to ask the browser for produces
 * one: `window.print()` takes no arguments and the Save as PDF dialog has no
 * such option. Chrome will write an outline, but only when it is driven over
 * the DevTools Protocol, which is a headless browser on a server rather than a
 * web part in a tenant. The contents page with real page numbers is the
 * answer to the same need that a page turns to rather than navigates from.
 *
 * The document on screen is never touched. Everything below happens to a copy:
 * the copy is laid out, printed from, and thrown away, and the reader's
 * scroll position, their open callouts and the document they were reading are
 * all where they left them.
 *
 * .USAGE
 *   import { PdfExport } from './utils/pdfExport';
 *
 *   const exporter: PdfExport = new PdfExport();
 *   await exporter.run(article, root, {
 *     title: 'Deploying the service',
 *     source: 'Documents / Runbooks / deploy.md',
 *     taken: '16 September 2026',
 *     cover: true, contents: true, contentsMaxLevel: 3, sectionBreaks: false
 *   });
 *   exporter.dispose();
 *
 * .NOTES
 * Since:     0.0.20.0
 * Ships in:  the web part bundle, with Paged.js as a chunk of its own
 * Requires:  contents.ts, exportStyles.ts, pagedjs
 */

import { IPagedFlow, IPagedStylesheet, Previewer } from 'pagedjs';

import { ITocEntry, collectHeadings } from './contents';
import { PAGE, PAGED } from './exportStyles';

export interface IExportOptions {
  /** What the document calls itself, on the cover and in every running head. */
  title: string;
  /** Where it came from, under the title. */
  source: string;
  /** The date the export was taken, at the foot of the cover. */
  taken: string;
  cover: boolean;
  contents: boolean;
  contentsMaxLevel: number;
  /** Start each top level section on a page of its own. */
  sectionBreaks: boolean;
}

/**
 * Put in front of every id in the copy.
 *
 * The copy carries the document's own ids, and two elements answering to one
 * id is one too many: `target-counter` would be asked which page `#rollback`
 * is on and be shown the one still on screen, which is on no page at all.
 * Prefixing the copy's ids leaves the document's own untouched and gives the
 * contents something unambiguous to point at.
 */
const ID_PREFIX: string = 'strata-export-id-';

/** How long to wait for a picture before laying out without it. */
const IMAGE_TIMEOUT_MS: number = 4000;

/**
 * How long after printing to put the page back, when the browser never says
 * the print finished.
 *
 * `afterprint` is the signal and most browsers send it. One that does not
 * would otherwise leave the page with the export still standing in front of
 * it, which is a worse failure than tearing down slightly early.
 */
const TEARDOWN_FALLBACK_MS: number = 60000;

/**
 * What the copy is told about itself whatever the reader is looking at.
 *
 * Everything else about the theme is taken from the root the reader has in
 * front of them. These four are answers to the shape of a window or to the
 * state of a page, and an export has neither.
 */
const EXPORT_ATTRIBUTES: { [name: string]: string } = {
  /*
   * Paper is white. A reader in a dark theme exporting light text on a dark
   * ground gets a page the printer fills edge to edge and a PDF that is
   * unreadable the moment anybody prints it, so the export is laid out in the
   * light half of whatever theme they chose rather than in a different theme.
   */
  'data-strata-mode': 'light',
  /* Fill-the-height is a min-height in pixels measured off a screen. */
  'data-strata-fill': 'content',
  /* And pinned metadata sticks to the top of one. */
  'data-strata-meta': 'flow',
  /* The page being edited is not something the export is part of. */
  'data-strata-editing': 'false'
};

export class PdfExport {
  private holder: HTMLElement | undefined;
  private sheet: HTMLStyleElement | undefined;
  private previewer: Previewer | undefined;
  private onAfterPrint: (() => void) | undefined;
  private fallbackTimer: number | undefined;
  private running: boolean = false;

  /**
   * Lays the document out and opens the print dialog.
   *
   * Returns false when the pages could not be worked out, which is the
   * caller's signal to fall back to printing the page as it stands. A reader
   * who asked for a PDF should get something rather than a button that did
   * nothing.
   */
  public async run(
    article: HTMLElement,
    root: HTMLElement | undefined,
    options: IExportOptions
  ): Promise<boolean> {
    /* A second click while the first is still laying pages out would export
       the copy along with the document. */
    if (this.running) {
      return true;
    }
    this.running = true;

    try {
      const content: HTMLElement = this.buildContent(article, options);
      await imagesSettled(content);

      const previewer: Previewer = await PdfExport.load();
      this.previewer = previewer;

      this.holder = this.buildHolder(root, options);
      document.body.appendChild(this.holder);
      this.sheet = installSheet();

      const sheets: IPagedStylesheet[] = [{ 'strata-export': PAGED }];
      const flow: IPagedFlow = await previewer.preview(content, sheets, this.holder);
      if (!flow || !flow.total) {
        this.teardown();
        return false;
      }

      this.print();
      return true;
    } catch (error) {
      console.error('[Markstrata] The document could not be laid out for export.', error);
      this.teardown();
      return false;
    } finally {
      this.running = false;
    }
  }

  /** Takes the export off the page, whether or not it was ever printed. */
  public dispose(): void {
    this.teardown();
  }

  /**
   * Paged.js is large and most readers never export, so it is a chunk of its
   * own rather than part of the bundle, the same arrangement Mermaid has.
   */
  private static async load(): Promise<Previewer> {
    const loaded: { Previewer: typeof Previewer } =
      await import(/* webpackChunkName: 'pagedjs' */ 'pagedjs');
    return new loaded.Previewer();
  }

  /**
   * The document to lay out: a cover, a contents, and a copy of what is on
   * screen, in that order and none of them attached to the page.
   */
  private buildContent(article: HTMLElement, options: IExportOptions): HTMLElement {
    const content: HTMLElement = document.createElement('div');

    const copy: HTMLElement = article.cloneNode(true) as HTMLElement;
    copy.classList.add('strata-export-content');
    copy.removeAttribute('id');
    prefixIds(copy);
    loadEagerly(copy);

    if (options.cover) {
      content.appendChild(this.buildCover(options));
    }
    if (options.contents) {
      const entries: ITocEntry[] = collectHeadings(copy, options.contentsMaxLevel);
      const contents: HTMLElement | undefined = this.buildContents(entries);
      if (contents) {
        content.appendChild(contents);
      }
    }

    content.appendChild(copy);
    return content;
  }

  private buildCover(options: IExportOptions): HTMLElement {
    const cover: HTMLElement = document.createElement('section');
    cover.className = 'strata-export-cover';

    const title: HTMLElement = document.createElement('div');
    title.className = 'strata-export-title';
    title.textContent = options.title;
    cover.appendChild(title);

    if (options.source) {
      const source: HTMLElement = document.createElement('div');
      source.className = 'strata-export-source';
      source.textContent = options.source;
      cover.appendChild(source);
    }

    if (options.taken) {
      const taken: HTMLElement = document.createElement('div');
      taken.className = 'strata-export-taken';
      taken.textContent = `Exported ${options.taken}`;
      cover.appendChild(taken);
    }

    return cover;
  }

  /**
   * The contents, as links the page numbers are counted against.
   *
   * The dots are an element rather than a border on the label, because the
   * label is as wide as its words and the dots have to fill whatever is left
   * between them and the number.
   */
  private buildContents(entries: ITocEntry[]): HTMLElement | undefined {
    if (!entries.length) {
      return undefined;
    }

    const section: HTMLElement = document.createElement('section');
    section.className = 'strata-export-contents';

    const heading: HTMLElement = document.createElement('div');
    heading.className = 'strata-export-contents-heading';
    heading.textContent = 'Contents';
    section.appendChild(heading);

    const list: HTMLElement = document.createElement('ol');
    entries.forEach((entry: ITocEntry) => {
      const item: HTMLElement = document.createElement('li');
      item.className = `strata-lvl-${entry.level}`;

      const link: HTMLAnchorElement = document.createElement('a');
      link.setAttribute('href', `#${entry.id}`);

      const label: HTMLElement = document.createElement('span');
      label.className = 'strata-export-label';
      label.textContent = entry.text;

      const dots: HTMLElement = document.createElement('span');
      dots.className = 'strata-export-dots';

      link.appendChild(label);
      link.appendChild(dots);
      item.appendChild(link);
      list.appendChild(item);
    });

    section.appendChild(list);
    return section;
  }

  /**
   * Where the pages are rendered.
   *
   * Carries the web part's own root class and whatever theme the reader is
   * looking at, so the copy is styled by the same stylesheets the document is
   * and an export does not quietly look like a different product.
   *
   * The class alone is not the theme, and finding that out cost an export.
   * Every token a theme declares is declared against an attribute on the root
   * - `.strata-root[data-strata-theme='github']` and, for the colours,
   * `[data-strata-mode='light']` with it - so a copy carrying `strata-root`
   * and none of the attributes resolves not one of them. CSS says nothing
   * about that: `font-size: var(--strata-h2-size)` with nothing behind the
   * variable is an invalid declaration and is dropped, so the heading inherits
   * body size, and `border: var(--strata-table-border) solid` goes the same
   * way, so the table loses its rules. Every page comes out, correctly
   * paginated, and what comes out is a flat wall of text.
   *
   * So the attributes come across with the class, and the four that are
   * answers to a window rather than to a theme are then set to what a sheet of
   * paper needs.
   */
  private buildHolder(root: HTMLElement | undefined, options: IExportOptions): HTMLElement {
    const holder: HTMLElement = document.createElement('div');
    holder.className = 'strata-export-root';

    if (root) {
      root.classList.forEach((name: string) => holder.classList.add(name));
      copyTheme(root, holder);
    } else {
      holder.classList.add('strata-root');
    }

    Object.keys(EXPORT_ATTRIBUTES).forEach((name: string) => {
      holder.setAttribute(name, EXPORT_ATTRIBUTES[name]);
    });
    /* So the browser picks light form controls and scrollbars to match, the
       same reason ThemeManager sets it on the root. */
    holder.style.colorScheme = 'light';

    if (options.sectionBreaks) {
      holder.classList.add('strata-export-sections');
    }

    return holder;
  }

  /** Hands the page to the export, prints, and puts it back afterwards. */
  private print(): void {
    document.documentElement.setAttribute('data-strata-export', 'on');

    this.onAfterPrint = (): void => this.teardown();
    window.addEventListener('afterprint', this.onAfterPrint);
    this.fallbackTimer = window.setTimeout(() => this.teardown(), TEARDOWN_FALLBACK_MS);

    window.print();
  }

  private teardown(): void {
    /*
     * The order here is the whole of it, and it is not the obvious one.
     *
     * Paged.js watches every page it builds with a resize observer, and
     * answers a resize by walking back through the tokens it broke the
     * document on. Taking those pages out of the document is itself a resize,
     * to nothing, so pulling the export off the page fires all of them at
     * once: each walks a document that is being dismantled around it, and a
     * dozen "cannot read properties of null" errors arrive in the console of
     * whatever page the web part happens to be on. Removing the element first
     * does not help, because removing the element is what does it.
     *
     * removePages destroys each page properly, and a page being destroyed
     * disconnects its observer before it goes. After that there is nothing
     * left watching and the rest can be taken apart in any order.
     */
    if (this.previewer) {
      try {
        this.previewer.chunker.removePages(0);
        this.previewer.chunker.destroy();
        this.previewer.polisher.destroy();
      } catch {
        /* Already gone, which is the state this is trying to reach. */
      }
      this.previewer = undefined;
    }

    if (this.holder && this.holder.parentNode) {
      this.holder.parentNode.removeChild(this.holder);
    }
    this.holder = undefined;

    if (this.sheet && this.sheet.parentNode) {
      this.sheet.parentNode.removeChild(this.sheet);
    }
    this.sheet = undefined;

    document.documentElement.removeAttribute('data-strata-export');

    if (this.onAfterPrint) {
      window.removeEventListener('afterprint', this.onAfterPrint);
      this.onAfterPrint = undefined;
    }
    if (this.fallbackTimer !== undefined) {
      window.clearTimeout(this.fallbackTimer);
      this.fallbackTimer = undefined;
    }
  }
}

/**
 * The theme the reader chose, brought across to the copy.
 *
 * Only the `data-strata-*` attributes, and none of the inline style: the root
 * carries a measured `min-height` when the web part is filling the window and
 * a scroll offset for clearing the page's chrome, both of which are lengths
 * taken off a screen that the export has nothing to do with.
 */
function copyTheme(root: HTMLElement, holder: HTMLElement): void {
  const attributes: Attr[] = Array.prototype.slice.call(root.attributes);
  attributes.forEach((attribute: Attr) => {
    if (attribute.name.indexOf('data-strata-') === 0) {
      holder.setAttribute(attribute.name, attribute.value);
    }
  });
}

/**
 * Renames every id in the copy, and the links pointing at them with it.
 *
 * A link the copy carries to a heading the copy carries should land inside the
 * export rather than back in the document on screen, which on paper is the
 * difference between a page number and nothing.
 */
function prefixIds(copy: HTMLElement): void {
  const identified: HTMLElement[] = Array.prototype.slice.call(copy.querySelectorAll('[id]'));
  identified.forEach((element: HTMLElement) => {
    element.id = ID_PREFIX + element.id;
  });

  const links: HTMLAnchorElement[] = Array.prototype.slice.call(copy.querySelectorAll('a[href^="#"]'));
  links.forEach((link: HTMLAnchorElement) => {
    const href: string = link.getAttribute('href') || '';
    if (href.length > 1) {
      link.setAttribute('href', `#${ID_PREFIX}${href.slice(1)}`);
    }
  });
}

/**
 * Asks for every picture at once, rather than when it comes into view.
 *
 * The enhancer marks pictures `loading="lazy"`, which is right for a document
 * somebody is scrolling and wrong for one being laid out: the copy is off the
 * side of the page while its pages are worked out, so a lazy picture is never
 * in view, never loads, and never has a height. Paged.js reaches it, finds
 * nothing to measure, and stops there with the rest of the document still in
 * its hands. A ten paragraph document exported as ten paragraphs; a thirty
 * paragraph one with a picture in it exported as the ten before the picture.
 *
 * Decoding synchronously for the same reason: the height has to be known while
 * the page it goes on is being decided, not shortly afterwards.
 */
function loadEagerly(copy: HTMLElement): void {
  const images: HTMLImageElement[] = Array.prototype.slice.call(copy.querySelectorAll('img'));
  images.forEach((image: HTMLImageElement) => {
    image.setAttribute('loading', 'eager');
    image.setAttribute('decoding', 'sync');
  });
}

/**
 * Waits for the copy's pictures, so the pages are worked out around their real
 * heights rather than around nothing.
 *
 * A picture that never answers is waited for once and then laid out as it
 * stands: a document with one broken image should still export.
 */
async function imagesSettled(content: HTMLElement): Promise<void> {
  const images: HTMLImageElement[] = Array.prototype.slice.call(content.querySelectorAll('img'));
  const pending: HTMLImageElement[] = images.filter((image: HTMLImageElement) => !image.complete);
  if (!pending.length) {
    return;
  }

  await Promise.all(pending.map((image: HTMLImageElement) => new Promise<void>((resolve) => {
    let settled: boolean = false;
    const done = (): void => {
      if (!settled) {
        settled = true;
        resolve();
      }
    };
    image.addEventListener('load', done);
    image.addEventListener('error', done);
    window.setTimeout(done, IMAGE_TIMEOUT_MS);
  })));
}

/** The gating stylesheet, added for the export and taken away with it. */
function installSheet(): HTMLStyleElement {
  const style: HTMLStyleElement = document.createElement('style');
  style.setAttribute('data-strata-export-styles', 'true');
  style.textContent = PAGE;
  document.head.appendChild(style);
  return style;
}
