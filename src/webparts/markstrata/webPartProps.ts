/**
 * .SYNOPSIS
 * What an author has configured on the markdown web part, as one shape.
 *
 * .DESCRIPTION
 * Apart on its own because two files need it and neither should have to import
 * the other for it: the web part, which owns the values, and the property
 * pane, which draws them.
 *
 * Most of what an author sets is not about markdown at all - where the file
 * comes from, the theme, the toolbar, how an export is laid out - and that
 * half lives in IStrataWebPartProps, which the HTML web part shares. What is
 * left here is what only means something to markdown: its code fences, its
 * diagrams, its maths, its wiki links, and whether the raw HTML an author
 * wrote inside it is allowed through.
 *
 * So the two files read together are still the one place to look to see
 * everything this web part can be told to do. The shared half first.
 *
 * .USAGE
 *   import { IMarkstrataWebPartProps } from './webPartProps';
 *
 *   export default class MarkstrataWebPart
 *     extends StrataWebPart<IMarkstrataWebPartProps> { }
 *
 * .NOTES
 * Since:     0.0.17.0
 * Ships in:  the web part bundle
 * Requires:  strataWebPartProps.ts, mermaidConfig.ts, codeBlocks.ts
 */

import { IStrataWebPartProps } from '../shared/strataWebPartProps';
import { DiagramWidth } from './utils/mermaidConfig';
import { CodeHeight } from './utils/codeBlocks';

export interface IMarkstrataWebPartProps extends IStrataWebPartProps {
  /**
   * The markdown itself.
   *
   * Named for what it holds rather than called "content", because the
   * property pane shows the name to an author and the search index carries it.
   * StrataWebPart reaches it through its documentText accessor.
   */
  markdownContent: string;

  // Code blocks
  enableSyntaxHighlighting: boolean;
  showCodeHeader: boolean;
  showLineNumbers: boolean;
  wrapCodeLines: boolean;
  codeHeight: CodeHeight;

  // Diagrams and maths, both of which are fenced markdown constructs
  enableMermaid: boolean;
  diagramWidth: DiagramWidth;
  enableMath: boolean;

  /** Heading anchors, which markdown-it generates from the heading text. */
  enableAnchors: boolean;

  // Wiki links and tags: markdown syntax with no HTML equivalent
  enableWikiLinks: boolean;
  checkWikiLinks: boolean;
  enableTags: boolean;

  /**
   * Whether raw HTML an author wrote inside the markdown is rendered.
   *
   * Off by default, and markdown-only by nature: in the HTML web part the
   * whole document is HTML, so there is nothing for a switch to allow. What
   * that web part does instead is sanitise always.
   */
  allowHtml: boolean;
}
