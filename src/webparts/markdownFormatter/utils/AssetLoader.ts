/**
 * Loads the two optional third-party assets (Mermaid and KaTeX's stylesheet)
 * from a CDN, once per page, and only when the matching feature is switched
 * on. Tenants with a locked-down CSP need these two hosts allowed, or can
 * point MERMAID_URL / KATEX_CSS_URL at a library hosted inside the tenant.
 */

const MERMAID_URL: string = 'https://cdn.jsdelivr.net/npm/mermaid@11.12.0/dist/mermaid.min.js';
const KATEX_CSS_URL: string = 'https://cdn.jsdelivr.net/npm/katex@0.16.9/dist/katex.min.css';

const pending: { [url: string]: Promise<void> } = {};

function loadScript(url: string): Promise<void> {
  if (pending[url]) {
    return pending[url];
  }

  pending[url] = new Promise<void>((resolve: () => void, reject: (reason: Error) => void) => {
    const existing: HTMLScriptElement | null = document.querySelector(`script[src="${url}"]`);
    if (existing) {
      resolve();
      return;
    }

    const script: HTMLScriptElement = document.createElement('script');
    script.src = url;
    script.async = true;
    script.crossOrigin = 'anonymous';
    script.onload = () => resolve();
    script.onerror = () => reject(new Error(`Failed to load ${url}`));
    document.head.appendChild(script);
  });

  return pending[url];
}

export class AssetLoader {
  /** Resolves with the global `mermaid` object. */
  public static async loadMermaid(): Promise<any> {
    const existing: any = (window as any).mermaid;
    if (existing) {
      return existing;
    }

    await loadScript(MERMAID_URL);

    // The bundle assigns window.mermaid synchronously on load, but guard
    // against a slow assignment rather than failing the whole render.
    for (let attempt: number = 0; attempt < 20; attempt++) {
      if ((window as any).mermaid) {
        return (window as any).mermaid;
      }
      await new Promise<void>((resolve: () => void) => setTimeout(resolve, 50));
    }

    throw new Error('Mermaid loaded but did not register itself on window');
  }

  public static loadKatexCss(): void {
    if (document.querySelector(`link[href="${KATEX_CSS_URL}"]`)) {
      return;
    }
    const link: HTMLLinkElement = document.createElement('link');
    link.rel = 'stylesheet';
    link.href = KATEX_CSS_URL;
    link.crossOrigin = 'anonymous';
    document.head.appendChild(link);
  }
}
