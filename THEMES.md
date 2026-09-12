# Themes

Every colour, font and shape in this web part comes from a CSS custom property
declared in `src/webparts/markstrata/styles/base.css` and given a value
by a theme file in `styles/themes/`. Nothing in the structural stylesheets
hard-codes a colour, which is why "GitHub / Obsidian / VS Code" is a data change
rather than three forks of the same CSS — and why adding a fourth theme is one
file plus one dropdown entry.

The root element carries the selection as attributes:

```html
<div class="ink-root"
     data-ink-theme="github|obsidian|vscode"
     data-ink-mode="light|dark"
     data-ink-width="narrow|comfortable|wide|full"
     data-ink-density="compact|normal|relaxed"
     data-ink-size="small|normal|large|xlarge"
     data-ink-code-size="small|normal|large">
```

## The token contract

### Surfaces and text

| Token | Used for |
|-------|----------|
| `--ink-bg` | Page background |
| `--ink-bg-elevated` | Sidebar, table header, toolbar buttons, panels |
| `--ink-bg-hover` | Hover state for the above |
| `--ink-text` | Body text |
| `--ink-text-muted` | Secondary text, plain blockquotes, list markers |
| `--ink-text-faint` | Labels, footer metadata, heading anchors |
| `--ink-border` / `--ink-border-strong` | Rules, dividers, control borders |
| `--ink-link` / `--ink-link-hover` | Anchors |
| `--ink-on-accent` | Text on a filled accent surface (the Save button) |

### Accent palette

Nine hues, each stored as an `R, G, B` triple so a rule can use both the solid
colour and a tint of it:

```css
--ink-color-blue: 9, 105, 218;
/* solid */  color: rgb(var(--ink-color-blue));
/* tint  */  background: rgba(var(--ink-color-blue), 0.1);
```

`blue`, `cyan`, `green`, `yellow`, `orange`, `red`, `purple`, `pink`, `gray`.
Callouts pick one of these through `--ink-callout-rgb`, which is the same
technique Obsidian uses for its own callouts.

### Typography

`--ink-font-body`, `--ink-font-heading`, `--ink-font-mono`, `--ink-font-size`,
`--ink-line-height-base`, `--ink-block-gap-base`, `--ink-h1-size` … `--ink-h6-size`,
`--ink-heading-weight`, `--ink-h1-weight`, `--ink-heading-color`, and the
optional heading rules `--ink-h1-rule-width` / `-space` / `-color` (and the h2
equivalents).

Density and text size scale the base values rather than replacing them
(`--ink-density-scale`, `--ink-font-scale`), so a theme never has to know which
reading options are selected.

### Code

`--ink-code-bg`, `--ink-code-text`, `--ink-code-border`, `--ink-code-radius`,
`--ink-code-padding`, `--ink-code-font-size`, `--ink-code-line-height`,
`--ink-code-header-bg`, `--ink-code-header-border`, `--ink-code-gutter-text`,
`--ink-code-gutter-border`, `--ink-code-line-hover`, `--ink-code-inline-bg`,
`--ink-code-inline-text`, `--ink-code-inline-border`.

### Syntax tokens

`syntax.css` maps highlight.js classes onto these, following highlight.js' own
grouping so language coverage matches what the library emits:

| Token | highlight.js classes |
|-------|----------------------|
| `--ink-syn-comment` | `comment`, `code`, `formula` |
| `--ink-syn-keyword` | `keyword`, `doctag`, `template-tag`, `template-variable`, `variable.language_` |
| `--ink-syn-type` | `type`, `class .title` |
| `--ink-syn-entity` | `title`, `title.function_`, `title.class_` |
| `--ink-syn-constant` | `number`, `literal`, `meta` |
| `--ink-syn-attr` | `attr`, `attribute`, `selector-attr/class/id` |
| `--ink-syn-string` | `string`, `char.escape_` |
| `--ink-syn-regexp` | `regexp` |
| `--ink-syn-variable` | `variable` |
| `--ink-syn-builtin` | `built_in`, `symbol` |
| `--ink-syn-tag` | `name`, `quote`, `selector-tag`, `selector-pseudo` |
| `--ink-syn-property`, `--ink-syn-punctuation`, `--ink-syn-operator` | `property`, `punctuation`/`params`/`tag`, `operator` |
| `--ink-syn-section`, `--ink-syn-bullet`, `--ink-syn-link` | markdown structures |
| `--ink-syn-addition` / `-bg`, `--ink-syn-deletion` / `-bg` | diff lines |

### Callout shape

`--ink-callout-bg-alpha`, `--ink-callout-title-bg-alpha`,
`--ink-callout-border-width`, `--ink-callout-accent-width`,
`--ink-callout-radius`, `--ink-callout-title-padding`,
`--ink-callout-content-padding`, `--ink-callout-title-weight`.

A GitHub alert is `bg-alpha: 0` + `accent-width: 4px` + `radius: 0`; an Obsidian
callout is `bg-alpha: .1` + `title-bg-alpha: .1` + `radius: 8px`; a VS Code
notice is a tint plus a 3px bar. Same markup, three looks.

## Where the colours come from

| Theme | Light | Dark |
|-------|-------|------|
| GitHub | Primer light: `#ffffff` / `#1f2328` / `#d1d9e0`, link `#0969da`, code `#f6f8fa`, `prettylights-syntax-*` tokens | Primer dark: `#0d1117` / `#e6edf3` / `#3d444d`, link `#4493f8`, code `#151b23` |
| Obsidian | Default theme base ramp: `#ffffff` / `#222222` / `#e0e0e0`, accent purple, code `#f6f6f6` | `#1e1e1e` / `#dadada`, code `#161616`, accent `#a882ff` |
| VS Code | Light Modern: `#ffffff` / `#3b3b3b` / `#e5e5e5`, link `#005fb8`, code `#f5f5f5`, Light+ tokens | Dark Modern: `#1f1f1f` / `#cccccc` / `#3c3c3c`, link `#4daafc`, code `#181818`, Dark+ tokens |

VS Code's inline code colour (`textPreformat.foreground`) is kept as-is: gold
`#d7ba7d` in dark, red `#b5200d` in light. It is distinctive and it is what the
preview actually does.

## Deliberate deviations

The point of this project is readability, so a few source colours are adjusted.
All of them are documented in the theme files as well:

- **Obsidian light accents** are darkened about 15% (hue preserved). Obsidian's
  own light green `#08b94e`, cyan `#00bfbc` and yellow `#e0ac00` land near
  2.5:1 on white — below WCAG AA — which makes callout titles and syntax tokens
  hard to read. Dark mode keeps Obsidian's values.
- **Obsidian dark blue** `#027aff` is raised to `#4a9eff`; the original is about
  3.2:1 on Obsidian's own `#1e1e1e`.
- **Comment colours** are set explicitly rather than inheriting "faint" text, so
  comments stay legible instead of disappearing into the background.
- **`tip` is green and `important` is purple** by default (GitHub's palette),
  because those two types come from GitHub's alerts. In the Obsidian theme both
  are cyan, matching Obsidian.
- **VS Code body text is 15px**, between VS Code's own 14px preview and the 16px
  the other two use, because SharePoint pages are read further from the screen
  than an editor pane.

## Callout types and colours

| Type (and aliases) | Hue |
|--------------------|-----|
| `note`, `info`, `todo` | blue |
| `abstract` (`summary`, `tldr`), `hint` | cyan |
| `tip`, `success` (`check`, `done`) | green (cyan for `tip` in the Obsidian theme) |
| `important`, `example` | purple (cyan for `important` in the Obsidian theme) |
| `question` (`help`, `faq`) | yellow |
| `warning` (`attention`) | orange |
| `caution`, `failure` (`fail`, `missing`), `danger` (`error`), `bug` | red |
| `quote` (`cite`) | gray |

Wiki.js classes map on too: `is-info` → info, `is-warning` → warning,
`is-danger` → danger, `is-success` → success.

## Adding a theme

1. Copy `styles/themes/github.css` to `styles/themes/mytheme.css` and replace
   `github` with `mytheme` in the three selectors. Fill in the values — every
   token the other themes set has to be set here too, since there is no fallback
   palette by design (a missing colour should be obvious, not silently grey).
   `npm test` checks this for you: the theme files must declare an identical set
   of tokens, each palette hue must be an `R, G, B` triple in both modes, and no
   structural rule may hard-code a colour.
2. Import it in `MarkstrataWebPart.ts` next to the other theme imports.
3. Add `{ key: 'mytheme', text: 'My theme' }` to `THEME_FAMILIES` in
   `utils/ThemeManager.ts`, and add `ThemeFamily` to the union type.
4. Add a `mytheme-light` and `mytheme-dark` entry to `MERMAID_PALETTES` in the
   same file so diagrams follow, and a font stack in `FONT_STACKS`.
5. `npm run demo` and open `demo/dist/index.html` to check it against the
   kitchen-sink document before deploying.

## Checking contrast

The demo page is the fastest check: open `demo/dist/index.html`, switch through
the six combinations, and look at the callout titles, comments in code, and the
muted text in the footer — those are the three places a palette usually fails.

## Names and trademarks

GitHub, Obsidian and Visual Studio Code are trademarks of their respective
owners. The theme names say which editor's rendering each theme reproduces;
nothing here is affiliated with or endorsed by them, and no code from those
projects is included.
