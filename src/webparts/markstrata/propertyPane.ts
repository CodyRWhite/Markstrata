/**
 * .SYNOPSIS
 * The property pane: what an author sees when they edit the web part.
 *
 * .DESCRIPTION
 * It lives here rather than in the web part because it is a literal that
 * describes settings, while the web part is the thing that renders a document -
 * and because it has no need of anything else in there. Given the properties
 * and the libraries, folders and files SharePoint has reported, the pane is the
 * same every time.
 *
 * The pages are laid out by what somebody came to change rather than by what
 * the code calls things. Appearance holds the theme, the measure, the pictures
 * and the page itself; code blocks, diagrams, tables and maths share a page,
 * since all of those are things a document puts in the middle of its text;
 * Contents keeps the table of contents and the links between documents,
 * because finding your way inside a document and finding your way between them
 * are the same errand; and what is left is what is drawn around the document.
 *
 * WHAT IS HERE AND WHAT IS IN paneFields
 * The pages and the groups are here, because that layout is this web part's
 * own and the HTML web part's pages are not the same pages. The controls
 * inside a group that both parts show - the theme, the measure, the pictures,
 * the contents list, the toolbar, the file footer - come from paneFields, so
 * there is one of each rather than two that drift. What is left written out
 * below is what only markdown has: its code fences, its diagrams, its maths,
 * its wiki links and its tags.
 *
 * .USAGE
 *   import { paneConfiguration } from './propertyPane';
 *
 *   protected getPropertyPaneConfiguration(): IPropertyPaneConfiguration {
 *     return paneConfiguration(this.properties, {
 *       libraries: this.libraryOptions, folders: this.folderOptions, files: this.fileOptions
 *     });
 *   }
 *
 * .NOTES
 * Since:     0.0.17.0
 * Ships in:  the web part bundle
 * Requires:  webPartProps.ts, paneFields.ts, mermaidConfig.ts, codeBlocks.ts
 */

import {
  IPropertyPaneConfiguration,
  PropertyPaneDropdown,
  PropertyPaneToggle,
  PropertyPaneLabel
} from '@microsoft/sp-property-pane';
import * as strings from 'MarkstrataWebPartStrings';

import { IMarkstrataWebPartProps } from './webPartProps';
import {
  IPaneSources,
  toDropdown,
  documentSourceFields,
  themeFields,
  readingFields,
  pictureFields,
  pageFields,
  contentsFields,
  tableFields,
  toolbarFields,
  fileInfoFields
} from '../shared/paneFields';
import { CODE_SIZES } from './utils/ThemeManager';

export { IPaneSources };

/**
 * The five pages of the property pane.
 *
 * A pure function of the properties and of what SharePoint has told us is in
 * the site: the same settings in, the same pane out. It is a function rather
 * than a method because nothing about laying a pane out needs the web part -
 * and because a pane's worth of literal inside a class is where a class stops
 * being readable.
 */
export function paneConfiguration(
  properties: IMarkstrataWebPartProps,
  sources: IPaneSources
): IPropertyPaneConfiguration {
  return {
    pages: [
      {
        header: { description: strings.ContentPageDescription },
        groups: [
          {
            groupName: strings.ContentGroupName,
            groupFields: documentSourceFields(properties, sources, {
              textProperty: 'markdownContent',
              textLabel: strings.MarkdownContentLabel,
              textDescription: strings.MarkdownContentDescription,
              fileLabel: strings.FileLabel,
              urlDescription: strings.FileUrlDescription,
              urlPlaceholder: 'https://contoso.sharepoint.com/sites/team/Shared%20Documents/readme.md'
            })
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
            groupName: strings.PageGroupName,
            groupFields: pageFields()
          }
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
              }),
              PropertyPaneDropdown('codeHeight', {
                label: strings.CodeHeightLabel,
                options: [
                  { key: 'full', text: 'As tall as the code' },
                  { key: 'short', text: 'Short, about ten lines' },
                  { key: 'medium', text: 'Medium, about twenty-five lines' }
                ],
                selectedKey: properties.codeHeight
              }),
              PropertyPaneLabel('codeHeightHint', { text: strings.CodeHeightHint })
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
            groupFields: tableFields()
          }
        ]
      },
      {
        header: { description: strings.ContentsPageDescription },
        groups: [
          {
            groupName: strings.ContentsGroupName,
            groupFields: [
              ...contentsFields(properties),
              /* Last, and markdown's alone: these anchors are put on by
                 markdown-it as it renders. An HTML document's headings are
                 given ids too, but by walking the rendered document rather
                 than by a setting, because without them nothing at all could
                 link to a section. */
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
              /* Beside the wiki links rather than on a page of its own: both
                 are how a folder of notes says what belongs with what, and
                 somebody turning one on has come here for the other. */
              PropertyPaneToggle('enableTags', {
                label: strings.TagsLabel,
                onText: 'On',
                offText: 'Off'
              }),
              PropertyPaneLabel('tagsHint', { text: strings.TagsHint }),
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
