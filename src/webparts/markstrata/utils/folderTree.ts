/**
 * .SYNOPSIS
 * Walks a document library's folders, including the ones inside other folders.
 *
 * .DESCRIPTION
 * SharePoint answers "what folders are in here" one folder at a time: asking a
 * library for its folders returns the folders sitting at its root and says
 * nothing about what is inside them. The property pane asked once, so an author
 * could choose `Runbooks` and never `Runbooks/Database`, and a wiki kept more
 * than one level deep could not be pointed at at all.
 *
 * Walking it means a request per folder, so two limits are kept rather than
 * asking a library to describe itself in full. Depth, because a dropdown of
 * paths eight segments long is not a thing anybody can read; and a total, so a
 * library with a folder per customer cannot sit the property pane down for a
 * thousand round trips. Both are generous next to how deep a wiki actually is,
 * and stopping early loses folders rather than hanging the pane, which is the
 * better of the two failures.
 *
 * A folder that cannot be read is not a folder that does not exist. A reader
 * may be denied one subfolder out of twenty, and the other nineteen are still
 * theirs to choose from, so a refusal is taken as "nothing below here" rather
 * than allowed to abandon the walk.
 *
 * Paths come back relative to the library root and separated by a forward
 * slash, `Runbooks/Database`, which is the shape `getMarkdownFiles` already
 * joins onto a library URL and the shape already stored in `selectedFolder`.
 * A folder chosen before any of this still reads correctly.
 *
 * .USAGE
 *   import { collectFolderPaths } from './utils/folderTree';
 *
 *   const folders: string[] = await collectFolderPaths(
 *     (relativePath) => listChildFolderNames(library, relativePath)
 *   );
 *   // ['Archive', 'Archive/2019', 'Runbooks', 'Runbooks/Database']
 *
 * .NOTES
 * Since:     0.0.19.4
 * Ships in:  the web part bundle
 * Requires:  nothing else in this project
 */

/**
 * Lists the folder names directly inside one folder, named relative to the
 * library root. The root itself is the empty string.
 *
 * Names, not paths: what SharePoint reports for a child is its own name, and
 * joining it onto where it was found is this file's business.
 */
export type ListChildFolders = (relativePath: string) => Promise<string[]>;

/**
 * How far down to walk.
 *
 * Five is past where a library stops being navigable on its own terms. A wiki
 * organised more deeply than that is one nobody finds anything in by browsing,
 * and the author can still name a deeper folder by hand.
 */
export const MAX_FOLDER_DEPTH: number = 5;

/**
 * How many folders to gather before stopping.
 *
 * Reached only by a library that is not really a wiki - one folder per
 * customer, per ticket, per day. The pane is unusable well before this, so the
 * limit is there to protect the round trips rather than the dropdown.
 */
export const MAX_FOLDERS: number = 500;

/**
 * Every folder in a library, breadth first, as paths relative to its root.
 *
 * Breadth first rather than depth first so that the shallow folders, which are
 * the ones an author is most likely to want, are the ones that survive the
 * total limit.
 *
 * One level is asked for at a time and the folders in it are asked for
 * together, so a library three deep costs three rounds of requests rather than
 * one round per folder. The result is sorted at the end, which puts a folder
 * next to the folders inside it and makes the dropdown read as a tree.
 */
export async function collectFolderPaths(
  listChildren: ListChildFolders,
  maxDepth: number = MAX_FOLDER_DEPTH,
  maxFolders: number = MAX_FOLDERS
): Promise<string[]> {
  const found: string[] = [];
  /* The root, which is the one folder whose children are asked for without it
     having been discovered first. */
  let level: string[] = [''];

  for (let depth: number = 0; depth < maxDepth && level.length > 0; depth++) {
    const listings: string[][] = await Promise.all(
      level.map((parent: string) => childrenOf(listChildren, parent))
    );

    const next: string[] = [];
    for (let i: number = 0; i < listings.length; i++) {
      const parent: string = level[i];
      const names: string[] = listings[i];

      for (let j: number = 0; j < names.length; j++) {
        if (found.length >= maxFolders) {
          return sorted(found);
        }
        const path: string = parent ? `${parent}/${names[j]}` : names[j];
        found.push(path);
        next.push(path);
      }
    }

    level = next;
  }

  return sorted(found);
}

/**
 * One folder's children, with a refusal read as an empty folder.
 *
 * A subfolder a reader cannot open throws here, and letting that through would
 * lose the whole library over one folder somebody else's permissions cover.
 */
async function childrenOf(
  listChildren: ListChildFolders,
  parent: string
): Promise<string[]> {
  try {
    const names: string[] | undefined = await listChildren(parent);
    return names || [];
  } catch {
    return [];
  }
}

/**
 * Alphabetical, compared segment by segment so a folder sorts immediately
 * before the folders inside it.
 *
 * Comparing the whole path as one string very nearly does this, and gets it
 * wrong wherever a name is a prefix of a sibling: `Runbooks/Database` sorts
 * between `Runbooks` and `Runbooks archive` on a plain comparison, which reads
 * as the deep folder belonging to the wrong parent.
 */
function sorted(paths: string[]): string[] {
  return paths.slice().sort((left: string, right: string) => {
    const a: string[] = left.split('/');
    const b: string[] = right.split('/');

    for (let i: number = 0; i < Math.min(a.length, b.length); i++) {
      const order: number = a[i].localeCompare(b[i]);
      if (order !== 0) {
        return order;
      }
    }
    return a.length - b.length;
  });
}
