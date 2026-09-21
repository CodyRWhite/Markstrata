/**
 * .SYNOPSIS
 * The property pane: what an author sees when they edit the HTML web part.
 *
 * .DESCRIPTION
 * The same shape as the markdown web part's pane, and most of the same
 * controls: those come from paneFields, so there is one theme control rather
 * than two that drift. What is laid out here is the pages, because they are
 * not the same pages.
 *
 * The stylesheet has a page of its own rather than a group beside the
 * document. That is deliberate and it is the point of the whole arrangement: a
 * document and the look of a document are two different things to go and
 * change, one stylesheet in a library can dress every HTML web part in a site,
 * and an author editing one document should not be able to restyle the other
 * nineteen by accident. It also means the stylesheet gets its own library,
 * folder and file pickers, which would not fit beside the document's.
 *
 * Rendering is where the markdown pane keeps code fences and diagrams: the
 * page of settings that are about this kind of document and no other. Render
 * mode, whether the author's scripts run, how tall the document is, and
 * whether it is drawn at all on a narrow screen.
 *
 * WHAT IS ABSENT AND WHY
 * There is no "The page" group, because height is one setting with three
 * answers here rather than a switch, and two controls that can disagree about
 * the same thing are worse than one. There is no "allow HTML" switch, because
 * the document is HTML. And several controls are absent in frame mode rather
 * than disabled: nothing on the page can reach into a frame, so pictures do
 * not zoom and tables do not sort there, and a hint says so instead of a
 * greyed-out toggle implying it might.
 *
 * .USAGE
 *   import { htmlPaneConfiguration } from './htmlPropertyPane';
 *
 *   protected getPropertyPaneConfiguration(): IPropertyPaneConfiguration {
 *     return htmlPaneConfiguration(this.properties, sources, styleSources);
 *   }
 *
 * .NOTES
 * Since:     0.0.22.0
 * Ships in:  the HTML web part bundle
 * Requires:  htmlWebPartProps.ts, paneFields.ts
 */

import {
  IPropertyPaneConfiguration,
  IPropertyPaneField,
  PropertyPaneDropdown,
  PropertyPaneSlider,
  PropertyPaneTextField,
  PropertyPaneToggle,
  PropertyPaneLabel
} from '@microsoft/sp-property-pane';
import * as strings from 'MarkstrataWebPartStrings';

import { IMarkstrataHtmlWebPartProps } from './htmlWebPartProps';
import {
  IPaneSources,
  documentSourceFields,
  themeFields,
  readingFields,
  pictureFields,
  tableFields,
  contentsFields,
  toolbarFields,
  fileInfoFields
} from '../shared/paneFields';

/** How tall a fixed height may be asked to be, in pixels. */
const HEIGHT_RANGE: { min: number; max: number; step: number } = {
  min: 120,
  /* Beyond this a fixed height is a worse answer than full window, and a
     slider that can reach 20000 is a slider nobody can aim. */
  max: 4000,
  step: 20
};

export function htmlPaneConfiguration(
  properties: IMarkstrataHtmlWebPartProps,
  sources: IPaneSources,
  styleSources: IPaneSources
): IPropertyPaneConfiguration {
  const inAFrame: boolean = properties.renderMode === 'frame';

  return {
    pages: [
      {
        header: { description: strings.HtmlContentPageDescription },
        groups: [
          {
            groupName: strings.ContentGroupName,
            groupFields: documentSourceFields(properties, sources, {
              textProperty: 'htmlContent',
              textLabel: strings.HtmlContentLabel,
              textDescription: strings.HtmlContentDescription,
              fileLabel: strings.HtmlFileLabel,
              urlDescription: strings.HtmlFileUrlDescription,
              urlPlaceholder: 'https://contoso.sharepoint.com/sites/team/Shared%20Documents/handbook.html'
            })
          }
        ]
      },
      {
        header: { description: strings.StylePageDescription },
        groups: [
          {
            groupName: strings.StyleGroupName,
            groupFields: styleFields(properties, styleSources)
          }
        ]
      },
      {
        header: { description: strings.AppearancePageDescription },
        groups: [
          {
            groupName: strings.ThemeGroupName,
            groupFields: themeFields(properties)
          },
          {
            groupName: strings.ReadingGroupName,
            groupFields: readingFields(properties)
          },
          {
            groupName: strings.PicturesGroupName,
            groupFields: pictureFields(properties)
          },
          {
            groupName: strings.TablesGroupName,
            groupFields: tableFields()
          }
        ]
      },
      {
        header: { description: strings.RenderPageDescription },
        groups: [
          {
            groupName: strings.RenderGroupName,
            groupFields: renderFields(properties, inAFrame)
          }
        ]
      },
      {
        header: { description: strings.ContentsPageDescription },
        groups: [
          {
            groupName: strings.ContentsGroupName,
            groupFields: contentsFields(properties)
          },
          {
            groupName: strings.LinksGroupName,
            groupFields: [
              PropertyPaneToggle('followDocumentLinks', {
                label: strings.FollowLinksLabel,
                onText: 'On',
                offText: 'Off',
                disabled: properties.contentSource !== 'library'
              }),
              PropertyPaneLabel('followLinksHint', { text: strings.FollowLinksHintHtml })
            ]
          }
        ]
      },
      {
        header: { description: strings.ChromePageDescription },
        groups: [
          {
            groupName: strings.ToolbarGroupName,
            groupFields: toolbarFields(properties)
          },
          {
            groupName: strings.FileInfoGroupName,
            groupFields: fileInfoFields(properties)
          }
        ]
      }
    ]
  };
}

/**
 * Where the shared stylesheet comes from.
 *
 * Four answers rather than the document's three, because "none" is a real
 * answer here: a document with its own `<style>` block in it needs nothing
 * from outside, and offering it an empty box to fill in would suggest
 * otherwise.
 */
function styleFields(
  properties: IMarkstrataHtmlWebPartProps,
  styleSources: IPaneSources
): IPropertyPaneField<unknown>[] {
  return [
    PropertyPaneDropdown('cssSource', {
      label: strings.CssSourceLabel,
      options: [
        { key: 'none', text: 'None, the document styles itself' },
        { key: 'manual', text: 'Type it here' },
        { key: 'library', text: 'File in a document library' },
        { key: 'url', text: 'File at a URL' }
      ],
      selectedKey: properties.cssSource
    }),
    ...(properties.cssSource === 'manual'
      ? [
          PropertyPaneTextField('cssContent', {
            label: strings.CssContentLabel,
            multiline: true,
            rows: 14,
            description: strings.CssContentDescription
          })
        ]
      : []),
    ...(properties.cssSource === 'url'
      ? [
          PropertyPaneTextField('cssFileUrl', {
            label: strings.CssFileUrlLabel,
            description: strings.CssFileUrlDescription,
            placeholder: 'https://contoso.sharepoint.com/sites/team/Style%20Library/handbook.css'
          })
        ]
      : []),
    ...(properties.cssSource === 'library'
      ? [
          PropertyPaneDropdown('selectedStyleLibrary', {
            label: strings.StyleLibraryLabel,
            options: styleSources.libraries,
            selectedKey: properties.selectedStyleLibrary
          }),
          PropertyPaneDropdown('selectedStyleFolder', {
            label: strings.StyleFolderLabel,
            options: styleSources.folders,
            selectedKey: properties.selectedStyleFolder,
            disabled: !properties.selectedStyleLibrary
          }),
          PropertyPaneDropdown('selectedStyleFile', {
            label: strings.CssFileLabel,
            options: styleSources.files,
            selectedKey: properties.selectedStyleFile,
            disabled: !properties.selectedStyleLibrary
          })
        ]
      : []),
    PropertyPaneLabel('styleHint', { text: strings.StyleHint })
  ] as IPropertyPaneField<unknown>[];
}

/**
 * Whether the document's own height can be read at all.
 *
 * Only a frame running scripts cannot be measured. Everything else is either
 * in the page or in a frame that shares the page's origin, there being no
 * script in that one to make any use of sharing it.
 */
function canMeasure(properties: IMarkstrataHtmlWebPartProps, inAFrame: boolean): boolean {
  return !(inAFrame && properties.runScripts);
}

/** Render mode, scripts, full bleed, height and narrow screens. */
function renderFields(
  properties: IMarkstrataHtmlWebPartProps,
  inAFrame: boolean
): IPropertyPaneField<unknown>[] {
  return [
    PropertyPaneDropdown('renderMode', {
      label: strings.RenderModeLabel,
      options: [
        { key: 'inline', text: 'Inline, part of the page' },
        { key: 'shadow', text: 'Shadow DOM, behind a style boundary' },
        { key: 'frame', text: 'Frame, a document of its own' }
      ],
      selectedKey: properties.renderMode
    }),
    PropertyPaneLabel('renderModeHint', { text: strings.RenderModeHint }),
    /* Scripts can only run in a frame, so outside frame mode the toggle is
       not there at all rather than sitting greyed out: an author who has not
       chosen a frame has not been offered something and refused it. */
    ...(inAFrame
      ? [
          PropertyPaneToggle('runScripts', {
            label: strings.RunScriptsLabel,
            onText: 'On',
            offText: 'Off'
          }),
          PropertyPaneLabel('runScriptsHint', { text: strings.RunScriptsHint })
        ]
      : []),
    ...(inAFrame
      ? [PropertyPaneLabel('frameLimitsHint', { text: strings.FrameLimitsHint })]
      : []),
    PropertyPaneToggle('fullBleed', {
      label: strings.FullBleedLabel,
      onText: 'On',
      offText: 'Off'
    }),
    PropertyPaneLabel('fullBleedHint', { text: strings.FullBleedHint }),
    PropertyPaneDropdown('heightMode', {
      label: strings.HeightModeLabel,
      /* "Fit content" is not offered to a frame running scripts. Such a frame
         is an opaque origin, so there is no reading its height from out here,
         and an answer that quietly behaved as one of the others would be
         worse than an answer that is not there. */
      options: (canMeasure(properties, inAFrame)
        ? [{ key: 'fit', text: 'Fit content' }]
        : []).concat([
          { key: 'fixed', text: 'Fixed' },
          { key: 'window', text: 'Full window' }
        ]),
      selectedKey: properties.heightMode
    }),
    /* The number only exists once a fixed height is asked for. */
    ...(properties.heightMode === 'fixed'
      ? [
          PropertyPaneSlider('fixedHeight', {
            label: strings.FixedHeightLabel,
            min: HEIGHT_RANGE.min,
            max: HEIGHT_RANGE.max,
            step: HEIGHT_RANGE.step,
            showValue: true
          })
        ]
      : []),
    PropertyPaneLabel('heightHint', { text: strings.HeightHint }),
    PropertyPaneToggle('showOnNarrowScreens', {
      label: strings.NarrowScreensLabel,
      onText: 'On',
      offText: 'Off'
    }),
    PropertyPaneLabel('narrowScreensHint', { text: strings.NarrowScreensHint })
  ] as IPropertyPaneField<unknown>[];
}
