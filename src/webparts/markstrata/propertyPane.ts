/*
 * The property pane: what an author sees when they edit the web part.
 *
 * It lives here rather than in the web part because it is 380 lines of literal
 * that describes settings, while the web part is the thing that renders a
 * document - and because it has no need of anything else in there. Given the
 * properties and the libraries, folders and files SharePoint has reported, the
 * pane is the same every time.
 *
 * The pages are laid out by what somebody came to change rather than by what
 * the code calls things. Appearance holds the theme, the measure, the pictures
 * and the page itself; code blocks, diagrams, tables and maths share a page,
 * since all of those are things a document puts in the middle of its text;
 * Contents keeps the table of contents and the links between documents,
 * because finding your way inside a document and finding your way between them
 * are the same errand; and what is left is what is drawn around the document.
 */
import {
  IPropertyPaneConfiguration,
  IPropertyPaneDropdownOption,
  IPropertyPaneField,
  PropertyPaneDropdown,
  PropertyPaneSlider,
  PropertyPaneTextField,
  PropertyPaneToggle,
  PropertyPaneLabel
} from '@microsoft/sp-property-pane';
import * as strings from 'MarkstrataWebPartStrings';

import { IMarkstrataWebPartProps } from './webPartProps';
import { ITocWidthRange, TOC_WIDTH_RANGES } from './utils/tocWidth';
import {
  THEME_FAMILIES,
  COLOR_MODES,
  CONTENT_WIDTHS,
  DENSITIES,
  TEXT_SIZES,
  CODE_SIZES,
  IThemeChoice
} from './utils/ThemeManager';

/** What the pane knows about the site it is being shown in. */
export interface IPaneSources {
  libraries: IPropertyPaneDropdownOption[];
  folders: IPropertyPaneDropdownOption[];
  files: IPropertyPaneDropdownOption[];
}

function toDropdown(choices: IThemeChoice[]): IPropertyPaneDropdownOption[] {
  return choices.map((choice: IThemeChoice) => ({ key: choice.key, text: choice.text }));
}

/** The contents are only a sidebar on two of the four placements. */
function isTocSidebar(properties: IMarkstrataWebPartProps): boolean {
  return properties.tocPosition === 'left' || properties.tocPosition === 'right';
}

/*
 * Slider and box are the same property. The slider is for finding a width by
 * eye, the box for typing one already known; the pane re-reads the property
 * when either changes, so the two stay in step.
 */
function tocWidthFields(properties: IMarkstrataWebPartProps): IPropertyPaneField<unknown>[] {
  const range: ITocWidthRange = tocWidthRange(properties);
  return [
    PropertyPaneDropdown('tocWidthUnit', {
      label: strings.TocWidthUnitsLabel,
      options: [
        { key: 'em', text: 'em, follows the text size' },
        { key: '%', text: '%, share of the web part' },
        { key: 'px', text: 'px, a fixed number of pixels' },
        { key: 'vw', text: 'vw, share of the browser window' }
      ],
      selectedKey: properties.tocWidthUnit
    }),
    PropertyPaneSlider('tocWidthValue', {
      label: strings.TocWidthValueLabel,
      min: range.min,
      max: range.max,
      step: range.step,
      showValue: true
    }),
    PropertyPaneTextField('tocWidthValue', {
      label: `${strings.TocWidthValueLabel} (${properties.tocWidthUnit})`,
      onGetErrorMessage: (typed: string): string => checkTocWidth(properties, typed)
    })
  ] as IPropertyPaneField<unknown>[];
}

function tocWidthRange(properties: IMarkstrataWebPartProps): ITocWidthRange {
  return TOC_WIDTH_RANGES[properties.tocWidthUnit] || TOC_WIDTH_RANGES.em;
}

/** Keeps a typed width inside the range its unit makes sense in. */
function checkTocWidth(properties: IMarkstrataWebPartProps, typed: string): string {
  const range: ITocWidthRange = tocWidthRange(properties);
  const value: number = Number(typed);
  if (typed.trim().length === 0 || isNaN(value)) {
    return 'Enter a number.';
  }
  if (value < range.min || value > range.max) {
    return `Between ${range.min} and ${range.max}${properties.tocWidthUnit}.`;
  }
  return '';
}

/**
 * The five pages of the property pane.
 *
 * A pure function of the properties and of what SharePoint has told us is in
 * the site: the same settings in, the same pane out. It is a function rather
 * than a method because nothing about laying a pane out needs the web part -
 * and because 380 lines of literal inside a class is where a class stops
 * being readable.
 */
export function paneConfiguration(
  properties: IMarkstrataWebPartProps,
  sources: IPaneSources
): IPropertyPaneConfiguration {
  const isLibrary: boolean = properties.contentSource === 'library';
  const isUrl: boolean = properties.contentSource === 'url';

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
                selectedKey: properties.contentSource
              }),
              ...(properties.contentSource === 'manual'
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
                      options: sources.libraries,
                      selectedKey: properties.selectedLibrary
                    }),
                    PropertyPaneDropdown('selectedFolder', {
                      label: strings.FolderLabel,
                      options: sources.folders,
                      selectedKey: properties.selectedFolder,
                      disabled: !properties.selectedLibrary
                    }),
                    PropertyPaneDropdown('selectedFile', {
                      label: strings.FileLabel,
                      options: sources.files,
                      selectedKey: properties.selectedFile,
                      disabled: !properties.selectedLibrary
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
                options: toDropdown(THEME_FAMILIES),
                selectedKey: properties.themeFamily
              }),
              PropertyPaneDropdown('colorMode', {
                label: strings.ColorModeLabel,
                options: toDropdown(COLOR_MODES),
                selectedKey: properties.colorMode
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
                options: toDropdown(CONTENT_WIDTHS),
                selectedKey: properties.contentWidth
              }),
              PropertyPaneDropdown('density', {
                label: strings.DensityLabel,
                options: toDropdown(DENSITIES),
                selectedKey: properties.density
              }),
              PropertyPaneDropdown('textSize', {
                label: strings.TextSizeLabel,
                options: toDropdown(TEXT_SIZES),
                selectedKey: properties.textSize
              })
            ]
          },
          {
            groupName: strings.PicturesGroupName,
            groupFields: [
              PropertyPaneDropdown('imageAlign', {
                label: strings.ImageAlignLabel,
                options: [
                  { key: 'left', text: 'Left' },
                  { key: 'center', text: 'Centred' },
                  { key: 'right', text: 'Right' }
                ],
                selectedKey: properties.imageAlign
              }),
              PropertyPaneToggle('enableImageZoom', {
                label: strings.ImageZoomLabel,
                onText: 'On',
                offText: 'Off'
              }),
              PropertyPaneLabel('imageAlignHint', { text: strings.ImageAlignHint })
            ]
          },
          {
            groupName: strings.PageGroupName,
            groupFields: [
              PropertyPaneToggle('fillHeight', {
                label: strings.FillHeightLabel,
                onText: 'On',
                offText: 'Off'
              }),
              PropertyPaneLabel('fillHeightHint', { text: strings.FillHeightHint })
            ]
          },
        ]
      },
      {
        header: { description: strings.CodePageDescription },
        groups: [
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
                options: toDropdown(CODE_SIZES),
                selectedKey: properties.codeSize
              })
            ]
          },
          {
            groupName: strings.DiagramsGroupName,
            groupFields: [
              PropertyPaneToggle('enableMermaid', {
                label: strings.MermaidLabel,
                onText: 'On',
                offText: 'Off'
              }),
              PropertyPaneDropdown('diagramWidth', {
                label: strings.DiagramWidthLabel,
                options: [
                  { key: 'fit', text: 'Fit to the column' },
                  { key: 'scroll', text: 'Keep their size and scroll' },
                  { key: 'scale', text: 'Scale down to fit' }
                ],
                selectedKey: properties.diagramWidth,
                disabled: !properties.enableMermaid
              }),
              PropertyPaneLabel('diagramWidthHint', { text: strings.DiagramWidthHint })
            ]
          },
          {
            groupName: strings.MathGroupName,
            groupFields: [
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
          },
          {
            groupName: strings.TablesGroupName,
            groupFields: [
              PropertyPaneToggle('enableTableSort', {
                label: strings.TableSortLabel,
                onText: 'On',
                offText: 'Off'
              }),
              PropertyPaneLabel('tableSortHint', { text: strings.TableSortHint })
            ]
          }
        ]
      },
      {
        header: { description: strings.ContentsPageDescription },
        groups: [
          {
            groupName: strings.ContentsGroupName,
            groupFields: [
              PropertyPaneDropdown('tocPosition', {
                label: strings.TocPositionLabel,
                options: [
                  { key: 'off', text: 'No contents' },
                  { key: 'left', text: 'Sidebar on the left' },
                  { key: 'right', text: 'Sidebar on the right' },
                  { key: 'inline', text: 'Above the content' }
                ],
                selectedKey: properties.tocPosition
              }),
              PropertyPaneSlider('tocMaxLevel', {
                label: strings.TocLevelLabel,
                min: 1,
                max: 4,
                step: 1,
                disabled: properties.tocPosition === 'off'
              }),
              PropertyPaneDropdown('tocWidthMode', {
                label: strings.TocWidthUnitLabel,
                options: [
                  { key: 'auto', text: 'Auto, fits the longest entry' },
                  { key: 'fixed', text: 'Fixed width' }
                ],
                selectedKey: properties.tocWidthMode,
                disabled: !isTocSidebar(properties)
              }),
              /* The unit and the number only exist once a fixed width is
                 asked for. Greyed-out controls read as broken; absent ones
                 read as not applicable, which is what they are. */
              ...(isTocSidebar(properties) && properties.tocWidthMode === 'fixed'
                ? tocWidthFields(properties)
                : []),
              PropertyPaneLabel('tocWidthHint', { text: strings.TocWidthHint }),
              PropertyPaneToggle('enableAnchors', {
                label: strings.AnchorsLabel,
                onText: 'On',
                offText: 'Off'
              })
            ]
          },
          {
            groupName: strings.LinksGroupName,
            groupFields: [
              PropertyPaneToggle('enableWikiLinks', {
                label: strings.WikiLinksLabel,
                onText: 'On',
                offText: 'Off'
              }),
              /* Checking only means anything once there is something to
                 check, so it appears with the thing it checks. */
              ...(properties.enableWikiLinks
                ? [
                    PropertyPaneToggle('checkWikiLinks', {
                      label: strings.CheckWikiLinksLabel,
                      onText: 'On',
                      offText: 'Off',
                      disabled: properties.contentSource !== 'library'
                    })
                  ]
                : []),
              PropertyPaneToggle('followDocumentLinks', {
                label: strings.FollowLinksLabel,
                onText: 'On',
                offText: 'Off',
                disabled: properties.contentSource !== 'library'
              }),
              PropertyPaneLabel('followLinksHint', { text: strings.FollowLinksHint }),
              PropertyPaneLabel('wikiLinksHint', { text: strings.WikiLinksHint })
            ]
          }
        ]
      },
      {
        header: { description: strings.ChromePageDescription },
        groups: [
          {
            groupName: strings.ToolbarGroupName,
            groupFields: [
              PropertyPaneDropdown('toolbarVisibility', {
                label: strings.ToolbarVisibilityLabel,
                options: [
                  { key: 'always', text: 'Always' },
                  { key: 'editing', text: 'Only while editing the page' },
                  { key: 'never', text: 'Never' }
                ],
                selectedKey: properties.toolbarVisibility
              }),
              // The toolbar carries the print button, so a reader who never
              // sees the toolbar never sees printing either. Saying so here
              // costs a line and saves someone turning the toggle on and
              // wondering why nothing changed.
              PropertyPaneLabel('toolbarHint', { text: strings.ToolbarHint }),
              PropertyPaneToggle('showPrintButton', {
                label: strings.PrintButtonLabel,
                onText: 'On',
                offText: 'Off',
                disabled: properties.toolbarVisibility !== 'always'
              }),
              PropertyPaneToggle('showReadingTime', {
                label: strings.ReadingTimeLabel,
                onText: 'On',
                offText: 'Off',
                disabled: properties.toolbarVisibility === 'never'
              }),
              PropertyPaneDropdown('backToTop', {
                label: strings.BackToTopLabel,
                options: [
                  { key: 'off', text: 'No button' },
                  { key: 'left', text: 'Bottom left' },
                  { key: 'right', text: 'Bottom right' }
                ],
                selectedKey: properties.backToTop
              })
            ]
          },
          {
            groupName: strings.FileInfoGroupName,
            groupFields: [
              PropertyPaneToggle('showSourceInfo', {
                label: strings.ShowSourceInfoLabel,
                onText: 'On',
                offText: 'Off',
                // The footer is built from the file's metadata, and only a
                // library file has any.
                disabled: !isLibrary
              }),
              PropertyPaneToggle('pinMeta', {
                label: strings.PinMetaLabel,
                onText: 'On',
                offText: 'Off',
                disabled: !isLibrary || !properties.showSourceInfo
              }),
              PropertyPaneLabel('sourceInfoHint', { text: strings.SourceInfoHint })
            ]
          }
        ]
      }
    ]
  };
}
