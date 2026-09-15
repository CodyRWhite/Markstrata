/**
 * .SYNOPSIS
 * Runs the real web part - not its renderers, the web part itself - in a plain
 * browser page.
 *
 * .DESCRIPTION
 * harness.ts drives the classes below the web part, which is most of the code
 * and none of the lifecycle. Everything the web part does before a single
 * character is drawn - building its collaborators, in an order that has to
 * work, and taking them apart again - only ever ran inside SharePoint, and in
 * 0.0.17.0 it did not work: the web part could not start at all, and what the
 * page showed was the second error, thrown while disposing the wreckage of the
 * first.
 *
 * This page starts it the way SharePoint starts it. The web part is the real
 * one, compiled from src; the SharePoint around it is spfx/, which is small
 * enough to read in one sitting; and the library it talks to is three
 * documents held in memory. What the harness adds on top is the ability to run
 * the unhappy paths on purpose - a library that is slow to answer, a library
 * that refuses, a web part put away while it is still starting - because those
 * are the paths a tenant finds first.
 *
 * .USAGE
 *   npm run harness              builds harness/dist/webpart.html beside index.html
 *   npm run harness:drive        builds it and drives it
 *
 *   Open harness/dist/webpart.html and use the buttons; or, from a driver:
 *
 *   await webPartHarness.start();
 *   webPartHarness.outcome();              // { started: true }
 *   webPartHarness.change('themeFamily', 'obsidian');
 *   webPartHarness.disposeBeforeStarting();
 *
 * .NOTES
 * Since:     unreleased
 * Ships in:  nothing - it builds or drives what ships
 * Requires:  MarkstrataWebPart.ts, spfx/*, webPartPane.ts
 */

import MarkstrataWebPart from '../src/webparts/markstrata/MarkstrataWebPart';
import { IMarkstrataWebPartProps } from '../src/webparts/markstrata/webPartProps';
import { DisplayMode } from './spfx/coreLibrary';
import { ThemeProvider } from './spfx/componentBase';
import { SharePointService } from './spfx/sharePoint';
import { IStartUpOutcome, IWebPartContext } from './spfx/webPartBase';
import { WebPartPane } from './webPartPane';

const LIBRARY: string = '/sites/demo/Documents';

/** One provider for the page, so a driver can raise a theme change on it. */
const themeProvider: ThemeProvider = new ThemeProvider();

const host: HTMLElement = document.getElementById('host') as HTMLElement;
const statusStrip: HTMLElement = document.getElementById('wp-status') as HTMLElement;
const paneHost: HTMLElement = document.getElementById('demo-panel') as HTMLElement;

let webPart: MarkstrataWebPart | undefined;
let outcome: IStartUpOutcome | undefined;
let pane: WebPartPane | undefined;

/**
 * What an author had configured before the page was loaded. Left almost empty
 * on purpose: an unconfigured web part filling in its own defaults is the
 * state a newly added one is in, and the state its defaults are for.
 */
function startingProperties(configured?: Partial<IMarkstrataWebPartProps>): IMarkstrataWebPartProps {
  return { ...(configured || {}) } as IMarkstrataWebPartProps;
}

function context(): IWebPartContext {
  return {
    instanceId: 'harness-web-part',
    pageContext: { web: { serverRelativeUrl: '/sites/demo' } },
    propertyPane: { refresh: () => { if (pane) { pane.refresh(); } } },
    serviceScope: {
      consume: <TService>(): TService => themeProvider as unknown as TService
    }
  };
}

// ------------------------------------------------------------------ status

/*
 * Both errors are shown, and separately. The whole lesson of the release this
 * page exists because of is that a failure to stop stood in front of a failure
 * to start and nobody could see past it.
 */
function showStatus(): void {
  if (!webPart) {
    statusStrip.dataset.state = 'away';
    statusStrip.textContent = 'The web part has been put away.';
    return;
  }
  if (!outcome) {
    statusStrip.dataset.state = 'starting';
    statusStrip.textContent = 'Starting…';
    return;
  }
  if (outcome.started) {
    statusStrip.dataset.state = 'started';
    statusStrip.textContent = 'The web part started and drew itself.';
    return;
  }

  statusStrip.dataset.state = 'failed';
  statusStrip.textContent = '';

  const failed: HTMLElement = document.createElement('div');
  failed.id = 'wp-start-error';
  failed.textContent = `It could not start: ${message(outcome.startUpError)}`;
  statusStrip.appendChild(failed);

  if (outcome.disposalError) {
    const second: HTMLElement = document.createElement('div');
    second.id = 'wp-dispose-error';
    second.textContent = `…and could not be put away either: ${message(outcome.disposalError)}`;
    statusStrip.appendChild(second);
  }
}

function message(error: Error | undefined): string {
  return error ? (error.message || String(error)) : 'no error was reported';
}

// ------------------------------------------------------- starting and stopping

async function start(configured?: Partial<IMarkstrataWebPartProps>): Promise<IStartUpOutcome> {
  dispose();
  webPart = new MarkstrataWebPart();
  outcome = undefined;
  showStatus();

  outcome = await webPart.hostStart({
    context: context(),
    properties: startingProperties(configured),
    domElement: host,
    displayMode: DisplayMode.Read
  });

  showStatus();
  if (pane && pane.isOpen) { pane.refresh(); }
  return outcome;
}

/** Puts the web part away the way closing the page does. */
function dispose(): Error | undefined {
  if (!webPart) { return undefined; }
  const failure: Error | undefined = webPart.hostStop();
  webPart = undefined;
  host.textContent = '';
  showStatus();
  return failure;
}

/**
 * A web part disposed while it is still starting. The library is told to be
 * slow, the web part is started but not waited for, and it is put away in the
 * middle - which is what a reader closing a slow page does.
 */
async function disposeWhileStarting(delayMs: number): Promise<Error | undefined> {
  SharePointService.answerAfter(delayMs);
  const starting: Promise<IStartUpOutcome> = start({
    contentSource: 'library',
    selectedLibrary: LIBRARY,
    selectedFile: `${LIBRARY}/handbook.md`
  });

  const failure: Error | undefined = webPart ? webPart.hostStop() : undefined;
  await starting;
  SharePointService.answerAfter(0);
  return failure;
}

/**
 * A web part disposed having never started: every collaborator missing. It
 * stands in for an onInit that threw on its first line, which is the state
 * 0.0.17.0 disposed in and could not survive.
 */
function disposeBeforeStarting(): Error | undefined {
  const neverStarted: MarkstrataWebPart = new MarkstrataWebPart();
  return neverStarted.hostStop();
}

// -------------------------------------------------------------------- page

function wireButtons(): void {
  const configure: HTMLElement | null = document.getElementById('demo-configure');
  const edit: HTMLElement | null = document.getElementById('demo-edit');
  const away: HTMLElement | null = document.getElementById('demo-away');

  pane = new WebPartPane(paneHost, {
    read: () => (webPart ? webPart.hostPane() : { pages: [] }),
    value: (path: string) => (webPart
      ? (webPart.hostSettings() as unknown as Record<string, unknown>)[path]
      : undefined),
    change: (path: string, value: unknown) => {
      if (webPart) { webPart.hostChangeProperty(path, value); }
    },
    close: () => {
      pane!.hide();
      if (configure) { configure.setAttribute('aria-expanded', 'false'); }
    }
  });

  if (configure) {
    configure.addEventListener('click', () => {
      if (!pane) { return; }
      const opening: boolean = !pane.isOpen;
      if (opening) { pane.show(); } else { pane.hide(); }
      configure.setAttribute('aria-expanded', opening ? 'true' : 'false');
    });
  }

  if (edit) {
    edit.addEventListener('click', () => {
      if (!webPart) { return; }
      const editing: boolean = edit.getAttribute('aria-pressed') === 'true';
      edit.setAttribute('aria-pressed', editing ? 'false' : 'true');
      webPart.hostSetDisplayMode(editing ? DisplayMode.Read : DisplayMode.Edit);
    });
  }

  if (away) {
    away.addEventListener('click', () => {
      if (webPart) { dispose(); } else { void start(); }
      away.textContent = webPart ? 'Put the web part away' : 'Start it again';
    });
  }
}

/** What a driver talks to. Everything above, and nothing the page needs. */
const harness = {
  start: start,
  dispose: dispose,
  disposeWhileStarting: disposeWhileStarting,
  disposeBeforeStarting: disposeBeforeStarting,
  outcome: (): IStartUpOutcome | undefined => outcome,
  running: (): boolean => webPart !== undefined,
  settings: (): Record<string, unknown> =>
    (webPart ? webPart.hostSettings() : {}) as unknown as Record<string, unknown>,
  change: (path: string, value: unknown): void => {
    if (webPart) { webPart.hostChangeProperty(path, value); }
  },
  openPane: (): void => { if (pane) { pane.show(); } },
  closePane: (): void => { if (pane) { pane.hide(); } },
  /** The choices a dropdown is offering, which is where an empty pane shows. */
  paneOptions: (propertyPath: string): string[] => {
    const select: HTMLSelectElement | null =
      paneHost.querySelector(`select[data-property="${propertyPath}"]`);
    return select
      ? Array.from(select.options).map((option: HTMLOptionElement) => option.text)
      : [];
  },
  /** Something SharePoint provides stops working, part way through starting. */
  breakTheme: (broken: boolean): void => themeProvider.breakTheme(broken),
  /** The site switched between light and dark under the web part. */
  siteTheme: (isInverted: boolean): void => themeProvider.setTheme({ isInverted: isInverted }),
  /** Listeners still attached to the page's theme: nought once disposed. */
  themeListeners: (): number => themeProvider.themeChangedEvent.count,
  library: (): string[] => SharePointService.paths(),
  refuse: (refusing: boolean): void => SharePointService.refuse(refusing),
  answerAfter: (milliseconds: number): void => SharePointService.answerAfter(milliseconds)
};

(window as unknown as { webPartHarness: typeof harness }).webPartHarness = harness;

wireButtons();
void start();
