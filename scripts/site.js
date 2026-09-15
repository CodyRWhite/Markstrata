/*
 * The shape of the documentation site: which pages exist, what they are built
 * from, and the header and footer they share.
 *
 * Every page is generated - the markdown ones through the web part's own
 * pipeline, the demo through its real renderer classes - so this file is the
 * only place the navigation is written down. Adding a page is an entry here
 * and a markdown file.
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
 * `source` is the markdown the page is built from; the demo has none because
 * it is the web part itself rather than a document. `dir` is the directory it
 * is published at, empty for the site root.
 */
const PAGES = [
  {
    id: 'home', folder: '', label: 'Home', title: 'Markstrata',
    source: 'docs/site/home.md',
    description: 'Markdown for SharePoint, themed like the editors you write it in - GitHub, Obsidian and VS Code, in light and dark.'
  },
  {
    id: 'demo', folder: 'demo', label: 'Demo', title: 'Demo - Markstrata',
    description: 'The web part itself, running in your browser: toolbar, contents, copy buttons, theme switcher and the split editor.'
  },
  {
    id: 'themes', folder: 'themes', label: 'Themes', title: 'Themes - Markstrata',
    source: 'samples/kitchen-sink.md',
    description: 'Every feature at once - callouts, code, tables, diagrams and maths - in each theme, so you can judge one at a glance.'
  },
  {
    id: 'docs', folder: 'docs', label: 'Documentation', title: 'Documentation - Markstrata',
    source: 'docs/site/documentation.md',
    description: 'Install, content sources, themes, code block flags, callout syntaxes, the table of contents and editing in the page.'
  },
  {
    id: 'syntax', folder: 'syntax', label: 'Syntax', title: 'Syntax - Markstrata',
    source: 'docs/site/syntax.md',
    description: 'Every piece of markdown Markstrata renders, with what you write beside what it turns into.'
  },
  {
    id: 'about', folder: 'about', label: 'About', title: 'About - Markstrata',
    source: 'docs/site/about.md',
    description: 'Why Markstrata exists, how it is built, and what it borrows from the web part that prompted it.'
  },
  {
    id: 'support', folder: 'support', label: 'Support', title: 'Support - Markstrata',
    source: 'docs/site/support.md',
    description: 'Markstrata is free and MIT licensed. Ways to help - most of which cost nothing.'
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

/* The site header: the logo, the navigation, and the call to action. */
function header(currentId) {
  const toRoot = page(currentId).folder ? '../' : '';
  const links = PAGES
    .map((entry) => {
      const current = entry.id === currentId;
      return `<a class="site-nav-link${current ? ' is-current' : ''}" href="${linkTo(currentId, entry.id)}"`
        + `${current ? ' aria-current="page"' : ''}>${entry.label}</a>`;
    })
    .join('');
  /* The reversed lockup unconditionally: this bar is dark whatever the reader's
     colour scheme is, and keying the choice off prefers-color-scheme put the
     dark wordmark on the dark bar for anyone browsing in light mode. */
  return `<header class="site-header">
  <a class="site-brand" href="${linkTo(currentId, 'home')}" aria-label="Markstrata">
    <img src="${toRoot}brand/lockup-horizontal-dark.svg" alt="Markstrata">
  </a>
  <nav class="site-nav" aria-label="Site">${links}</nav>
  <a class="site-cta" href="${REPO}/releases/latest">Download</a>
</header>`;
}

function footer(currentId) {
  return `<footer class="site-footer">
  <p>Markstrata: a SharePoint web part that renders markdown the way you write it.</p>
  <p>
    <a href="${REPO}">GitHub</a> ·
    <a href="${REPO}/releases/latest">Releases</a> ·
    <a href="${REPO}/blob/main/LICENSE">MIT licence</a> ·
    <a href="${linkTo(currentId, 'support')}">Support this project</a>
  </p>
</footer>`;
}

/* Styling for the chrome above. The page body below it is the web part's. */
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

const CHROME_CSS = `
.site-header {
  display: flex; flex-wrap: wrap; gap: 10px 22px; align-items: center;
  padding: 14px 22px; background: #072830; color: #EAF2F2;
  font: 15px/1.4 -apple-system, BlinkMacSystemFont, "Segoe UI", sans-serif;
}
.site-brand { margin-right: auto; display: flex; align-items: center; }
.site-brand img { height: 30px; display: block; }
.site-nav { display: flex; flex-wrap: wrap; gap: 4px; }
.site-nav-link {
  padding: 6px 11px; border-radius: 6px; color: #C9E8EA; text-decoration: none;
}
.site-nav-link:hover { background: rgba(255, 255, 255, .1); color: #fff; }
.site-nav-link.is-current { background: rgba(98, 190, 197, .18); color: #62BEC5; }
.site-cta {
  padding: 7px 15px; border-radius: 6px; background: #0F7B86; color: #FFFFFF;
  font-weight: 600; text-decoration: none;
}
.site-cta:hover { background: #0C666F; }
.site-footer {
  padding: 30px 22px 44px; background: #072830; color: #9FBCBE;
  font: 14px/1.7 -apple-system, BlinkMacSystemFont, "Segoe UI", sans-serif;
  text-align: center;
}
.site-footer p { margin: 0 0 6px; }
.site-footer a { color: #62BEC5; }

/* The support page's two buttons. They sit inside rendered markdown, so they
   are styled here rather than in the web part's own stylesheets - nothing on a
   SharePoint page has any use for them. */
.support-buttons { display: flex; flex-wrap: wrap; gap: 12px; margin: 22px 0 28px; }
/* Scoped through .strata-content so these beat the theme's own link colour -
   without it a button reads as a blue hyperlink on a yellow slab. */
.strata-content a.support-btn {
  display: inline-block; padding: 12px 22px; border-radius: 8px;
  font-weight: 600; text-decoration: none; border: 1px solid transparent;
}
.strata-content a.support-btn--coffee { background: #ffdd00; color: #17120a; }
.strata-content a.support-btn--coffee:hover { background: #ffe74d; color: #17120a; }
.strata-content a.support-btn--sponsor { background: transparent; border-color: #a371f7; color: #a371f7; }
.strata-content a.support-btn--sponsor:hover { background: rgba(163, 113, 247, .14); color: #a371f7; }
@media (max-width: 620px) {
  .site-header { gap: 10px 12px; }
  .site-brand { margin-right: 0; width: 100%; }
}
`;

module.exports = {
  PAGES, page, linkTo, header, footer, CHROME_CSS, MODE_BOOTSTRAP, MODE_KEY,
  COFFEE_URL, COFFEE_HANDLE, SPONSORS_URL, SPONSORS_USER, REPO
};
