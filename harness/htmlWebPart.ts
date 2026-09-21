/**
 * .SYNOPSIS
 * Runs the real HTML web part - not its renderers, the web part itself - in a
 * plain browser page.
 *
 * .DESCRIPTION
 * webPart.ts does this for the markdown web part, and the two share a base
 * class, so what is worth driving here is not the lifecycle again: it is the
 * part that is different, and that part is the only part of either web part
 * that cannot be checked without a browser.
 *
 * WHAT ONLY A BROWSER CAN ANSWER
 * Whether a shadow root really keeps an author's stylesheet off the page, and
 * really keeps the page's off the document. Whether a sandboxed frame really
 * refuses the things its sandbox attribute says it refuses. Whether the CSS
 * narrowing holds up against Chromium's own parser rather than against a test
 * that reads strings. Whether a script in a document runs when it is meant to
 * and stays put when it is not. None of those is a question a unit test can be
 * asked: they are the browser's answers, not ours.
 *
 * So the page is deliberately plain around the web part, and carries one thing
 * that is not the web part at all: a paragraph and a link outside it, with
 * styling of its own, so a driver can check that an author's `body { ... }`
 * did not reach them.
 *
 * .USAGE
 *   npm run harness              builds harness/dist/htmlwebpart.html
 *   npm run harness:drive        builds it and drives it
 *
 *   Open harness/dist/htmlwebpart.html and use the buttons; or, from a driver:
 *
 *   await htmlHarness.start({ renderMode: 'shadow' });
 *   htmlHarness.change('renderMode', 'frame');
 *   htmlHarness.editing(true);
 *
 * .NOTES
 * Since:     0.0.22.0
 * Ships in:  nothing - it builds or drives what ships
 * Requires:  MarkstrataHtmlWebPart.ts, spfx/*, webPartPane.ts
 */

import MarkstrataHtmlWebPart from '../src/webparts/markstratahtml/MarkstrataHtmlWebPart';
import { IMarkstrataHtmlWebPartProps } from '../src/webparts/markstratahtml/htmlWebPartProps';
import { DisplayMode } from './spfx/coreLibrary';
import { ThemeProvider } from './spfx/componentBase';
import { SharePointService } from './spfx/sharePoint';
import { IStartUpOutcome, IWebPartContext } from './spfx/webPartBase';
import { WebPartPane } from './webPartPane';

const LIBRARY: string = '/sites/demo/Documents';

const themeProvider: ThemeProvider = new ThemeProvider();

const host: HTMLElement = document.getElementById('host') as HTMLElement;
const statusStrip: HTMLElement = document.getElementById('wp-status') as HTMLElement;
const paneHost: HTMLElement = document.getElementById('demo-panel') as HTMLElement;

let webPart: MarkstrataHtmlWebPart | undefined;
let outcome: IStartUpOutcome | undefined;
let pane: WebPartPane | undefined;

/**
 * A web part pointed at the whole HTML document in the stand-in library.
 *
 * Configured rather than empty, which is the opposite of the markdown page's
 * choice and for the opposite reason: there the interesting state is a web
 * part nobody has set up, and here it is a document actually being drawn,
 * because everything worth asking a browser about needs one on screen.
 */
function startingProperties(
  configured?: Partial<IMarkstrataHtmlWebPartProps>
): IMarkstrataHtmlWebPartProps {
  return {
    contentSource: 'library',
    selectedLibrary: LIBRARY,
    selectedFolder: '',
    selectedFile: `${LIBRARY}/notes.html`,
    ...(configured || {})
  } as IMarkstrataHtmlWebPartProps;
}

function context(): IWebPartContext {
  return {
    instanceId: 'harness-html-web-part',
    pageContext: { web: { serverRelativeUrl: '/sites/demo' } },
    propertyPane: { refresh: () => { if (pane) { pane.refresh(); } } },
    serviceScope: {
      consume: <TService>(): TService => themeProvider as unknown as TService
    }
  };
}

// ------------------------------------------------------------------- status

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

// ------------------------------------------------------ starting and stopping

async function start(
  configured?: Partial<IMarkstrataHtmlWebPartProps>, editing?: boolean
): Promise<IStartUpOutcome> {
  dispose();
  webPart = new MarkstrataHtmlWebPart();
  outcome = undefined;
  showStatus();

  outcome = await webPart.hostStart({
    context: context(),
    properties: startingProperties(configured),
    domElement: host,
    displayMode: editing ? DisplayMode.Edit : DisplayMode.Read
  });

  showStatus();
  if (pane && pane.isOpen) { pane.refresh(); }
  return outcome;
}

function dispose(): Error | undefined {
  if (!webPart) { return undefined; }
  const failure: Error | undefined = webPart.hostStop();
  webPart = undefined;
  host.textContent = '';
  showStatus();
  return failure;
}

// --------------------------------------------------------------------- page

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
      if (pane) { pane.hide(); }
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

/** What a driver talks to. */
const harness = {
  start: start,
  dispose: dispose,
  outcome: (): IStartUpOutcome | undefined => outcome,
  running: (): boolean => webPart !== undefined,
  settings: (): Record<string, unknown> =>
    (webPart ? webPart.hostSettings() : {}) as unknown as Record<string, unknown>,
  change: (path: string, value: unknown): void => {
    if (webPart) { webPart.hostChangeProperty(path, value); }
  },
  openPane: (): void => { if (pane) { pane.show(); } },
  /* The pane shows one page at a time, so a control that is not on the first
     one has to be turned to. Zero based, in the order the pane declares. */
  panePage: (index: number): void => { if (pane) { pane.goToPage(index); } },
  closePane: (): void => { if (pane) { pane.hide(); } },
  /** The choices a dropdown is offering, which is where an empty pane shows. */
  paneOptions: (propertyPath: string): string[] => {
    const select: HTMLSelectElement | null =
      paneHost.querySelector(`select[data-property="${propertyPath}"]`);
    return select
      ? Array.from(select.options).map((option: HTMLOptionElement) => option.text)
      : [];
  },
  editing: (isEditing: boolean): void => {
    if (webPart) {
      webPart.hostSetDisplayMode(isEditing ? DisplayMode.Edit : DisplayMode.Read);
    }
  },
  /** Put a document in the page's address, the way a SharePoint menu entry does. */
  addressDocument: (value: string | undefined): void => {
    const url: URL = new URL(window.location.href);
    if (value) {
      url.searchParams.set('strataDoc', value);
    } else {
      url.searchParams.delete('strataDoc');
    }
    window.history.replaceState(window.history.state, '', url.toString());
  },
  library: (): string[] => SharePointService.paths(),
  refuse: (refusing: boolean): void => SharePointService.refuse(refusing)
};

(window as unknown as { htmlHarness: typeof harness }).htmlHarness = harness;

wireButtons();
void start();
