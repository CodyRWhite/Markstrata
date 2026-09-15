/**
 * .SYNOPSIS
 * Stands in for @microsoft/sp-component-base: the page's theme, and being told
 * when it changes.
 *
 * .DESCRIPTION
 * SharePoint hands a web part the site's theme through a service it looks up
 * in a scope, and raises an event when a reader switches the whole site
 * between light and dark. The web part follows that event when its colour mode
 * is set to Auto, and detaches from it when the page puts it away - and
 * detaching correctly is the kind of thing that is only ever wrong in
 * production, so the event here behaves like the real one: remove() has to be
 * handed the same scope and the same handler that add() was given, or the
 * listener stays.
 *
 * The theme itself is the one thing SharePoint has and a plain page does not.
 * It is settable here so the harness can raise a change and watch the web part
 * answer, which is the whole point of having it.
 *
 * .USAGE
 *   // The harness build maps '@microsoft/sp-component-base' onto this file.
 *   import { ThemeProvider, IReadonlyTheme } from '@microsoft/sp-component-base';
 *
 *   const provider = scope.consume(ThemeProvider.serviceKey);
 *   provider.setTheme({ isInverted: true });   // harness only
 *
 * .NOTES
 * Since:     unreleased
 * Ships in:  nothing - it stands in for SharePoint at harness time
 * Requires:  nothing else in this project
 */

export interface IReadonlyTheme {
  isInverted: boolean;
}

interface IListener {
  scope: object;
  handler: (args: { theme?: IReadonlyTheme }) => void;
}

class ThemeChangedEvent {
  private readonly listeners: IListener[] = [];

  public add(scope: object, handler: (args: { theme?: IReadonlyTheme }) => void): void {
    this.listeners.push({ scope: scope, handler: handler });
  }

  /** Both have to match, the same way SharePoint matches them. */
  public remove(scope: object, handler: (args: { theme?: IReadonlyTheme }) => void): void {
    const at: number = this.listeners.findIndex(
      (listener: IListener) => listener.scope === scope && listener.handler === handler
    );
    if (at !== -1) { this.listeners.splice(at, 1); }
  }

  public raise(theme: IReadonlyTheme | undefined): void {
    this.listeners.slice().forEach((listener: IListener) => {
      listener.handler.call(listener.scope, { theme: theme });
    });
  }

  /** How many listeners are still attached: what the harness checks after a
      web part has been disposed. */
  public get count(): number {
    return this.listeners.length;
  }
}

export class ThemeProvider {
  /** SharePoint looks the service up by this; here it is just a name. */
  public static readonly serviceKey: string = 'ThemeProvider';

  public readonly themeChangedEvent: ThemeChangedEvent = new ThemeChangedEvent();
  private theme: IReadonlyTheme | undefined = { isInverted: false };

  public tryGetTheme(): IReadonlyTheme | undefined {
    return this.theme;
  }

  /** Harness only: the site switched between light and dark. */
  public setTheme(theme: IReadonlyTheme | undefined): void {
    this.theme = theme;
    this.themeChangedEvent.raise(theme);
  }
}
