# Contributing

## Branches

Work happens on feature branches named for the feature:

```
feature/<short-description>      new work
fix/<short-description>          bug fixes
chore/<short-description>        tooling, dependencies, docs
```

`main` is the release branch. Open a pull request from the feature branch;
CI builds, lints, tests and packages every push.

## Commits

- Subject line in the imperative mood, under ~70 characters: "Add container
  query layout", not "Added..." or "Adding...".
- Body explains why the change was made, wrapped at 72 characters.
- No trailers: no `Co-Authored-By`, no tool or session attribution. Commits are
  authored by the person who owns the change.

```bash
git config user.name "Your Name"
git config user.email "you@example.com"
```

## Before you push

```bash
npm run lint     # eslint, zero warnings allowed
npm test         # unit tests for the markdown pipeline and themes
npm run package  # the .sppkg CI will build
```

Two ways to look at it without a tenant:

```bash
npm run demo           # demo/dist/index.html - every theme, real pipeline
npm run harness        # harness/dist/index.html - the real renderer classes
npm run harness:drive  # ...and drive them in Chromium (needs Playwright)
```

`demo` is for judging how markdown *renders*. `harness` is for the parts only a
running page exercises - the toolbar, the contents sidebar and its scroll
tracking, copy buttons, theme switching, diagram re-rendering, the split editor
and its live preview. SPFx removed the local workbench and the hosted one needs
a tenant, so this is as close to running the web part as you get locally. CI
runs `harness:drive` on every push.

## Releasing

Releases are built by `.github/workflows/release.yml` when a `v*.*.*` tag is
pushed. The tag is the version: it is stamped into `package.json` and
`config/package-solution.json` before the build, and the resulting `.sppkg` is
attached to a GitHub Release whose notes come from the matching `CHANGELOG.md`
section.

```bash
# 1. Add the release section to CHANGELOG.md and commit it.
# 2. Tag and push.
git tag v1.1.0
git push origin v1.1.0
```

Nothing else is needed - do not commit a built `.sppkg`. To build one for a
test tenant without releasing, download the artifact from the CI run, or run
`npm run package` locally.

## The documentation site

`npm run site` builds `site/` (the landing page, the theme preview and the
working demo) from the same sources as the package. It is published to GitHub
Pages by `.github/workflows/pages.yml` on every push to `main`.

The workflow enables Pages itself through the API, so no manual setting is
needed. Two constraints still apply: a private repository needs a paid plan for
Pages at all, and the `github-pages` environment only accepts deployments from
the default branch unless other branches are added under **Settings ->
Environments** - so the site does not publish from a feature branch.

Note that a Pages site built from a private repository is still publicly
reachable on anything below Enterprise Cloud.

## Toolchain

The build is SPFx 1.23.2 with gulp 5. The Heft migration is still open: it
touches every config file for no user-visible gain, and the gulp rig builds,
serves and packages cleanly. Three things are worth knowing:

- The compiler SPFx pins is still TypeScript 4.7, which cannot parse the
  TypeScript 5 syntax in Mermaid's transitive `@types/d3-*`. That is why
  `src/types/mermaid.d.ts` and the `paths` entry in `tsconfig.json` exist; both
  can be deleted once the rig's compiler is 5.x.
- `typescript` in devDependencies is separate from that: it compiles the unit
  tests and the demo. It has to stay on 5.x, because TypeScript 7 removed
  `baseUrl` and `moduleResolution: node`, which the SPFx-compatible config
  needs.
- SPFx 1.23 resolves `url()` in a stylesheet as a module request, so KaTeX's
  bundled font references need the alias in `gulpfile.js`. Without it the
  package build fails outright.

## Adding a theme

See [THEMES.md](./THEMES.md). `npm test` enforces that every theme declares the
same set of tokens, so a half-finished theme fails the build rather than
rendering with missing colours.
