/**
 * .SYNOPSIS
 * Module declarations for the markdown-it plugins that ship no types.
 *
 * .DESCRIPTION
 * Each of these packages is published without TypeScript types, and without a
 *
 * declaration the import is an error under noImplicitAny. They are declared as
 *
 * plugin functions rather than as `any`, so the processor still has to call
 *
 * them the way markdown-it does.
 *
 * .USAGE
 *   // Nothing imports this file: TypeScript picks it up from src/types and it
 *   // then covers every markdown-it plugin the processor loads.
 *
 *   import markdownItAbbr from 'markdown-it-abbr';   // typed, because of this file
 *
 * .NOTES
 * Since:     0.0.6
 * Ships in:  the web part bundle
 * Requires:  nothing else in this project
 */

declare module 'markdown-it-attrs' {
  const plugin: (markdownIt: unknown, options?: unknown) => void;
  export = plugin;
}

declare module 'markdown-it-footnote' {
  const plugin: (markdownIt: unknown) => void;
  export = plugin;
}

declare module 'markdown-it-emoji' {
  export const full: (markdownIt: unknown, options?: unknown) => void;
  export const light: (markdownIt: unknown, options?: unknown) => void;
  export const bare: (markdownIt: unknown, options?: unknown) => void;
}

declare module 'markdown-it-abbr' {
  const plugin: (markdownIt: unknown) => void;
  export = plugin;
}

declare module 'markdown-it-deflist' {
  const plugin: (markdownIt: unknown) => void;
  export = plugin;
}

declare module 'markdown-it-sub' {
  const plugin: (markdownIt: unknown) => void;
  export = plugin;
}

declare module 'markdown-it-sup' {
  const plugin: (markdownIt: unknown) => void;
  export = plugin;
}

declare module 'markdown-it-mark' {
  const plugin: (markdownIt: unknown) => void;
  export = plugin;
}

declare module 'markdown-it-multimd-table' {
  const plugin: (markdownIt: unknown, options?: unknown) => void;
  export = plugin;
}

declare module 'markdown-it-table-of-contents' {
  const plugin: (markdownIt: unknown, options?: unknown) => void;
  export = plugin;
}

declare module 'markdown-it-anchor' {
  interface IPermalinkOptions {
    symbol?: string;
    placement?: 'before' | 'after';
    class?: string;
    ariaHidden?: boolean;
    space?: boolean | string;
  }

  type PermalinkRenderer = (
    slug: string,
    options: unknown,
    state: unknown,
    index: number
  ) => void;

  interface IAnchorPlugin {
    (markdownIt: unknown, options?: unknown): void;
    permalink: {
      linkInsideHeader(options: IPermalinkOptions): PermalinkRenderer;
      headerLink(options?: IPermalinkOptions): PermalinkRenderer;
      ariaHidden(options?: IPermalinkOptions): PermalinkRenderer;
    };
  }

  const plugin: IAnchorPlugin;
  export = plugin;
}
