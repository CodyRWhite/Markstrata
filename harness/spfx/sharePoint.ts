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
 * Since:     unreleased
 * Ships in:  nothing - it stands in for SharePoint at harness time
 * Requires:  webPartBase.ts
 */

import { WebPartContext } from '@microsoft/sp-webpart-base';

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

const ROLLBACK: string = [
  '# Rolling back',
  '',
  'The other end of the link in [deploying](deploy.md).',
  '',
  '## When to roll back',
  '',
  'When the thing that came up is worse than the thing that was there.',
  ''
].join('\n');

interface IStoredFile {
  markdown: string;
  modified: string;
}

/* Everything the library holds, by the path SharePoint would serve it at. */
const files: { [path: string]: IStoredFile } = {};

function put(path: string, markdown: string): void {
  files[path] = { markdown: markdown, modified: '2026-01-05T09:00:00Z' };
}

put(`${LIBRARY}/handbook.md`, typeof SAMPLE === 'string' ? SAMPLE : '# Handbook\n');
put(`${LIBRARY}/Runbooks/deploy.md`, DEPLOY);
put(`${LIBRARY}/Runbooks/rollback.md`, ROLLBACK);

function fileName(path: string): string {
  return path.slice(path.lastIndexOf('/') + 1);
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

  public async getMarkdownFiles(libraryUrl: string, folderPath?: string): Promise<IFileMetadata[]> {
    const folder: string = folderPath ? `${libraryUrl}/${folderPath}` : libraryUrl;
    const inside: IFileMetadata[] = Object.keys(files)
      .filter((path: string) => folderOf(path) === folder)
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
