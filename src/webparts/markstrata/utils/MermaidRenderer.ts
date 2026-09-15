/**
 * .SYNOPSIS
 * Renders the `<pre class="mermaid">` blocks the markdown processor emits.
 *
 * .DESCRIPTION
 * Mermaid draws to SVG with the colours baked in at render time, so a theme
 * change means re-rendering rather than restyling. The diagram source is kept
 * on the container in `data-strata-source` so that second pass has something to
 * re-render from after the <pre> has been replaced by the SVG.
 *
 * .USAGE
 *   import { MermaidRenderer } from './utils/MermaidRenderer';
 *
 *   const mermaid: MermaidRenderer = new MermaidRenderer();
 *   await mermaid.render(article, 'vscode', 'dark', 'fit');
 *
 * .NOTES
 * Since:     0.0.6
 * Ships in:  the web part bundle
 * Requires:  ThemeManager.ts, mermaidConfig.ts
 */

import { IMermaidApi, IMermaidRenderResult } from 'mermaid';
import { ThemeManager, ThemeFamily, ResolvedMode } from './ThemeManager';
import { mermaidConfigFor, MERMAID_BASE_CONFIG, DiagramWidth } from './mermaidConfig';


export class MermaidRenderer {
  /**
   * Mermaid is large, so it is a lazily imported chunk rather than part of the
   * web part bundle: pages without a diagram never download it. It is imported
   * rather than fetched from a CDN so a locked-down tenant can still use it and
   * no third party can change what runs.
   */
  private static async load(): Promise<IMermaidApi> {
    const loaded: { default: IMermaidApi } = await import(/* webpackChunkName: 'mermaid' */ 'mermaid');
    return loaded.default || ((loaded as unknown) as IMermaidApi);
  }

  private mermaid: IMermaidApi | undefined;
  private renderCount: number = 0;
  /** Ids must be unique across every web part on the page, not just this one. */
  private idPrefix: string = `strata-mermaid-${Math.random().toString(36).substring(2, 8)}`;

  public async render(container: HTMLElement, family: ThemeFamily, mode: ResolvedMode,
    width: DiagramWidth = 'fit'): Promise<void> {
    const hosts: HTMLElement[] = Array.prototype.slice.call(container.querySelectorAll('.strata-mermaid'));
    if (hosts.length === 0) {
      return;
    }

    // Capture sources before anything is replaced.
    const jobs: { host: HTMLElement; source: string }[] = [];
    hosts.forEach((host: HTMLElement) => {
      const stored: string | null = host.getAttribute('data-strata-source');
      const block: HTMLElement | null = host.querySelector('pre.mermaid');
      const source: string = stored || (block ? block.textContent || '' : '');
      if (source.trim().length > 0) {
        host.setAttribute('data-strata-source', source);
        jobs.push({ host: host, source: source });
      }
    });

    if (jobs.length === 0) {
      return;
    }

    try {
      if (!this.mermaid) {
        this.mermaid = await MermaidRenderer.load();
      }
    } catch {
      jobs.forEach((job) => this.showError(job.host, job.source, 'Mermaid could not be loaded.'));
      return;
    }

    const palette: { [key: string]: unknown } = ThemeManager.getMermaidTheme(family, mode) as
      unknown as { [key: string]: unknown };

    for (const job of jobs) {
      this.renderCount += 1;
      try {
        /*
         * Configured per diagram rather than once for all of them, because
         * fitting needs the width of the box this one is going into. The host
         * is already in the document and already has its padding, so its inner
         * width is what the drawing has to live in.
         */
        job.host.setAttribute('data-strata-diagram', width);
        this.mermaid.initialize({
          ...mermaidConfigFor(width, MermaidRenderer.usableWidth(job.host), MERMAID_BASE_CONFIG),
          ...palette
        });
        const result: IMermaidRenderResult = await this.mermaid.render(
          `${this.idPrefix}-${this.renderCount}`,
          job.source
        );
        job.host.classList.remove('strata-mermaid-error');
        job.host.innerHTML = result.svg;
      } catch (error) {
        this.showError(job.host, job.source, (error as Error).message || 'Diagram could not be rendered.');
      }
    }
  }

  /** The width inside the host's own padding, which is what a diagram gets. */
  private static usableWidth(host: HTMLElement): number {
    const style: CSSStyleDeclaration = window.getComputedStyle(host);
    const padding: number = parseFloat(style.paddingLeft || '0')
      + parseFloat(style.paddingRight || '0');
    return Math.max(0, Math.floor(host.clientWidth - padding));
  }

  /** Falls back to showing the diagram source, which beats showing nothing. */
  private showError(host: HTMLElement, source: string, message: string): void {
    host.classList.add('strata-mermaid-error');
    const pre: HTMLElement = document.createElement('pre');
    pre.className = 'mermaid';
    pre.textContent = source;
    const note: HTMLElement = document.createElement('div');
    note.className = 'strata-mermaid-message';
    note.textContent = message;
    host.innerHTML = '';
    host.appendChild(note);
    host.appendChild(pre);
  }
}
