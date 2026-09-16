/**
 * .SYNOPSIS
 * Showing a Word, Excel or PowerPoint file from the library inside a document,
 * read only, with the way through to the real editor beside it.
 *
 * .DESCRIPTION
 * `![[Quarterly report.docx]]` in a markdown document names a file in the same
 * library. Until now that rendered as a link with a mark on it, which is a
 * link to a download: the reader either gets a file or loses the page they
 * were on.
 *
 * What is drawn instead is a card: the file's name, what kind of file it is,
 * a preview of it, and a link that opens it in Word for the web where it can
 * be edited by anybody allowed to. The preview is SharePoint's own, in a frame,
 * so the document is never copied anywhere and a reader who may not open the
 * file sees SharePoint refuse rather than the contents.
 *
 * TWO THINGS ARE WORTH KNOWING BEFORE READING THE CODE.
 *
 * The preview frame is addressed by the file's UNIQUE ID, not by its path.
 * `/_layouts/15/Doc.aspx?sourcedoc={guid}&action=embedview` is the address
 * SharePoint itself produces from File, Share, Embed, and the id has to be
 * fetched before the frame can be built. So the card is drawn first with what
 * is already known, and the preview arrives into it afterwards, the same way
 * wiki link checking and Mermaid diagrams do.
 *
 * And the frame can be refused. Office for the web sets frame-ancestors, and a
 * tenant can be configured in ways that block it; there is nothing this code
 * can do about that and no reliable way to detect it from the outside, because
 * a cross-origin frame does not report what happened inside it. So the card is
 * built the other way up from how it looks: the LINK is the feature and the
 * preview is the enhancement. If the frame shows nothing, the name and the way
 * into the editor are still sitting there, which is strictly better than the
 * link this replaced.
 *
 * .USAGE
 *   import { isOfficeDocument, officeKind, embedAddress } from './utils/officeEmbeds';
 *
 *   if (isOfficeDocument(href)) {
 *     const id = await sharePoint.getFileId(pathOf(href));
 *     frame.src = embedAddress(webUrl, id);
 *   }
 *
 * .NOTES
 * Since:     unreleased
 * Ships in:  the web part bundle
 * Requires:  nothing else in this project
 */

/** What kind of thing a file is, as a reader would name it. */
export type OfficeKind = 'Word' | 'Excel' | 'PowerPoint';

const KINDS: { [extension: string]: OfficeKind } = {
  doc: 'Word', docx: 'Word', docm: 'Word',
  xls: 'Excel', xlsx: 'Excel', xlsm: 'Excel', xlsb: 'Excel',
  ppt: 'PowerPoint', pptx: 'PowerPoint', pptm: 'PowerPoint'
};

/** The extension of whatever a href points at, lower case and without the dot. */
function extensionOf(href: string): string {
  const path: string = (href || '').split('#')[0].split('?')[0];
  const name: string = path.slice(path.lastIndexOf('/') + 1);
  const dot: number = name.lastIndexOf('.');
  return dot === -1 ? '' : name.slice(dot + 1).toLowerCase();
}

export function isOfficeDocument(href: string): boolean {
  return officeKind(href) !== undefined;
}

export function officeKind(href: string): OfficeKind | undefined {
  return KINDS[extensionOf(href)];
}

/**
 * The address of the read-only preview.
 *
 * `webUrl` is the site the web part is on, server relative, as SharePoint
 * reports it. The id is the file's UniqueId, and the braces around it are part
 * of the format rather than decoration: this is the address SharePoint's own
 * Embed dialog produces, and it is fussy about the shape.
 *
 * Returns empty when either half is missing, which is the signal not to build
 * a frame at all rather than to build one pointing nowhere.
 */
export function embedAddress(webUrl: string, fileId: string): string {
  if (!webUrl || !fileId) {
    return '';
  }
  const site: string = webUrl.replace(/\/+$/, '');
  const braced: string = fileId.charAt(0) === '{' ? fileId : `{${fileId}}`;
  return `${site}/_layouts/15/Doc.aspx?sourcedoc=${encodeURIComponent(braced)}&action=embedview`;
}

/**
 * Where the link goes: the file itself.
 *
 * Deliberately not an `action=edit` address. A reader who may only read gets
 * sent to an editor they cannot use, and the file's own URL is what SharePoint
 * already knows how to answer: it opens Word for the web for somebody who can
 * edit and the viewer for somebody who cannot, which is the decision SharePoint
 * should be making rather than this code.
 */
export function openAddress(href: string): string {
  return href;
}

/**
 * What to call a file when there is nothing else to call it by.
 *
 * The label from the markdown wins where the author wrote one; this is the
 * fallback, and it is the file name decoded, because a href is encoded and
 * "Quarterly%20report.docx" is not a name anybody gave anything.
 */
export function nameFromHref(href: string): string {
  const path: string = (href || '').split('#')[0].split('?')[0];
  const name: string = path.slice(path.lastIndexOf('/') + 1);
  try {
    return decodeURIComponent(name);
  } catch {
    return name;
  }
}
