/**
 * .SYNOPSIS
 * Takes the scripting out of rendered markdown when raw HTML is allowed.
 *
 * .DESCRIPTION
 * With "Allow raw HTML" on, markdown-it hands whatever the author wrote
 * straight through to the page. In a document library that is everyone with
 * write access to the library, and what one of them writes runs in the next
 * reader's browser, in that reader's SharePoint session. `<script>`,
 * `<img onerror>` and `<a href="javascript:">` all worked.
 *
 * GitHub's answer is to strip a fixed list of tags, `<iframe>` among them.
 * That is not the answer here, because an embedded video is the main reason
 * anybody turns the setting on in the first place. So scripting goes and
 * `<iframe>` stays, narrowed to hosts a video or a form actually comes from.
 *
 * Sanitising is done with DOMPurify rather than by hand. HTML sanitisation by
 * regular expression is the most reliably-got-wrong thing in this field: the
 * parser, not the pattern, decides what a tag is, and only a parser can see
 * through `java&#115;cript:` or a stray control character.
 *
 * WHAT IS SANITISED
 * The whole rendered string, not only the author's raw HTML. Sanitising the
 * `html_block` and `html_inline` tokens instead would touch author HTML only,
 * which sounds tidier and does not work: markdown-it emits `html_inline` as
 * individual unbalanced tags, `<b>` and `</b>` as separate tokens, and a
 * sanitiser handed `<b>` on its own does not give it back.
 *
 * Sanitising the whole string means this also runs over markup this project
 * generated: KaTeX, callouts rendered as `<details>`/`<summary>`, code blocks,
 * footnotes, the contents list, the SVG icons. Nothing of ours may be lost on
 * the way through, which is what the kitchen-sink test in
 * tests/html-sanitiser.test.js pins: it sanitises the whole sample and checks
 * DOMPurify removed nothing at all.
 *
 * Two settings exist only so that stays true:
 *
 *   ADD_ATTR: focusable    Our icons carry `focusable="false"`, which keeps
 *                          Internet Explorer and older Edge from putting an
 *                          SVG in the tab order. DOMPurify does not allow it
 *                          by default.
 *   SANITIZE_DOM: false    DOMPurify drops an `id` whose value names a
 *                          property of `document`, as a guard against DOM
 *                          clobbering. Heading anchors are ids made from
 *                          heading text, so `## Images` became an `<h2>` with
 *                          no id, and the contents list above it linked to
 *                          nothing. The guard buys nothing here anyway: the
 *                          ids it would keep and the ids it would drop are
 *                          equally the author's, since both come out of words
 *                          the author typed.
 *
 * With raw HTML off there is nothing to do. markdown-it escapes every tag
 * itself, so the string holds no HTML but ours, and this never runs.
 *
 * WHERE THE WINDOW COMES FROM
 * DOMPurify needs a DOM. In a browser that is `window`, and the web part gets
 * one for free. In Node - the tests, and the demo and site builders - there is
 * no window, and DOMPurify handed no window quietly returns its input
 * unchanged, which is the one failure mode a sanitiser must not have. So a
 * Node caller says which window to use, jsdom is a devDependency and never
 * reaches the bundle, and a caller that says nothing gets an error rather than
 * unsanitised HTML.
 *
 * .USAGE
 *   import { sanitiseRenderedHtml } from './utils/htmlSanitiser';
 *
 *   const safe: string = sanitiseRenderedHtml(renderedHtml);
 *
 *   // In Node, before anything renders:
 *   const { JSDOM } = require('jsdom');
 *   useSanitiserWindow(new JSDOM('').window);
 *
 * .NOTES
 * Since:     0.0.18.6
 * Ships in:  the web part bundle
 * Requires:  dompurify
 */

import DOMPurify from 'dompurify';

/** The window-shaped object DOMPurify wants, as this file needs to read it. */
type SanitiserWindow = Parameters<typeof DOMPurify>[0];

/** A DOMPurify instance bound to one window. */
type Purifier = ReturnType<typeof DOMPurify>;

/**
 * Hosts an `<iframe>` may point at.
 *
 * Deliberately short, and hard-coded rather than a property-pane setting: a
 * list a page author can add to is not an allowlist, it is a suggestion. What
 * is here is what people embed in a SharePoint page - video, a form, a report,
 * a meeting - and nothing whose whole purpose is to run someone else's code.
 *
 * Matched against the parsed hostname and never against the text of the URL,
 * or `https://evil.example/?x=www.youtube.com` would read as YouTube.
 */
export const ALLOWED_IFRAME_HOSTS: string[] = [
  'www.youtube.com',
  'youtube.com',
  'www.youtube-nocookie.com',
  'youtube-nocookie.com',
  'player.vimeo.com',
  'vimeo.com',
  'web.microsoftstream.com',
  'forms.office.com',
  'app.powerbi.com',
  'teams.microsoft.com'
];

/**
 * Whole domains, matched on the dot so `sharepoint.com.evil.example` is not
 * one of them. A tenant's own content lives on a name nobody here can know in
 * advance, which is why this one is a suffix and the rest are not.
 */
export const ALLOWED_IFRAME_HOST_SUFFIXES: string[] = ['.sharepoint.com'];

/** An embed is a page, fetched over the web. Nothing else is. */
const EMBED_PROTOCOLS: string[] = ['http:', 'https:'];

/**
 * Tags that are refused by name as well as by absence.
 *
 * `<script>`, `<object>`, `<embed>`, `<base>` and `<meta>` are already outside
 * DOMPurify's allowed set, but naming them says what this file is for, and
 * leaves the guarantee in one readable place rather than in a default that a
 * future version is free to change. `<form>` is not a default: DOMPurify
 * allows it, and a form on a wiki page is a login box drawn over someone
 * else's content, posting somewhere the reader cannot see.
 */
const FORBIDDEN_TAGS: string[] = ['script', 'object', 'embed', 'base', 'meta', 'form'];

/**
 * `srcdoc` is a whole document written inline, so an iframe carrying one never
 * fetches the host it claims. It is refused whatever the host.
 */
const FORBIDDEN_ATTRIBUTES: string[] = ['srcdoc'];

/**
 * What an embed needs to size itself, go full screen and play, and nothing
 * more.
 *
 * `allow` and `referrerpolicy` are here because they are in the embed code
 * YouTube hands somebody who presses Share: stripping them let the video keep
 * working while quietly changing what the author pasted, and a permission
 * policy that is silently dropped is worse than one that is read - it is the
 * attribute that says what the frame may NOT do. It is only ever read on a
 * frame whose host is on the list below, so it grants nothing to anybody else.
 */
const EMBED_ATTRIBUTES: string[] = [
  'src', 'width', 'height', 'allowfullscreen', 'frameborder', 'title', 'loading',
  'allow', 'referrerpolicy'
];

/** Our own SVG icons; see the notes at the top of this file. */
const OUR_ATTRIBUTES: string[] = ['focusable'];

interface ISanitiserConfig {
  ADD_TAGS: string[];
  ADD_ATTR: string[];
  FORBID_TAGS: string[];
  FORBID_ATTR: string[];
  SANITIZE_DOM: boolean;
}

const CONFIG: ISanitiserConfig = {
  ADD_TAGS: ['iframe'],
  ADD_ATTR: EMBED_ATTRIBUTES.concat(OUR_ATTRIBUTES),
  FORBID_TAGS: FORBIDDEN_TAGS,
  FORBID_ATTR: FORBIDDEN_ATTRIBUTES,
  SANITIZE_DOM: false
};

/** The window a Node caller handed over, if one did. */
let chosenWindow: SanitiserWindow | undefined;

/** Built once per window, because building it registers the iframe hook. */
let purifier: Purifier | undefined;

/**
 * Names the window to sanitise against. For Node only: a browser has one
 * already and the web part never calls this.
 *
 * Takes `unknown` so a caller in plain JavaScript, which is every caller that
 * needs it, does not have to name a DOM type to pass a jsdom window.
 */
export function useSanitiserWindow(root: unknown): void {
  chosenWindow = root as SanitiserWindow;
  purifier = undefined;
}

/** True when `host` is one this project will load an iframe from. */
export function isAllowedIframeHost(host: string, pageHost?: string): boolean {
  const name: string = (host || '').toLowerCase();
  if (!name) {
    return false;
  }
  if (ALLOWED_IFRAME_HOSTS.indexOf(name) !== -1) {
    return true;
  }
  if (ALLOWED_IFRAME_HOST_SUFFIXES.some((suffix: string): boolean =>
    name.length > suffix.length && name.slice(-suffix.length) === suffix)) {
    return true;
  }
  /* The page embedding its own site is embedding content the reader can
     already see, from a host they are already trusting. */
  return !!pageHost && name === pageHost.toLowerCase();
}

/**
 * The address a relative `src` is relative to. `document.baseURI` is what the
 * browser itself would resolve against, including a `<base>` the host page
 * set; `location.href` is the fallback for a window that has no document.
 */
function baseAddress(root: SanitiserWindow | undefined): string | undefined {
  const known: { document?: { baseURI?: string }; location?: { href?: string } } =
    (root || {}) as { document?: { baseURI?: string }; location?: { href?: string } };
  const base: string | undefined =
    (known.document && known.document.baseURI) || (known.location && known.location.href);
  /* about:blank is a window that has not been anywhere. Resolving against it
     throws, and a relative address under it has no host to check. */
  return base && base.indexOf('about:') !== 0 ? base : undefined;
}

/** The host the page itself is served from, if the window knows. */
function pageHostOf(root: SanitiserWindow | undefined): string | undefined {
  const known: { location?: { hostname?: string } } =
    (root || {}) as { location?: { hostname?: string } };
  return (known.location && known.location.hostname) || undefined;
}

/**
 * Whether an iframe pointing at `value` may stay.
 *
 * The URL is parsed and its host read off, rather than matched in the text.
 * A URL that will not parse at all has no host to judge, so it does not pass.
 */
function isAllowedEmbed(value: string, base: string | undefined, pageHost: string | undefined): boolean {
  if (!value) {
    return false;
  }
  let parsed: URL;
  try {
    parsed = base ? new URL(value, base) : new URL(value);
  } catch {
    return false;
  }
  if (EMBED_PROTOCOLS.indexOf(parsed.protocol) === -1) {
    return false;
  }
  return isAllowedIframeHost(parsed.hostname, pageHost);
}

/** Builds the instance for the current window, hook and all. */
function build(): Purifier {
  const root: SanitiserWindow | undefined = chosenWindow
    || (typeof window !== 'undefined' ? (window as unknown as SanitiserWindow) : undefined);

  if (!root) {
    throw new Error(
      'No window to sanitise HTML against. In a browser there is one already; '
      + 'in Node, call useSanitiserWindow(new JSDOM(\'\').window) before rendering '
      + 'with raw HTML allowed.'
    );
  }

  const instance: Purifier = DOMPurify(root);
  if (!instance.isSupported) {
    throw new Error('DOMPurify cannot run against this window, so raw HTML cannot be made safe.');
  }

  const base: string | undefined = baseAddress(root);
  const pageHost: string | undefined = pageHostOf(root);

  /*
   * Host checking is a hook rather than configuration because DOMPurify allows
   * or refuses a tag by name, and the question here is about the value of one
   * attribute. By the time this runs the attributes have already been through
   * DOMPurify's own URL check, so anything left is a real address.
   */
  instance.addHook('afterSanitizeAttributes', (node: Element): void => {
    const tag: string = (node.tagName || '').toLowerCase();
    if (tag !== 'iframe') {
      return;
    }
    if (!isAllowedEmbed(node.getAttribute('src') || '', base, pageHost)) {
      if (node.parentNode) {
        node.parentNode.removeChild(node);
      }
    }
  });

  return instance;
}

/**
 * Sanitises a rendered document. Call it only when raw HTML is allowed; with
 * the setting off the string holds nothing but markup this project wrote.
 *
 * Throws rather than returning the input when it cannot do the job. Returning
 * the input is how a sanitiser ships a hole nobody notices.
 */
export function sanitiseRenderedHtml(html: string): string {
  if (!html) {
    return html;
  }
  if (!purifier) {
    purifier = build();
  }
  return purifier.sanitize(html, CONFIG);
}

/**
 * What the last call removed, as DOMPurify recorded it. Read by the tests,
 * which assert it is empty for every document this project generates itself.
 */
export function lastRemoved(): unknown[] {
  return purifier ? purifier.removed : [];
}
