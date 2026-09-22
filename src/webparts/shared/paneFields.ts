/**
 * .SYNOPSIS
 * The property pane fields both web parts show, as groups of fields rather
 * than as whole pages.
 *
 * .DESCRIPTION
 * Two web parts have two property panes, and almost every control on them is
 * the same control: the theme, the reading measure, the pictures, the contents
 * list, the toolbar, the export options, the file footer. Written out twice
 * they would drift, and a pane that drifts is worse than one that is merely
 * long: an author finds a setting in one part and cannot find it in the other.
 *
 * WHY GROUPS OF FIELDS AND NOT PAGES
 * Because the pages are where the two parts genuinely differ. The markdown
 * pane has a page about code fences, diagrams and maths that means nothing
 * here; the HTML pane has one about render modes and scripts that means
 * nothing there. And the markdown pane's Contents group ends with a setting
 * about heading anchors that only markdown generates. So each pane still lays
 * out its own pages and names its own groups, and takes the fields from here.
 *
 * It also keeps the pane readable in one place per web part, which is what
 * tests/property-pane.test.js reads to check the demo pane has not drifted
 * from the real one.
 *
 * WHY IStrataWebPartProps AND NOT A GENERIC
 * Because that interface is exactly the contract: a field here may only read a
 * setting both web parts have. A control that needed one of them in particular
 * would not compile, which is the point.
 *
 * .USAGE
 *   import { themeFields, toolbarFields } from '../shared/paneFields';
 *
 *   groups: [
 *     { groupName: strings.ThemeGroupName, groupFields: themeFields(properties) },
 *     { groupName: strings.ToolbarGroupName, groupFields: toolbarFields(properties) }
 *   ]
 *
 * .NOTES
 * Since:     0.0.22.0
 * Ships in:  both web part bundles
 * Requires:  strataWebPartProps.ts, tocWidth.ts, ThemeManager.ts
 */

import {
  IPropertyPaneDropdownOption,
  IPropertyPaneField,
  PropertyPaneDropdown,
  PropertyPaneSlider,
  PropertyPaneTextField,
  PropertyPaneToggle,
  PropertyPaneLabel
} from '@microsoft/sp-property-pane';
import * as strings from 'MarkstrataWebPartStrings';

import { IStrataWebPartProps } from './strataWebPartProps';
import { ITocWidthRange, TOC_WIDTH_RANGES } from '../markstrata/utils/tocWidth';
import {
  THEME_FAMILIES,
  COLOR_MODES,
  CONTENT_WIDTHS,
  DENSITIES,
  TEXT_SIZES,
  IThemeChoice
} from '../markstrata/utils/ThemeManager';

/** A field list, in the shape the pane wants it. */
type Fields = IPropertyPaneField<unknown>[];

export function toDropdown(choices: IThemeChoice[]): IPropertyPaneDropdownOption[] {
  return choices.map((choice: IThemeChoice) => ({ key: choice.key, text: choice.text }));
}

/** The libraries, folders and files a site has, for the pickers that need them. */
export interface IPaneSources {
  libraries: IPropertyPaneDropdownOption[];
  folders: IPropertyPaneDropdownOption[];
  files: IPropertyPaneDropdownOption[];
}

/**
 * What a web part calls its own document, so the content group can name it.
 *
 * Every one of these is a word an author reads, and "Content" would read as
 * neither markdown nor HTML. The property name is here too, because the pane
 * writes straight to it.
 */
export interface IDocumentWords {
  /** The property the document's own text is kept in. */
  textProperty: string;
  textLabel: string;
  textDescription: string;
  /** What the file picker is called: "Markdown file", "HTML file". */
  fileLabel: string;
  urlDescription: string;
  urlPlaceholder: string;
}

// ------------------------------------------------------------------- content

/**
 * Where the document comes from, and the controls that only one of the three
 * answers needs.
 *
 * Absent rather than disabled, throughout. A greyed-out control reads as
 * broken; one that is not there reads as not applicable, which is what it is.
 */
export function documentSourceFields(
  properties: IStrataWebPartProps,
  sources: IPaneSources,
  words: IDocumentWords
): Fields {
  const isLibrary: boolean = properties.contentSource === 'library';
  const isUrl: boolean = properties.contentSource === 'url';

  return [
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
          PropertyPaneTextField(words.textProperty, {
            label: words.textLabel,
            multiline: true,
            rows: 14,
            description: words.textDescription
          })
        ]
      : []),
    ...(isUrl
      ? [
          PropertyPaneTextField('fileUrl', {
            label: strings.FileUrlLabel,
            description: words.urlDescription,
            placeholder: words.urlPlaceholder
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
            label: words.fileLabel,
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
  ] as Fields;
}

// ---------------------------------------------------------------- appearance

export function themeFields(properties: IStrataWebPartProps): Fields {
  return [
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
  ] as Fields;
}

export function readingFields(properties: IStrataWebPartProps): Fields {
  return [
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
  ] as Fields;
}

export function pictureFields(properties: IStrataWebPartProps): Fields {
  return [
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
    PropertyPaneLabel('imageZoomHint', { text: strings.ImageZoomHint }),
    PropertyPaneLabel('imageAlignHint', { text: strings.ImageAlignHint })
  ] as Fields;
}

/**
 * The web part's own height.
 *
 * The markdown web part's only answer to this. The HTML web part has a Height
 * setting of three choices instead, because an HTML document can want a fixed
 * height in a way a markdown one cannot, and it keeps fillHeight in step with
 * the one that means the same thing rather than showing two controls that can
 * disagree.
 */
export function pageFields(): Fields {
  return [
    PropertyPaneToggle('fillHeight', {
      label: strings.FillHeightLabel,
      onText: 'On',
      offText: 'Off'
    }),
    PropertyPaneLabel('fillHeightHint', { text: strings.FillHeightHint })
  ] as Fields;
}

/**
 * Sorting a table, which is done by clicking the rendered header rather than
 * by anything in the document's syntax - so it is as true of an HTML table as
 * of a markdown one.
 */
export function tableFields(): Fields {
  return [
    PropertyPaneToggle('enableTableSort', {
      label: strings.TableSortLabel,
      onText: 'On',
      offText: 'Off'
    }),
    PropertyPaneLabel('tableSortHint', { text: strings.TableSortHint })
  ] as Fields;
}

// ------------------------------------------------------------------ contents

/** The contents are only a sidebar on two of the four placements. */
export function isTocSidebar(properties: IStrataWebPartProps): boolean {
  return properties.tocPosition === 'left' || properties.tocPosition === 'right';
}

export function contentsFields(properties: IStrataWebPartProps): Fields {
  return [
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
      /* Six, because every heading has an id now. It stopped at four while h5
         and h6 had none, so listing them would have listed entries that led
         nowhere. */
      max: 6,
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
    /* The unit and the number only exist once a fixed width is asked for.
       Greyed-out controls read as broken; absent ones read as not applicable,
       which is what they are. */
    ...(isTocSidebar(properties) && properties.tocWidthMode === 'fixed'
      ? tocWidthFields(properties)
      : []),
    PropertyPaneLabel('tocWidthHint', { text: strings.TocWidthHint })
  ] as Fields;
}

/*
 * Slider and box are the same property. The slider is for finding a width by
 * eye, the box for typing one already known; the pane re-reads the property
 * when either changes, so the two stay in step.
 */
export function tocWidthFields(properties: IStrataWebPartProps): Fields {
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
  ] as Fields;
}

export function tocWidthRange(properties: IStrataWebPartProps): ITocWidthRange {
  return TOC_WIDTH_RANGES[properties.tocWidthUnit] || TOC_WIDTH_RANGES.em;
}

/** Keeps a typed width inside the range its unit makes sense in. */
export function checkTocWidth(properties: IStrataWebPartProps, typed: string): string {
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

// -------------------------------------------------------------------- chrome

export function toolbarFields(properties: IStrataWebPartProps): Fields {
  return [
    PropertyPaneDropdown('toolbarVisibility', {
      label: strings.ToolbarVisibilityLabel,
      options: [
        { key: 'always', text: 'Always' },
        { key: 'editing', text: 'Only while editing the page' },
        { key: 'never', text: 'Never' }
      ],
      selectedKey: properties.toolbarVisibility
    }),
    // The toolbar carries the print button, so a reader who never sees the
    // toolbar never sees printing either. Saying so here costs a line and
    // saves someone turning the toggle on and wondering why nothing changed.
    PropertyPaneLabel('toolbarHint', { text: strings.ToolbarHint }),
    PropertyPaneDropdown('trailVisibility', {
      label: strings.TrailVisibilityLabel,
      options: [
        { key: 'followed', text: 'Once a reader has followed a link' },
        { key: 'always', text: 'On every page' },
        { key: 'never', text: 'Never' }
      ],
      selectedKey: properties.trailVisibility
    }),
    PropertyPaneLabel('trailHint', { text: strings.TrailHint }),
    /* Nothing to stick when the toolbar is never drawn, and nothing worth
       sticking when only an author sees it. */
    PropertyPaneToggle('stickyToolbar', {
      label: strings.StickyToolbarLabel,
      onText: 'On',
      offText: 'Off',
      disabled: properties.toolbarVisibility === 'never'
    }),
    PropertyPaneLabel('stickyToolbarHint', { text: strings.StickyToolbarHint }),
    PropertyPaneToggle('showExportButton', {
      label: strings.ExportButtonLabel,
      onText: 'On',
      offText: 'Off',
      disabled: properties.toolbarVisibility !== 'always'
    }),
    PropertyPaneLabel('exportHint', { text: strings.ExportButtonHint }),
    /* The three below decide what an export contains, so they are nothing to
       anybody whose toolbar has no export button in it. */
    PropertyPaneToggle('exportCoverPage', {
      label: strings.ExportCoverLabel,
      onText: 'On',
      offText: 'Off',
      disabled: !properties.showExportButton
        || properties.toolbarVisibility !== 'always'
    }),
    PropertyPaneToggle('exportContentsPage', {
      label: strings.ExportContentsLabel,
      onText: 'On',
      offText: 'Off',
      disabled: !properties.showExportButton
        || properties.toolbarVisibility !== 'always'
    }),
    PropertyPaneToggle('exportSectionBreaks', {
      label: strings.ExportSectionBreaksLabel,
      onText: 'On',
      offText: 'Off',
      disabled: !properties.showExportButton
        || properties.toolbarVisibility !== 'always'
    }),
    PropertyPaneLabel('exportSectionBreaksHint', { text: strings.ExportSectionBreaksHint }),
    PropertyPaneToggle('showShareButton', {
      label: strings.ShareButtonLabel,
      /* Off with following off, because the link it copies is the one that
         setting reads: a button offering a link nobody can follow back is
         worse than no button. */
      disabled: !properties.followDocumentLinks
    }),
    PropertyPaneLabel('shareButtonHint', { text: strings.ShareButtonHint }),
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
  ] as Fields;
}

export function fileInfoFields(properties: IStrataWebPartProps): Fields {
  const isLibrary: boolean = properties.contentSource === 'library';
  return [
    PropertyPaneToggle('showSourceInfo', {
      label: strings.ShowSourceInfoLabel,
      onText: 'On',
      offText: 'Off',
      // The footer is built from the file's metadata, and only a library file
      // has any.
      disabled: !isLibrary
    }),
    PropertyPaneToggle('pinMeta', {
      label: strings.PinMetaLabel,
      onText: 'On',
      offText: 'Off',
      disabled: !isLibrary || !properties.showSourceInfo
    }),
    PropertyPaneLabel('sourceInfoHint', { text: strings.SourceInfoHint })
  ] as Fields;
}
