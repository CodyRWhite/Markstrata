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
 *     pane). Text with doubled brackets in it is kept as base64 of its UTF-8
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
 *
 * .USAGE
 *   import { storedProperties, recoverProperties } from './persistedText';
 *
 *   const rules = { documentKey: 'markdownContent', textKeys: [], fileSource: false };
 *   const toWrite = storedProperties(properties, rules);   // { markdownContent: 'strata-b64:...' }
 *   const outcome = recoverProperties(deserialized, rules); // decodes in place
 *
 * .NOTES
 * Since:     0.0.24.0
 * Ships in:  both web part bundles
 * Requires:  nothing else in this project
 */

/** Marks a stored value as encoded. Plain text that begins with it is encoded too, so it can never be mistaken. */
export const STORED_PREFIX: string = 'strata-b64:';

/** Longest slice handed to String.fromCharCode at once, which has an argument limit. */
const SLICE: number = 0x8000;

const DOUBLED_BRACKETS: RegExp = /\[\[|\]\]/;

/**
 * What the wiki-link processor leaves behind, or what the damaged page leaves
 * in a value that SharePoint could still parse: its class, or its anchor with
 * the numeric id prefix, either as markup or already escaped as text.
 */
const DAMAGE: RegExp = /ms-missinglink|(?:<|&lt;|&#60;)a\s+id=\\?["']?\d+::/i;

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

/** Which properties hold text, and whether the document is the page's to keep. */
export interface IPersistedTextRules {
  /** The property the document itself is kept in. */
  documentKey: string;
  /** Other free text the web part keeps, a stylesheet for one. */
  textKeys: string[];
  /** The document comes from a file, so the page must not keep a copy of it. */
  fileSource: boolean;
}

type Bag = Record<string, unknown>;

/**
 * What to write into each text property when the page is saved.
 *
 * Only the keys that change are returned. A document that comes from a file is
 * written as nothing at all - the file is read again when the page loads -
 * and every other text is encoded if it needs to be. The search text is
 * cleaned.
 */
export function storedProperties(properties: Bag, rules: IPersistedTextRules): Record<string, string> {
  const write: Record<string, string> = {};
  const note = (key: string, value: string): void => {
    if (properties[key] !== value) {
      write[key] = value;
    }
  };

  const document: unknown = properties[rules.documentKey];
  if (typeof document === 'string') {
    note(rules.documentKey, rules.fileSource ? '' : toStoredText(document));
  }
  rules.textKeys.forEach((key: string) => {
    const value: unknown = properties[key];
    if (typeof value === 'string') {
      note(key, toStoredText(value));
    }
  });
  const search: unknown = properties.searchablePlainText;
  if (typeof search === 'string') {
    note('searchablePlainText', cleanSearchText(search));
  }
  return write;
}

/** What reading a saved property bag found. */
export interface IRecovery {
  /** Keys whose stored value was damaged or unreadable and has been discarded. */
  discarded: string[];
}

/**
 * Turns a deserialized property bag back into what the web part works with,
 * in place.
 *
 * A stored value that is damaged, or that claims to be encoded and is not, is
 * emptied and reported rather than passed on. A document that comes from a
 * file is emptied as well, without being reported: pages saved before the
 * document stopped being kept have a copy of it in the page, and it is
 * dropped so that saving the page again cleans it out.
 */
export function recoverProperties(properties: Bag, rules: IPersistedTextRules): IRecovery {
  const discarded: string[] = [];

  const read = (key: string): void => {
    const stored: unknown = properties[key];
    if (typeof stored !== 'string' || !stored) {
      return;
    }
    if (isDamaged(stored)) {
      properties[key] = '';
      discarded.push(key);
      return;
    }
    const text: string | undefined = fromStoredText(stored);
    if (text === undefined) {
      properties[key] = '';
      discarded.push(key);
      return;
    }
    properties[key] = text;
  };

  if (rules.fileSource) {
    if (typeof properties[rules.documentKey] === 'string') {
      properties[rules.documentKey] = '';
    }
  } else {
    read(rules.documentKey);
  }
  rules.textKeys.forEach(read);

  /* The search text is regenerated from the rendered document, so a damaged
     copy is simply dropped and is not a reason to say anything. */
  const search: unknown = properties.searchablePlainText;
  if (typeof search === 'string' && search && isDamaged(search)) {
    properties.searchablePlainText = '';
  }
  return { discarded };
}
