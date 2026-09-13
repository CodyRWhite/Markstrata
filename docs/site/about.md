# About Markstrata Markdown

Markstrata Markdown is a SharePoint Framework web part that renders markdown on a
SharePoint page, with themes that match the editors your documentation is
actually written in.

## Why it exists

Plenty of teams keep their documentation in markdown: in a repository, in
Obsidian, in a folder of `.md` files someone syncs to SharePoint. Getting it
onto an intranet page usually means one of two compromises: paste it in as rich
text and lose the source, or use a markdown web part and accept how it renders.

The existing web parts render, but they are hard to *read*. Code blocks come out
on a fixed near-black fill whatever the page theme is, with a text shadow and an
inset glow over the syntax colours. Line numbers are absolutely positioned, so
they overlap long lines, and they get copied along with the code. Note blocks
use saturated fills that fight the text sitting on them. None of it is wrong,
exactly; it is just tiring to read a page of.

This project started as a fix for those specific irritations and turned into a
rewrite. The rendering is from scratch.

## How it is built

The idea the whole thing rests on is that **a theme is data, not code**. Every
colour, font, radius and spacing value is a CSS custom property, and a theme is
a file that sets them. The structural stylesheets never name a colour. That is
what makes three faithful themes practical rather than three sets of overrides
fighting each other, and it is enforced: a test fails the build if a theme
leaves a token undefined, or if a structural stylesheet hard-codes a hex value.

A few other decisions worth knowing about:

> [!NOTE] Nothing is fetched from a CDN
> Markdown parsing, syntax highlighting, KaTeX's stylesheet **and its fonts**,
> and Mermaid all ship inside the solution package. It works in tenants that
> block outbound requests, and no external service can change what runs on your
> pages. Mermaid is a lazily loaded chunk, so pages without a diagram never
> download it.

> [!NOTE] Layout responds to the web part, not the window
> A web part in a one-third column on a wide monitor has to behave like a narrow
> layout. A media query cannot see that, so the layout uses container queries
> and measures the web part itself.

> [!NOTE] The content reaches Microsoft Search
> Client-side web parts render after the search crawler has looked at the page,
> which is why markdown in similar web parts is usually invisible to search.
> The rendered text is published to the index when the page is saved.

## Credit where it is due

This project was prompted by
[Better Markdown for SharePoint](https://github.com/npapadacis/better-markdown-webpart)
by Nath Papadacis, which gets a lot right and which several of these ideas
argue with. Its open issues and the security review in its open pull request
shaped what got built here: search indexing, per-fence word wrap, toolbar
visibility, usable editing in narrow columns, diagrams surviving a refresh, and
current dependencies with nothing loaded from a CDN.

GitHub, Obsidian and Visual Studio Code are trademarks of their respective
owners. The theme names describe which editor's rendering each theme is
modelled on; this project is not affiliated with or endorsed by any of them.

## Licence

MIT. Use it, fork it, ship it inside your organisation, with no attribution
required.
