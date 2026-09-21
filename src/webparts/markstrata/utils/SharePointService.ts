/**
 * .SYNOPSIS
 * SharePoint access: browsing libraries for markdown files, reading and
 * writing file content, version history and change polling.
 *
 * .USAGE
 *   import { SharePointService } from './utils/SharePointService';
 *
 *   const sharePoint: SharePointService = new SharePointService(this.context);
 *   const markdown: string = await sharePoint.getFileContent(fileUrl);
 *   const names: string[] | undefined = await sharePoint.listFolderFileNames(folder);
 *
 * .NOTES
 * Since:     0.0.6
 * Ships in:  the web part bundle
 * Requires:  nothing else in this project
 */

import { WebPartContext } from '@microsoft/sp-webpart-base';
import { spfi, SPFI, SPFx } from '@pnp/sp';
import '@pnp/sp/webs';
import '@pnp/sp/lists';
import '@pnp/sp/items';
import '@pnp/sp/files';
import '@pnp/sp/folders';

import { collectFolderPaths } from './folderTree';

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

/**
 * The shapes SharePoint's REST API returns for the fields this web part asks
 * for. PnPjs types these loosely, so they are written out here rather than
 * reaching into `any` - a renamed field then fails to compile instead of
 * silently reading undefined at runtime.
 */
interface ISpUser {
  Title?: string;
  EMail?: string;
}

interface ISpFile {
  Name: string;
  ServerRelativeUrl: string;
  TimeLastModified: string;
  Length: number;
  Author?: ISpUser;
}

interface ISpList {
  Title: string;
  RootFolder: { ServerRelativeUrl: string };
}

interface ISpFolder {
  Name: string;
}

interface ISpVersion {
  VersionLabel: string;
  Created: string;
  Url: string;
  IsCurrentVersion: boolean;
  CreatedBy?: ISpUser;
}

const MARKDOWN_EXTENSIONS: string[] = ['.md', '.markdown', '.mdx', '.txt'];

/**
 * Whether a file name ends in one of a set of extensions.
 *
 * Exported and taking the set, rather than asking "is this markdown", because
 * two web parts ask the same question about different answers: the file picker
 * for the markdown part offers .md, the one for the HTML part offers .html.
 * A lastIndexOf rather than endsWith, which the SPFx target does not have.
 */
export function hasExtension(name: string, extensions: string[]): boolean {
  const lower: string = (name || '').toLowerCase();
  return extensions.some(
    (extension: string) => lower.lastIndexOf(extension) === lower.length - extension.length
  );
}
const POLL_INTERVAL_MS: number = 30000;

export class SharePointService {
  private sp: SPFI;
  /* Keyed by folder, holding the promise so simultaneous links share a request. */
  private folderListings: { [folder: string]: Promise<string[] | undefined> } = {};
  private webServerRelativeUrl: string;
  private pollTimer: number | undefined;
  private lastSeenModified: string | undefined;

  constructor(context: WebPartContext) {
    this.sp = spfi().using(SPFx(context));
    this.webServerRelativeUrl = context.pageContext.web.serverRelativeUrl;
  }

  public async getDocumentLibraries(): Promise<ILibraryInfo[]> {
    try {
      const lists: ISpList[] = await this.sp.web.lists
        .filter('BaseTemplate eq 101 and Hidden eq false')
        .select('Title', 'RootFolder/ServerRelativeUrl')
        .expand('RootFolder')();

      return lists.map((list: ISpList) => ({
        title: list.Title,
        serverRelativeUrl: list.RootFolder.ServerRelativeUrl
      }));
    } catch (error) {
      console.error('[Markstrata] Could not list document libraries', error);
      return [];
    }
  }

  /**
   * Every folder in a library, the ones inside other folders included, as
   * paths relative to its root.
   *
   * SharePoint describes one folder at a time, so this used to stop at the
   * root and an author could not point the web part at `Runbooks/Database`.
   * The walking is in folderTree.ts, which knows nothing about SharePoint and
   * can therefore be tested; this is the half that does the asking.
   */
  public async getFolders(libraryUrl: string): Promise<string[]> {
    return collectFolderPaths((relativePath: string) =>
      this.childFolderNames(libraryUrl, relativePath));
  }

  /**
   * The folder names directly inside one folder of a library.
   *
   * A failure is reported and read as an empty folder rather than thrown: a
   * reader denied one subfolder still has every other folder to choose from,
   * and losing the library over that would be the worse answer.
   */
  private async childFolderNames(libraryUrl: string, relativePath: string): Promise<string[]> {
    const target: string = relativePath ? `${libraryUrl}/${relativePath}` : libraryUrl;

    try {
      const folders: ISpFolder[] = await this.sp.web
        .getFolderByServerRelativePath(target)
        .folders.select('Name')();

      /* `Forms` is SharePoint's own, holding the library's view pages, and it
         exists only at the root. Filtered there and nowhere else, so a folder
         an author deliberately called Forms further down still appears. */
      return folders
        .map((folder: ISpFolder) => folder.Name)
        .filter((name: string) => relativePath !== '' || name !== 'Forms');
    } catch (error) {
      console.error('[Markstrata] Could not list folders in', target, error);
      return [];
    }
  }

  public async getMarkdownFiles(
    libraryUrl: string,
    folderPath?: string,
    extensions?: string[]
  ): Promise<IFileMetadata[]> {
    const target: string = folderPath && folderPath.trim() ? `${libraryUrl}/${folderPath}` : libraryUrl;

    try {
      const files: ISpFile[] = await this.sp.web
        .getFolderByServerRelativePath(target)
        .files.select('Name', 'ServerRelativeUrl', 'TimeLastModified', 'Author/Title', 'Length')
        .expand('Author')();

      return files
        .filter((file: ISpFile) => hasExtension(file.Name, extensions || MARKDOWN_EXTENSIONS))
        .map((file: ISpFile) => this.toMetadata(file));
    } catch (error) {
      console.error('[Markstrata] Could not list markdown files', error);
      return [];
    }
  }

  /**
   * Every file name in a folder, for checking whether a link points at
   * something that is there.
   *
   * A whole folder rather than a file at a time, because a document's links
   * mostly point into the folder it lives in: one listing answers all of them,
   * where asking per link would be a request per link. The promise is cached
   * rather than the result, so links resolved at the same moment share one
   * request instead of racing.
   *
   * Returns undefined when the folder cannot be read, which is different from
   * an empty folder: a reader without access to it must not have their links
   * called broken on the strength of a failed request.
   */
  public listFolderFileNames(folderUrl: string): Promise<string[] | undefined> {
    const key: string = (folderUrl || '').replace(/\/+$/, '');
    if (!key) {
      return Promise.resolve(undefined);
    }

    const cached: Promise<string[] | undefined> | undefined = this.folderListings[key];
    if (cached) {
      return cached;
    }

    const listing: Promise<string[] | undefined> = this.sp.web
      .getFolderByServerRelativePath(key)
      .files.select('Name')()
      .then((files: { Name: string }[]) => files.map((file) => file.Name))
      .catch((error: unknown) => {
        /* Not knowing is a perfectly good answer here, and quieter than a
           console full of failures for a folder somebody cannot open. */
        console.warn('[Markstrata] Could not list', key, error);
        return undefined;
      });

    this.folderListings[key] = listing;
    return listing;
  }

  /** Forgotten when the document changes, so a new file is seen. */
  public forgetFolderListings(): void {
    this.folderListings = {};
  }

  public async getFileContent(serverRelativeUrl: string): Promise<string> {
    return this.sp.web.getFileByServerRelativePath(serverRelativeUrl).getText();
  }

  public async getFileMetadata(serverRelativeUrl: string): Promise<IFileMetadata | undefined> {
    try {
      const file: ISpFile = await this.sp.web
        .getFileByServerRelativePath(serverRelativeUrl)
        .select('Name', 'ServerRelativeUrl', 'TimeLastModified', 'Author/Title', 'Length')
        .expand('Author')();
      return this.toMetadata(file);
    } catch (error) {
      console.error('[Markstrata] Could not read file metadata', error);
      return undefined;
    }
  }

  /**
   * A file's unique id, which is what a preview frame is addressed by.
   *
   * `/_layouts/15/Doc.aspx?sourcedoc={id}` is the address SharePoint's own
   * File, Share, Embed dialog produces, and it takes the id rather than the
   * path. Undefined when the file is not there or the reader may not see it,
   * which the caller draws as a card with no preview in it rather than as a
   * failure: not being allowed to look inside a document is an ordinary thing
   * to happen in a library.
   */
  public async getFileId(serverRelativeUrl: string): Promise<string | undefined> {
    try {
      const file: { UniqueId?: string } = await this.sp.web
        .getFileByServerRelativePath(serverRelativeUrl)
        .select('UniqueId')();
      return file && file.UniqueId ? file.UniqueId : undefined;
    } catch {
      return undefined;
    }
  }

  public async saveFileContent(serverRelativeUrl: string, content: string): Promise<void> {
    await this.sp.web.getFileByServerRelativePath(serverRelativeUrl).setContent(content);
  }

  public async getVersions(serverRelativeUrl: string): Promise<IVersionInfo[]> {
    try {
      const versions: ISpVersion[] = await this.sp.web
        .getFileByServerRelativePath(serverRelativeUrl)
        .versions.select('VersionLabel', 'Created', 'CreatedBy/Title', 'Url', 'IsCurrentVersion')
        .expand('CreatedBy')();

      return versions
        .map((version: ISpVersion) => ({
          versionLabel: version.VersionLabel,
          created: version.Created,
          // Title is optional on the REST payload: system accounts and
          // unexpanded fields both come back without one.
          createdBy: (version.CreatedBy && version.CreatedBy.Title) || 'Unknown',
          url: version.Url,
          isCurrentVersion: !!version.IsCurrentVersion
        }))
        .reverse();
    } catch (error) {
      console.error('[Markstrata] Could not read version history', error);
      return [];
    }
  }

  /**
   * Reads the text of one historical version. SharePoint returns a web-relative
   * `_vti_history/...` path for each version; resolving that is far safer than
   * trying to rebuild the version id from its label.
   */
  public async getVersionContent(version: IVersionInfo): Promise<string> {
    const base: string = this.webServerRelativeUrl.replace(/\/$/, '');
    const relative: string = version.url.indexOf('/') === 0 ? version.url : `/${version.url}`;
    const response: Response = await fetch(`${window.location.origin}${base}${relative}`, {
      credentials: 'include'
    });
    if (!response.ok) {
      throw new Error(`Version ${version.versionLabel} could not be read (HTTP ${response.status})`);
    }
    return response.text();
  }

  public async hasChangedSince(serverRelativeUrl: string, lastModified: string): Promise<boolean> {
    const metadata: IFileMetadata | undefined = await this.getFileMetadata(serverRelativeUrl);
    if (!metadata || !lastModified) {
      return false;
    }
    return new Date(metadata.timeLastModified) > new Date(lastModified);
  }

  /** Polls for changes; SharePoint has no push channel available to a web part. */
  public watchFile(serverRelativeUrl: string, onChanged: () => void): void {
    this.unwatchFile();

    void this.getFileMetadata(serverRelativeUrl).then((metadata: IFileMetadata | undefined) => {
      this.lastSeenModified = metadata ? metadata.timeLastModified : undefined;
    });

    this.pollTimer = window.setInterval(() => {
      // No point asking SharePoint for changes nobody is looking at.
      if (document.hidden) {
        return;
      }
      void this.getFileMetadata(serverRelativeUrl).then((metadata: IFileMetadata | undefined) => {
        if (!metadata) {
          return;
        }
        if (this.lastSeenModified && metadata.timeLastModified !== this.lastSeenModified) {
          this.lastSeenModified = metadata.timeLastModified;
          onChanged();
        } else if (!this.lastSeenModified) {
          this.lastSeenModified = metadata.timeLastModified;
        }
      });
    }, POLL_INTERVAL_MS);
  }

  public unwatchFile(): void {
    if (this.pollTimer !== undefined) {
      window.clearInterval(this.pollTimer);
      this.pollTimer = undefined;
    }
    this.lastSeenModified = undefined;
  }

  /**
   * Fetches markdown from an arbitrary URL. Same-origin URLs go out with the
   * user's SharePoint cookies so a plain link to a file in the tenant works.
   */
  public static async fetchUrl(url: string): Promise<string> {
    const sameOrigin: boolean = url.indexOf('/') === 0 || url.indexOf(window.location.origin) === 0;
    const response: Response = await fetch(url, sameOrigin ? { credentials: 'include' } : {});
    if (!response.ok) {
      throw new Error(`Could not load ${url} (HTTP ${response.status})`);
    }
    return response.text();
  }

  private toMetadata(file: ISpFile): IFileMetadata {
    return {
      name: file.Name,
      serverRelativeUrl: file.ServerRelativeUrl,
      timeLastModified: file.TimeLastModified,
      author: (file.Author && file.Author.Title) || 'Unknown',
      length: file.Length
    };
  }
}
