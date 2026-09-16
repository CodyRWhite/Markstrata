/**
 * .SYNOPSIS
 * Invented files that live at an address rather than in the stand-in library.
 *
 * .DESCRIPTION
 * A fence can name a `src` and have its code fetched from there. Both harness
 * pages need something at that address: index.html hands ViewModeRenderer a
 * fetchCode of its own, and webpart.html goes through MarkstrataWebPart into
 * harness/spfx/sharePoint.ts. One copy here rather than two that drift.
 *
 * Nothing reaches the network. The addresses are made up, the file under them
 * is written for this harness, and the map is keyed by the address the fetch
 * actually asks for - the raw host, after remoteDocuments' fetchableUrl has
 * translated the github.com blob link a person would paste.
 *
 * .USAGE
 *   import { REMOTE_CODE, fetchRemoteCode } from './fixtures';
 *
 *   await fetchRemoteCode('https://raw.githubusercontent.com/contoso/...');
 *
 * .NOTES
 * Since:     0.0.19.0
 * Ships in:  nothing - it stands in for another server at harness time
 * Requires:  nothing else in this project
 */

/** The blob address a document writes, the way a browser hands it over. */
export const CODE_BLOB_URL: string =
  'https://github.com/contoso/tools/blob/main/src/cache.ts';

/** And where fetchableUrl sends the request instead. */
export const CODE_RAW_URL: string =
  'https://raw.githubusercontent.com/contoso/tools/main/src/cache.ts';

/*
 * Long enough that a line fragment is worth writing: a runbook quoting this
 * file wants the eviction, not the twenty lines of plumbing around it.
 */
const CACHE_TS: string = [
  'export interface IEntry<T> {',
  '  value: T;',
  '  storedAt: number;',
  '}',
  '',
  '/** A map that forgets an entry once it is older than its time to live. */',
  'export class Cache<T> {',
  '  private readonly entries: Map<string, IEntry<T>> = new Map();',
  '',
  '  public constructor(private readonly ttlMs: number) {}',
  '',
  '  public get(key: string): T | undefined {',
  '    const entry = this.entries.get(key);',
  '    if (!entry) {',
  '      return undefined;',
  '    }',
  '    if (Date.now() - entry.storedAt > this.ttlMs) {',
  '      this.entries.delete(key);',
  '      return undefined;',
  '    }',
  '    return entry.value;',
  '  }',
  '',
  '  public set(key: string, value: T): void {',
  '    this.entries.set(key, { value: value, storedAt: Date.now() });',
  '  }',
  '}',
  ''
].join('\n');

/** Everything reachable by address, keyed by the address that returns it. */
export const REMOTE_CODE: { [url: string]: string } = {
  [CODE_RAW_URL]: CACHE_TS
};

/**
 * The stand-in for a fetch across origins.
 *
 * An address nothing is stored under is rejected, which is what the failing
 * half of the feature needs: a block that cannot reach its file has to say so
 * rather than stay empty.
 */
export function fetchRemoteCode(url: string): Promise<string> {
  const stored: string | undefined = REMOTE_CODE[url];
  if (stored === undefined) {
    return Promise.reject(new Error(`Nothing at ${url}`));
  }
  return Promise.resolve(stored);
}
