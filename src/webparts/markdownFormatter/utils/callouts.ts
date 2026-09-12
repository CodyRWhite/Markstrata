/**
 * Callout registry.
 *
 * One set of types covers three syntaxes that users actually paste into
 * SharePoint:
 *
 *   GitHub alerts      > [!NOTE] / [!TIP] / [!IMPORTANT] / [!WARNING] / [!CAUTION]
 *   Obsidian callouts  > [!info] Optional title   (plus +/- for foldable)
 *   Wiki.js legacy     > quoted text
 *                      {.is-info}
 *
 * Colour per type is decided in CSS (callouts.css) from the type name, so
 * adding a type here only needs an icon and a default title.
 */

export interface ICalloutType {
  /** Canonical type name, emitted as data-callout and used by the CSS. */
  type: string;
  /** Heading shown when the author does not supply their own title. */
  title: string;
  /** Inline SVG body (no <svg> wrapper - buildIcon adds it). */
  icon: string;
}

const ICONS: { [key: string]: string } = {
  pencil: '<path d="M12 20h9"/><path d="M16.5 3.5a2.12 2.12 0 0 1 3 3L7 19l-4 1 1-4Z"/>',
  info: '<circle cx="12" cy="12" r="10"/><path d="M12 16v-4"/><path d="M12 8h.01"/>',
  clipboard:
    '<rect x="8" y="2" width="8" height="4" rx="1"/><path d="M16 4h2a2 2 0 0 1 2 2v14a2 2 0 0 1-2 2H6a2 2 0 0 1-2-2V6a2 2 0 0 1 2-2h2"/><path d="M12 11h4"/><path d="M12 16h4"/><path d="M8 11h.01"/><path d="M8 16h.01"/>',
  check: '<path d="M22 11.08V12a10 10 0 1 1-5.93-9.14"/><path d="m22 4-10 10.01-3-3.01"/>',
  flame:
    '<path d="M8.5 14.5A2.5 2.5 0 0 0 11 12c0-1.38-.5-2-1-3-1.072-2.143-.224-4.054 2-6 .5 2.5 2 4.9 4 6.5 2 1.6 3 3.5 3 5.5a7 7 0 1 1-14 0c0-1.153.433-2.294 1-3a2.5 2.5 0 0 0 2.5 2.5Z"/>',
  flag: '<path d="M4 15s1-1 4-1 5 2 8 2 4-1 4-1V3s-1 1-4 1-5-2-8-2-4 1-4 1Z"/><path d="M4 22v-7"/>',
  help: '<circle cx="12" cy="12" r="10"/><path d="M9.09 9a3 3 0 0 1 5.83 1c0 2-3 3-3 3"/><path d="M12 17h.01"/>',
  triangle:
    '<path d="m21.73 18-8-14a2 2 0 0 0-3.48 0l-8 14A2 2 0 0 0 4 21h16a2 2 0 0 0 1.73-3Z"/><path d="M12 9v4"/><path d="M12 17h.01"/>',
  octagon:
    '<path d="M7.86 2h8.28L22 7.86v8.28L16.14 22H7.86L2 16.14V7.86Z"/><path d="M12 8v4"/><path d="M12 16h.01"/>',
  cross: '<circle cx="12" cy="12" r="10"/><path d="m15 9-6 6"/><path d="m9 9 6 6"/>',
  zap: '<path d="M13 2 3 14h9l-1 8 10-12h-9Z"/>',
  bug: '<path d="M14.12 3.88 16 2"/><path d="m8 2 1.88 1.88"/><path d="M9 7.13V6a3 3 0 1 1 6 0v1.13"/><path d="M12 20c-3.3 0-6-2.7-6-6v-3a4 4 0 0 1 4-4h4a4 4 0 0 1 4 4v3c0 3.3-2.7 6-6 6Z"/><path d="M12 20v-9"/><path d="M6.5 9.5C4.6 9.3 3 7.6 3 5.5"/><path d="M6 13H2"/><path d="M3 21c0-2.1 1.7-3.9 3.8-4"/><path d="M21 5.5c0 2.1-1.6 3.8-3.5 4"/><path d="M22 13h-4"/><path d="M17.2 17c2.1.1 3.8 1.9 3.8 4"/>',
  list: '<path d="M8 6h13"/><path d="M8 12h13"/><path d="M8 18h13"/><path d="M3 6h.01"/><path d="M3 12h.01"/><path d="M3 18h.01"/>',
  quote:
    '<path d="M10 11H6a2 2 0 0 1-2-2V7a2 2 0 0 1 2-2h2a2 2 0 0 1 2 2v8c0 2.2-1.8 4-4 4"/><path d="M20 11h-4a2 2 0 0 1-2-2V7a2 2 0 0 1 2-2h2a2 2 0 0 1 2 2v8c0 2.2-1.8 4-4 4"/>',
  chevron: '<path d="m6 9 6 6 6-6"/>'
};

const TYPES: ICalloutType[] = [
  { type: 'note', title: 'Note', icon: ICONS.pencil },
  { type: 'abstract', title: 'Abstract', icon: ICONS.clipboard },
  { type: 'info', title: 'Info', icon: ICONS.info },
  { type: 'todo', title: 'Todo', icon: ICONS.check },
  { type: 'tip', title: 'Tip', icon: ICONS.flame },
  { type: 'important', title: 'Important', icon: ICONS.flag },
  { type: 'success', title: 'Success', icon: ICONS.check },
  { type: 'question', title: 'Question', icon: ICONS.help },
  { type: 'warning', title: 'Warning', icon: ICONS.triangle },
  { type: 'caution', title: 'Caution', icon: ICONS.octagon },
  { type: 'failure', title: 'Failure', icon: ICONS.cross },
  { type: 'danger', title: 'Danger', icon: ICONS.zap },
  { type: 'bug', title: 'Bug', icon: ICONS.bug },
  { type: 'example', title: 'Example', icon: ICONS.list },
  { type: 'quote', title: 'Quote', icon: ICONS.quote }
];

/** Alternative spellings, mostly the ones Obsidian ships. */
const ALIASES: { [alias: string]: string } = {
  summary: 'abstract',
  tldr: 'abstract',
  hint: 'tip',
  check: 'success',
  done: 'success',
  help: 'question',
  faq: 'question',
  attention: 'warning',
  fail: 'failure',
  missing: 'failure',
  error: 'danger',
  cite: 'quote',
  // Wiki.js blockquote classes, so content written for the older web part
  // keeps rendering.
  'is-info': 'info',
  'is-warning': 'warning',
  'is-danger': 'danger',
  'is-success': 'success'
};

const BY_TYPE: { [type: string]: ICalloutType } = {};
TYPES.forEach((definition: ICalloutType) => {
  BY_TYPE[definition.type] = definition;
});

/**
 * Resolves any spelling to a known callout, or undefined when the word is not
 * a callout at all (so `> [!something]` stays an ordinary blockquote).
 */
export function resolveCallout(rawType: string): ICalloutType | undefined {
  const key: string = (rawType || '').trim().toLowerCase();
  const canonical: string = ALIASES[key] || key;
  return BY_TYPE[canonical];
}

export function isCalloutType(rawType: string): boolean {
  return resolveCallout(rawType) !== undefined;
}

/** Wraps an icon body in a sized, currentColor-stroked <svg>. */
export function buildIcon(body: string): string {
  return (
    '<svg viewBox="0 0 24 24" xmlns="http://www.w3.org/2000/svg" aria-hidden="true" focusable="false">' +
    body +
    '</svg>'
  );
}

export const FOLD_ICON: string = buildIcon(ICONS.chevron);

export const CALLOUT_TYPES: ICalloutType[] = TYPES;
