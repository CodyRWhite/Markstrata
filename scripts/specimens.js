/**
 * .SYNOPSIS
 * Specimens: panels of real web part markup, dropped into a site page where a
 * behaviour cannot be shown by rendering one document.
 *
 * .DESCRIPTION
 * Most of what the web part does is a string of markdown going in and a string
 * of HTML coming out, and the site shows that by rendering the page through
 * the same pipeline. The rest is not: the toolbar, the trail of documents a
 * reader has walked, a link to another document that opens in the page, the
 * split editor. All of that is built by ViewModeRenderer and EditModeManager
 * against a SharePoint library, out of a string's reach.
 *
 * Rather than draw a picture of it, this runs those same classes over a
 * jsdom document at build time and lifts the markup they produce onto the
 * page. The stylesheets are already there, because a site page carries the web
 * part's own. So a specimen is the real thing, drawn by the code that ships,
 * and it goes stale the moment that code changes - which is the point of it.
 *
 * What a specimen is not is working. The handlers are properties on the
 * elements and do not survive being written to a file, so every control in one
 * is inert, and the note under each panel says so.
 *
 * A page asks for one by writing an empty div in its markdown:
 *
 *   <div class="site-specimen" data-specimen="trail-three"></div>
 *
 * .USAGE
 *   const specimens = require('./specimens');
 *
 *   html = await specimens.fill(html, libDir);
 *
 *   `libDir` is where the renderer classes have been compiled to; the demo
 *   builder compiles them and passes its own.
 *
 * .NOTES
 * Since:     0.0.19.0
 * Ships in:  nothing - it builds or drives what ships
 * Requires:  site.ts, jsdom, and the compiled renderer classes
 */

const path = require('path');

/*
 * A placeholder as it survives rendering. The attribute order is DOMPurify's
 * to choose, so the pattern reads the name out of wherever it lands rather
 * than expecting the div to come back the way it was written.
 */
const PLACEHOLDER = /<div\b[^>]*\bdata-specimen="([a-z0-9-]+)"[^>]*>\s*<\/div>/g;

/** True when a page asks for any specimen at all, so nothing is compiled for the rest. */
function wanted(html) {
  PLACEHOLDER.lastIndex = 0;
  return PLACEHOLDER.test(html);
}

/*
 * A neutral IT wiki, invented for these pages.
 *
 * Every file name, folder and tenant here is made up. Nothing from a real
 * tenant belongs on this site, and a specimen is the easiest place for one to
 * arrive: it is the one part of a page that looks like a screenshot of
 * somebody's library.
 */
const LIBRARY = '/sites/it-wiki/Documents';
const FOLDER = `${LIBRARY}/Network`;

const SETTINGS = {
  themeFamily: 'github',
  colorMode: 'light',
  contentWidth: 'full',
  density: 'compact',
  textSize: 'normal',
  codeSize: 'normal',
  imageAlign: 'left',
  tocWidth: 'auto'
};

/* Options every specimen shares, so one differs from another only where it means to. */
const VIEW = {
  settings: SETTINGS,
  resolvedMode: 'light',
  showToolbar: true,
  showThemeSwitcher: true,
  showExportButton: true,
  showReadingTime: true,
  tocPosition: 'off',
  tocMaxLevel: 3,
  showSourceInfo: false,
  enableMermaid: false,
  enableImageZoom: false,
  enableTableSort: false,
  canReload: true,
  canShowVersions: true,
  isPageEditing: false
};

const NOTHING = () => undefined;

/*
 * jsdom, and the globals the renderer classes reach for.
 *
 * They are written for a browser, so they use `document` and a handful of
 * constructors as globals rather than taking a window. Node has none of them,
 * so the window jsdom builds is published under those names for the length of
 * the build.
 */
function standUpDom(libDir) {
  const { JSDOM } = require('jsdom');
  const dom = new JSDOM('<!doctype html><html><body></body></html>');
  const window = dom.window;

  ['HTMLElement', 'HTMLTextAreaElement', 'Node', 'Element', 'CSS', 'NodeFilter',
    'MutationObserver', 'CustomEvent', 'Event', 'KeyboardEvent'
  ].forEach((name) => {
    global[name] = window[name];
  });
  global.window = window;
  global.document = window.document;
  global.getComputedStyle = window.getComputedStyle.bind(window);

  require(path.join(libDir, 'htmlSanitiser.js')).useSanitiserWindow(window);
  return window;
}

/** The classes a specimen is drawn with, built once per page. */
function renderers(libDir, options) {
  const { MarkdownProcessor } = require(path.join(libDir, 'MarkdownProcessor.js'));
  const { MermaidRenderer } = require(path.join(libDir, 'MermaidRenderer.js'));
  const { ContentEnhancer } = require(path.join(libDir, 'ContentEnhancer.js'));
  const { ViewModeRenderer } = require(path.join(libDir, 'ViewModeRenderer.js'));
  const { EditModeManager } = require(path.join(libDir, 'EditModeManager.js'));

  const processor = new MarkdownProcessor(Object.assign({
    enableMermaid: false, enableMath: false, enableAnchors: false,
    enableWikiLinks: true, imageBasePath: FOLDER
  }, options || {}));
  const mermaid = new MermaidRenderer();
  const enhancer = new ContentEnhancer();

  return {
    enhancer: enhancer,
    view: new ViewModeRenderer(processor, mermaid, enhancer, {
      onReload: NOTHING, onShowVersions: NOTHING, onThemeOverride: NOTHING, onExport: NOTHING
    }),
    editor: new EditModeManager(processor, mermaid, enhancer, {
      onChange: NOTHING, onSave: () => Promise.resolve(true)
    })
  };
}

/*
 * The theme and mode attributes come off the specimen's own root, so it takes
 * the page's. Both are written by ThemeManager as data attributes, and the
 * stylesheets read them off the nearest element that carries one - so an
 * element that carries neither is drawn in whatever the page around it is set
 * to, and follows the theme control at the top of the page like everything
 * else. A specimen pinned to GitHub light on an Obsidian dark page would read
 * as a picture, which is exactly what it is not.
 *
 * The measured styles go too. jsdom reports every box as zero, so what the
 * renderer worked out from the width of a column it has never drawn is a
 * number that means nothing here.
 */
function unpin(root) {
  root.removeAttribute('data-strata-theme');
  root.removeAttribute('data-strata-mode');
  root.removeAttribute('style');
  Array.prototype.slice.call(root.querySelectorAll('[style]'))
    .forEach((element) => element.removeAttribute('style'));

  /*
   * And nothing in it is reachable. A specimen is a still: its handlers were
   * properties on the elements and did not survive being written to a file, so
   * every button in one already does nothing and every link points into a
   * library that does not exist here. The panel refuses the pointer in CSS;
   * this is the same refusal for a keyboard, so tabbing through the page does
   * not stop at a row of controls that answer nothing.
   */
  Array.prototype.slice
    .call(root.querySelectorAll('a[href], button, input, select, textarea, summary, [tabindex]'))
    .forEach((element) => element.setAttribute('tabindex', '-1'));
}

/*
 * A trail of documents, as the reader who walked it sees it.
 *
 * Everything but the trail is turned off, so what is left in the toolbar is
 * the thing being shown. The document under it is the one the last crumb
 * names: three panels of the same text under three different trails would be
 * showing the trail lying about where the reader is.
 */
function trail(kit, names) {
  const host = document.createElement('div');
  const here = names[names.length - 1];
  kit.view.render(host, TRAIL_DOCUMENTS[here], Object.assign({}, VIEW, {
    showThemeSwitcher: false,
    showExportButton: false,
    showReadingTime: false,
    canReload: false,
    canShowVersions: false,
    documentBase: FOLDER,
    openDocumentName: here,
    documentTrail: names,
    onGoToCrumb: NOTHING
  }));
  return host;
}

/* One short walk through an invented wiki: each of these links to the next. */
const TRAIL_DOCUMENTS = {
  'Firewall.md': [
    '## Firewall',
    '',
    'The perimeter is a pair of appliances in active and standby. Traffic',
    'between offices does not pass through it: see [[Site to site links]].',
    ''
  ].join('\n'),
  'Site to site links.md': [
    '## Site to site links',
    '',
    'Each office reaches the others over the tunnel described in [[VPN]]. The',
    'addresses on either end are held in [[Address plan]].',
    ''
  ].join('\n'),
  'VPN.md': [
    '## VPN',
    '',
    'The tunnel is rebuilt by either end when it drops, so a restart at one',
    'office does not need anybody at the other.',
    ''
  ].join('\n')
};

const WIKI_DOCUMENT = [
  '## Perimeter',
  '',
  'Every rule change goes through [[Change control]] first. The rules',
  'themselves are listed in [[Firewall rules|the rule table]], and the',
  'addresses they name come from [[Address plan#Allocations]].',
  '',
  'The tunnel to the branch offices is described in [[Branch tunnels]].',
  ''
].join('\n');

const EDITOR_DOCUMENT = [
  '# Firewall',
  '',
  'The perimeter is a pair of appliances in active and standby.',
  '',
  '> [!NOTE]',
  '> Rule changes need a change record before they are applied.',
  '',
  '| Zone | Reaches |',
  '|------|---------|',
  '| Office | Internet, branch offices |',
  '| Branch | Office only |',
  ''
].join('\n');

/*
 * Each specimen: what to draw, and the note that goes under it. The note is
 * part of the specimen rather than the page's prose because it is the same
 * sentence every time and a page that had to remember to write it would one
 * day not.
 */
const SPECIMENS = {
  'toolbar': {
    note: 'The toolbar as a reader of the page sees it, with every control turned on.',
    draw: (kit) => {
      const host = document.createElement('div');
      kit.view.render(host, '## Firewall\n\nThe perimeter is a pair of appliances in active and standby.\n', VIEW);
      return host;
    }
  },
  'wiki-links': {
    note: 'Wiki links resolved against the folder the document is in. The last one names a file that is not in the library, so it is marked.',
    draw: async (kit) => {
      const host = document.createElement('div');
      kit.view.render(host, WIKI_DOCUMENT, Object.assign({}, VIEW, {
        showToolbar: false, documentBase: FOLDER
      }));
      const { validateWikiLinks } = require(kit.linkCheck);
      await validateWikiLinks(host, (folder) => Promise.resolve(
        folder === FOLDER
          ? ['Change control.md', 'Firewall rules.md', 'Address plan.md']
          : undefined
      ));
      return host;
    }
  },
  'trail-one': {
    note: 'One link followed. The trail names the document the page is configured to show, then the one being read.',
    draw: (kit) => trail(kit, ['Home.md', 'Firewall.md'])
  },
  'trail-two': {
    note: 'A second link followed, from inside the first document.',
    draw: (kit) => trail(kit, ['Home.md', 'Firewall.md', 'Site to site links.md'])
  },
  'trail-three': {
    note: 'A third. Clicking Firewall here drops everything after it and reopens that document.',
    draw: (kit) => trail(kit, ['Home.md', 'Firewall.md', 'Site to site links.md', 'VPN.md'])
  },
  'editor': {
    note: 'Edit mode: the markdown source, its live preview, and the layout buttons above both.',
    draw: (kit) => {
      const host = document.createElement('div');
      kit.editor.render(host, EDITOR_DOCUMENT, {
        settings: SETTINGS,
        resolvedMode: 'light',
        enableMermaid: false,
        canSave: true,
        saveTargetName: 'Firewall.md'
      });
      /*
       * A textarea's value is a property, and a property is not markup: written
       * to a file the box comes back empty. Its text content is what a browser
       * reads the value from when the page is parsed, so the two are put back
       * in step here.
       */
      const box = host.querySelector('.strata-editor-input');
      if (box) {
        box.textContent = EDITOR_DOCUMENT;
      }
      return host;
    }
  }
};

/** Draws one, and wraps it in the panel and the note. */
async function build(name, kit) {
  const specimen = SPECIMENS[name];
  if (!specimen) {
    throw new Error(`no specimen called "${name}"`);
  }
  const host = await specimen.draw(kit);
  const root = host.firstElementChild;
  if (!root) {
    throw new Error(`the specimen "${name}" drew nothing`);
  }
  unpin(root);
  return `<div class="site-specimen"><div class="site-specimen-frame">${host.innerHTML}</div>`
    + `<p class="site-specimen-note">${specimen.note}</p></div>`;
}

/**
 * Replaces every placeholder in a rendered page with the markup it asked for.
 *
 * Returns the page unchanged, and compiles nothing, when it holds none.
 */
async function fill(html, libDir) {
  if (!wanted(html)) {
    return html;
  }

  standUpDom(libDir);
  const kit = renderers(libDir);
  kit.linkCheck = path.join(libDir, 'linkCheck.js');

  const names = [];
  PLACEHOLDER.lastIndex = 0;
  let match = PLACEHOLDER.exec(html);
  while (match) {
    names.push(match[1]);
    match = PLACEHOLDER.exec(html);
  }

  const drawn = {};
  for (const name of names) {
    if (!drawn[name]) {
      drawn[name] = await build(name, kit);
    }
  }

  PLACEHOLDER.lastIndex = 0;
  return html.replace(PLACEHOLDER, (whole, name) => drawn[name]);
}

module.exports = { fill, wanted, SPECIMENS };
