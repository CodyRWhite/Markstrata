# Markdown Formatter for SharePoint

A SharePoint Framework (SPFx) web part that renders markdown from a document
library, a URL, or typed straight into the page — with themes that mirror how
**GitHub**, **Obsidian** and **VS Code** display markdown, in light and dark.

It is a ground-up rebuild inspired by
[npapadacis/better-markdown-webpart](https://github.com/npapadacis/better-markdown-webpart)
(MIT). That web part gets a lot right; this one is aimed squarely at the part
that was hard to live with: **code blocks and note/callout blocks that were
difficult to read**, and a rendering style you could not match to the tools your
documentation is actually written in.

## What is different

| | Before | Here |
|---|---|---|
| Code block background | Fixed near-black `#212121` in every theme, plus a text shadow and an inset black glow | Theme surface colour, no shadow, no glow |
| Syntax colours | One highlight.js stylesheet (`atom-one-dark`), whatever the page theme was | Per-theme token colours — Primer, Obsidian's Prism mapping, Dark+/Light+ |
| Line numbers | Absolutely positioned, overlapping long lines, copied along with the code | A sticky gutter column drawn with CSS counters, never copied |
| Callouts | Four Wiki.js classes (`{.is-info}`) | GitHub alerts, all 15 Obsidian callout types with foldable support, and the old Wiki.js classes still work |
| Dark mode | An orange `#e65100` fill behind warning text | Tinted panels from the theme palette, every combination checked for contrast |
| Theme | Light / dark | 3 themes × light/dark/follow-the-page, plus width, spacing, text size |

## Themes

Each theme brings its own typography, code block shape, callout shape and
syntax palette — not just a different set of colours.

| Theme | Modelled on | Headings | Code blocks | Callouts |
|-------|-------------|----------|-------------|----------|
| **GitHub** | github.com rendered markdown (Primer) | h1/h2 with underline rules | Flat `#f6f8fa` / `#151b23` fill, 6px radius | Alert style: 4px accent bar, no fill |
| **Obsidian** | Obsidian's default theme | Modular scale, no rules | Fill, 8px radius | Tinted panel with a tinted title row |
| **VS Code** | Markdown preview with Dark+ / Light+ | h1 rule only | Bordered block on the editor background, 3px radius | Tint with a 3px accent bar |

| Light | Dark |
|---|---|
| ![GitHub light](docs/images/github-light.png) | ![GitHub dark](docs/images/github-dark.png) |
| ![Obsidian light](docs/images/obsidian-light.png) | ![Obsidian dark](docs/images/obsidian-dark.png) |
| ![VS Code light](docs/images/vscode-light.png) | ![VS Code dark](docs/images/vscode-dark.png) |

*(GitHub, Obsidian and VS Code, top to bottom — the same document in each.)*

Readers can be allowed to switch theme themselves (**Let readers switch theme**);
their choice is remembered per web part in their own browser.

See [THEMES.md](./THEMES.md) for the full token list, the colour sources, the
handful of deliberate deviations, and how to add a fourth theme.

## Callouts

Three syntaxes, one rendering:

```markdown
> [!NOTE]
> GitHub alert syntax: NOTE, TIP, IMPORTANT, WARNING, CAUTION.

> [!tip] Obsidian callout with a custom title
> Types: note, abstract, info, todo, tip, important, success, question,
> warning, caution, failure, danger, bug, example, quote (and their aliases).

> [!warning]- Foldable, collapsed by default
> `-` starts collapsed, `+` starts open. Rendered as a <details> element, so it
> needs no JavaScript and prints expanded.

> Wiki.js style from the older web part still renders.
{.is-info}
```

## Code blocks

- Syntax highlighting for ~40 languages via highlight.js, including PowerShell,
  Dockerfile, batch and HTTP on top of the common set.
- Optional header showing the language and, with ` ```ts title="app.ts" `, a
  filename.
- Copy button that copies the source — never the line numbers.
- Optional line numbers in a sticky gutter that stays put while the code scrolls.
- Soft wrap or horizontal scroll, whichever you configure.
- Diff blocks tint whole lines so `+` and `-` read at a glance.

## Also rendered

Tables (including colspan/rowspan and alignment), task lists, footnotes,
definition lists, abbreviations, emoji, sub/sup, heading anchors, a table of
contents (sidebar built from the headings, or inline with `[[toc]]`),
[Mermaid](https://mermaid.js.org/) diagrams themed to match, and KaTeX math.

## Install

Requires Node.js 22.x and a SharePoint Online tenant you can deploy apps to.

```bash
npm install
npm run package          # gulp bundle --ship && gulp package-solution --ship
```

Upload `sharepoint/solution/markdown-formatter-spo.sppkg` to your tenant App
Catalog, choose **Enable this app and add it to all sites** (or add it per site),
then add **Markdown Formatter** to a page from the Content group of the web part
picker.

For local development against the hosted workbench:

```bash
cp .env.example .env     # set SPFX_SERVE_TENANT_DOMAIN=yourtenant
gulp trust-dev-cert      # first time only
npm run serve
```

### Network access

Two assets load from jsDelivr, and only when the matching feature is on: Mermaid
(`mermaid@11`) and the KaTeX stylesheet (`katex@0.16`). If your tenant restricts
outbound requests, allow `cdn.jsdelivr.net` or change the URLs at the top of
`src/webparts/markdownFormatter/utils/AssetLoader.ts` to a copy hosted in your
tenant. Everything else — markdown parsing, highlighting, all themes — is in the
bundle and works offline.

## Configuration

The property pane has three pages.

**Content** — where the markdown comes from: typed into the web part, a file
picked from a document library (with folder browsing, auto-reload on change, and
version history), or any URL that returns markdown.

**Appearance** — theme, colour mode (light, dark, or follow the SharePoint page
theme), reader theme switcher, content width, spacing, text size, toolbar and
file-info footer, and the code block options (highlighting, language header,
line numbers, wrapping, code text size).

**Features** — table of contents sidebar and its depth, heading anchors, Mermaid,
math, and raw HTML (off by default).

## Editing in the page

Put the page in edit mode and the web part becomes a split editor: markdown on
the left, live preview on the right, with **Edit / Split / Preview** layouts. If
the content came from a library file, **Save to SharePoint** writes it back,
warning you first if someone else has saved it since you opened it. This is a
plain textarea rather than Monaco — it always loads, and a large editor bundle is
hard to justify for the short edits that happen on a SharePoint page.

## Previewing themes without deploying

```bash
npm run demo             # writes demo/dist/index.html
```

Open that file in a browser: every theme and mode, with a sample document that
exercises callouts, code, tables, lists, math and diagrams. It runs the real
markdown pipeline and the real stylesheets, so it is also the quickest way to
check a change to a theme. Pass a path to preview your own file:

```bash
node demo/build-demo.js path/to/your.md
```

## Project layout

```
src/webparts/markdownFormatter/
  MarkdownFormatterWebPart.ts     web part, property pane, content loading
  styles/
    base.css                      the --mdf-* token contract and layout
    typography.css code.css syntax.css callouts.css tables-lists.css extras.css
    chrome.css                    toolbar, editor, version panel
    modifiers.css                 width / spacing / text size options
    print.css
    themes/github.css obsidian.css vscode.css
  utils/
    MarkdownProcessor.ts          markdown-it pipeline (no SharePoint imports)
    markdownItCallouts.ts         GitHub / Obsidian / Wiki.js callouts
    codeBlocks.ts callouts.ts     code block markup, callout registry
    ThemeManager.ts               theme resolution and Mermaid colours
    ViewModeRenderer.ts EditModeManager.ts VersionPanel.ts ContentEnhancer.ts
    SharePointService.ts AssetLoader.ts MermaidRenderer.ts
samples/                          welcome + kitchen-sink markdown
demo/build-demo.js                static theme preview builder
scripts/build-strings.js          regenerates loc/en-us.js from samples/welcome.md
```

## Credits

Inspired by [Better Markdown for SharePoint](https://github.com/npapadacis/better-markdown-webpart)
by Nath Papadacis (MIT) — the SPFx scaffolding conventions and the SharePoint
file-browsing approach follow that project. Colour values are taken from
[Primer](https://primer.style/), Obsidian's default theme, and VS Code's Dark+ /
Light+ themes, and belong to their respective owners; this project reimplements
the look, it does not redistribute their code.

## License

MIT — see [LICENSE](./LICENSE).
