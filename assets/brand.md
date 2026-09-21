# Brand assets

`markstrata-brand-v1/` is the delivered brand system and the master for
everything visual. **Do not edit anything inside it**, and read
[`markstrata-brand-v1/BRAND-GUIDE.md`](./markstrata-brand-v1/BRAND-GUIDE.md)
before using any of it: it covers the palette, the minimum sizes, the clear
space rule, which icon is drawn for which size band, and the type licensing.

Everything else in this folder is produced by `npm run brand`, which copies the
right file out of the package into each place the build expects and renders the
two composites that are made from brand artwork rather than shipped with it.
Nothing here should be edited by hand; the next build overwrites it.

```
npm install --no-save playwright && npx playwright install chromium
npm run brand
```

## Copied out of the package

| File | Comes from | Used by |
|---|---|---|
| `mark.svg` | `icon/markstrata-glyph.svg` | Page headers, the site |
| `mark-small.svg` | `icon/markstrata-icon-16.svg` | Below 24px, where the second stratum is dropped |
| `mark-mono-light.svg` / `mark-mono-dark.svg` | `icon/markstrata-glyph-mono-*.svg` | One colour, on photographs or coloured surfaces |
| `lockup-horizontal.svg` | `lockup/markstrata-lockup-horizontal.svg` | The site header, the README |
| `lockup-horizontal-dark.svg` | the reversed lockup | The same, on dark surfaces |
| `lockup.svg` | the stacked lockup | Narrow columns |
| `lockup-tagline.svg` | the tagline lockup | First contact: the social card |
| `icons/*.png` | `export/markstrata-icon-*.png` | Favicons and app icons |
| `../sharepoint/assets/icon.png` | `export/markstrata-icon-96.png` | The app catalog tile, which SharePoint validates at exactly 96×96 |

The web part manifest's `iconImageUrl` is also written from the package's own
`export/spfx-iconImageUrl.txt`. It is an SVG data URI at 690 characters, which
matters because it travels inside the manifest into every page that loads the
web part.

## Rendered here

| File | What it is |
|---|---|
| `social-card.png` | 1200×630, the tagline lockup on Chalk. The ratio GitHub, Slack and Teams all crop to |
| `webpart-tile.jpg` | The markdown web part's tile: markdown source at an angle, with the mono-light glyph. Content and styling live in `scripts/webpart-tile.js` |
| `webpart-tile-html.jpg` | The HTML web part's tile: the same editor and the same palette, showing HTML source instead, so the two entries in the toolbox are told apart at a glance |
| `webpart-preview.jpg` | The same markdown scene at 195x110, for the full-page app picker, whose preview panel is landscape rather than 4:3 |
| `webpart-preview-html.jpg` | And the HTML one, for the same panel |

All four are JPEGs because they are photographic; the same image as a
PNG is six times the size.
