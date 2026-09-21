/**
 * .SYNOPSIS
 * The libraries, folders and files the property pane offers to choose from.
 *
 * .DESCRIPTION
 * The pane itself is a pure function of the properties and of these lists; this
 * is where the lists come from, which is SharePoint, and it is kept apart for
 * that reason: one file that asks the site what is in it, and one that decides
 * how to draw the answer.
 *
 * They are loaded in a cascade, because each narrows the next: picking a
 * library changes the folders, and picking a folder changes the files. Nothing
 * here refreshes the pane - the web part does that, because redrawing a
 * property pane is SPFx's business and this file knows nothing about SPFx.
 *
 * WHY THE PROPERTY NAMES ARE GIVEN RATHER THAN FIXED
 * The HTML web part has two of these: one for the document and one for the
 * stylesheet it is dressed with. They are two separate choices of library,
 * folder and file, kept under two sets of properties, and an author picking a
 * stylesheet must not have their document picked out from under them. The
 * cascade is identical, so the names of the three properties are handed in.
 *
 * .USAGE
 *   import { PaneSources } from './paneSources';
 *
 *   const sources: PaneSources = new PaneSources(this.sharePoint, this.properties);
 *   await sources.loadAll();
 *   this.context.propertyPane.refresh();
 *
 *   // When the author picks a different library:
 *   await sources.loadFolders();
 *   await sources.loadFiles();
 *
 * .NOTES
 * Since:     0.0.17.0
 * Ships in:  the web part bundle
 * Requires:  SharePointService.ts, strataWebPartProps.ts
 */

import { IPropertyPaneDropdownOption } from '@microsoft/sp-property-pane';

import { IStrataWebPartProps } from '../shared/strataWebPartProps';
import { SharePointService, IFileMetadata, ILibraryInfo } from './utils/SharePointService';

/** Which three properties a cascade reads and writes. */
export interface IPickedFile {
  library: string;
  folder: string;
  file: string;
}

/** The document's own, which both web parts keep under these names. */
export const THE_DOCUMENT: IPickedFile = {
  library: 'selectedLibrary',
  folder: 'selectedFolder',
  file: 'selectedFile'
};

export class PaneSources {
  public libraries: IPropertyPaneDropdownOption[] = [];
  public folders: IPropertyPaneDropdownOption[] = [];
  public files: IPropertyPaneDropdownOption[] = [];

  private readonly sharePoint: SharePointService;
  private readonly properties: Record<string, unknown>;
  /** Which files the picker offers. Markdown unless a web part says otherwise. */
  private readonly extensions: string[] | undefined;
  /** Which three properties this cascade is the cascade for. */
  private readonly fields: IPickedFile;

  public constructor(
    sharePoint: SharePointService,
    properties: IStrataWebPartProps,
    extensions?: string[],
    fields?: IPickedFile
  ) {
    this.sharePoint = sharePoint;
    this.properties = properties as unknown as Record<string, unknown>;
    this.extensions = extensions;
    this.fields = fields || THE_DOCUMENT;
  }

  /** What is chosen now, for whichever three properties this cascade reads. */
  private chosen(which: keyof IPickedFile): string {
    return (this.properties[this.fields[which]] as string) || '';
  }

  /**
   * Everything the pane needs to open with. The folders and the files are only
   * worth asking for once a library has been chosen, since both are inside one.
   */
  public async loadAll(): Promise<void> {
    const libraries: ILibraryInfo[] = await this.sharePoint.getDocumentLibraries();
    this.libraries = libraries.map((library: ILibraryInfo) => ({
      key: library.serverRelativeUrl,
      text: library.title
    }));

    if (this.chosen('library')) {
      await this.loadFolders();
      await this.loadFiles();
    }
  }

  public async loadFolders(): Promise<void> {
    const folders: string[] = await this.sharePoint.getFolders(this.chosen('library'));
    this.folders = [{ key: '', text: '(root)' }].concat(
      folders.map((folder: string) => ({ key: folder, text: folder }))
    );
  }

  public async loadFiles(): Promise<void> {
    const files: IFileMetadata[] = await this.sharePoint.getMarkdownFiles(
      this.chosen('library'),
      this.chosen('folder'),
      this.extensions
    );
    this.files = files.map((file: IFileMetadata) => ({
      key: file.serverRelativeUrl,
      text: file.name
    }));
  }
}
