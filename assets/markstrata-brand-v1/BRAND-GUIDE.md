# Markstrata — brand guide

Markdown for SharePoint Online.

---

## 1. The idea

**Strata** are layers laid down in order, each one readable as a record of what came before. That is
also what a Markdown document is: headings stacked into a hierarchy, and underneath it, a document
library with versions stacked in order.

The mark says both things at once:

- Two horizontal bars of decreasing width — a heading hierarchy, and a sediment layer.
- A wide descending chevron — the `↓` that Markdown has carried since the original mark, and the
  direction everything in the product moves: source at the top, rendered page underneath it.

It is a layered document that resolves downward. Three elements, one idea, no letterforms to
misread at 16 px.

**Name.** One word, capital M only: *Markstrata*. Not MarkStrata, not Mark Strata, not MS.
First mention in long copy: "Markstrata, a Markdown editor for SharePoint Online."

---

## 2. The mark

### Geometry (512 grid — `icon/markstrata-construction.svg`)

| Element | Position | Size |
| --- | --- | --- |
| Tile | 0, 0 | 512 × 512, corner radius 118 (23.05%) |
| Top stratum | x 110, y 138 | 292 × 44, radius 22 |
| Second stratum | x 110, y 202 | 220 × 44, radius 22 |
| Chevron | 132,288 → 256,352 → 380,288 | stroke 44, round cap and join |

Everything is built from one unit: the 44 px bar weight, with a 22 px radius (exactly half) on every
terminal. Gaps between strata are 20. The mark's bounding box is 292 × 236, optically centred in the
tile. Do not redraw it by eye — scale the supplied SVG.

### Variants

| File | Use |
| --- | --- |
| `icon/markstrata-icon-512.svg` | Master. App tile, store listing, anywhere above 96 px. |
| `icon/markstrata-icon-flat.svg` | Flat teal, no gradient. Print, embroidery, low-colour contexts. |
| `icon/markstrata-icon-32.svg` | 32–64 px. Thicker relative weights, tighter radius. |
| `icon/markstrata-icon-16.svg` | 16–24 px. Second stratum removed; two elements only. |
| `icon/markstrata-icon-maskable.svg` | PWA maskable: full-bleed background, mark at 80%. |
| `icon/markstrata-glyph.svg` | Mark alone on transparent, for light backgrounds. |
| `icon/markstrata-glyph-mono-dark.svg` | One colour, for light backgrounds. |
| `icon/markstrata-glyph-mono-light.svg` | One colour, for dark or photographic backgrounds. |
| `icon/markstrata-favicon.svg` | 32 grid, all-white mark — survives browser-tab scaling. |

### Minimum sizes

- Tile with gradient: **32 px**. Below that use `markstrata-icon-16.svg`, which is drawn for it.
- Mono glyph without tile: **20 px**.
- Horizontal lockup: **112 px wide**. Below that, drop the wordmark and use the tile alone.

### Clear space

Clear space on every side equals **one quarter of the tile height** (128 on the 512 master). See
`icon/markstrata-clearspace.svg`. Nothing — type, rules, avatars, SharePoint web part chrome —
enters that band. In the lockups the same quarter-tile rule applies, measured from the tile edge and
from the right edge of the wordmark.

---

## 3. Wordmark and lockups

The wordmark is set in **Selawik Bold**, tracked −1.3%, with a small optical kern on *Ma*, and
supplied as outlines. Selawik is metrically and visually compatible with Segoe UI and is licensed
under the SIL Open Font License, so the wordmark matches SharePoint's type while remaining
redistributable — Segoe UI's own licence does not extend to third-party logos. See
`lockup/TYPE-NOTICE.txt`.

Never re-set the wordmark as live text, never restore default tracking, never substitute Arial.

| File | Use |
| --- | --- |
| `lockup/markstrata-lockup-horizontal.svg` | Default. Site headers, docs, README, slides. |
| `lockup/markstrata-lockup-horizontal-reversed.svg` | On Bedrock or Shale surfaces. |
| `lockup/markstrata-lockup-tagline.svg` | First contact: store listing, landing page, deck cover. |
| `lockup/markstrata-lockup-stacked.svg` | Narrow columns, square placements, splash. |
| `lockup/markstrata-wordmark.svg` | Where the tile already appears nearby. |

Proportions are fixed: wordmark cap height is 46% of the tile height, set one quarter of a tile
away from it. In the tagline lockup the wordmark drops to 40% to make room.

**Tagline.** *Markdown for SharePoint.* Sentence case, full stop, no title case, no exclamation.
Use it once per surface, never inside the product UI.

---

## 4. Colour

Two families do the work. **Strata** is the brand teal — close enough to SharePoint's own teal to sit
in the suite without looking borrowed. **Sediment** is the amber of the chevron: the one warm thing
in the system, reserved for the Markdown source side of the product.

### Strata

| Token | Hex | Use |
| --- | --- | --- |
| `--ms-strata-50` | `#E9F5F6` | Selected rows, subtle fills |
| `--ms-strata-100` | `#C9E8EA` | Hover fills, dividers on tinted surfaces |
| `--ms-strata-200` | `#9BD6DA` | Illustration, diagram guides |
| `--ms-strata-300` | `#62BEC5` | Links and icons on dark surfaces (7.15:1 on Bedrock) |
| `--ms-strata-400` | `#2AA3AC` | Focus ring (3.03:1 on white) |
| `--ms-strata-500` | `#0F7B86` | **Brand.** Primary buttons, active state (5.00:1 on white) |
| `--ms-strata-600` | `#0C666F` | Hover on primary (6.68:1 on white) |
| `--ms-strata-700` | `#0A4048` | Pressed, gradient end, dark surfaces |
| `--ms-strata-800` | `#072830` | **Bedrock.** Body text (15.50:1 on white) |
| `--ms-strata-900` | `#04181D` | Dark-mode canvas |

### Sediment

| Token | Hex | Use |
| --- | --- | --- |
| `--ms-sediment-100` | `#FBEFD9` | Warning surface |
| `--ms-sediment-400` | `#F0B24A` | Chevron on dark (6.07:1 on Strata 700) |
| `--ms-sediment-500` | `#E2A03F` | **Accent.** Graphics only (6.89:1 on Bedrock) |
| `--ms-sediment-600` | `#D9922B` | Chevron in the light-background glyph |
| `--ms-sediment-700` | `#9A6314` | Amber **text** and warning text (5.04:1 on white) |

Slate neutrals (`--ms-slate-50` … `--ms-slate-900`) are teal-tinted greys; full values in
`tokens/markstrata-tokens.json`.

### Rules

- Amber is an accent, not a second brand colour. One amber element per screen. It marks the
  Markdown source — the editor pane, the syntax affordance, the unsaved marker — and nothing else.
- **Sediment 500 fails text contrast on white (2.25:1).** For amber text use Sediment 700.
- The gradient (`#1A99A5 → #0F7B86 → #0A4048`, 135°) belongs to the app tile only. Do not put it
  behind buttons, headers, or sections.
- Dark mode overrides are in `tokens/markstrata-tokens.css` under `[data-theme='dark']`: brand
  lightens to Strata 400, warning to Sediment 400.
- Target WCAG 2.2 AA everywhere, AAA for body copy on Chalk.

---

## 5. Type

| Role | Face | Setting |
| --- | --- | --- |
| Logo | Selawik Bold, outlined | Supplied artwork only |
| UI | Segoe UI Variable Text / Segoe UI | 14/20 body, 12/16 secondary |
| Headings | Segoe UI Variable Display / Segoe UI Semibold | 20/28, 16/22; sentence case |
| Markdown source and code | Cascadia Mono, Consolas | 13/20, tabular |

SharePoint already serves Segoe UI. Do not load a webfont for UI type — it costs a request and
breaks the illusion that Markstrata is part of the page. Cascadia Mono may be loaded, with the
Consolas fallback metrically checked.

The editor pane is the one place the product shows its own character: monospace source on Chalk,
rendered output on white, an amber rule between them.

---

## 6. Voice

Plain, specific, unhurried. Markstrata is a tool for people whose intranet is already complicated
enough. It explains what happened and what to do; it does not apologise, celebrate, or joke.

- Name actions by their result, and keep the name through the flow: the button says **Publish to
  page**, the toast says **Published**.
- Say *page*, *library*, *site* — SharePoint's words, not ours. Never *artifact*, *asset*, *entity*.
- Empty state: "No Markdown here yet. Choose a document library and Markstrata will render every
  `.md` file in it."
- Conflict: "This page changed in SharePoint while you were editing. Compare both versions, then
  keep the one you want."
- Limit: "Markstrata renders raw HTML as plain text. The SharePoint page canvas doesn't allow it."
- Failure: "Couldn't reach the library. Check that the site is still shared with you, then retry."

---

## 7. Putting it into SharePoint

**SPFx web part manifest.** `preconfiguredEntries[].iconImageUrl` takes a data URI; the base64 of
the 32 px icon is in `export/spfx-iconImageUrl.txt`. Use `officeFabricIconFontName` only as a
fallback — the Fluent icon font has nothing that reads as Markstrata.

```json
"preconfiguredEntries": [{
  "title": { "default": "Markstrata" },
  "description": { "default": "Render Markdown from a document library on this page." },
  "iconImageUrl": "data:image/svg+xml;base64,…",
  "groupId": "cf066440-0614-43d6-98ae-0b31cf14c7c3"
}]
```

**App catalog / store listing.** Ship `export/markstrata-icon-96.png` for the tile and
`export/markstrata-icon-300.png` for the listing; both are square with no padding baked in — the
tile radius is part of the artwork, so do not let a packaging tool round it again.

**Command bar.** Use the 20 px `ui/*.svg` icons. They are `currentColor` with a 1.6 stroke on a
20 grid, matching Fluent's optical weight, so they inherit SharePoint's theme colours for free.
`ms-app-20.svg` is the line version of the mark and is the only correct icon for a Markstrata
command — never shrink the gradient tile into a toolbar.

**Section backgrounds.** SharePoint sections can be white, neutral, soft, or strong. On *strong*
(which takes the site theme colour), switch to the reversed lockup and mono-light glyph; never place
the gradient tile on a coloured section.

**Theming.** Read the site theme rather than hard-coding brand teal for UI chrome — a tenant with a
red theme should still get a coherent web part. The tile, the lockup, and the amber accent stay
Markstrata's, always.

---

## 8. Do and don't

**Do**

- Scale the SVG; export PNGs from `export/` for anything that needs raster.
- Keep the tile square with its own radius.
- Use the size-specific icon files rather than downscaling the master.
- Put the mono-light glyph on photographs, never the tile.

**Don't**

- Recolour the tile, add a stroke to it, or drop a shadow behind it.
- Rotate, skew, or flip the chevron — it points down, always.
- Rebuild the lockup by placing the wordmark next to the tile by hand.
- Set the wordmark in Segoe UI as live text and call it the logo.
- Use the mark as a bullet, a favicon for someone else's site, or a watermark over content.
- Add "for SharePoint" to the wordmark itself; it lives in the tagline lockup only.

---

## 9. Trademarks and credits

- *SharePoint*, *Microsoft 365*, *Segoe UI*, and *Cascadia* are trademarks of Microsoft. Markstrata
  is an independent product. Describe it as "for Microsoft SharePoint" — descriptive, never
  "Microsoft Markstrata", and never beside a Microsoft logo in a way that implies endorsement.
- *Markdown* is not a trademark, but the original Markdown mark by Dustin Curtis is a separate
  design (CC0). The Markstrata chevron is an original drawing; do not swap in the Markdown mark.
- Wordmark outlines derive from Selawik, © Microsoft Corporation, SIL Open Font License 1.1. Full
  text: `lockup/TYPE-NOTICE.txt`.

---

## 10. Files

```
markstrata/
├─ BRAND-GUIDE.md            this document
├─ brand-sheet.html          one-page visual reference, open in a browser
├─ icon/                     9 icon SVGs + construction and clear-space diagrams
├─ lockup/                   wordmark and 4 lockups, outlined
├─ ui/                       4 currentColor 20 px product icons
├─ tokens/                   CSS, SCSS, JSON (JSON includes the contrast audit)
└─ export/                   PNG 16–512, maskable, .ico, SPFx data URI
```
