/**
 * .SYNOPSIS
 * The shape of the documentation site: which pages exist, what they are built
 * from, the two sections they are split into, and the header and footer they
 * share.
 *
 * .DESCRIPTION
 * Every page is generated - the markdown ones through the web part's own
 * pipeline, the demo through its real renderer classes - so this file is the
 * only place the navigation is written down. Adding a page is an entry here
 * and a markdown file.
 *
 * The site serves two readers who want different things. An administrator is
 * deciding whether to install it: what it is, what it looks like, how it is
 * installed in SharePoint and how it reaches Teams. Everybody after them is
 * writing or reading the documents: the settings, the syntax, how links
 * between documents behave, what the toolbar does. Those are the two sections,
 * and each page says which one it belongs to. The navigation draws them apart
 * rather than running all twelve links together.
 *
 * .USAGE
 *   const { PAGES, page, linkTo, header, footer } = require('./site');
 *
 *   const href = linkTo('home', 'docs');   // '../docs/', relative on purpose
 *
 * .NOTES
 * Since:     0.0.6
 * Ships in:  nothing - it builds or drives what ships
 * Requires:  nothing else in this project
 */

/*
 * Where to send people who want to say thanks. Both of these are also listed
 * in .github/FUNDING.yml, which is what puts the Sponsor button on the
 * repository page - keep the two in step.
 */
const COFFEE_HANDLE = 'codyrwhite';
const COFFEE_URL = `https://buymeacoffee.com/${COFFEE_HANDLE}`;
const SPONSORS_USER = 'CodyRWhite';
const SPONSORS_URL = `https://github.com/sponsors/${SPONSORS_USER}`;

const REPO = 'https://github.com/CodyRWhite/Markstrata';

/*
 * The two halves of the site, in the order the navigation draws them. A page
 * names one of these; a hidden page names none, because it is not in the
 * navigation to be grouped.
 */
const SECTIONS = [
  { id: 'evaluate', label: 'Evaluate' },
  { id: 'use', label: 'Documentation' }
];

/*
 * `source` is the markdown the page is built from; the demo has none because
 * it is the web part itself rather than a document. `dir` is the directory it
 * is published at, empty for the site root.
 *
 * `render` overrides the options the markdown pipeline is given for that one
 * page, and `demoBar` asks for the theme controls above the document. Only the
 * pages whose subject is the rendering carry those: on a page of prose the bar
 * is five dropdowns nobody came for, and on a phone it fills the screen before
 * the first sentence.
 *
 * `toc: 'off'` leaves a page without a contents. The front page is the one
 * that wants it: it is four short sections and two cards, and a sidebar
 * listing them says only that this is a documentation site, which is the half
 * of it a visitor has not asked about yet.
 *
 * Folders are one level deep on purpose. The addresses under them are named in
 * the SharePoint package, the Teams manifest and the README, and a reader who
 * bookmarked /docs/ or /syntax/ before this rewrite still lands on the page
 * they meant.
 */
const PAGES = [
  {
    id: 'home', folder: '', label: 'Overview', title: 'Markstrata',
    section: 'evaluate',
    source: 'docs/site/home.md', toc: 'off',
    description: 'Markdown for SharePoint and Teams, themed like the editors you write it in: GitHub, Obsidian and VS Code, light and dark.'
  },
  {
    id: 'demo', folder: 'demo', label: 'Demo', title: 'Demo - Markstrata',
    section: 'evaluate',
    description: 'The web part itself, running in your browser: toolbar, contents, copy buttons, the property pane and the split editor.'
  },
  {
    id: 'themes', folder: 'themes', label: 'Themes', title: 'Themes - Markstrata',
    section: 'evaluate',
    source: 'samples/kitchen-sink.md', demoBar: true,
    /* The kitchen sink is the document that claims to exercise everything, so
       the two settings that are off by default in the web part have to be on
       here or it claims two things it is not showing: it was rendering
       `[[deploy]]` as literal brackets and `#kitchen-sink` as a word with a
       hash in front, in the same sentences that say what each becomes. */
    render: { enableWikiLinks: true, enableTags: true },
    description: 'Every feature at once - callouts, code, tables, diagrams and maths - in each theme, so you can judge one at a glance.'
  },
  {
    id: 'install', folder: 'install', label: 'Install', title: 'Install - Markstrata',
    section: 'evaluate',
    source: 'docs/site/install.md',
    description: 'Uploading the package to the App Catalog, adding the web part to a page, upgrading it, and what it asks of a tenant.'
  },
  {
    id: 'teams', folder: 'teams', label: 'Teams', title: 'Microsoft Teams - Markstrata',
    section: 'evaluate',
    source: 'docs/site/teams.md',
    description: 'A channel\'s Files are a document library, so the same web part reads the same documents as a Teams tab. How Sync to Teams gets it there.'
  },
  {
    id: 'about', folder: 'about', label: 'About', title: 'About - Markstrata',
    section: 'evaluate',
    source: 'docs/site/about.md',
    description: 'Why Markstrata exists, how it is built, and what it borrows from the web part that prompted it.'
  },
  {
    id: 'support', folder: 'support', label: 'Support', title: 'Support - Markstrata',
    /* Out of the navigation and into the footer, beside the privacy policy and
       the terms. It sat in Evaluate because it was in the old navigation, but
       nobody deciding whether to install this is reading about ways to help;
       it is a page somebody arrives at on purpose, which is what the footer is
       for. Hidden has never meant orphaned here and there is a check for
       that. */
    hidden: true,
    source: 'docs/site/support.md',
    description: 'Markstrata is free and MIT licensed. Ways to help, most of which cost nothing.'
  },

  {
    id: 'docs', folder: 'docs', label: 'Settings', title: 'Settings - Markstrata',
    section: 'use',
    source: 'docs/site/documentation.md',
    description: 'Every setting in the property pane: content sources, themes, code block flags, callouts, tables, pictures and the contents.'
  },
  {
    id: 'syntax', folder: 'syntax', label: 'Syntax', title: 'Syntax - Markstrata',
    section: 'use',
    source: 'docs/site/syntax.md',
    description: 'Every piece of markdown Markstrata renders, with what you write beside what it turns into.'
  },
  {
    id: 'linking', folder: 'linking', label: 'Linking', title: 'Linking documents - Markstrata',
    section: 'use',
    source: 'docs/site/linking.md',
    /* The one page that has to show a wiki link working rather than describe
       one: the [[#heading]] form resolves inside this page, so it is a live
       example rather than a claim. */
    render: { enableWikiLinks: true },
    description: 'Wiki links, what a bare [[Page]] finds, opening a linked document in the page, the trail back out, and ?strataDoc on the address.'
  },
  {
    id: 'reading', folder: 'reading', label: 'Reading', title: 'Reading a document - Markstrata',
    section: 'use',
    source: 'docs/site/reading.md',
    description: 'What a reader gets around the document: the toolbar, the contents sidebar in a long document, and the way back to the top.'
  },
  {
    id: 'editing', folder: 'editing', label: 'Editing', title: 'Editing in the page - Markstrata',
    section: 'use',
    source: 'docs/site/editing.md',
    description: 'What changes when the SharePoint page goes into edit mode: the split editor, the live preview, and saving back to the library.'
  },
  /*
   * Below the line: pages that exist because something has to point at them,
   * rather than because a reader is looking for them. The web part's package
   * names a privacy policy and terms of use, and Teams and the app catalog
   * show those to everybody who installs it - so they have to be real pages at
   * stable addresses. They are linked from the footer and left out of the
   * navigation, which is for the pages somebody might actually want.
   */
  {
    id: 'privacy', folder: 'privacy', label: 'Privacy', title: 'Privacy - Markstrata',
    source: 'docs/site/privacy.md', hidden: true,
    description: 'What the web part reads, what it never sends, and what this site counts.'
  },
  {
    id: 'terms', folder: 'terms', label: 'Terms of use', title: 'Terms of use - Markstrata',
    source: 'docs/site/terms.md', hidden: true,
    description: 'MIT licensed, provided as is, and not a Microsoft product.'
  }
];

function page(id) {
  const found = PAGES.find((entry) => entry.id === id);
  if (!found) {
    throw new Error(`no site page called "${id}"`);
  }
  return found;
}

/*
 * Links are relative, not root-relative: the site is published under a
 * repository path (/Markstrata/), so a leading slash would land on the
 * domain root. Every page but the home page sits one directory down.
 */
function linkTo(fromId, toId) {
  const toRoot = page(fromId).folder ? '../' : '';
  const target = page(toId).folder;
  return `${toRoot}${target ? `${target}/` : ''}` || './';
}

/*
 * The two logos, one per colour mode.
 *
 * Both are in the markup and CSS shows one, rather than a <picture> keyed off
 * prefers-color-scheme: the reader can choose a mode here, so the system
 * setting is not the answer. The mode is settled in <head> before the first
 * paint, so the right one is the only one ever drawn.
 */
function lockup(toRoot) {
  return `<img class="site-logo site-logo--light" src="${toRoot}brand/lockup-horizontal.svg" alt="Markstrata">`
    + `<img class="site-logo site-logo--dark" src="${toRoot}brand/lockup-horizontal-dark.svg" alt="" aria-hidden="true">`;
}

const SUN_ICON = '<svg class="site-mode-icon site-mode-icon--sun" viewBox="0 0 24 24" aria-hidden="true" '
  + 'focusable="false" fill="none" stroke="currentColor" stroke-width="1.8" stroke-linecap="round">'
  + '<circle cx="12" cy="12" r="4.2"></circle>'
  + '<path d="M12 2.5v2M12 19.5v2M2.5 12h2M19.5 12h2M5.2 5.2l1.4 1.4M17.4 17.4l1.4 1.4M18.8 5.2l-1.4 1.4M6.6 17.4l-1.4 1.4"></path>'
  + '</svg>';

const MOON_ICON = '<svg class="site-mode-icon site-mode-icon--moon" viewBox="0 0 24 24" aria-hidden="true" '
  + 'focusable="false" fill="none" stroke="currentColor" stroke-width="1.8" stroke-linecap="round" stroke-linejoin="round">'
  + '<path d="M20 14.2A8.2 8.2 0 0 1 9.8 4a8.2 8.2 0 1 0 10.2 10.2Z"></path>'
  + '</svg>';

/*
 * The light and dark switch.
 *
 * A function rather than a constant because it is not only the header's: the
 * bare demo page `npm run demo` builds has no site chrome around it and still
 * has to be readable in both modes, so it carries the same button in its own
 * bar. One button, one script, one place the choice is written down.
 */
function modeToggle() {
  return '<button type="button" class="site-mode" id="site-mode-toggle" '
    + `aria-label="Switch to the dark mode">${SUN_ICON}${MOON_ICON}</button>`;
}

/* One section's links, under its own label. */
function navGroup(currentId, section) {
  const links = PAGES
    .filter((entry) => !entry.hidden && entry.section === section.id)
    .map((entry) => {
      const current = entry.id === currentId;
      return `<a class="site-nav-link${current ? ' is-current' : ''}" href="${linkTo(currentId, entry.id)}"`
        + `${current ? ' aria-current="page"' : ''}>${entry.label}</a>`;
    })
    .join('');
  return `<div class="site-nav-group">
    <span class="site-nav-label" id="site-nav-${section.id}">${section.label}</span>
    <div class="site-nav-list" role="group" aria-labelledby="site-nav-${section.id}">${links}</div>
  </div>`;
}

/*
 * The site header: the logo and the actions on one row, the two sections of
 * the navigation on the next.
 *
 * Every page of both sections is linked from every page, the hidden ones
 * included, so a reader who arrived on the privacy policy from the app catalog
 * has the whole site in front of them rather than a dead end.
 */
function header(currentId) {
  const toRoot = page(currentId).folder ? '../' : '';
  return `<header class="site-header">
  <div class="site-header-bar">
    <a class="site-brand" href="${linkTo(currentId, 'home')}" aria-label="Markstrata">${lockup(toRoot)}</a>
    <div class="site-header-actions">
      ${modeToggle()}
      <a class="site-cta" href="${REPO}/releases/latest">Download</a>
    </div>
  </div>
  <nav class="site-nav" aria-label="Site">${SECTIONS.map((section) => navGroup(currentId, section)).join('')}</nav>
</header>`;
}

function footer(currentId) {
  return `<footer class="site-footer">
  <p class="site-footer-line">Markstrata renders markdown from a SharePoint document library, on a page or in a Teams tab.</p>
  <p>
    <a href="${REPO}">GitHub</a> ·
    <a href="${REPO}/releases/latest">Releases</a> ·
    <a href="${REPO}/blob/main/LICENSE">MIT licence</a> ·
    <a href="${linkTo(currentId, 'support')}">Support this project</a>
  </p>
  <p>
    <a href="${linkTo(currentId, 'privacy')}">Privacy</a> ·
    <a href="${linkTo(currentId, 'terms')}">Terms of use</a>
  </p>
</footer>`;
}

/*
 * The reader's colour mode, settled before anything is painted.
 *
 * Both builders used to decide this at the foot of the page, so a page was
 * drawn light, painted, and then repainted dark: a white flash on every load
 * for anyone reading in the dark. Deciding it in the head costs one small
 * blocking script and removes the flash entirely.
 *
 * It sets the page canvas only. The web part's own root does not exist yet on
 * either page, so each builder finishes the job where its root appears.
 */
const MODE_KEY = 'markstrata-site-mode';

const MODE_BOOTSTRAP = `<script>
(function () {
  var mode;
  try { mode = window.localStorage.getItem(${JSON.stringify(MODE_KEY)}); } catch (error) { mode = null; }
  if (mode !== 'light' && mode !== 'dark') {
    mode = window.matchMedia && window.matchMedia('(prefers-color-scheme: dark)').matches
      ? 'dark' : 'light';
  }
  window.__strataMode = mode;
  document.documentElement.setAttribute('data-site-mode', mode);
  document.documentElement.style.colorScheme = mode;
})();
</script>`;

/*
 * The switch in the header, and the one place the choice is written down.
 *
 * It sets the page's own mode and then says so with an event, because what
 * else has to move differs by page: the markdown pages repaint the web part's
 * root and re-draw their diagrams, and the demo page re-draws the whole web
 * part and refreshes the property pane that also holds the setting. Neither
 * builder reaches into the other's page to do it.
 */
const MODE_SCRIPT = `<script>
(function () {
  var button = document.getElementById('site-mode-toggle');
  if (!button) { return; }
  var KEY = ${JSON.stringify(MODE_KEY)};

  function stored() {
    try {
      var saved = window.localStorage.getItem(KEY);
      return saved === 'light' || saved === 'dark' ? saved : null;
    } catch (error) { return null; }
  }

  function label(mode) {
    button.setAttribute('aria-label', mode === 'dark'
      ? 'Switch to the light mode' : 'Switch to the dark mode');
    button.title = button.getAttribute('aria-label');
  }

  function apply(mode, remember) {
    document.documentElement.setAttribute('data-site-mode', mode);
    document.documentElement.style.colorScheme = mode;
    window.__strataMode = mode;
    if (remember) {
      /* Storage throws in a private window. The change still applies; it is
         only the memory of it that is lost. */
      try { window.localStorage.setItem(KEY, mode); } catch (error) { /* no memory */ }
    }
    window.dispatchEvent(new CustomEvent('strata-site-mode', { detail: mode }));
  }

  /* Relabelled from the event rather than from the click, so a mode changed
     anywhere else on the page - the demo page's property pane holds the same
     setting - leaves the button saying what it will do next. */
  window.addEventListener('strata-site-mode', function (event) { label(event.detail); });

  label(document.documentElement.getAttribute('data-site-mode') || 'light');
  button.addEventListener('click', function () {
    apply(document.documentElement.getAttribute('data-site-mode') === 'dark' ? 'light' : 'dark', true);
  });

  /* Until a reader picks one, the operating system decides, and keeps
     deciding: a laptop that goes dark at sunset takes the page with it. */
  var query = window.matchMedia ? window.matchMedia('(prefers-color-scheme: dark)') : null;
  if (query && query.addEventListener) {
    query.addEventListener('change', function () {
      if (!stored()) { apply(query.matches ? 'dark' : 'light', false); }
    });
  }
})();
</script>`;

/*
 * The colours the chrome is drawn in, and the canvas the web part sits on.
 *
 * Always included, by both builders, because the bare harness and the bare
 * demo need a canvas too. The values are the brand palette in
 * assets/markstrata-brand-v1/tokens; they are written out rather than imported
 * because these pages are single self-contained files and a stylesheet they
 * had to fetch would be one more thing to copy beside each of them.
 */
const SITE_TOKENS_CSS = `
:root {
  color-scheme: light;
  --site-canvas: #F2F6F6;
  --site-chrome: #FFFFFF;
  --site-chrome-sunken: #F6F9F9;
  --site-line: #DCE5E7;
  --site-ink: #072830;
  --site-muted: #4E6870;
  --site-accent: #0F7B86;
  --site-accent-hover: #0C666F;
  --site-accent-ink: #FFFFFF;
  --site-accent-soft: rgba(15, 123, 134, .10);
  --site-intro: #3E6570;
  --site-shadow: 0 1px 2px rgba(7, 40, 48, .06), 0 8px 24px rgba(7, 40, 48, .05);
}
:root[data-site-mode="dark"] {
  color-scheme: dark;
  --site-canvas: #04181D;
  --site-chrome: #072830;
  --site-chrome-sunken: #061F26;
  --site-line: #14343C;
  --site-ink: #EDF2F3;
  --site-muted: #94A8AE;
  --site-accent: #2AA3AC;
  --site-accent-hover: #62BEC5;
  --site-accent-ink: #04181D;
  --site-accent-soft: rgba(98, 190, 197, .14);
  --site-intro: #9FBCBE;
  --site-shadow: none;
}

/* The light and dark switch. Here rather than with the rest of the chrome
   because the bare demo page carries it without carrying a header. */
.site-mode {
  display: inline-flex; align-items: center; justify-content: center;
  width: 34px; height: 34px; padding: 0; cursor: pointer;
  border: 1px solid var(--site-line); border-radius: 8px;
  background: transparent; color: var(--site-muted);
}
.site-mode:hover { color: var(--site-ink); border-color: var(--site-accent); }
.site-mode:focus-visible { outline: 2px solid var(--site-accent); outline-offset: 2px; }
.site-mode-icon { width: 18px; height: 18px; display: block; }
.site-mode-icon--moon { display: none; }
:root[data-site-mode="dark"] .site-mode-icon--sun { display: none; }
:root[data-site-mode="dark"] .site-mode-icon--moon { display: block; }
`;

/* Styling for the chrome above. The page body below it is the web part's. */
const CHROME_CSS = `
.site-header {
  background: var(--site-chrome);
  color: var(--site-ink);
  border-bottom: 1px solid var(--site-line);
  font: 15px/1.4 -apple-system, BlinkMacSystemFont, "Segoe UI", sans-serif;
}
.site-header-bar {
  display: flex; flex-wrap: wrap; gap: 12px 22px; align-items: center;
  padding: 16px 22px 12px; max-width: 1180px; margin: 0 auto;
}
.site-brand { margin-right: auto; display: flex; align-items: center; }
.site-logo { height: 30px; display: block; }
.site-logo--dark { display: none; }
:root[data-site-mode="dark"] .site-logo--light { display: none; }
:root[data-site-mode="dark"] .site-logo--dark { display: block; }
.site-header-actions { display: flex; align-items: center; gap: 10px; }
.site-cta {
  padding: 8px 16px; border-radius: 8px; background: var(--site-accent);
  color: var(--site-accent-ink); font-weight: 600; text-decoration: none;
}
.site-cta:hover { background: var(--site-accent-hover); }

/* The two sections, side by side and each under its own word. A reader who
   wants to know whether to install it and a reader who has to write a document
   in it are after different pages, and running all of them together as one bar
   told neither of them which half was theirs. */
.site-nav {
  display: flex; flex-wrap: wrap; gap: 6px 30px; align-items: baseline;
  padding: 0 22px 12px; max-width: 1180px; margin: 0 auto;
}
.site-nav-group { display: flex; flex-wrap: wrap; gap: 4px 10px; align-items: baseline; }
.site-nav-group + .site-nav-group { padding-left: 30px; border-left: 1px solid var(--site-line); }
.site-nav-label {
  font-size: 11px; font-weight: 700; letter-spacing: .09em; text-transform: uppercase;
  color: var(--site-muted);
}
.site-nav-list { display: flex; flex-wrap: wrap; gap: 2px; }
.site-nav-link {
  padding: 5px 10px; border-radius: 6px; color: var(--site-ink);
  text-decoration: none; font-size: 14px;
}
.site-nav-link:hover { background: var(--site-accent-soft); color: var(--site-accent); }
.site-nav-link.is-current {
  background: var(--site-accent-soft); color: var(--site-accent); font-weight: 600;
}

.site-footer {
  padding: 34px 22px 46px; background: var(--site-chrome); color: var(--site-muted);
  border-top: 1px solid var(--site-line);
  font: 14px/1.7 -apple-system, BlinkMacSystemFont, "Segoe UI", sans-serif;
  text-align: center;
}
.site-footer p { margin: 0 0 6px; }
.site-footer-line { color: var(--site-ink); }
.site-footer a { color: var(--site-accent); }

/* ------------------------------------------------------------ front page */

/* The front page's own furniture. It sits inside rendered markdown, so it is
   written as HTML in home.md and styled here: nothing on a SharePoint page has
   any use for it, so none of it belongs in the web part's stylesheets. */
.strata-content .site-lead {
  margin: 0 0 26px; font-size: 1.2em; line-height: 1.55; color: var(--site-intro);
}
.site-split { display: grid; gap: 16px; margin: 26px 0 32px; }
@media (min-width: 720px) { .site-split { grid-template-columns: 1fr 1fr; } }
.strata-content a.site-card {
  display: block; padding: 20px 22px; border-radius: 12px; text-decoration: none;
  border: 1px solid var(--site-line); background: var(--site-chrome);
  box-shadow: var(--site-shadow); color: var(--site-ink);
}
.strata-content a.site-card:hover { border-color: var(--site-accent); }
.site-card-kicker {
  display: block; font-size: 11px; font-weight: 700; letter-spacing: .09em;
  text-transform: uppercase; color: var(--site-accent); margin-bottom: 8px;
}
.site-card-title { display: block; font-size: 18px; font-weight: 600; margin-bottom: 6px; }
.site-card-text { display: block; font-size: 14px; line-height: 1.6; color: var(--site-muted); }

/* ------------------------------------------------------------- specimens */

/* A panel of markup the web part's own renderer produced at build time, put on
   the page so a behaviour that needs a SharePoint library behind it can still
   be shown rather than only described. The note under each one says so; the
   controls inside are markup without their handlers and do nothing. */
/* Drawn in the document's own tokens rather than the site's, because a
   specimen is a piece of the document: on an Obsidian dark page it has to be
   Obsidian dark, not a teal-tinted panel from the site chrome. */
.strata-content .site-specimen {
  margin: 22px 0 26px; border: 1px solid var(--strata-border); border-radius: 10px;
  overflow: hidden; background: var(--strata-bg-elevated);
}
/* Nothing in a specimen answers, so nothing in one invites a click. The note
   below the panel says the same thing in words. */
.site-specimen-frame { overflow-x: auto; pointer-events: none; background: var(--strata-bg); }
.site-specimen .strata-root { padding-block: 14px; }
/* The editor is 70% of the window tall in a web part, because that is a whole
   web part. Inside a paragraph of a page it is a figure, and a figure two
   screens deep is a page nobody scrolls past. */
.site-specimen .strata-editor { height: 300px; min-height: 0; }
/* Narrow, the editor stacks and gives each half two fifths of the window, which
   in a web part is right and in a figure is most of a phone screen twice over.
   Written past the rule that sets it, which is more specific than the one that
   sets the height above. */
@media (max-width: 720px) {
  .site-specimen .strata-editor[data-layout='split'] .strata-editor-pane,
  .site-specimen .strata-editor[data-layout='split'] .strata-preview-pane {
    height: 200px;
  }
}
.site-specimen-note {
  margin: 0; padding: 9px 14px; border-top: 1px solid var(--strata-border);
  color: var(--strata-text-muted);
  font: 12px/1.5 -apple-system, BlinkMacSystemFont, "Segoe UI", sans-serif;
}

/* --------------------------------------------------------------- support */

/* The support page's two buttons, styled here for the same reason. Scoped
   through .strata-content so they beat the theme's own link colour: without it
   a button reads as a blue hyperlink on a yellow slab. */
.support-buttons { display: flex; flex-wrap: wrap; gap: 12px; margin: 22px 0 28px; }
.strata-content a.support-btn {
  display: inline-block; padding: 12px 22px; border-radius: 8px;
  font-weight: 600; text-decoration: none; border: 1px solid transparent;
}
.strata-content a.support-btn--coffee { background: #ffdd00; color: #17120a; }
.strata-content a.support-btn--coffee:hover { background: #ffe74d; color: #17120a; }
.strata-content a.support-btn--sponsor { background: transparent; border-color: #a371f7; color: #a371f7; }
.strata-content a.support-btn--sponsor:hover { background: rgba(163, 113, 247, .14); color: #a371f7; }

@media (max-width: 720px) {
  .site-header-bar { padding: 14px 16px 10px; gap: 10px 12px; }
  .site-brand { margin-right: auto; }
  .site-nav { padding: 0 16px 12px; gap: 10px; }
  .site-nav-group { width: 100%; }
  .site-nav-group + .site-nav-group {
    padding-left: 0; padding-top: 10px;
    border-left: 0; border-top: 1px solid var(--site-line);
  }
  .site-footer { padding: 28px 16px 36px; }
}
`;

module.exports = {
  PAGES, SECTIONS, page, linkTo, header, footer, modeToggle,
  SITE_TOKENS_CSS, CHROME_CSS, MODE_BOOTSTRAP, MODE_SCRIPT, MODE_KEY,
  COFFEE_URL, COFFEE_HANDLE, SPONSORS_URL, SPONSORS_USER, REPO
};
