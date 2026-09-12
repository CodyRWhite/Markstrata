# Markstrata Markdown brand assets

Everything in this folder except `mark.svg` is generated. `mark.svg` is the
master artboard — the ink-drop mark above the MARKSTRATA / MARKDOWN lockup — and
`scripts/build-brand.js` cuts every other asset out of it:

```
npm install --no-save playwright && npx playwright install chromium
npm run brand
```

Change the logo by changing `mark.svg` and re-running that. Never hand-edit a
generated file; the next build overwrites it.

## Palette

| | Hex | RGB | Used for |
|---|---|---|---|
| Ink navy | `#013463` | 1, 52, 99 | The drop, the MARKSTRATA wordmark, the rules |
| Signal cyan | `#36a7ca` | 54, 167, 202 | The hash, the falling droplet, MARKDOWN |
| Page slate | `#a7bcd0` | 167, 188, 208 | The turned corner of the page |
| Navy on dark | `#2f7fc4` | 47, 127, 196 | Navy, lifted for dark surfaces |
| Slate on dark | `#c3d4e4` | 195, 212, 228 | Slate, lifted for dark surfaces |

Ink navy sits at about 1.4:1 against a dark UI surface — well under the 3:1 a
graphic needs to stay legible — which is the whole reason the `-dark` variants
exist. Signal cyan clears 4.5:1 against both a white page and a dark surface,
so it is the same colour in both.

The document page inside the drop is **not painted**: the drop's outline winds
around it, so the page takes the colour of whatever is behind the mark. That is
deliberate — the mark sits on a white page in light mode and on the surface
colour in dark mode — but it does mean the mark wants a plain background, not a
photograph or a busy gradient.

## Which file to use

| File | Use it for |
|---|---|
| `lockup.svg` | The stacked logo on a light background: READMEs, title slides, anywhere with height to spare |
| `lockup-dark.svg` | The same, on a dark background |
| `lockup-horizontal.svg` | The logo in a row — nav bars, page headers, toolbars |
| `lockup-horizontal-dark.svg` | The same, on a dark background |
| `mark.svg` | The drop on its own, at 40px and up — app tiles, avatars, a page header |
| `mark-dark.svg` | The same, on a dark background |
| `mark-small.svg` | The drop below 40px. The turned corner and the falling droplet break into stray pixels at that size, so this one drops them |
| `mark-mono.svg` | One colour, inherited from `color`. See the note below |
| `wordmark.svg` / `wordmark-dark.svg` | Type only, where the mark already appears nearby |
| `icons/*.png` | Favicons and app icons, rasterised from the marks above |
| `social-card.png` | The 1200×630 preview GitHub, Slack and Teams crop to |

`mark-mono.svg` paints with `currentColor`, which only resolves when the SVG is
**inlined** in the page. Loaded through `<img src="mark-mono.svg">` it has no
`color` to inherit and renders black. Inline it, or use one of the colour marks.

## Clear space and minimum size

Keep clear space around the logo of at least the width of the `I` in MARKSTRATA —
roughly 3% of the lockup's width.

The stacked lockup needs about **160px of width** before MARKDOWN stops being
readable; the horizontal one gets there at about **24px of height**. Below
either, use the mark on its own.

## Don't

- Recolour the artwork outside the palette above, or add effects to it
- Stretch it — every asset has a fixed `viewBox`, so keep the aspect ratio
- Rebuild the wordmark in a font; the letterforms are outlines, not live text
- Place the colour marks on a photograph, or on a background close to `#013463`
