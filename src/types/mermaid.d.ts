/**
 * .SYNOPSIS
 * Minimal typings for the lazily imported Mermaid chunk.
 *
 * .DESCRIPTION
 * Mermaid's own .d.ts pulls in @types/d3-*, which use TypeScript 5 syntax that
 * the compiler shipped with SPFx 1.21 (4.7) cannot parse - and skipLibCheck
 * does not help, because it is a parse error rather than a type error. The
 * `paths` entry in tsconfig.json points the compiler at this file instead;
 * webpack still resolves the real package when it builds the chunk.
 *
 * Only the two calls this web part makes are declared, so a typo in either is
 * still a compile error.
 *
 * .USAGE
 *   // Nothing imports this by name. tsconfig.json's `paths` points the compiler
 *   // at it wherever the code says:
 *
 *   const mermaid = await import('mermaid');
 *
 * .NOTES
 * Since:     0.0.6
 * Ships in:  the web part bundle
 * Requires:  nothing else in this project
 */

declare module 'mermaid' {
  export interface IMermaidRenderResult {
    svg: string;
    bindFunctions?: (element: HTMLElement) => void;
  }

  export interface IMermaidApi {
    initialize(config: Record<string, unknown>): void;
    render(id: string, source: string): Promise<IMermaidRenderResult>;
  }

  const mermaid: IMermaidApi;
  export default mermaid;
}
