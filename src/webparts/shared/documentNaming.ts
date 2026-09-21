/**
 * .SYNOPSIS
 * Turns a document's file name into the name a reader should see.
 *
 * .DESCRIPTION
 * Both web parts draw a trail of the documents a reader has followed links
 * through, and a crumb in that trail reads as a page rather than as a file:
 * "Deploy notes", not "Deploy notes.md" and not "Deploy notes.html".
 *
 * WHY THE EXTENSION IS GIVEN RATHER THAN ASSUMED
 * Every document in one web part's trail has the same extension, which is
 * exactly why it tells a reader nothing and can come off. But the two parts do
 * not agree on which extension that is, and a trail through a linked .txt or
 * .pdf keeps its extension in either of them, because there the extension is
 * the one thing saying this entry is not like the others. So the caller says
 * which extensions are its own and everything else is left alone.
 *
 * WHICH WAY THIS FAILS
 * A name this strips too much from is a crumb that reads short; a name it
 * strips nothing from reads as a file name. Neither loses the reader, and the
 * full name stays in the crumb's title attribute either way.
 *
 * A name that is nothing but an extension (".md") is handed back whole. An
 * empty crumb is a button with no label, which is worse than a blunt one.
 *
 * .USAGE
 *   import { withoutExtension } from './documentNaming';
 *   import { MARKDOWN_DOCUMENTS } from '../markstrata/utils/documentLinks';
 *
 *   withoutExtension('Deploy notes.md', MARKDOWN_DOCUMENTS);  // 'Deploy notes'
 *
 * .NOTES
 * Since:     0.0.22.0
 * Ships in:  both web part bundles
 * Requires:  nothing
 */

/**
 * The file name with a trailing extension removed, where that extension is one
 * the caller owns.
 */
export function withoutExtension(name: string, extensions: RegExp): string {
  return (name || '').replace(extensions, '') || name;
}
