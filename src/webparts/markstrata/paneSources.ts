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

export class PaneSources {
  public libraries: IPropertyPaneDropdownOption[] = [];
  public folders: IPropertyPaneDropdownOption[] = [];
  public files: IPropertyPaneDropdownOption[] = [];

  private readonly sharePoint: SharePointService;
  private readonly properties: IStrataWebPartProps;
  /** Which files the picker offers. Markdown unless a web part says otherwise. */
  private readonly extensions: string[] | undefined;

  public constructor(
    sharePoint: SharePointService,
    properties: IStrataWebPartProps,
    extensions?: string[]
  ) {
    this.sharePoint = sharePoint;
    this.properties = properties;
    this.extensions = extensions;
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

    if (this.properties.selectedLibrary) {
      await this.loadFolders();
      await this.loadFiles();
    }
  }

  public async loadFolders(): Promise<void> {
    const folders: string[] = await this.sharePoint.getFolders(this.properties.selectedLibrary);
    this.folders = [{ key: '', text: '(root)' }].concat(
      folders.map((folder: string) => ({ key: folder, text: folder }))
    );
  }

  public async loadFiles(): Promise<void> {
    const files: IFileMetadata[] = await this.sharePoint.getMarkdownFiles(
      this.properties.selectedLibrary,
      this.properties.selectedFolder,
      this.extensions
    );
    this.files = files.map((file: IFileMetadata) => ({
      key: file.serverRelativeUrl,
      text: file.name
    }));
  }
}
