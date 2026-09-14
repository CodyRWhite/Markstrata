/**
 * Theme selection.
 *
 * The stylesheets do the work; this class only decides which data-* attributes
 * the root element carries, resolves "follow SharePoint" into a real light or
 * dark value, and hands Mermaid a matching set of colours (Mermaid draws to
 * SVG, so it cannot read the CSS variables itself).
 */

export type ThemeFamily = 'github' | 'obsidian' | 'vscode';
export type ColorMode = 'light' | 'dark' | 'auto';
export type ResolvedMode = 'light' | 'dark';

export interface IThemeSettings {
  themeFamily: ThemeFamily;
  colorMode: ColorMode;
  contentWidth: string;
  density: string;
  textSize: string;
  codeSize: string;
  /** 'auto', or a CSS length for the contents sidebar: '240px', '15em', '22%'. */
  tocWidth?: string;
  /** True to keep the file name and modified date in view while scrolling. */
  pinMeta?: boolean;
  /**
   * True to give the web part at least the height of the room below it, so a
   * short document does not leave the page canvas showing under it.
   */
  fillHeight?: boolean;
}

export interface IThemeChoice {
  key: string;
  text: string;
}

export const THEME_FAMILIES: IThemeChoice[] = [
  { key: 'github', text: 'GitHub' },
  { key: 'obsidian', text: 'Obsidian' },
  { key: 'vscode', text: 'VS Code' }
];

export const COLOR_MODES: IThemeChoice[] = [
  { key: 'light', text: 'Light' },
  { key: 'dark', text: 'Dark' },
  { key: 'auto', text: 'Match SharePoint page' }
];

export const CONTENT_WIDTHS: IThemeChoice[] = [
  { key: 'narrow', text: 'Narrow (680px)' },
  { key: 'comfortable', text: 'Comfortable (860px)' },
  { key: 'wide', text: 'Wide (1100px)' },
  { key: 'full', text: 'Full width' }
];

export const DENSITIES: IThemeChoice[] = [
  { key: 'compact', text: 'Compact' },
  { key: 'normal', text: 'Normal' },
  { key: 'relaxed', text: 'Relaxed' }
];

export const TEXT_SIZES: IThemeChoice[] = [
  { key: 'small', text: 'Small' },
  { key: 'normal', text: 'Normal' },
  { key: 'large', text: 'Large' },
  { key: 'xlarge', text: 'Extra large' }
];

export const CODE_SIZES: IThemeChoice[] = [
  { key: 'small', text: 'Small' },
  { key: 'normal', text: 'Normal' },
  { key: 'large', text: 'Large' }
];

export const DEFAULT_THEME_SETTINGS: IThemeSettings = {
  themeFamily: 'github',
  colorMode: 'light',
  contentWidth: 'comfortable',
  density: 'normal',
  textSize: 'normal',
  codeSize: 'normal'
};

/** The config object handed to mermaid.initialize for a theme. */
export interface IMermaidThemeConfig {
  theme: string;
  themeVariables: { [name: string]: string | boolean };
}

interface IMermaidPalette {
  background: string;
  surface: string;
  border: string;
  text: string;
  accent: string;
  accentText: string;
  line: string;
  note: string;
}

const MERMAID_PALETTES: { [key: string]: IMermaidPalette } = {
  'github-light': {
    background: '#ffffff',
    surface: '#ddf4ff',
    border: '#54aeff',
    text: '#1f2328',
    accent: '#0969da',
    accentText: '#ffffff',
    line: '#59636e',
    note: '#fff8c5'
  },
  'github-dark': {
    background: '#0d1117',
    surface: '#121d2f',
    border: '#4493f8',
    text: '#e6edf3',
    accent: '#1f6feb',
    accentText: '#ffffff',
    line: '#9198a1',
    note: '#272115'
  },
  'obsidian-light': {
    background: '#ffffff',
    surface: '#efeaff',
    border: '#7852ee',
    text: '#222222',
    accent: '#7852ee',
    accentText: '#ffffff',
    line: '#5a5a5a',
    note: '#fff6dc'
  },
  'obsidian-dark': {
    background: '#1e1e1e',
    surface: '#2a2440',
    border: '#a882ff',
    text: '#dadada',
    accent: '#8b6cef',
    accentText: '#ffffff',
    line: '#b3b3b3',
    note: '#33301f'
  },
  'vscode-light': {
    background: '#ffffff',
    surface: '#e7f1fb',
    border: '#005fb8',
    text: '#3b3b3b',
    accent: '#005fb8',
    accentText: '#ffffff',
    line: '#616161',
    note: '#fff8e1'
  },
  'vscode-dark': {
    background: '#1f1f1f',
    surface: '#1e2b3c',
    border: '#4daafc',
    text: '#cccccc',
    accent: '#0e639c',
    accentText: '#ffffff',
    line: '#9d9d9d',
    note: '#332d1e'
  }
};

const FONT_STACKS: { [family: string]: string } = {
  github: '-apple-system, BlinkMacSystemFont, "Segoe UI", Helvetica, Arial, sans-serif',
  obsidian: 'Inter, -apple-system, "Segoe UI", Roboto, sans-serif',
  vscode: '"Segoe WPC", "Segoe UI", system-ui, sans-serif'
};

export class ThemeManager {
  /**
   * Turns the configured mode into a concrete one. `auto` follows the
   * SharePoint page theme when the host tells us it is inverted, and falls
   * back to the reader's OS preference when it does not.
   */
  public static resolveMode(mode: ColorMode, isInvertedTheme?: boolean): ResolvedMode {
    if (mode === 'light' || mode === 'dark') {
      return mode;
    }
    if (typeof isInvertedTheme === 'boolean') {
      return isInvertedTheme ? 'dark' : 'light';
    }
    if (typeof window !== 'undefined' && window.matchMedia) {
      return window.matchMedia('(prefers-color-scheme: dark)').matches ? 'dark' : 'light';
    }
    return 'light';
  }

  /**
   * Clears `host` and returns the element everything should be rendered into.
   *
   * The root is a child of the web part's element rather than the element
   * itself. SharePoint owns that element: with supportsThemeVariants on, it
   * styles the web part's container to match the section, and in display mode
   * that beat our own background while edit mode left it alone - a page of
   * dark-theme text on a white background. Rendering one level in means
   * nothing SharePoint does to its container can fight the theme.
   */
  public static mount(host: HTMLElement, settings: IThemeSettings, resolved: ResolvedMode): HTMLElement {
    host.innerHTML = '';
    const root: HTMLElement = document.createElement('div');
    host.appendChild(root);
    ThemeManager.apply(root, settings, resolved);
    return root;
  }

  /** Stamps the root element with the attributes the stylesheets key off. */
  public static apply(element: HTMLElement, settings: IThemeSettings, resolved: ResolvedMode): void {
    element.classList.add('strata-root');
    element.setAttribute('data-strata-theme', settings.themeFamily);
    element.setAttribute('data-strata-mode', resolved);
    element.setAttribute('data-strata-width', settings.contentWidth);
    element.setAttribute('data-strata-density', settings.density);
    element.setAttribute('data-strata-size', settings.textSize);
    element.setAttribute('data-strata-code-size', settings.codeSize);
    /*
     * The contents sidebar sizes itself from this. 'auto' is a mode rather than
     * a length, so it goes on the attribute and the stylesheet handles it;
     * anything else is a length the stylesheet can use directly.
     */
    const tocWidth: string = settings.tocWidth || 'auto';
    element.setAttribute('data-strata-toc-width', tocWidth === 'auto' ? 'auto' : 'fixed');
    if (tocWidth === 'auto') {
      element.style.removeProperty('--strata-toc-width');
    } else {
      element.style.setProperty('--strata-toc-width', tocWidth);
    }
    element.setAttribute('data-strata-meta', settings.pinMeta ? 'pinned' : 'flow');
    /*
     * Only the layout half of "fill the available height" lives in CSS. The
     * height itself cannot: it is the room below wherever the web part starts,
     * which the stylesheet has no way to measure, so ContentEnhancer sets it.
     * Clearing it here means turning the setting off in the property pane
     * takes effect on the next render rather than leaving the last measured
     * height stuck on the element.
     */
    element.setAttribute('data-strata-fill', settings.fillHeight ? 'window' : 'content');
    if (!settings.fillHeight) {
      element.style.removeProperty('min-height');
    }
    // Lets the browser pick matching form controls and scrollbars.
    element.style.colorScheme = resolved;
  }

  public static getMermaidTheme(family: ThemeFamily, mode: ResolvedMode): IMermaidThemeConfig {
    const palette: IMermaidPalette = MERMAID_PALETTES[`${family}-${mode}`] || MERMAID_PALETTES['github-light'];

    return {
      theme: 'base',
      themeVariables: {
        darkMode: mode === 'dark',
        background: palette.background,
        mainBkg: palette.surface,
        primaryColor: palette.surface,
        primaryTextColor: palette.text,
        primaryBorderColor: palette.border,
        secondaryColor: palette.background,
        secondaryTextColor: palette.text,
        secondaryBorderColor: palette.line,
        tertiaryColor: palette.background,
        tertiaryTextColor: palette.text,
        tertiaryBorderColor: palette.line,
        lineColor: palette.line,
        textColor: palette.text,
        nodeBorder: palette.border,
        nodeTextColor: palette.text,
        clusterBkg: palette.background,
        clusterBorder: palette.line,
        edgeLabelBackground: palette.background,
        titleColor: palette.text,
        noteBkgColor: palette.note,
        noteTextColor: palette.text,
        noteBorderColor: palette.line,
        actorBkg: palette.surface,
        actorBorder: palette.border,
        actorTextColor: palette.text,
        signalColor: palette.line,
        signalTextColor: palette.text,
        labelBoxBkgColor: palette.surface,
        labelBoxBorderColor: palette.border,
        labelTextColor: palette.text,
        loopTextColor: palette.text,
        activationBkgColor: palette.surface,
        activationBorderColor: palette.border,
        sectionBkgColor: palette.surface,
        altSectionBkgColor: palette.background,
        taskBkgColor: palette.accent,
        taskTextColor: palette.accentText,
        taskTextOutsideColor: palette.text,
        taskTextDarkColor: palette.text,
        gridColor: palette.line,
        doneTaskBkgColor: palette.line,
        critBkgColor: palette.border,
        pieTitleTextColor: palette.text,
        fontFamily: FONT_STACKS[family] || FONT_STACKS.github,
        fontSize: '14px'
      }
    };
  }
}
