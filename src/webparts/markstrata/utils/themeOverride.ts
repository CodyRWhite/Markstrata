/**
 * .SYNOPSIS
 * The theme a reader chose for themselves, remembered in their own browser.
 *
 * .DESCRIPTION
 * An author picks the theme the page ships with; a reader may prefer another,
 * and that preference is theirs alone. It is kept in local storage rather than
 * in the web part's properties for exactly that reason: properties are the
 * page's configuration and are saved for everybody, so a reader's choice
 * written there would be a reader editing the page.
 *
 * Keyed by the web part's instance id, so two of them on one page are set
 * separately, and every access is guarded: storage is blocked in a private
 * window and on some managed browsers, where the honest outcome is that the
 * choice works for the session and does not stick.
 *
 * An author changing the theme clears it. Their change should win over a
 * reader's earlier one, or a reader who switched once would never see the
 * page's own theme change again.
 *
 * .USAGE
 *   import { ThemeOverride } from './utils/themeOverride';
 *
 *   const override: ThemeOverride = new ThemeOverride(this.context.instanceId);
 *   override.read();                       // once, on init
 *   override.set('obsidian', 'dark');      // the reader chose
 *   override.clear();                      // the author changed the theme
 *
 *   const family = override.current ? override.current.themeFamily : properties.themeFamily;
 *
 * .NOTES
 * Since:     0.0.17.0
 * Ships in:  the web part bundle
 * Requires:  ThemeManager.ts (for the theme and mode types)
 */

import { ThemeFamily } from './ThemeManager';

export interface IThemeOverride {
  themeFamily: ThemeFamily;
  colorMode: 'light' | 'dark';
}

export class ThemeOverride {
  private readonly key: string;
  private chosen: IThemeOverride | undefined;

  public constructor(instanceId: string) {
    this.key = `strata-theme-${instanceId}`;
  }

  /** What the reader chose, or undefined to use the author's theme. */
  public get current(): IThemeOverride | undefined {
    return this.chosen;
  }

  public read(): void {
    try {
      const stored: string | null = window.localStorage.getItem(this.key);
      this.chosen = stored ? (JSON.parse(stored) as IThemeOverride) : undefined;
    } catch {
      // Storage can be blocked; the author's theme is then simply used as-is.
      this.chosen = undefined;
    }
  }

  public set(family: ThemeFamily, mode: 'light' | 'dark'): void {
    this.chosen = { themeFamily: family, colorMode: mode };
    try {
      window.localStorage.setItem(this.key, JSON.stringify(this.chosen));
    } catch {
      // Private browsing or blocked storage: the choice just will not stick.
    }
  }

  public clear(): void {
    this.chosen = undefined;
    try {
      window.localStorage.removeItem(this.key);
    } catch {
      // Nothing stored, or storage is blocked; either way there is no override.
    }
  }
}
