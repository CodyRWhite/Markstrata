import { Version, DisplayMode } from '@microsoft/sp-core-library';
import {
  IPropertyPaneConfiguration,
  IPropertyPaneDropdownOption,
  PropertyPaneDropdown,
  PropertyPaneSlider,
  PropertyPaneTextField,
  PropertyPaneToggle,
  PropertyPaneLabel
} from '@microsoft/sp-property-pane';
import { BaseClientSideWebPart } from '@microsoft/sp-webpart-base';
import { ThemeProvider, IReadonlyTheme } from '@microsoft/sp-component-base';
import * as strings from 'MarkdownFormatterWebPartStrings';

// Content styles. Loaded in this order: tokens, structure, then themes, then
// the reader options that override them.
import './styles/base.css';
import './styles/typography.css';
import './styles/code.css';
import './styles/syntax.css';
import './styles/callouts.css';
import './styles/tables-lists.css';
import './styles/extras.css';
import './styles/chrome.css';
import './styles/themes/github.css';
import './styles/themes/obsidian.css';
import './styles/themes/vscode.css';
import './styles/modifiers.css';
import './styles/print.css';

import { MarkdownProcessor } from './utils/MarkdownProcessor';
import { MermaidRenderer } from './utils/MermaidRenderer';
import { ContentEnhancer } from './utils/ContentEnhancer';
import { AssetLoader } from './utils/AssetLoader';
import { ViewModeRenderer } from './utils/ViewModeRenderer';
import { EditModeManager } from './utils/EditModeManager';
import { VersionPanel } from './utils/VersionPanel';
import { SharePointService, IFileMetadata, ILibraryInfo } from './utils/SharePointService';
import {
  ThemeManager,
  IThemeSettings,
  ResolvedMode,
  ThemeFamily,
  ColorMode,
  THEME_FAMILIES,
  COLOR_MODES,
  CONTENT_WIDTHS,
  DENSITIES,
  TEXT_SIZES,
  CODE_SIZES,
  IThemeChoice
} from './utils/ThemeManager';

export interface IMarkdownFormatterWebPartProps {
  // Content
  contentSource: 'manual' | 'library' | 'url';
  markdownContent: string;
  fileUrl: string;
  selectedLibrary: string;
  selectedFolder: string;
  selectedFile: string;
  enableAutoRefresh: boolean;

  // Appearance
  themeFamily: ThemeFamily;
  colorMode: ColorMode;
  contentWidth: string;
  density: string;
  textSize: string;
  codeSize: string;
  showThemeSwitcher: boolean;

  // Code blocks
  enableSyntaxHighlighting: boolean;
  showCodeHeader: boolean;
  showLineNumbers: boolean;
  wrapCodeLines: boolean;

  // Features
  enableMermaid: boolean;
  enableMath: boolean;
  enableAnchors: boolean;
  showTocSidebar: boolean;
  tocMaxLevel: number;
  showToolbar: boolean;
  showSourceInfo: boolean;
  enableVersionHistory: boolean;
  allowHtml: boolean;

  // Runtime state kept with the web part
  fileMetadata?: IFileMetadata;
}

interface IThemeOverride {
  themeFamily: ThemeFamily;
  colorMode: 'light' | 'dark';
}

export default class MarkdownFormatterWebPart extends BaseClientSideWebPart<IMarkdownFormatterWebPartProps> {
  private processor: MarkdownProcessor;
  private mermaid: MermaidRenderer;
  private enhancer: ContentEnhancer;
  private viewRenderer: ViewModeRenderer;
  private editManager: EditModeManager;
  private versionPanel: VersionPanel;
  private sharePoint: SharePointService;
  private themeProvider: ThemeProvider;

  private isInverted: boolean | undefined;
  private themeOverride: IThemeOverride | undefined;
  private loadError: string | undefined;
  /** Suppresses the extra render on first load; SPFx renders straight after onInit. */
  private contentLoadedOnce: boolean = false;
  private previewBanner: string | undefined;
  private previewContent: string | undefined;

  private libraryOptions: IPropertyPaneDropdownOption[] = [];
  private folderOptions: IPropertyPaneDropdownOption[] = [];
  private fileOptions: IPropertyPaneDropdownOption[] = [];

  // --------------------------------------------------------------- lifecycle

  protected async onInit(): Promise<void> {
    await super.onInit();

    this.applyDefaults();
    this.readThemeOverride();

    this.themeProvider = this.context.serviceScope.consume(ThemeProvider.serviceKey);
    const theme: IReadonlyTheme | undefined = this.themeProvider.tryGetTheme();
    this.isInverted = theme ? theme.isInverted : undefined;
    this.themeProvider.themeChangedEvent.add(this, (args) => {
      this.isInverted = args.theme ? args.theme.isInverted : undefined;
      if (this.properties.colorMode === 'auto') {
        this.render();
      }
    });

    this.sharePoint = new SharePointService(this.context);
    this.processor = new MarkdownProcessor(this.processorOptions());
    this.mermaid = new MermaidRenderer();
    this.enhancer = new ContentEnhancer();

    this.viewRenderer = new ViewModeRenderer(this.processor, this.mermaid, this.enhancer, {
      onReload: () => void this.loadContent(true),
      onShowVersions: () => void this.showVersions(),
      onThemeOverride: (family: ThemeFamily, mode: 'light' | 'dark') => this.setThemeOverride(family, mode),
      onPrint: () => window.print()
    });

    this.editManager = new EditModeManager(this.processor, this.mermaid, this.enhancer, {
      onChange: (markdown: string) => {
        this.properties.markdownContent = markdown;
      },
      onSave: (markdown: string) => this.saveToSharePoint(markdown)
    });

    this.versionPanel = new VersionPanel(this.sharePoint, {
      onPreview: (content: string, label: string) => {
        this.previewContent = content;
        this.previewBanner = `Previewing version ${label}. Reload to go back to the current version.`;
        this.render();
      },
      onRestored: () => void this.loadContent(true)
    });

    if (this.properties.enableMath) {
      AssetLoader.loadKatexCss();
    }

    void this.loadPropertyPaneSources();
    await this.loadContent(false);
  }

  protected onDispose(): void {
    this.sharePoint.unwatchFile();
    this.enhancer.dispose();
    this.editManager.dispose();
    super.onDispose();
  }

  protected get dataVersion(): Version {
    return Version.parse('1.0');
  }

  /** Defaults matter here: an unconfigured web part still has to look right. */
  private applyDefaults(): void {
    const defaults: Partial<IMarkdownFormatterWebPartProps> = {
      contentSource: 'manual',
      markdownContent: strings.SampleContent,
      fileUrl: '',
      selectedLibrary: '',
      selectedFolder: '',
      selectedFile: '',
      enableAutoRefresh: false,
      themeFamily: 'github',
      colorMode: 'light',
      contentWidth: 'comfortable',
      density: 'normal',
      textSize: 'normal',
      codeSize: 'normal',
      showThemeSwitcher: false,
      enableSyntaxHighlighting: true,
      showCodeHeader: true,
      showLineNumbers: false,
      wrapCodeLines: false,
      enableMermaid: true,
      enableMath: true,
      enableAnchors: true,
      showTocSidebar: false,
      tocMaxLevel: 3,
      showToolbar: true,
      showSourceInfo: true,
      enableVersionHistory: true,
      allowHtml: false
    };

    Object.keys(defaults).forEach((key: string) => {
      if ((this.properties as any)[key] === undefined || (this.properties as any)[key] === null) {
        (this.properties as any)[key] = (defaults as any)[key];
      }
    });
  }

  // ------------------------------------------------------------------ render

  public render(): void {
    // The panel lives inside the element we are about to rebuild, so drop it
    // rather than leave the toggle thinking it is still open.
    this.versionPanel.close();

    const settings: IThemeSettings = this.themeSettings();
    const mode: ResolvedMode = this.resolvedMode();
    const markdown: string = this.previewContent !== undefined ? this.previewContent : this.properties.markdownContent;

    if (this.displayMode === DisplayMode.Edit && this.previewContent === undefined) {
      this.editManager.render(this.domElement, markdown, {
        settings: settings,
        resolvedMode: mode,
        enableMermaid: this.properties.enableMermaid,
        canSave: this.canSaveToSharePoint(),
        saveTargetName: this.properties.fileMetadata ? this.properties.fileMetadata.name : ''
      });
      return;
    }

    this.viewRenderer.render(this.domElement, markdown, {
      settings: settings,
      resolvedMode: mode,
      showToolbar: this.properties.showToolbar,
      showThemeSwitcher: this.properties.showThemeSwitcher,
      showToc: this.properties.showTocSidebar,
      tocMaxLevel: this.properties.tocMaxLevel,
      showSourceInfo: this.properties.showSourceInfo,
      enableMermaid: this.properties.enableMermaid,
      canReload: this.properties.contentSource !== 'manual',
      canShowVersions: this.properties.enableVersionHistory && this.canSaveToSharePoint(),
      fileMetadata: this.properties.fileMetadata
    });

    if (this.previewBanner) {
      this.showBanner(this.previewBanner, 'success');
    }
    if (this.loadError) {
      this.showBanner(this.loadError, 'error');
    }
  }

  private showBanner(message: string, tone: string): void {
    const banner: HTMLElement = document.createElement('div');
    banner.className = 'mdf-status';
    banner.setAttribute('data-tone', tone);
    banner.style.display = 'block';
    banner.style.marginBottom = '12px';
    banner.textContent = message;
    this.domElement.insertBefore(banner, this.domElement.firstChild);
  }

  private themeSettings(): IThemeSettings {
    return {
      themeFamily: this.themeOverride ? this.themeOverride.themeFamily : this.properties.themeFamily,
      colorMode: this.themeOverride ? this.themeOverride.colorMode : this.properties.colorMode,
      contentWidth: this.properties.contentWidth,
      density: this.properties.density,
      textSize: this.properties.textSize,
      codeSize: this.properties.codeSize
    };
  }

  private resolvedMode(): ResolvedMode {
    const settings: IThemeSettings = this.themeSettings();
    return ThemeManager.resolveMode(settings.colorMode, this.isInverted);
  }

  private processorOptions(): any {
    return {
      enableSyntaxHighlighting: this.properties.enableSyntaxHighlighting,
      enableMath: this.properties.enableMath,
      enableMermaid: this.properties.enableMermaid,
      enableToc: true,
      enableAnchors: this.properties.enableAnchors,
      showCodeHeader: this.properties.showCodeHeader,
      showLineNumbers: this.properties.showLineNumbers,
      wrapCodeLines: this.properties.wrapCodeLines,
      allowHtml: this.properties.allowHtml
    };
  }

  // ------------------------------------------------------------ reader theme

  private overrideStorageKey(): string {
    return `mdf-theme-${this.context.instanceId}`;
  }

  private readThemeOverride(): void {
    try {
      const raw: string | null = window.localStorage.getItem(this.overrideStorageKey());
      this.themeOverride = raw ? (JSON.parse(raw) as IThemeOverride) : undefined;
    } catch (error) {
      this.themeOverride = undefined;
    }
  }

  private setThemeOverride(family: ThemeFamily, mode: 'light' | 'dark'): void {
    this.themeOverride = { themeFamily: family, colorMode: mode };
    try {
      window.localStorage.setItem(this.overrideStorageKey(), JSON.stringify(this.themeOverride));
    } catch (error) {
      // Private browsing or blocked storage: the choice just will not stick.
    }
    this.render();
  }

  // ----------------------------------------------------------------- content

  private canSaveToSharePoint(): boolean {
    return this.properties.contentSource === 'library' && !!this.properties.selectedFile;
  }

  private async loadContent(userInitiated: boolean): Promise<void> {
    this.loadError = undefined;
    this.previewContent = undefined;
    this.previewBanner = undefined;

    try {
      if (this.properties.contentSource === 'library' && this.properties.selectedFile) {
        this.properties.markdownContent = await this.sharePoint.getFileContent(this.properties.selectedFile);
        this.properties.fileMetadata = await this.sharePoint.getFileMetadata(this.properties.selectedFile);
        this.setupAutoRefresh();
      } else if (this.properties.contentSource === 'url' && this.properties.fileUrl) {
        this.properties.markdownContent = await SharePointService.fetchUrl(this.properties.fileUrl);
        this.properties.fileMetadata = undefined;
      }
    } catch (error) {
      this.loadError = `Could not load the markdown: ${(error as Error).message}`;
    }

    if (userInitiated || this.contentLoadedOnce) {
      this.render();
    }
    this.contentLoadedOnce = true;
  }

  private setupAutoRefresh(): void {
    this.sharePoint.unwatchFile();
    if (!this.properties.enableAutoRefresh || !this.properties.selectedFile) {
      return;
    }
    this.sharePoint.watchFile(this.properties.selectedFile, () => {
      if (this.displayMode === DisplayMode.Edit && this.editManager.hasUnsavedChanges) {
        // Never overwrite what the author is typing.
        return;
      }
      void this.loadContent(true);
    });
  }

  private async saveToSharePoint(markdown: string): Promise<boolean> {
    if (!this.canSaveToSharePoint()) {
      return false;
    }

    const lastModified: string = this.properties.fileMetadata ? this.properties.fileMetadata.timeLastModified : '';
    if (lastModified) {
      const changed: boolean = await this.sharePoint.hasChangedSince(this.properties.selectedFile, lastModified);
      if (changed) {
        const overwrite: boolean = window.confirm(
          'Someone else has saved this file since you opened it.\n\n' +
            'OK overwrites their version (the old text stays in version history), Cancel keeps it.'
        );
        if (!overwrite) {
          return false;
        }
      }
    }

    await this.sharePoint.saveFileContent(this.properties.selectedFile, markdown);
    this.properties.fileMetadata = await this.sharePoint.getFileMetadata(this.properties.selectedFile);
    return true;
  }

  private async showVersions(): Promise<void> {
    if (this.versionPanel.isOpen) {
      this.versionPanel.close();
      return;
    }
    await this.versionPanel.open(this.domElement, this.properties.selectedFile);
  }

  // --------------------------------------------------------- property pane

  private async loadPropertyPaneSources(): Promise<void> {
    const libraries: ILibraryInfo[] = await this.sharePoint.getDocumentLibraries();
    this.libraryOptions = libraries.map((library: ILibraryInfo) => ({
      key: library.serverRelativeUrl,
      text: library.title
    }));

    if (this.properties.selectedLibrary) {
      await this.loadFolderOptions();
      await this.loadFileOptions();
    }

    this.context.propertyPane.refresh();
  }

  private async loadFolderOptions(): Promise<void> {
    const folders: string[] = await this.sharePoint.getFolders(this.properties.selectedLibrary);
    this.folderOptions = [{ key: '', text: '(root)' }].concat(
      folders.map((folder: string) => ({ key: folder, text: folder }))
    );
  }

  private async loadFileOptions(): Promise<void> {
    const files: IFileMetadata[] = await this.sharePoint.getMarkdownFiles(
      this.properties.selectedLibrary,
      this.properties.selectedFolder
    );
    this.fileOptions = files.map((file: IFileMetadata) => ({ key: file.serverRelativeUrl, text: file.name }));
  }

  protected onPropertyPaneFieldChanged(propertyPath: string, oldValue: any, newValue: any): void {
    super.onPropertyPaneFieldChanged(propertyPath, oldValue, newValue);

    const rebuildProcessor: string[] = [
      'enableSyntaxHighlighting',
      'enableMath',
      'enableMermaid',
      'enableAnchors',
      'showCodeHeader',
      'showLineNumbers',
      'wrapCodeLines',
      'allowHtml'
    ];

    if (rebuildProcessor.indexOf(propertyPath) !== -1) {
      this.processor.updateOptions(this.processorOptions());
      if (propertyPath === 'enableMath' && newValue) {
        AssetLoader.loadKatexCss();
      }
    }

    if (propertyPath === 'contentSource') {
      this.previewContent = undefined;
      void this.loadContent(true);
      this.context.propertyPane.refresh();
    }

    if (propertyPath === 'selectedLibrary') {
      this.properties.selectedFolder = '';
      this.properties.selectedFile = '';
      void this.loadFolderOptions()
        .then(() => this.loadFileOptions())
        .then(() => this.context.propertyPane.refresh());
    }

    if (propertyPath === 'selectedFolder') {
      this.properties.selectedFile = '';
      void this.loadFileOptions().then(() => this.context.propertyPane.refresh());
    }

    if (propertyPath === 'selectedFile' || propertyPath === 'fileUrl') {
      void this.loadContent(true);
    }

    if (propertyPath === 'enableAutoRefresh') {
      this.setupAutoRefresh();
    }

    if (propertyPath === 'themeFamily' || propertyPath === 'colorMode') {
      // An author changing the theme should win over a reader's earlier choice.
      this.themeOverride = undefined;
      try {
        window.localStorage.removeItem(this.overrideStorageKey());
      } catch (error) {
        // ignore
      }
    }
  }

  private toDropdown(choices: IThemeChoice[]): IPropertyPaneDropdownOption[] {
    return choices.map((choice: IThemeChoice) => ({ key: choice.key, text: choice.text }));
  }

  protected getPropertyPaneConfiguration(): IPropertyPaneConfiguration {
    const isLibrary: boolean = this.properties.contentSource === 'library';
    const isUrl: boolean = this.properties.contentSource === 'url';

    return {
      pages: [
        {
          header: { description: strings.ContentPageDescription },
          groups: [
            {
              groupName: strings.ContentGroupName,
              groupFields: [
                PropertyPaneDropdown('contentSource', {
                  label: strings.ContentSourceLabel,
                  options: [
                    { key: 'manual', text: 'Type it here' },
                    { key: 'library', text: 'File in a document library' },
                    { key: 'url', text: 'File at a URL' }
                  ],
                  selectedKey: this.properties.contentSource
                }),
                ...(this.properties.contentSource === 'manual'
                  ? [
                      PropertyPaneTextField('markdownContent', {
                        label: strings.MarkdownContentLabel,
                        multiline: true,
                        rows: 14,
                        description: strings.MarkdownContentDescription
                      })
                    ]
                  : []),
                ...(isUrl
                  ? [
                      PropertyPaneTextField('fileUrl', {
                        label: strings.FileUrlLabel,
                        description: strings.FileUrlDescription,
                        placeholder: 'https://contoso.sharepoint.com/sites/team/Shared%20Documents/readme.md'
                      })
                    ]
                  : []),
                ...(isLibrary
                  ? [
                      PropertyPaneDropdown('selectedLibrary', {
                        label: strings.LibraryLabel,
                        options: this.libraryOptions,
                        selectedKey: this.properties.selectedLibrary
                      }),
                      PropertyPaneDropdown('selectedFolder', {
                        label: strings.FolderLabel,
                        options: this.folderOptions,
                        selectedKey: this.properties.selectedFolder,
                        disabled: !this.properties.selectedLibrary
                      }),
                      PropertyPaneDropdown('selectedFile', {
                        label: strings.FileLabel,
                        options: this.fileOptions,
                        selectedKey: this.properties.selectedFile,
                        disabled: !this.properties.selectedLibrary
                      }),
                      PropertyPaneToggle('enableAutoRefresh', {
                        label: strings.AutoRefreshLabel,
                        onText: 'On',
                        offText: 'Off'
                      }),
                      PropertyPaneToggle('enableVersionHistory', {
                        label: strings.VersionHistoryLabel,
                        onText: 'On',
                        offText: 'Off'
                      })
                    ]
                  : [])
              ]
            }
          ]
        },
        {
          header: { description: strings.AppearancePageDescription },
          groups: [
            {
              groupName: strings.ThemeGroupName,
              groupFields: [
                PropertyPaneDropdown('themeFamily', {
                  label: strings.ThemeFamilyLabel,
                  options: this.toDropdown(THEME_FAMILIES),
                  selectedKey: this.properties.themeFamily
                }),
                PropertyPaneDropdown('colorMode', {
                  label: strings.ColorModeLabel,
                  options: this.toDropdown(COLOR_MODES),
                  selectedKey: this.properties.colorMode
                }),
                PropertyPaneToggle('showThemeSwitcher', {
                  label: strings.ThemeSwitcherLabel,
                  onText: 'On',
                  offText: 'Off'
                }),
                PropertyPaneLabel('themeHint', { text: strings.ThemeHint })
              ]
            },
            {
              groupName: strings.ReadingGroupName,
              groupFields: [
                PropertyPaneDropdown('contentWidth', {
                  label: strings.ContentWidthLabel,
                  options: this.toDropdown(CONTENT_WIDTHS),
                  selectedKey: this.properties.contentWidth
                }),
                PropertyPaneDropdown('density', {
                  label: strings.DensityLabel,
                  options: this.toDropdown(DENSITIES),
                  selectedKey: this.properties.density
                }),
                PropertyPaneDropdown('textSize', {
                  label: strings.TextSizeLabel,
                  options: this.toDropdown(TEXT_SIZES),
                  selectedKey: this.properties.textSize
                }),
                PropertyPaneToggle('showToolbar', {
                  label: strings.ShowToolbarLabel,
                  onText: 'On',
                  offText: 'Off'
                }),
                PropertyPaneToggle('showSourceInfo', {
                  label: strings.ShowSourceInfoLabel,
                  onText: 'On',
                  offText: 'Off'
                })
              ]
            },
            {
              groupName: strings.CodeGroupName,
              groupFields: [
                PropertyPaneToggle('enableSyntaxHighlighting', {
                  label: strings.SyntaxHighlightingLabel,
                  onText: 'On',
                  offText: 'Off'
                }),
                PropertyPaneToggle('showCodeHeader', {
                  label: strings.CodeHeaderLabel,
                  onText: 'On',
                  offText: 'Off'
                }),
                PropertyPaneToggle('showLineNumbers', {
                  label: strings.LineNumbersLabel,
                  onText: 'On',
                  offText: 'Off'
                }),
                PropertyPaneToggle('wrapCodeLines', {
                  label: strings.WrapCodeLabel,
                  onText: 'Wrap',
                  offText: 'Scroll'
                }),
                PropertyPaneDropdown('codeSize', {
                  label: strings.CodeSizeLabel,
                  options: this.toDropdown(CODE_SIZES),
                  selectedKey: this.properties.codeSize
                })
              ]
            }
          ]
        },
        {
          header: { description: strings.FeaturesPageDescription },
          groups: [
            {
              groupName: strings.FeaturesGroupName,
              groupFields: [
                PropertyPaneToggle('showTocSidebar', {
                  label: strings.TocSidebarLabel,
                  onText: 'On',
                  offText: 'Off'
                }),
                PropertyPaneSlider('tocMaxLevel', {
                  label: strings.TocLevelLabel,
                  min: 1,
                  max: 4,
                  step: 1,
                  disabled: !this.properties.showTocSidebar
                }),
                PropertyPaneToggle('enableAnchors', {
                  label: strings.AnchorsLabel,
                  onText: 'On',
                  offText: 'Off'
                }),
                PropertyPaneToggle('enableMermaid', {
                  label: strings.MermaidLabel,
                  onText: 'On',
                  offText: 'Off'
                }),
                PropertyPaneToggle('enableMath', {
                  label: strings.MathLabel,
                  onText: 'On',
                  offText: 'Off'
                }),
                PropertyPaneToggle('allowHtml', {
                  label: strings.AllowHtmlLabel,
                  onText: 'On',
                  offText: 'Off'
                }),
                PropertyPaneLabel('htmlHint', { text: strings.AllowHtmlHint })
              ]
            }
          ]
        }
      ]
    };
  }
}
