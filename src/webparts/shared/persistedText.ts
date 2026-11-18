/**
 * .SYNOPSIS
 * What a Markstrata web part may write into its page, and how it gets back
 * what it wrote: the encoding, the search-text cleaning and the check for a
 * page SharePoint has already damaged.
 *
 * .DESCRIPTION
 * A page stores a web part's properties inside its own HTML, in a
 * data-sp-webpartdata attribute, and the Site Pages library runs a server-side
 * wiki-link processor over that HTML when it is saved. The processor does not
 * know it is inside an attribute. Every literal [[Name]] it finds becomes
 *
 *   <a id="4::Name|Name" class="ms-missinglink" href="...">
 *
 * and the raw quotes in that end the attribute early, the JSON after them
 * spills out as loose markup, and SharePoint's own page code throws while
 * reading it, before any web part has started. The page is blank and, because
 * the damage is in what is stored, it stays blank.
 *
 * A document that uses wiki links is exactly a document with [[ in it, so the
 * rule this module serves is blunt: nothing a Markstrata web part persists may
 * contain a literal [[ or ]]. Wiki links still work, because they are
 * resolved when the document is drawn; only what is written down changes.
 *
 * WHAT IT PROVIDES
 *   - toStoredText / fromStoredText: a reversible encoding for text that has to
 *     be kept (a document typed into the web part, a stylesheet typed into the
 *     pane, a file name). Text with doubled brackets in it is kept as base64 of its UTF-8
 *     bytes behind a marker; text without is kept as it is, so a page that was
 *     saved before this existed still loads and a document without wiki links
 *     is still readable in the page's data.
 *   - cleanSearchText: the text handed to the search index, with any brackets
 *     that survived rendering taken out of it.
 *   - isDamaged: whether a stored value already carries what the processor
 *     wrote.
 *   - storedProperties / recoverProperties: the two directions applied to a
 *     whole property bag, which is what the web part calls and what the tests
 *     check, so the shape of what is persisted can be asserted without SharePoint.
 *     Every string in the bag is covered, nested ones included: a file called
 *     "[[Draft]] plan.md" puts a [[ in selectedFile and in fileMetadata as
 *     surely as a document does.
 *   - plainText / decodeStoredInPlace: the guard for live properties, so an
 *     encoded value is never taken for the document itself.
 *
 * .USAGE
 *   import { storedProperties, recoverProperties } from './persistedText';
 *
 *   const rules = { documentKey: 'markdownContent', fileSource: false };
 *   const toWrite = storedProperties(properties, rules);   // { markdownContent: 'strata-b64:...' }
 *   const outcome = recoverProperties(deserialized, rules); // decodes in place
 *
 * .NOTES
 * Since:     0.0.24.0 (every string, and the guard, in 0.0.24.1)
 * Ships in:  both web part bundles
 * Requires:  nothing else in this project
 */

/** Marks a stored value as encoded. Plain text that begins with it is encoded too, so it can never be mistaken. */
export const STORED_PREFIX: string = 'strata-b64:';

/** Longest slice handed to String.fromCharCode at once, which has an argument limit. */
const SLICE: number = 0x8000;

const DOUBLED_BRACKETS: RegExp = /\[\[|\]\]/;

/**
 * What the wiki-link processor leaves behind: an anchor whose id starts with
 * digits and "::" and whose class is ms-missinglink, either as markup or
 * already escaped as text. Both have to be there, in the one anchor. A value
 * that only mentions the class - a stylesheet with a rule for it, a note about
 * it - is somebody's content and is not damage.
 */
const DAMAGE: RegExp =
  /(?:<|&lt;|&#0*60;|\\u003c)a\s+id=(?:\\?["']|&quot;|&#0*34;)?\d+::[\s\S]{0,2000}?ms-missinglink/i;

/** [[Page]], [[Page|Alias]] and [[Page#Heading|Alias]], on one line. */
const WIKI_LINK: RegExp = /\[\[([^[\]|\r\n]*)(?:\|([^[\]\r\n]*))?\]\]/g;

/** Whether the text has a [[ or ]] in it. */
export function hasDoubledBrackets(text: string): boolean {
  return DOUBLED_BRACKETS.test(text);
}

function toBase64(text: string): string {
  const bytes: Uint8Array = new TextEncoder().encode(text);
  let binary: string = '';
  for (let i: number = 0; i < bytes.length; i += SLICE) {
    binary += String.fromCharCode.apply(null, Array.prototype.slice.call(bytes, i, i + SLICE) as number[]);
  }
  return btoa(binary);
}

function fromBase64(encoded: string): string {
  const binary: string = atob(encoded);
  const bytes: Uint8Array = new Uint8Array(binary.length);
  for (let i: number = 0; i < binary.length; i++) {
    bytes[i] = binary.charCodeAt(i);
  }
  return new TextDecoder('utf-8', { fatal: true }).decode(bytes);
}

/**
 * The form of a text that is safe to write into a page.
 *
 * Encoded only when it has to be: when it holds a [[ or ]], or when it starts
 * with the marker, which would otherwise read back as something it is not.
 * Everything else is returned untouched.
 */
export function toStoredText(text: string): string {
  if (!text) {
    return text;
  }
  if (hasDoubledBrackets(text) || text.indexOf(STORED_PREFIX) === 0) {
    return STORED_PREFIX + toBase64(text);
  }
  return text;
}

/**
 * The text a stored value stands for, or undefined when it begins with the
 * marker and is not valid after it - which is a value somebody has edited by
 * hand, and not one to guess at.
 */
export function fromStoredText(stored: string): string | undefined {
  if (!stored || stored.indexOf(STORED_PREFIX) !== 0) {
    return stored;
  }
  try {
    return fromBase64(stored.substring(STORED_PREFIX.length));
  } catch {
    return undefined;
  }
}

/** Whether a stored value carries what the server-side wiki-link processor writes. */
export function isDamaged(stored: string): boolean {
  return typeof stored === 'string' && DAMAGE.test(stored);
}

/**
 * Text for the search index, with no [[ or ]] left in it.
 *
 * The rendered document already shows a wiki link as its label, so most text
 * arrives clean. What does not is what rendering leaves alone on purpose, such
 * as a link inside a code span. A link that survives is reduced to what a
 * reader would see, and any other doubled bracket is broken with a space, which
 * is enough: the processor only matches them together.
 */
export function cleanSearchText(text: string): string {
  if (!text) {
    return '';
  }
  return text
    .replace(WIKI_LINK, (whole: string, page: string, alias: string | undefined) =>
      (alias !== undefined && alias.trim() ? alias : page).trim())
    .replace(/\[(?=\[)/g, '[ ')
    .replace(/\](?=\])/g, '] ');
}

/** Which property holds the document, and whether the document is the page's to keep. */
export interface IPersistedTextRules {
  /** The property the document itself is kept in. */
  documentKey: string;
  /** The document comes from a file, so the page must not keep a copy of it. */
  fileSource: boolean;
}

type Bag = Record<string, unknown>;

/** The one property that is cleaned instead of encoded: it is for the search index, not for reading back. */
const SEARCH_KEY: string = 'searchablePlainText';

function needsEncoding(text: string): boolean {
  return hasDoubledBrackets(text) || text.indexOf(STORED_PREFIX) === 0;
}

/**
 * A copy of the value with every string in it that needs encoding encoded, or
 * the value itself, untouched, when none does. Objects and arrays are walked;
 * nothing is changed in place.
 */
function encodeDeep(value: unknown): unknown {
  if (typeof value === 'string') {
    return needsEncoding(value) ? toStoredText(value) : value;
  }
  if (Array.isArray(value)) {
    const items: unknown[] = value.map(encodeDeep);
    return items.some((item: unknown, i: number) => item !== value[i]) ? items : value;
  }
  if (value && typeof value === 'object') {
    const source: Bag = value as Bag;
    const copy: Bag = {};
    let changed: boolean = false;
    Object.keys(source).forEach((key: string) => {
      copy[key] = encodeDeep(source[key]);
      changed = changed || copy[key] !== source[key];
    });
    return changed ? copy : value;
  }
  return value;
}

/**
 * What to write into the page for each property that has to change.
 *
 * Only the top-level keys that change are returned, each with a new value (a
 * string, or a copy of the object or array it was inside), so the caller can
 * swap them in without anything nested being touched. A document that comes
 * from a file is written as nothing at all - the file is read again when the
 * page loads. Every other string, wherever it is, is encoded if it has a [[ or
 * ]] in it or begins with the marker. The search text is cleaned.
 */
export function storedProperties(properties: Bag, rules: IPersistedTextRules): Record<string, unknown> {
  const write: Record<string, unknown> = {};

  Object.keys(properties).forEach((key: string) => {
    const value: unknown = properties[key];
    let next: unknown;
    if (key === rules.documentKey && rules.fileSource && typeof value === 'string') {
      next = '';
    } else if (key === SEARCH_KEY && typeof value === 'string') {
      next = cleanSearchText(value);
    } else {
      next = encodeDeep(value);
    }
    if (next !== value) {
      write[key] = next;
    }
  });
  return write;
}

/** What reading a saved property bag found. */
export interface IRecovery {
  /** Top-level keys whose stored value was damaged or unreadable and has been discarded. */
  discarded: string[];
}

/** The text a stored value stands for; nothing at all when it cannot be read. For reading live properties. */
export function plainText(value: string): string {
  const text: string | undefined = fromStoredText(value);
  return text === undefined ? '' : text;
}

/**
 * Decodes every encoded string in the value, wherever it is, returning the new
 * value (or the same one when nothing was encoded). A string that cannot be
 * decoded, or is damaged, becomes empty and is counted in `lost`.
 */
function decodeDeep(value: unknown, checkDamage: boolean, lost: { count: number }): unknown {
  if (typeof value === 'string') {
    if (checkDamage && isDamaged(value)) {
      lost.count++;
      return '';
    }
    if (value.indexOf(STORED_PREFIX) === 0) {
      const text: string | undefined = fromStoredText(value);
      if (text === undefined) {
        lost.count++;
        return '';
      }
      return text;
    }
    return value;
  }
  if (Array.isArray(value)) {
    return value.map((item: unknown) => decodeDeep(item, checkDamage, lost));
  }
  if (value && typeof value === 'object') {
    const source: Bag = value as Bag;
    const copy: Bag = {};
    Object.keys(source).forEach((key: string) => {
      copy[key] = decodeDeep(source[key], checkDamage, lost);
    });
    return copy;
  }
  return value;
}

/**
 * The guard for live properties: decodes any encoded string left in the bag,
 * in place, so one is never mistaken for the document. A no-op on a bag that
 * holds only plain values, which is nearly always.
 */
export function decodeStoredInPlace(properties: Bag): void {
  Object.keys(properties).forEach((key: string) => {
    if (key !== SEARCH_KEY) {
      properties[key] = decodeDeep(properties[key], false, { count: 0 });
    }
  });
}

/**
 * Turns a deserialized property bag back into what the web part works with,
 * in place.
 *
 * A stored value, anywhere in the bag, that is damaged or that claims to be
 * encoded and is not, is emptied and its top-level key reported rather than
 * passed on. A document that comes from a file is emptied as well, without
 * being reported: pages saved before the document stopped being kept have a
 * copy of it in the page, and it is dropped so that saving the page again
 * cleans it out. Plain values, as every release before this one wrote them,
 * are left exactly as they are.
 */
export function recoverProperties(properties: Bag, rules: IPersistedTextRules): IRecovery {
  const discarded: string[] = [];

  Object.keys(properties).forEach((key: string) => {
    const value: unknown = properties[key];
    if (key === SEARCH_KEY) {
      /* Regenerated from the rendered document, so a damaged copy is simply
         dropped and is not a reason to say anything. */
      if (typeof value === 'string' && value && isDamaged(value)) {
        properties[key] = '';
      }
      return;
    }
    if (key === rules.documentKey && rules.fileSource) {
      if (typeof value === 'string') {
        properties[key] = '';
      }
      return;
    }
    const lost: { count: number } = { count: 0 };
    const next: unknown = decodeDeep(value, true, lost);
    if (next !== value) {
      properties[key] = next;
    }
    if (lost.count > 0) {
      discarded.push(key);
    }
  });
  return { discarded };
}
