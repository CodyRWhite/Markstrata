/**
 * .SYNOPSIS
 * Stands in for @microsoft/sp-webpart-base: the class the web part extends,
 * and the page that starts it, draws it and puts it away.
 *
 * .DESCRIPTION
 * This is the part of the harness that earns its keep. Everything the web part
 * does before it draws anything - building its collaborators in an order that
 * works, surviving being disposed, detaching what it attached - happens inside
 * methods SharePoint calls, and until this file existed nothing outside a
 * tenant ever called them. 0.0.17.0 went out unable to start at all.
 *
 * So the sequence here is SharePoint's sequence, including the unhappy one:
 * onInit is awaited, and a web part that fails to start is disposed anyway,
 * half-built, exactly as the page does it. What the page cannot do is tell you
 * both what went wrong; startUp reports the failure to start and the failure
 * to stop separately, because in the tenant the second replaced the first and
 * that is why the bug was hard to read.
 *
 * What is deliberately not modelled: SharePoint's own chrome, its loader, and
 * the reactive property-pane plumbing beyond setting the property, telling the
 * web part, and drawing again. Anything this file claims is behaviour the web
 * part can rely on in a tenant, so it stays small enough to be honest.
 *
 * .USAGE
 *   // The harness build maps '@microsoft/sp-webpart-base' onto this file.
 *   import { BaseClientSideWebPart } from '@microsoft/sp-webpart-base';
 *
 *   const part = new MarkstrataWebPart();
 *   const outcome = await part.hostStart({ context, properties, host, displayMode });
 *   part.hostChangeProperty('themeFamily', 'obsidian');
 *   part.hostStop();
 *
 * .NOTES
 * Since:     unreleased
 * Ships in:  nothing - it stands in for SharePoint at harness time
 * Requires:  coreLibrary.ts
 */

import { DisplayMode } from './coreLibrary';

export interface IWebPartContext {
  /** Tells two web parts on one page apart. */
  instanceId: string;
  pageContext: { web: { serverRelativeUrl: string } };
  propertyPane: { refresh: () => void };
  serviceScope: { consume: <TService>(key: string) => TService };
}

/** The name the SharePoint service is written against. */
export type WebPartContext = IWebPartContext;

export interface IWebPartPropertiesMetadata {
  [property: string]: { isSearchablePlainText?: boolean; isLink?: boolean };
}

export interface IStartUp<TProperties> {
  context: IWebPartContext;
  properties: TProperties;
  domElement: HTMLElement;
  displayMode: DisplayMode;
}

/**
 * What came of starting the web part. Both errors are kept: a web part that
 * fails to start is disposed half-built, and if the disposal throws as well it
 * is the second error the page shows and the first one that matters.
 */
export interface IStartUpOutcome {
  started: boolean;
  startUpError?: Error;
  disposalError?: Error;
}

export abstract class BaseClientSideWebPart<TProperties> {
  protected context: IWebPartContext;
  protected properties: TProperties;
  protected domElement: HTMLElement;
  protected displayMode: DisplayMode;

  public abstract render(): void;

  protected async onInit(): Promise<void> {
    return Promise.resolve();
  }

  protected onDispose(): void {
    /* SharePoint's own is empty too; everything worth stopping is the web
       part's. */
  }

  protected getPropertyPaneConfiguration(): { pages: unknown[] } {
    return { pages: [] };
  }

  protected onPropertyPaneFieldChanged(
    propertyPath: string, oldValue: unknown, newValue: unknown
  ): void {
    /* SharePoint has already written the value by the time this runs, which is
       why the web part's override reads this.properties rather than newValue.
       Named so the arguments are what they are, and used so the compiler does
       not call them idle. */
    void propertyPath; void oldValue; void newValue;
  }

  // ------------------------------------------------- what the page does

  /*
   * Everything below is named for the host, and the prefix is not decoration.
   * These methods exist only here, so a web part that happens to define a
   * method of the same name silently overrides one - which is not a compile
   * error in a build that does not typecheck the harness, and shows up as the
   * page calling the web part's method with the host's arguments. It happened
   * once, within an hour of this file existing. A test now compares the two
   * lists of names so it cannot happen quietly again.
   */

  /**
   * Hands the web part its surroundings, starts it, and draws it - in that
   * order, because the order is the thing being tested.
   */
  public async hostStart(start: IStartUp<TProperties>): Promise<IStartUpOutcome> {
    this.context = start.context;
    this.properties = start.properties;
    this.domElement = start.domElement;
    this.displayMode = start.displayMode;

    let startUpError: Error | undefined;
    try {
      await this.onInit();
    } catch (error) {
      startUpError = error as Error;
    }

    if (startUpError) {
      /* A web part that failed to start is still disposed. This is the path
         that hid the real error in 0.0.17.0, so it is the path the harness
         drives most carefully. */
      const disposalError: Error | undefined = this.hostStop();
      return { started: false, startUpError: startUpError, disposalError: disposalError };
    }

    try {
      this.render();
    } catch (error) {
      return { started: false, startUpError: error as Error };
    }
    return { started: true };
  }

  /**
   * Puts the web part away. Hands back anything the web part threw on the way
   * out rather than throwing it on, so a harness can report a disposal that
   * failed without the page it is running in falling over - which is what a
   * throwing disposal does to a real SharePoint page.
   */
  public hostStop(): Error | undefined {
    try {
      this.onDispose();
      return undefined;
    } catch (error) {
      return error as Error;
    }
  }

  /**
   * A setting changed in the pane. SharePoint writes the value, tells the web
   * part, and draws it again; so does this.
   */
  public hostChangeProperty(propertyPath: string, newValue: unknown): void {
    const properties: Record<string, unknown> = this.properties as Record<string, unknown>;
    const oldValue: unknown = properties[propertyPath];
    properties[propertyPath] = newValue;
    this.onPropertyPaneFieldChanged(propertyPath, oldValue, newValue);
    this.render();
  }

  /** The pane as the web part describes it, for the harness to draw. */
  public hostPane(): { pages: unknown[] } {
    return this.getPropertyPaneConfiguration();
  }

  /** The settings as they stand, for the harness to read back. */
  public hostSettings(): TProperties {
    return this.properties;
  }

  /** Read mode or edit mode, changed the way opening the page for editing
      changes it. */
  public hostSetDisplayMode(mode: DisplayMode): void {
    this.displayMode = mode;
    this.render();
  }
}
