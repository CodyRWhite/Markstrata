/**
 * .SYNOPSIS
 * Rewrites an author's stylesheet so it can only reach the web part's own
 * content.
 *
 * .DESCRIPTION
 * The HTML web part lets an author point at a stylesheet, so that one sheet can
 * dress a whole folder of documents. Injected as written, that sheet styles the
 * SharePoint page around it: `body { font-family: Comic Sans }` is not a
 * document's business, and two HTML web parts on one page would fight over
 * every selector they share.
 *
 * So every selector is prefixed with the web part's own root, and the handful
 * of selectors that mean "the whole document" are rewritten to mean "this web
 * part" instead.
 *
 *   .note          ->  .strata-root[data-strata-id="x"] .note
 *   body           ->  .strata-root[data-strata-id="x"]
 *   :root          ->  .strata-root[data-strata-id="x"]
 *
 * WHAT THIS IS AND IS NOT
 * It is containment, not a security boundary. The boundary is htmlSanitiser,
 * which takes the scripting out, and the render modes: Shadow DOM seals styles
 * structurally and an iframe seals everything. A selector this fails to prefix
 * leaks styling onto the page, which is untidy; it does not run code. Inline
 * mode says as much in the property pane, because leaking both ways is what
 * inline rendering is.
 *
 * WHY NOT THE BROWSER'S OWN PARSER
 * Because the tests would then be measuring jsdom rather than Chromium. A rule
 * jsdom does not understand is dropped from its cssRules, so a stylesheet would
 * pass every test here and quietly lose rules in a tenant. This tokeniser
 * understands selectors and blocks and nothing else, and emits anything it does
 * not recognise unchanged - so the failure it can have is a rule that stays
 * broader than intended, which is visible, rather than a rule that vanishes,
 * which is not.
 *
 * WHAT IS DROPPED, AND WHY ONLY THESE
 *   @import   fetches a stylesheet from wherever it names, at render time, with
 *             the reader's browser. That is a network request an author of a
 *             document should not be making on a reader's behalf, and it is the
 *             one at-rule that can pull in rules this function never sees.
 *   @charset  meaningless in an injected string and invalid anywhere but the
 *             very start of a sheet.
 *
 * .USAGE
 *   import { scopeCss } from './scopedCss';
 *
 *   scopeCss('body { margin: 0 } .note { color: red }', '.strata-root');
 *   //  -> '.strata-root { margin: 0 } .strata-root .note { color: red }'
 *
 * .NOTES
 * Since:     0.0.22.0
 * Ships in:  the HTML web part bundle
 * Requires:  nothing else in this project
 */

/**
 * Selectors that mean "everything" and have to be read as "everything of
 * ours". Left alone they would either do nothing, having no ancestor to match,
 * or reach the page.
 */
const WHOLE_DOCUMENT: string[] = [':root', 'html', 'body', ':host'];

/**
 * At-rules whose block holds style rules, so the rules inside need scoping
 * while the at-rule itself is kept.
 */
const NESTS_STYLE_RULES: string[] = ['media', 'supports', 'container', 'layer', 'scope'];

/**
 * At-rules whose block is not selectors at all: keyframe offsets, font
 * descriptors, page margins. Emitted exactly as written, because prefixing
 * anything inside them would break them.
 */
const NOT_SELECTORS: string[] = [
  'keyframes', 'font-face', 'page', 'property', 'counter-style',
  'font-feature-values', 'viewport'
];

/** At-rules taken out entirely. See the header for why these two. */
const DROPPED: string[] = ['import', 'charset'];

/**
 * An author's stylesheet, rewritten so it only reaches `root`.
 *
 * `root` is a selector, not an element: the caller decides whether that is a
 * class, an id or an attribute, and this only has to paste it in front.
 */
export function scopeCss(css: string, root: string): string {
  if (!css || !css.trim()) {
    return '';
  }
  return rewriteBlock(stripComments(css), root).trim();
}

/**
 * Comments out of the way first.
 *
 * Not for tidiness: a comment can hold a brace or a quote, and everything below
 * counts both. `/* } *\/` inside a rule would otherwise end it early and the
 * rest of the sheet would be scoped against the wrong nesting.
 */
export function stripComments(css: string): string {
  let out: string = '';
  let index: number = 0;

  while (index < css.length) {
    const two: string = css.substr(index, 2);
    if (two === '/*') {
      const end: number = css.indexOf('*/', index + 2);
      index = end === -1 ? css.length : end + 2;
      continue;
    }
    /* A quoted string may hold /* and must survive it. */
    const character: string = css.charAt(index);
    if (character === '"' || character === "'") {
      const close: number = endOfString(css, index);
      out += css.slice(index, close);
      index = close;
      continue;
    }
    out += character;
    index += 1;
  }
  return out;
}

/**
 * One level of a stylesheet: a run of rules and at-rules, scoped.
 *
 * Called again for the inside of an `@media`, which is why it is its own
 * function rather than the body of scopeCss.
 */
function rewriteBlock(css: string, root: string): string {
  let out: string = '';
  let index: number = 0;

  while (index < css.length) {
    /* Whitespace between rules is kept, so the output is still readable in a
       browser's inspector when somebody is working out why a rule did not
       apply. */
    const character: string = css.charAt(index);
    if (/\s/.test(character)) {
      out += character;
      index += 1;
      continue;
    }

    if (character === '@') {
      const rule: IAtRule | undefined = readAtRule(css, index);
      if (!rule) {
        /* Not something this understands. Emitted whole rather than guessed
           at: see the header on failing visibly. */
        out += css.slice(index);
        break;
      }
      out += rewriteAtRule(rule, root);
      index = rule.end;
      continue;
    }

    const rule: IStyleRule | undefined = readStyleRule(css, index);
    if (!rule) {
      out += css.slice(index);
      break;
    }
    out += `${scopeSelectorList(rule.selectors, root)} {${rule.body}}`;
    index = rule.end;
  }

  return out;
}

interface IStyleRule {
  selectors: string;
  body: string;
  end: number;
}

interface IAtRule {
  name: string;
  prelude: string;
  /** Undefined for a statement at-rule, which ends at its semicolon. */
  body: string | undefined;
  end: number;
}

/** A selector list and its declarations, from `at` to past the closing brace. */
function readStyleRule(css: string, at: number): IStyleRule | undefined {
  const open: number = findTopLevel(css, at, '{');
  if (open === -1) {
    return undefined;
  }
  const close: number = matchingBrace(css, open);
  if (close === -1) {
    return undefined;
  }
  return {
    selectors: css.slice(at, open),
    body: css.slice(open + 1, close),
    end: close + 1
  };
}

/** An at-rule: its name, whatever sits before its block, and its block. */
function readAtRule(css: string, at: number): IAtRule | undefined {
  const nameMatch: RegExpExecArray | null = /^@([A-Za-z-]+)/.exec(css.slice(at));
  if (!nameMatch) {
    return undefined;
  }
  const name: string = nameMatch[1].toLowerCase();
  const open: number = findTopLevel(css, at, '{');
  const semicolon: number = findTopLevel(css, at, ';');

  /* A statement at-rule has no block: @import url(x); and friends. Which comes
     first decides which this is, and either may be absent at the end of a
     truncated sheet. */
  const isStatement: boolean = open === -1 || (semicolon !== -1 && semicolon < open);
  if (isStatement) {
    const end: number = semicolon === -1 ? css.length : semicolon + 1;
    return {
      name: name,
      prelude: css.slice(at, end),
      body: undefined,
      end: end
    };
  }

  const close: number = matchingBrace(css, open);
  if (close === -1) {
    return undefined;
  }
  return {
    name: name,
    prelude: css.slice(at, open),
    body: css.slice(open + 1, close),
    end: close + 1
  };
}

function rewriteAtRule(rule: IAtRule, root: string): string {
  if (DROPPED.indexOf(rule.name) !== -1) {
    return '';
  }
  if (rule.body === undefined) {
    return rule.prelude;
  }
  if (NOT_SELECTORS.indexOf(rule.name) !== -1) {
    return `${rule.prelude}{${rule.body}}`;
  }
  if (NESTS_STYLE_RULES.indexOf(rule.name) !== -1) {
    return `${rule.prelude}{${rewriteBlock(rule.body, root)}}`;
  }
  /* An at-rule nobody here has heard of, with a block. Kept whole: a future
     one that nests style rules would go unscoped, which is the visible
     failure, and one that does not would be corrupted by scoping it. */
  return `${rule.prelude}{${rule.body}}`;
}

/**
 * Every selector in a comma separated list, prefixed.
 *
 * Split at the top level only: `:is(a, b)` is one selector and the comma
 * inside its brackets is not a separator.
 */
/*
 * The web part's own state, as an author can select on it.
 *
 * One or more `[data-strata-*]` attributes at the very start of a selector,
 * optionally after `:root` or `:host`, which an author may well write out of
 * habit. Anything after them is left alone: `[data-strata-mode="dark"] .card`
 * keeps its `.card`.
 *
 * Only the attributes this web part puts on its own root are recognised. An
 * author's own `[data-something]` is theirs and stays a descendant.
 */
const LEADING_STATE: RegExp =
  /^((?::root|:host)?((?:\[data-strata-[a-z-]+(?:[~|^$*]?=(?:"[^"]*"|'[^']*'|[^\]]*))?\])+))/i;

export function scopeSelectorList(selectors: string, root: string): string {
  const parts: string[] = splitTopLevel(selectors, ',');
  return parts
    .map((part: string) => scopeSelector(part.trim(), root))
    .filter((part: string) => part.length > 0)
    .join(', ');
}

/**
 * One selector, prefixed.
 *
 * A selector naming the whole document becomes the root itself rather than a
 * descendant of it, because `.strata-root body` matches nothing: there is no
 * body inside the web part.
 */
export function scopeSelector(selector: string, root: string): string {
  if (!selector) {
    return '';
  }
  if (WHOLE_DOCUMENT.indexOf(selector.toLowerCase()) !== -1) {
    return root;
  }

  /*
   * A selector that starts with one of the web part's own state attributes is
   * a statement about the web part, not about something inside it, so it is
   * attached to the root rather than made a descendant of it.
   *
   * This is what lets an author write a rule for dark mode. Prefixed the
   * ordinary way, `[data-strata-mode="dark"] .card` becomes
   * `.scope [data-strata-mode="dark"] .card` - and the attribute is on the
   * scope element itself, so that asks for one inside it and matches nothing,
   * ever. An author had no way to write a dark rule at all.
   */
  const state: RegExpExecArray | null = LEADING_STATE.exec(selector);
  if (state) {
    /* The attributes are kept and hung on the root; a `:root` or `:host` in
       front of them is what the root already is, so it goes. Dropping the
       attributes instead would be worse than the fault this fixes: a dark rule
       would then apply in both modes rather than in neither. */
    return `${root}${state[2]}${selector.slice(state[1].length)}`;
  }

  /*
   * A selector that starts at the document and descends, like `body .note`.
   * The leading part is replaced rather than prefixed, or the result asks for
   * a body inside the web part and finds none.
   */
  const leading: RegExpExecArray | null =
    /^(:root|html|body|:host)(?=[\s>+~])/i.exec(selector);
  if (leading) {
    return `${root}${selector.slice(leading[1].length)}`;
  }
  return `${root} ${selector}`;
}

// ------------------------------------------------------------------ scanning

/** The first `character` at nesting depth zero, or -1. */
function findTopLevel(css: string, from: number, character: string): number {
  let depth: number = 0;
  let index: number = from;

  while (index < css.length) {
    const here: string = css.charAt(index);
    if (here === '"' || here === "'") {
      index = endOfString(css, index);
      continue;
    }
    if (here === '(' || here === '[') {
      depth += 1;
    } else if (here === ')' || here === ']') {
      depth -= 1;
    } else if (depth === 0 && here === character) {
      return index;
    } else if (depth === 0 && here === '{' && character === ';') {
      /* A block started before any semicolon, so this is not a statement. */
      return -1;
    }
    index += 1;
  }
  return -1;
}

/** The brace closing the one at `open`, or -1 if the sheet ends first. */
function matchingBrace(css: string, open: number): number {
  let depth: number = 0;
  let index: number = open;

  while (index < css.length) {
    const here: string = css.charAt(index);
    if (here === '"' || here === "'") {
      index = endOfString(css, index);
      continue;
    }
    if (here === '{') {
      depth += 1;
    } else if (here === '}') {
      depth -= 1;
      if (depth === 0) {
        return index;
      }
    }
    index += 1;
  }
  return -1;
}

/** Splits on `character` at the top level, ignoring brackets and strings. */
function splitTopLevel(text: string, character: string): string[] {
  const parts: string[] = [];
  let depth: number = 0;
  let start: number = 0;
  let index: number = 0;

  while (index < text.length) {
    const here: string = text.charAt(index);
    if (here === '"' || here === "'") {
      index = endOfString(text, index);
      continue;
    }
    if (here === '(' || here === '[') {
      depth += 1;
    } else if (here === ')' || here === ']') {
      depth -= 1;
    } else if (depth === 0 && here === character) {
      parts.push(text.slice(start, index));
      start = index + 1;
    }
    index += 1;
  }
  parts.push(text.slice(start));
  return parts;
}

/**
 * Just past the string starting at `at`.
 *
 * Escapes are honoured, so `"a\"b"` is one string: a backslash inside a CSS
 * string escapes the next character exactly as it does elsewhere, and reading
 * the escaped quote as the end would leave everything after it misparsed.
 */
function endOfString(text: string, at: number): number {
  const quote: string = text.charAt(at);
  let index: number = at + 1;

  while (index < text.length) {
    const here: string = text.charAt(index);
    if (here === '\\') {
      index += 2;
      continue;
    }
    if (here === quote) {
      return index + 1;
    }
    index += 1;
  }
  return text.length;
}
