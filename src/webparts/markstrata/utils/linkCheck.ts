/**
 * .SYNOPSIS
 * Marking wiki links whose target is not in the library, the way Obsidian
 * marks an unresolved link.
 *
 * .DESCRIPTION
 * Done after rendering rather than during it, because it needs SharePoint and
 * rendering is a string going in and a string coming out.
 *
 * .USAGE
 *   import { validateWikiLinks } from './utils/linkCheck';
 *
 *   // Left to settle on its own: the document is readable while this is in flight.
 *   void validateWikiLinks(article, (folder) => sharePoint.listFolderFileNames(folder));
 *
 * .NOTES
 * Since:     unreleased
 * Ships in:  the web part bundle
 * Requires:  wikiLinks.ts
 */

import { byFolder, folderOf, fileOf } from './wikiLinks';

/**
 * Links are grouped by folder first, so a document pointing at its neighbours
 * costs one listing rather than one request per link.
 *
 * A folder that cannot be read leaves its links alone. Not knowing whether a
 * page is there is different from knowing it is not, and a reader without
 * access to a folder must not be told the author's links are broken.
 */
export async function validateWikiLinks(
  container: HTMLElement,
  listFolder: (folder: string) => Promise<string[] | undefined>
): Promise<void> {
  const links: HTMLAnchorElement[] =
    Array.prototype.slice.call(container.querySelectorAll('a.strata-wiki-link'));
  /* A link into this document points at a heading, which is already either
     there or not without asking anybody. */
  const outward: HTMLAnchorElement[] = links.filter((link: HTMLAnchorElement) =>
    folderOf(link.getAttribute('href') || '') !== '');
  if (!outward.length) {
    return;
  }

  const folders: string[] = Object.keys(
    byFolder(outward.map((link: HTMLAnchorElement) => link.getAttribute('href') || ''))
  );

  const listings: { [folder: string]: string[] | undefined } = {};
  await Promise.all(folders.map((folder: string) =>
    listFolder(folder).then((names: string[] | undefined) => {
      listings[folder] = names;
    })
  ));

  outward.forEach((link: HTMLAnchorElement) => {
    const href: string = link.getAttribute('href') || '';
    const names: string[] | undefined = listings[folderOf(href)];
    if (!names) {
      return;
    }
    const wanted: string = fileOf(href).toLowerCase();
    /* SharePoint file names are not case sensitive, so neither is this. */
    if (names.some((name: string) => name.toLowerCase() === wanted)) {
      return;
    }
    link.classList.add('strata-wiki-link--missing');
    /* Worded for what was actually established: the file was not in the
       listing, which covers both not being there and not being visible to this
       reader. */
    link.title = `${fileOf(href)} was not found in this library`;

    /* The styling says it to anyone who can see it; this says it to anyone who
       cannot. Inside the link, so it is read out with the link text. */
    if (!link.querySelector('.strata-missing-note')) {
      const note: HTMLElement = document.createElement('span');
      note.className = 'strata-missing-note';
      note.textContent = ' (page not found)';
      link.appendChild(note);
    }
  });
}
