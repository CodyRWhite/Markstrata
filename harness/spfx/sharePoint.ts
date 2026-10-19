/**
 * .SYNOPSIS
 * A document library that lives in memory, standing in for the SharePoint the
 * web part talks to.
 *
 * .DESCRIPTION
 * This is the one boundary the harness cannot cross: everything the real
 * service does is an HTTP call to a site that does not exist outside a tenant.
 * So the service is replaced, not its network - the web part above it is the
 * real one, and this answers the questions it asks.
 *
 * It is the same public surface as the real service, method for method, and a
 * test compares the two so a method added there cannot quietly go missing
 * here. What it holds is invented: three small documents written for this
 * file. No content from anywhere else belongs in a harness.
 *
 * Two things are settable that SharePoint would never let you set, both there
 * to drive the unhappy paths: how long an answer takes, so a web part can be
 * disposed while it is still starting, and whether the library refuses to
 * answer at all.
 *
 * .USAGE
 *   // The harness build maps the web part's own SharePointService onto this.
 *   const sharePoint = new SharePointService(context);
 *   await sharePoint.getFileContent('/sites/demo/Documents/handbook.md');
 *
 *   SharePointService.answerAfter(250);   // harness only: make it slow
 *   SharePointService.refuse(true);       // harness only: make it fail
 *
 * .NOTES
 * Since:     0.0.18.0
 * Ships in:  nothing - it stands in for SharePoint at harness time
 * Requires:  webPartBase.ts, fixtures.ts
 */

import { WebPartContext } from '@microsoft/sp-webpart-base';

import { REMOTE_CODE } from '../fixtures';

export interface IFileMetadata {
  name: string;
  serverRelativeUrl: string;
  timeLastModified: string;
  author: string;
  length: number;
}

export interface IVersionInfo {
  versionLabel: string;
  created: string;
  createdBy: string;
  url: string;
  isCurrentVersion: boolean;
}

export interface ILibraryInfo {
  title: string;
  serverRelativeUrl: string;
}

declare const SAMPLE: string;

const LIBRARY: string = '/sites/demo/Documents';

const DEPLOY: string = [
  '# Deploying',
  '',
  'A short document that exists so a link has somewhere to go.',
  '',
  '1. Check the change is on the branch.',
  '2. Run the pipeline.',
  '3. Watch it come up.',
  '',
  'If it does not come up, read [rolling back](rollback.md).',
  ''
].join('\n');

/*
 * Carries an anchor into itself, written the way a person writes one: the
 * heading's own words, capitalised, rather than the id the heading was given.
 * Both halves of the anchor fault are in that one link. Left to the browser it
 * is a navigation as far as a SharePoint page's router is concerned, and the
 * name does not match the id unless it is slugged on the way to the lookup.
 *
 * With enough between the link and the heading that landing on it is a
 * measurable thing to have happened: a document shorter than the window
 * cannot scroll, and a check on where the heading sits would be measuring that
 * rather than the scroll.
 */
const ROLLBACK: string = [
  '# Rolling back',
  '',
  'The other end of the link in [deploying](deploy.md).',
  '',
  'Straight to [[#When to roll back]].',
  '',
  ...new Array(60).fill('Filler, so the heading below can reach the top.'),
  '',
  '## When to roll back',
  '',
  'When the thing that came up is worse than the thing that was there.',
  '',
  ...new Array(20).fill('More filler, so the heading can sit at the top.'),
  ''
].join('\n\n');

interface IStoredFile {
  markdown: string;
  modified: string;
}

/* Everything the library holds, by the path SharePoint would serve it at. */
const files: { [path: string]: IStoredFile } = {};

function put(path: string, markdown: string): void {
  files[path] = { markdown: markdown, modified: '2026-01-05T09:00:00Z' };
}

/*
 * An index at the root of the library pointing into a subfolder, which is how
 * a wiki of any size is arranged and is the shape a reader reported a fault
 * in: the link renders, the web part takes the click, and the file downloads
 * anyway. The name carries a space because theirs did and because a space is
 * the difference between a path and an encoded one.
 */
const INDEX: string = [
  '# Wiki index',
  '',
  '## Testing',
  '',
  '- [[Runbooks/Deploy notes|the deploy notes]]',
  '- [Deploy notes, as an ordinary link](Runbooks/Deploy%20notes.md)',
  ''
].join('\n');

/*
 * Two documents that are not in this tenant at all, keyed by their address
 * rather than by a path. The File URL source reads one of these, and a wiki
 * link inside it resolves against the folder that address is in, so following
 * it asks for the other one by URL. Nothing here goes near the network: the
 * stand-in's fetchUrl reads the same map, keyed by the address asked for.
 *
 * REMOTE_HOME links to the second by its github.com blob address, which is the
 * one anybody copies out of a browser, while the document itself is stored
 * under the raw address. So following it only works if the translation between
 * the two happens, which is the point.
 */
const REMOTE_RAW: string = 'https://raw.githubusercontent.com/contoso/wiki/main/docs';

const REMOTE_HOME: string = [
  '# Remote handbook',
  '',
  'A document that is not in this tenant.',
  '',
  '- [[Deploy runbook]] as a wiki link',
  '- [the same page](https://github.com/contoso/wiki/blob/main/docs/Deploy%20runbook.md)',
  '  written the way GitHub gives it to you',
  ''
].join('\n');

const REMOTE_DEPLOY: string = [
  '# Remote deploying',
  '',
  'The other end of the link, fetched from the raw host.',
  ''
].join('\n');

put(`${REMOTE_RAW}/Home.md`, REMOTE_HOME);
put(`${REMOTE_RAW}/Deploy%20runbook.md`, REMOTE_DEPLOY);

/*
 * A document that embeds an Office file, and the file itself. The file has no
 * markdown in it and never needs any: what the library has to answer for it is
 * that it exists and what its id is.
 */
const WITH_EMBEDS: string = [
  '# Reports',
  '',
  'This quarter:',
  '',
  '![[Quarterly report.docx]]',
  '',
  'And one nobody has filed yet, which has no id to preview:',
  '',
  '![[Missing report.docx]]',
  ''
].join('\n');

put(`${LIBRARY}/reports.md`, WITH_EMBEDS);
put(`${LIBRARY}/Quarterly report.docx`, '');

const FILE_IDS: { [path: string]: string } = {
  [`${LIBRARY}/Quarterly report.docx`]: '6f1c2b8e-1111-2222-3333-444455556666'
};

/*
 * And a source file at an address, for a fence that names a `src` instead of
 * writing a body. It is not markdown and is not in any library; fetchUrl reads
 * the same map by address, which is all such a fence asks for. Stored under
 * the raw host, because that is where fetchableUrl sends the request once it
 * has translated the github.com blob link the document writes.
 */
Object.keys(REMOTE_CODE).forEach((url: string) => put(url, REMOTE_CODE[url]));

/*
 * HTML documents, for the HTML web part. Three of them, and each earns its
 * place.
 *
 * notes.html is a whole file rather than a fragment - a doctype, a head with a
 * title and a <style> block, a body - because that is what somebody points the
 * web part at, and because the <style> block is the thing the sanitiser
 * silently removes if it is not lifted out first.
 *
 * It also carries the three kinds of link whose handling differs: a relative
 * one to a neighbouring HTML document, which opens in the web part; a relative
 * one to something that is not a document, which does not; and one naming
 * another server, which is somebody else's. And a <script>, so that what
 * survives sanitising can be checked rather than assumed.
 */
const NOTES_HTML: string = [
  '<!doctype html>',
  '<html lang="en">',
  '<head>',
  '  <meta charset="utf-8">',
  '  <title>Deploy notes</title>',
  '  <style>',
  '    /* Three rules, and each is here to be looked for. The body rule and',
  '       the bare element rule are what a stylesheet that escaped the web',
  '       part would change out in the page; the class rule is what has to',
  '       keep working inside it. */',
  '    body { background: rgb(255, 248, 225); }',
  '    p { color: rgb(200, 0, 0); }',
  '    .note { border-left: 4px solid #b8860b; padding-left: 12px; }',
  '  </style>',
  '</head>',
  '<body>',
  '  <h1>Deploy notes</h1>',
  '  <p class="note">Watch the queue length for ten minutes after.</p>',
  '  <h2>When it goes wrong</h2>',
  '  <p>Read <a href="rollback.html">rolling back</a>, which is this backwards.</p>',
  '  <p>The signed-off plan is <a href="plan.pdf">a PDF</a>.</p>',
  '  <p>And <a href="https://example.com/elsewhere">somebody else\u2019s page</a>.</p>',
  '  <table>',
  '    <thead><tr><th>Step</th><th>Minutes</th></tr></thead>',
  '    <tbody><tr><td>Drain</td><td>4</td></tr><tr><td>Swap</td><td>2</td></tr></tbody>',
  '  </table>',
  /*
   * Everything above is load bearing and was here first. Everything below is
   * length, and length is the point of it: the website publishes this document
   * as the HTML web part running, and a document of four paragraphs left most
   * of a tall window showing empty canvas under the card. The canvas is honest
   * - a real page shows the same under a short web part - so the fix is a
   * document worth the frame rather than a frame that lies about the document.
   *
   * It stays prose, one table and the same three links. A second table would
   * change what the table checks count, and a fourth link would change which
   * one a check finds by its address.
   */
  '  <h2>Before you start</h2>',
  '  <p>Two people, one running and one reading this. The reader keeps the',
  '     clock and says the numbers out loud, because the person running is',
  '     watching a terminal and will not be watching anything else.</p>',
  '  <p>Anything below that says wait means wait. A step that looks finished',
  '     before its minutes are up has usually not started.</p>',
  '  <h2>While it runs</h2>',
  '  <p>The queue drains first and the swap follows it. Neither reports',
  '     progress, so the only honest signal is the clock and the queue length',
  '     beside it.</p>',
  '  <p>A queue that stops falling for a whole minute is the one thing worth',
  '     stopping for. Everything else that looks wrong at this point looks',
  '     wrong every time and has never been wrong yet.</p>',
  '  <h2>After</h2>',
  '  <p>Leave it alone for ten minutes and watch. The failure this replaces',
  '     did not show up until the cache had turned over, which is about that',
  '     long, and every earlier check said it was fine.</p>',
  '  <p>Write down what the queue peaked at. Nobody has ever needed it during',
  '     a deploy and everybody has wanted it a fortnight later.</p>',
  '  <h2>If it has to come back</h2>',
  '  <p>Rolling back is the same list upside down, and it is a separate',
  '     document because reading a list backwards under pressure is how steps',
  '     get missed.</p>',
  '  <p>The decision is not technical. If the queue is draining at all, let it',
  '     drain; if it has stopped, come back. There is no third answer worth',
  '     arguing about at two in the morning.</p>',
  '  <script>window.strataScriptRan = true;</script>',
  '</body>',
  '</html>',
  ''
].join('\n');

/* The document the first one links to, so following a link has somewhere to
   land. A fragment as well, so landing on a heading can be checked. */
const ROLLBACK_HTML: string = [
  '<h1>Rolling back</h1>',
  '<p>The deploy notes, backwards.</p>',
  '<h2>Undo the swap</h2>',
  '<p>Put the old one back first, then drain again.</p>',
  ''
].join('\n');

/* A fragment rather than a document: no doctype, no head, no styles. The web
   part has to draw one of these as readily as a whole file, because plenty of
   what people keep in a library is a fragment somebody exported. */
const FRAGMENT_HTML: string = [
  '<h1>A fragment</h1>',
  '<p>No doctype, no head, no styles of its own.</p>',
  ''
].join('\n');

/*
 * A stylesheet in the library, which is how several HTML web parts are given
 * one look from one file. It names body and html on purpose: those are the
 * selectors that have to be narrowed to the web part in inline mode, and a
 * stylesheet that did not use them would not test the narrowing.
 */
const SHARED_CSS: string = [
  'html, body { background: rgb(238, 245, 255); }',
  'h1 { color: rgb(20, 83, 45); }',
  '.note { font-style: italic; }',
  ''
].join('\n');

put(`${LIBRARY}/notes.html`, NOTES_HTML);
put(`${LIBRARY}/rollback.html`, ROLLBACK_HTML);
/* And the same document one folder down, because a menu entry names a document
   the short way - ?strataDoc=Runbooks/rollback.html - and that path has to be
   resolved against the configured document's folder rather than refused. */
put(`${LIBRARY}/Runbooks/rollback.html`, ROLLBACK_HTML);
put(`${LIBRARY}/fragment.htm`, FRAGMENT_HTML);
put(`${LIBRARY}/shared.css`, SHARED_CSS);

put(`${LIBRARY}/handbook.md`, typeof SAMPLE === 'string' ? SAMPLE : '# Handbook\n');
put(`${LIBRARY}/index.md`, INDEX);
put(`${LIBRARY}/Runbooks/Deploy notes.md`, DEPLOY);
put(`${LIBRARY}/Runbooks/deploy.md`, DEPLOY);
put(`${LIBRARY}/Runbooks/rollback.md`, ROLLBACK);

function fileName(path: string): string {
  return path.slice(path.lastIndexOf('/') + 1);
}

/* The real service exports this; the stand-in keeps its own copy rather than
   importing it, because the whole point of a stand-in is that it does not
   depend on the thing it stands in for. tests/stand-ins.test.js is what keeps
   the two honest. */
function hasExtension(name: string, extensions: string[]): boolean {
  const lower: string = (name || '').toLowerCase();
  return extensions.some(
    (extension: string) => lower.lastIndexOf(extension) === lower.length - extension.length
  );
}

function folderOf(path: string): string {
  return path.slice(0, path.lastIndexOf('/'));
}

function describe(path: string): IFileMetadata {
  return {
    name: fileName(path),
    serverRelativeUrl: path,
    timeLastModified: files[path].modified,
    author: 'A Harness',
    length: files[path].markdown.length
  };
}

export class SharePointService {
  /** How long every answer takes. Zero is a promise that is already resolved
      but still a promise, which is what a fast network looks like. */
  private static delayMs: number = 0;
  private static refusing: boolean = false;

  private readonly webServerRelativeUrl: string;
  private pollTimer: number | undefined;
  private folderListings: { [folder: string]: Promise<string[] | undefined> } = {};

  public constructor(context: WebPartContext) {
    this.webServerRelativeUrl = context.pageContext.web.serverRelativeUrl;
  }

  /** Harness only: how slow the library is to answer. */
  public static answerAfter(milliseconds: number): void {
    SharePointService.delayMs = milliseconds;
  }

  /** Harness only: a library that will not answer. */
  public static refuse(refusing: boolean): void {
    SharePointService.refusing = refusing;
  }

  /** Harness only: everything the library holds, for a driver to assert on. */
  public static paths(): string[] {
    return Object.keys(files);
  }

  private static answer<TResult>(result: TResult): Promise<TResult> {
    if (SharePointService.refusing) {
      return Promise.reject(new Error('The harness library was told to refuse'));
    }
    if (SharePointService.delayMs === 0) {
      return Promise.resolve(result);
    }
    return new Promise((resolve: (value: TResult) => void) => {
      window.setTimeout(() => resolve(result), SharePointService.delayMs);
    });
  }

  public async getDocumentLibraries(): Promise<ILibraryInfo[]> {
    return SharePointService.answer([
      { title: 'Documents', serverRelativeUrl: LIBRARY },
      { title: 'Site Assets', serverRelativeUrl: '/sites/demo/SiteAssets' }
    ]);
  }

  public async getFolders(libraryUrl: string): Promise<string[]> {
    const inside: string[] = Object.keys(files)
      .filter((path: string) => path.indexOf(`${libraryUrl}/`) === 0)
      .map((path: string) => folderOf(path))
      .filter((folder: string) => folder !== libraryUrl)
      .map((folder: string) => folder.slice(libraryUrl.length + 1));
    return SharePointService.answer(Array.from(new Set(inside)).sort());
  }

  /**
   * The files in a folder, of the kinds the caller asked for.
   *
   * The extensions are honoured rather than ignored, and that matters here
   * more than it looks: the two web parts pick from the same library and offer
   * different kinds of file. A stand-in that handed every file to both would
   * let a check on the HTML web part's file picker pass while the picker was
   * offering markdown.
   */
  public async getMarkdownFiles(libraryUrl: string, folderPath?: string,
    extensions?: string[]): Promise<IFileMetadata[]> {
    const folder: string = folderPath ? `${libraryUrl}/${folderPath}` : libraryUrl;
    const wanted: string[] = extensions || ['.md', '.markdown'];
    const inside: IFileMetadata[] = Object.keys(files)
      .filter((path: string) => folderOf(path) === folder)
      .filter((path: string) => hasExtension(fileName(path), wanted))
      .sort()
      .map(describe);
    return SharePointService.answer(inside);
  }

  public listFolderFileNames(folderUrl: string): Promise<string[] | undefined> {
    /* Kept per folder, as the real one does, so several links into the same
       folder share one answer. */
    if (!this.folderListings[folderUrl]) {
      const names: string[] = Object.keys(files)
        .filter((path: string) => folderOf(path) === folderUrl)
        .map(fileName);
      this.folderListings[folderUrl] = SharePointService.answer(
        names.length > 0 ? names : undefined
      );
    }
    return this.folderListings[folderUrl];
  }

  public forgetFolderListings(): void {
    this.folderListings = {};
  }

  public async getFileContent(serverRelativeUrl: string): Promise<string> {
    const stored: IStoredFile | undefined = files[serverRelativeUrl];
    if (!stored) {
      return Promise.reject(new Error(`No file at ${serverRelativeUrl}`));
    }
    return SharePointService.answer(stored.markdown);
  }

  public async getFileMetadata(serverRelativeUrl: string): Promise<IFileMetadata | undefined> {
    if (!files[serverRelativeUrl]) {
      return SharePointService.answer(undefined);
    }
    return SharePointService.answer(describe(serverRelativeUrl));
  }

  public async saveFileContent(serverRelativeUrl: string, content: string): Promise<void> {
    if (!files[serverRelativeUrl]) {
      return Promise.reject(new Error(`No file at ${serverRelativeUrl}`));
    }
    files[serverRelativeUrl] = { markdown: content, modified: new Date().toISOString() };
    return SharePointService.answer(undefined);
  }

  public async getVersions(serverRelativeUrl: string): Promise<IVersionInfo[]> {
    if (!files[serverRelativeUrl]) {
      return SharePointService.answer([]);
    }
    return SharePointService.answer([
      {
        versionLabel: '2.0',
        created: files[serverRelativeUrl].modified,
        createdBy: 'A Harness',
        url: `${serverRelativeUrl}?version=2`,
        isCurrentVersion: true
      },
      {
        versionLabel: '1.0',
        created: '2025-12-01T11:30:00Z',
        createdBy: 'A Harness',
        url: `${serverRelativeUrl}?version=1`,
        isCurrentVersion: false
      }
    ]);
  }

  public async getVersionContent(version: IVersionInfo): Promise<string> {
    return SharePointService.answer(
      `# An earlier version\n\nVersion ${version.versionLabel}, kept by the harness.\n`
    );
  }

  public async hasChangedSince(serverRelativeUrl: string, lastModified: string): Promise<boolean> {
    const stored: IStoredFile | undefined = files[serverRelativeUrl];
    return SharePointService.answer(!!stored && stored.modified !== lastModified);
  }

  public watchFile(serverRelativeUrl: string, onChanged: () => void): void {
    this.unwatchFile();
    /* The real one polls every thirty seconds. Nothing in the harness changes
       a file behind the web part's back, so this exists to be started and
       stopped - which is the half that has ever been wrong. */
    this.pollTimer = window.setInterval(() => {
      void this.hasChangedSince(serverRelativeUrl, files[serverRelativeUrl].modified)
        .then((changed: boolean) => { if (changed) { onChanged(); } });
    }, 30000);
  }

  public unwatchFile(): void {
    if (this.pollTimer !== undefined) {
      window.clearInterval(this.pollTimer);
      this.pollTimer = undefined;
    }
  }

  /** Harness only: whether the watcher is running, so a driver can check that
      putting the web part away stopped it. */
  public static watching(service: SharePointService): boolean {
    return service.pollTimer !== undefined;
  }

  /**
   * Harness stand-in for the unique id a preview frame is addressed by. Any
   * file the stand-in library holds has one; anything else has none, which is
   * how a card with no preview in it is driven.
   */
  public async getFileId(serverRelativeUrl: string): Promise<string | undefined> {
    return SharePointService.answer(
      files[serverRelativeUrl] ? FILE_IDS[serverRelativeUrl] : undefined
    );
  }

  public static async fetchUrl(url: string): Promise<string> {
    const stored: IStoredFile | undefined = files[url];
    if (!stored) {
      return Promise.reject(new Error(`Nothing at ${url}`));
    }
    return SharePointService.answer(stored.markdown);
  }

  /** Harness only: the site the service was built against, so a driver can
      check it was handed a real context rather than undefined. */
  public get webUrl(): string {
    return this.webServerRelativeUrl;
  }
}
