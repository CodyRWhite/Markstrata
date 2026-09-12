/**
 * Declarations for the markdown-it plugins that ship without types.
 *
 * Listing them here keeps `require()` calls out of the source and gives each
 * plugin a real (if small) type, so a wrong option name or a renamed export is
 * a compile error rather than a feature that quietly stops working.
 */

declare module 'markdown-it-attrs' {
  const plugin: (md: unknown, options?: unknown) => void;
  export = plugin;
}

declare module 'markdown-it-footnote' {
  const plugin: (md: unknown) => void;
  export = plugin;
}

declare module 'markdown-it-emoji' {
  export const full: (md: unknown, options?: unknown) => void;
  export const light: (md: unknown, options?: unknown) => void;
  export const bare: (md: unknown, options?: unknown) => void;
}

declare module 'markdown-it-abbr' {
  const plugin: (md: unknown) => void;
  export = plugin;
}

declare module 'markdown-it-deflist' {
  const plugin: (md: unknown) => void;
  export = plugin;
}

declare module 'markdown-it-sub' {
  const plugin: (md: unknown) => void;
  export = plugin;
}

declare module 'markdown-it-sup' {
  const plugin: (md: unknown) => void;
  export = plugin;
}

declare module 'markdown-it-multimd-table' {
  const plugin: (md: unknown, options?: unknown) => void;
  export = plugin;
}

declare module 'markdown-it-table-of-contents' {
  const plugin: (md: unknown, options?: unknown) => void;
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
    (md: unknown, options?: unknown): void;
    permalink: {
      linkInsideHeader(options: IPermalinkOptions): PermalinkRenderer;
      headerLink(options?: IPermalinkOptions): PermalinkRenderer;
      ariaHidden(options?: IPermalinkOptions): PermalinkRenderer;
    };
  }

  const plugin: IAnchorPlugin;
  export = plugin;
}
