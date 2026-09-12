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

`npm run demo` writes `demo/dist/index.html`, a self-contained preview of every
theme that runs the real pipeline - the quickest way to check a rendering or
theme change without deploying to a tenant.

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

## Toolchain

The build is SPFx 1.21.1 with gulp, deliberately, rather than 1.22.x with Heft.
1.21.1 is supported, the build is verified end to end here, and the migration
touches every config file in the repo for no user-visible gain. Two things are
worth knowing if you do migrate later:

- The compiler SPFx 1.21 pins is TypeScript 4.7, which cannot parse the
  TypeScript 5 syntax in Mermaid's transitive `@types/d3-*`. That is why
  `src/types/mermaid.d.ts` and the `paths` entry in `tsconfig.json` exist; both
  can be deleted once the compiler is 5.x.
- `npm audit` findings against `@microsoft/*` packages all come from one `ajv`
  advisory inside `@rushstack/node-core-library`. It is present in 1.22.x too,
  and it is build-time code, not shipped to the browser.

## Adding a theme

See [THEMES.md](./THEMES.md). `npm test` enforces that every theme declares the
same set of tokens, so a half-finished theme fails the build rather than
rendering with missing colours.
