# Changelog

All notable changes to this project are recorded here. Versions follow
[semantic versioning](https://semver.org/); the SharePoint solution version is
the same number with a fourth part appended (1.2.0 -> 1.2.0.0), stamped by
`scripts/set-version.js` when a release is tagged.

## 1.0.0

First release.

### Rendering

- Markdown rendered with markdown-it: tables (including colspan, rowspan and
  alignment), task lists, footnotes, definition lists, abbreviations, emoji,
  sub/sup, heading anchors, and a table of contents.
- Callouts in three syntaxes: GitHub alerts (`> [!NOTE]`), Obsidian callouts
  with custom titles and foldable `+`/`-` variants, and the Wiki.js
  `{.is-info}` classes used by earlier SharePoint markdown web parts.
- Code blocks with a language header, optional filename
  (` ```ts title="app.ts" `), a copy button that never copies line numbers,
  and per-fence `wrap` / `nowrap` / `numbers` / `nonumbers` flags.
- Mermaid diagrams, themed to match the selected theme, and KaTeX maths.

### Themes

- GitHub, Obsidian and VS Code, each in light and dark, plus a mode that
  follows the SharePoint page theme.
- Themes are CSS custom property sets: colours, typography, code block shape,
  callout shape and syntax token colours. Adding one is a file and a dropdown
  entry, not a change to the structural CSS.
- Reading options independent of theme: content width, spacing, text size and
  code text size.
- Optional reader-side theme switcher, remembered per web part per browser.

### SharePoint

- Content from a document library (with folder browsing, reload-on-change and
  version history with preview and restore), from any URL, or typed into the
  web part.
- Rendered text is published to Microsoft Search through
  `isSearchablePlainText`, so markdown content is findable - a client-side web
  part renders after the crawler has seen the page, so without this the content
  is invisible to search.
- Split editor with live preview while the page is in edit mode, Ctrl+S to save
  back to the source file, and a warning if someone else saved it first.
- No runtime dependency on a third-party CDN: Mermaid is a lazily loaded chunk
  of the solution and KaTeX's stylesheet and fonts are bundled.

### Accessibility and layout

- The table of contents is a column of the layout or a block above the content,
  never an overlay, and it can be placed left, right, inline or switched off.
  It collapses in narrow columns and never covers the page's editing controls.
- Layout decisions use container queries, so a web part in a one-third column
  behaves like a narrow layout however wide the window is.
- Every theme and mode was checked for contrast; light-mode accents that fell
  below WCAG AA were darkened with their hue preserved (see THEMES.md).
