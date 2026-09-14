/**
 * Renders the `<pre class="mermaid">` blocks the markdown processor emits.
 *
 * Mermaid draws to SVG with the colours baked in at render time, so a theme
 * change means re-rendering rather than restyling. The diagram source is kept
 * on the container in `data-strata-source` so that second pass has something to
 * re-render from after the <pre> has been replaced by the SVG.
 */

import { IMermaidApi, IMermaidRenderResult } from 'mermaid';
import { ThemeManager, ThemeFamily, ResolvedMode } from './ThemeManager';

/*
 * Gantt charts draw their labels at 10px (the time axis) and 11px (task names
 * and section titles). A flowchart scales its whole SVG to the container, so
 * its text grows with the column; a gantt re-lays the chart out instead and
 * keeps those sizes at any width, which leaves them close to unreadable on a
 * SharePoint page.
 *
 * Mermaid's own `gantt.fontSize` does not reach these elements. Its generated
 * stylesheet targets them by the diagram's id, so an id selector, which beats
 * anything we can write in our own stylesheet. themeCSS is appended to that
 * same generated stylesheet, which is why it is the one lever that works.
 */
const GANTT_TEXT_CSS: string = [
  '.tick text { font-size: 13px; }',
  '.taskText, .sectionTitle, text[class*="taskTextOutside"] { font-size: 13px; }'
].join('\n');

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

  public async render(container: HTMLElement, family: ThemeFamily, mode: ResolvedMode): Promise<void> {
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
      this.mermaid.initialize({
        startOnLoad: false,
        // strict escapes HTML in diagram text and disables click bindings;
        // htmlLabels off means labels can never become markup at all. Mermaid
        // still wraps long label text without them.
        securityLevel: 'strict',
        htmlLabels: false,
        flowchart: { htmlLabels: false, curve: 'basis', padding: 12, useMaxWidth: true, wrappingWidth: 220 },
        sequence: { useMaxWidth: true },
        gantt: { useMaxWidth: true, barHeight: 22, barGap: 6 },
        themeCSS: GANTT_TEXT_CSS,
        ...ThemeManager.getMermaidTheme(family, mode)
      });
    } catch {
      jobs.forEach((job) => this.showError(job.host, job.source, 'Mermaid could not be loaded.'));
      return;
    }

    for (const job of jobs) {
      this.renderCount += 1;
      try {
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
