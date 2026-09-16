/**
 * .SYNOPSIS
 * Runs the web part's real renderer classes in a plain browser page.
 *
 * .DESCRIPTION
 * SPFx 1.21 has no local workbench any more, and the hosted one needs a
 * tenant. Everything below the web part shell is plain DOM code, so this
 * drives those classes directly: the same ViewModeRenderer, EditModeManager,
 * ContentEnhancer, MermaidRenderer and MarkdownProcessor a deployed page uses.
 *
 * .USAGE
 *   npm run harness        builds harness/dist/index.html
 *   npm run harness:drive  builds it, builds the site, then drives both
 *
 *   Open harness/dist/index.html in a browser to use it by hand.
 *
 * .NOTES
 * Since:     0.0.6
 * Ships in:  nothing - it builds or drives what ships
 * Requires:  MarkdownProcessor.ts, MermaidRenderer.ts, ContentEnhancer.ts,
 *            ViewModeRenderer.ts, EditModeManager.ts, ThemeManager.ts,
 *            panel.ts, tocWidth.ts
 */

import { MarkdownProcessor } from '../src/webparts/markstrata/utils/MarkdownProcessor';
import { MermaidRenderer } from '../src/webparts/markstrata/utils/MermaidRenderer';
import { ContentEnhancer } from '../src/webparts/markstrata/utils/ContentEnhancer';
import { ViewModeRenderer } from '../src/webparts/markstrata/utils/ViewModeRenderer';
import { EditModeManager } from '../src/webparts/markstrata/utils/EditModeManager';
import { ThemeManager } from '../src/webparts/markstrata/utils/ThemeManager';
import { DocumentNavigator } from '../src/webparts/markstrata/utils/documentNavigator';
import { PropertyPanel, IPanelPage } from './panel';
import { TOC_WIDTH_RANGES, tocWidthForUnit } from '../src/webparts/markstrata/utils/tocWidth';

declare const SAMPLE: string;

/* Built bare and told the state below once it exists: constructing it from
   defaults meant the first render ignored anything the demo had set that
   happened to differ from them, which stayed invisible for as long as every
   setting agreed with its default. */
const processor = new MarkdownProcessor({ showLineNumbers: true });
const mermaid = new MermaidRenderer();
const enhancer = new ContentEnhancer();

const state: any = {
  markdown: SAMPLE,
  contentSource: 'library',
  selectedLibrary: 'documents',
  selectedFolder: 'root',
  selectedFile: 'handbook.md',
  family: 'vscode',
  mode: 'light',
  toc: 'left',
  editing: false,
  // Content
  canReload: true,
  canShowVersions: true,
  // Appearance
  showThemeSwitcher: true,
  contentWidth: 'comfortable',
  density: 'compact',
  textSize: 'normal',
  enableSyntaxHighlighting: true,
  showCodeHeader: true,
  showLineNumbers: true,
  wrapCodeLines: false,
  codeSize: 'normal',
  imageAlign: 'left',
  // Contents
  tocMaxLevel: 3,
  tocWidthMode: 'auto',
  tocWidthUnit: 'em',
  tocWidthValue: 15,
  enableAnchors: true,
  // Features
  enableMermaid: true,
  diagramWidth: 'fit',
  enableImageZoom: true,
  enableTableSort: true,
  followDocumentLinks: true,
  enableWikiLinks: true,
  checkWikiLinks: true,
  libraryBase: '',
  enableMath: true,
  allowHtml: false,
  showToolbar: true,
  showPrintButton: true,
  showReadingTime: true,
  backToTop: 'right',
  showSourceInfo: true,
  pinMeta: false,
  fillHeight: false
};

/* The options the processor is built from, as opposed to the ones the
   renderer reads at draw time. Changing any of these rebuilds markdown-it. */
const PROCESSOR_KEYS: string[] = ['enableSyntaxHighlighting', 'showCodeHeader',
  'showLineNumbers', 'wrapCodeLines', 'allowHtml', 'enableMath', 'enableMermaid',
  'enableAnchors', 'enableWikiLinks'];

function processorOptions(): any {
  return {
    enableSyntaxHighlighting: state.enableSyntaxHighlighting,
    showCodeHeader: state.showCodeHeader,
    showLineNumbers: state.showLineNumbers,
    wrapCodeLines: state.wrapCodeLines,
    allowHtml: state.allowHtml,
    enableMath: state.enableMath,
    enableMermaid: state.enableMermaid,
    enableAnchors: state.enableAnchors,
    enableWikiLinks: state.enableWikiLinks,
    imageBasePath: state.libraryBase || undefined
  };
}

/* Before the first draw, so the page opens showing what the panel says. */
processor.updateOptions(processorOptions());

const host = document.getElementById('host') as HTMLElement;

/*
 * There is no document library behind this page, so this stands in for one.
 * It holds some of the pages the sample links to and not others, which is what
 * makes the marking visible at all.
 */
const LIBRARY: string[] = ['handbook.md', 'deploy.md', 'onboarding.md'];

function listFolder(): Promise<string[] | undefined> {
  return Promise.resolve(LIBRARY);
}

/*
 * What a followed link opens. The real web part fetches the file from
 * SharePoint; here the document is written out so the behaviour around it -
 * the bar above it, the way back, landing on a heading - can be driven without
 * a tenant.
 */
const DEPLOY: string = [
  '# Deploying',
  '',
  'This page stands in for another document in the same folder.',
  '',
  /* Long enough that a heading further down can actually reach the top of the
     window: a document shorter than the screen cannot be scrolled, and a check
     on where a heading landed would be measuring that instead. */
  ...new Array(60).fill('Filler, so there is something to scroll past.'),
  '',
  '## Rollback',
  '',
  'Roll back by redeploying the previous package.',
  '',
  ...new Array(20).fill('More filler, so the heading can sit at the top.'),
  '',
  'Back to [[handbook]].'
].join('\n\n');

/*
 * The real DocumentNavigator, not a stand-in for it.
 *
 * It is the web part's own, so what it decides here is what a SharePoint page
 * decides: which document is on screen, and the history entries that make the
 * browser's Back button work. Only the fetch is faked, because there is no
 * library behind this page to fetch from.
 */
const navigator = new DocumentNavigator({
  instanceId: 'harness',
  load: (path: string) => {
    log(`Open ${path}`);
    return Promise.resolve({
      markdown: DEPLOY,
      metadata: {
        name: path.split('/').pop() || path,
        serverRelativeUrl: path,
        timeLastModified: new Date().toISOString(),
        author: 'Cody White',
        length: DEPLOY.length
      }
    });
  },
  onChange: () => draw(),
  onError: (message: string) => log(message)
});

/*
 * Checking a link needs a folder to ask about, and a folder needs the base
 * path a library file would have given the document. Without one a wiki link
 * resolves to a bare name, which is a perfectly good relative link and a
 * question nobody can answer, so it is left alone. Setting this turns the
 * demo's links into library paths so the marking can be seen; it moves
 * relative image paths with it, which is why it is not on by default.
 */
function setLibraryBase(base: string, markdown?: string): void {
  /* Changing the document is starting again: whatever was open was opened from
     the old one. */
  navigator.close(false);
  state.libraryBase = base;
  if (markdown !== undefined) {
    state.markdown = markdown || SAMPLE;
  }
  processor.updateOptions(processorOptions());
  draw();
}

const view = new ViewModeRenderer(processor, mermaid, enhancer, {
  onReload: () => log('Reload clicked'),
  onShowVersions: () => log('Version history clicked'),
  onThemeOverride: (family, mode) => {
    state.family = family;
    state.mode = mode;
    log(`Theme override -> ${family}/${mode}`);
    draw();
  },
  onPrint: () => log('Print clicked')
});

const editor = new EditModeManager(processor, mermaid, enhancer, {
  onChange: (markdown: string) => {
    state.markdown = markdown;
  },
  onSave: async (markdown: string) => {
    log(`Save called with ${markdown.length} characters`);
    return true;
  }
});

function settings(): any {
  return {
    themeFamily: state.family,
    colorMode: state.mode,
    contentWidth: state.contentWidth,
    density: state.density,
    textSize: state.textSize,
    codeSize: state.codeSize,
    imageAlign: state.imageAlign,
    tocWidth: state.tocWidthMode === 'auto'
      ? 'auto' : `${state.tocWidthValue}${state.tocWidthUnit}`,
    pinMeta: state.pinMeta,
    fillHeight: state.fillHeight
  };
}

function draw(showing?: string, heading?: string): void {
  const mode = ThemeManager.resolveMode(state.mode);
  /* The page's own canvas caps the web part like a SharePoint section does, so
     it has to step aside when the reader asks for full width. */
  document.body.setAttribute('data-demo-width', state.contentWidth);
  if (state.editing) {
    editor.render(host, state.markdown, {
      settings: settings(),
      resolvedMode: mode,
      enableMermaid: true,
      diagramWidth: state.diagramWidth,
      enableImageZoom: state.enableImageZoom,
      enableTableSort: state.enableTableSort,
      canSave: true,
      saveTargetName: 'handbook.md'
    });
    return;
  }

  view.render(host, showing !== undefined ? showing
    : (navigator.markdown !== undefined ? navigator.markdown : state.markdown), {
    settings: settings(),
    resolvedMode: mode,
    showToolbar: state.showToolbar,
    showThemeSwitcher: state.showThemeSwitcher,
    showPrintButton: state.showPrintButton,
    tocPosition: state.toc,
    tocMaxLevel: state.tocMaxLevel,
    showSourceInfo: state.showSourceInfo,
    enableMermaid: state.enableMermaid,
    diagramWidth: state.diagramWidth,
    enableImageZoom: state.enableImageZoom,
    enableTableSort: state.enableTableSort,
    showReadingTime: state.showReadingTime,
    backToTop: state.backToTop,
    listFolder: state.enableWikiLinks && state.checkWikiLinks ? listFolder : undefined,
    documentBase: state.libraryBase || undefined,
    openDocument: state.followDocumentLinks
      ? (path: string, heading: string) => void navigator.open(path, heading, true)
      : undefined,
    openDocumentName: navigator.name,
    documentTrail: navigator.path
      ? ['handbook.md'].concat(navigator.trailNames, [navigator.name])
      : undefined,
    onGoToCrumb: (index: number) => { void navigator.goTo(index - 1, true); },
    shareAddress: () => (navigator.path
      ? `${window.location.href}?strataDoc=${encodeURIComponent(navigator.path)}`
      : window.location.href),
    landOnHeading: heading !== undefined ? heading : navigator.takeHeading(),
    canReload: state.canReload,
    canShowVersions: state.canShowVersions,
    isPageEditing: false,
    fileMetadata: {
      name: 'handbook.md',
      serverRelativeUrl: '/sites/team/Shared Documents/handbook.md',
      timeLastModified: new Date().toISOString(),
      author: 'Cody White',
      length: 4096
    }
  });
}

function log(message: string): void {
  const line = document.createElement('div');
  line.textContent = message;
  (document.getElementById('log') as HTMLElement).appendChild(line);
}

(window as any).harness = {
  setTheme: (family: any, mode: any) => {
    state.family = family;
    state.mode = mode;
    draw();
  },
  setToc: (position: any) => {
    state.toc = position;
    draw();
  },
  setImageAlign: (align: any) => {
    state.imageAlign = align;
    draw();
  },
  setLibraryBase: setLibraryBase,
  setBackToTop: (position: any) => {
    state.backToTop = position;
    draw();
  },
  toggleEdit: () => {
    state.editing = !state.editing;
    draw();
  },
  state: state
};

draw();

/*
 * The demo page carries a button for this; the bare harness does not, and
 * drives editing through window.harness instead. Edit mode brings its own
 * split, edit and preview controls once it is open, so this only has to be
 * the way in and back out again.
 */
/*
 * The pane's pages mirror the web part's own, minus Content. Labels are the
 * strings the real pane shows, so a reader recognises the thing they will see
 * once the web part is on their page.
 */
const PANEL_PAGES: IPanelPage[] = [
  {
    description: 'Choose where the markdown comes from.',
    groups: [
      {
        name: 'Content',
        fields: [
          { key: 'contentSource', label: 'Source', type: 'dropdown', options: [
            { value: 'library', text: 'File in a document library' },
            { value: 'url', text: 'File at a URL' },
            { value: 'inline', text: 'Markdown typed into the web part' }] },
          { key: 'selectedLibrary', label: 'Document library', type: 'dropdown', options: [
            { value: 'documents', text: 'Documents' },
            { value: 'handbook', text: 'Team handbook' },
            { value: 'runbooks', text: 'Runbooks' }] },
          { key: 'selectedFolder', label: 'Folder', type: 'dropdown', options: [
            { value: 'root', text: '(root)' },
            { value: 'onboarding', text: 'Onboarding' },
            { value: 'platform', text: 'Platform' }] },
          { key: 'selectedFile', label: 'Markdown file', type: 'dropdown', options: [
            { value: 'handbook.md', text: 'handbook.md' },
            { value: 'deploy.md', text: 'deploy.md' },
            { value: 'onboarding.md', text: 'onboarding.md' }],
            hint: 'These four are filled in for show. There is no SharePoint site behind '
              + 'this page, so the demo renders its own sample document whatever they say. '
              + 'Everything on the next three pages is live.' },
          { key: 'canReload', label: 'Reload when the file changes', type: 'toggle' },
          { key: 'canShowVersions', label: 'Show version history button', type: 'toggle' }
        ]
      }
    ]
  },
  {
    description: 'How the page looks: theme, measure, and pictures.',
    groups: [
      {
        name: 'Theme',
        fields: [
          { key: 'family', label: 'Theme', type: 'dropdown', options: [
            { value: 'github', text: 'GitHub' },
            { value: 'obsidian', text: 'Obsidian' },
            { value: 'vscode', text: 'VS Code' }] },
          { key: 'mode', label: 'Colour mode', type: 'dropdown', options: [
            { value: 'light', text: 'Light' },
            { value: 'dark', text: 'Dark' }] },
          { key: 'showThemeSwitcher', label: 'Let readers switch theme', type: 'toggle',
            hint: 'GitHub, Obsidian and VS Code each bring their own typography, code '
              + 'block styling, callout shape and syntax colours in both light and dark.' }
        ]
      },
      {
        name: 'Reading',
        fields: [
          { key: 'contentWidth', label: 'Content width', type: 'dropdown', options: [
            { value: 'narrow', text: 'Narrow (720px)' },
            { value: 'comfortable', text: 'Comfortable (900px)' },
            { value: 'wide', text: 'Wide (1100px)' },
            { value: 'full', text: 'Full width' }] },
          { key: 'density', label: 'Spacing', type: 'dropdown', options: [
            { value: 'compact', text: 'Compact' },
            { value: 'comfortable', text: 'Comfortable' },
            { value: 'relaxed', text: 'Relaxed' }] },
          { key: 'textSize', label: 'Text size', type: 'dropdown', options: [
            { value: 'small', text: 'Small' },
            { value: 'normal', text: 'Normal' },
            { value: 'large', text: 'Large' },
            { value: 'xlarge', text: 'Extra large' }] }
        ]
      },
      {
        name: 'Pictures',
        fields: [
          { key: 'imageAlign', label: 'Picture alignment', type: 'dropdown', options: [
            { value: 'left', text: 'Left' },
            { value: 'center', text: 'Centred' },
            { value: 'right', text: 'Right' }] },
          { key: 'enableImageZoom', label: 'Click a picture or diagram to see it full size',
            type: 'toggle',
            hint: 'Alignment applies to a picture that is a paragraph of its own. One '
              + 'inside a sentence stays on the line it is in, and a document can place '
              + 'a single picture itself with ![alt](x.png){.center}.' }
        ]
      },
      {
        name: 'The page',
        fields: [
          { key: 'fillHeight', label: 'Fill the available height', type: 'toggle',
            hint: 'Gives the web part at least the room below it, so a short document '
              + 'does not stop halfway down the page and leave the canvas showing under '
              + 'it. The file name and modified date, if they are shown, sit at the '
              + 'bottom of that. Measured from where the web part starts, so a part '
              + 'placed below other content on a long page is left alone.' }
        ]
      },
    ]
  },
  {
    description: 'Code blocks, diagrams, tables and maths.',
    groups: [
      {
        name: 'Code blocks',
        fields: [
          { key: 'enableSyntaxHighlighting', label: 'Syntax highlighting', type: 'toggle' },
          { key: 'showCodeHeader', label: 'Show language header', type: 'toggle' },
          { key: 'showLineNumbers', label: 'Show line numbers', type: 'toggle' },
          { key: 'wrapCodeLines', label: 'Long lines wrap', type: 'toggle' },
          { key: 'codeSize', label: 'Code text size', type: 'dropdown', options: [
            { value: 'small', text: 'Small' },
            { value: 'normal', text: 'Normal' },
            { value: 'large', text: 'Large' }] }
        ]
      },
      {
        name: 'Diagrams',
        fields: [
          { key: 'enableMermaid', label: 'Mermaid diagrams', type: 'toggle' },
          { key: 'diagramWidth', label: 'Wide diagrams', type: 'dropdown',
            showIf: (state) => state.enableMermaid === true,
            options: [
              { value: 'fit', text: 'Fit to the column' },
              { value: 'scroll', text: 'Keep their size and scroll' },
              { value: 'scale', text: 'Scale down to fit' }],
            hint: 'Gantt charts lay out from their time axis rather than wrapping, so '
              + 'they often want more width than a column gives. Fitting compresses the '
              + 'axis and keeps the text readable.' }
        ]
      },
      {
        name: 'Maths and HTML',
        fields: [
          { key: 'enableMath', label: 'Math (KaTeX)', type: 'toggle' },
          { key: 'allowHtml', label: 'Allow raw HTML in markdown', type: 'toggle',
            hint: 'Leave off unless you trust everyone who can edit the source. With it '
              + 'on, HTML in the markdown is rendered as-is.' }
        ]
      },
      {
        name: 'Tables',
        fields: [
          { key: 'enableTableSort', label: 'Let readers sort a table', type: 'toggle',
            hint: 'A click on a column header sorts by it, a second reverses it, and a '
              + 'third puts the rows back in the order the document wrote them. A table '
              + 'with a merged cell in it is left alone, because reordering rows would '
              + 'scramble what the merge says. Long tables keep their header row in view '
              + 'either way.' }
        ]
      }
    ]
  },
  {
    description: 'Finding your way around a document, and between documents.',
    groups: [
      {
        name: 'Contents',
        fields: [
          { key: 'toc', label: 'Table of contents', type: 'dropdown', options: [
            { value: 'left', text: 'Sidebar on the left' },
            { value: 'right', text: 'Sidebar on the right' },
            { value: 'inline', text: 'Above the content' },
            { value: 'off', text: 'Off' }] },
          { key: 'tocMaxLevel', label: 'Deepest heading in the contents', type: 'slider',
            min: 1, max: 6 },
          { key: 'tocWidthMode', label: 'Contents width', type: 'dropdown', options: [
            { value: 'auto', text: 'Auto, fits the longest entry' },
            { value: 'fixed', text: 'Fixed width' }] },
          { key: 'tocWidthUnit', label: 'Measured in', type: 'dropdown',
            showIf: (state) => state.tocWidthMode === 'fixed',
            options: [
              { value: 'em', text: 'em, follows the text size' },
              { value: '%', text: '%, share of the web part' },
              { value: 'px', text: 'px, a fixed number of pixels' },
              { value: 'vw', text: 'vw, share of the browser window' }] },
          { key: 'tocWidthValue', label: 'Width', type: 'slider',
            showIf: (state) => state.tocWidthMode === 'fixed',
            min: (state) => TOC_WIDTH_RANGES[String(state.tocWidthUnit)].min,
            max: (state) => TOC_WIDTH_RANGES[String(state.tocWidthUnit)].max,
            hint: 'Only applies with the contents in a left or right sidebar, and only '
              + 'on a fixed width. Stacked above the content they are always full width.' },
          { key: 'enableAnchors', label: 'Heading link anchors', type: 'toggle' }
        ]
      },
      {
        name: 'Links between documents',
        fields: [
          { key: 'enableWikiLinks', label: 'Wiki links', type: 'toggle',
            hint: 'Turns [[Another page]] into a link to that file in the same folder. '
              + 'There is no document library behind this page, so the links here go '
              + 'nowhere, but the syntax renders.' },
          { key: 'checkWikiLinks', label: 'Mark links to pages that are not there',
            type: 'toggle', showIf: (state) => state.enableWikiLinks === true },
          { key: 'followDocumentLinks', label: 'Open a linked document here',
            type: 'toggle',
            hint: 'A link to another markdown file opens that document in the web part '
              + 'instead of handing the reader the file. A bar above the document says '
              + 'which one is open and goes back. This page stands a document in for '
              + 'the library it does not have.' }
        ]
      }
    ]
  },
  {
    description: 'What is shown around the document.',
    groups: [
      {
        name: 'Toolbar',
        fields: [
          { key: 'showToolbar', label: 'Show toolbar', type: 'toggle',
            hint: 'The reload, version history, theme and print controls all live in the '
              + 'toolbar, so turning it off takes the print button with it.' },
          { key: 'showPrintButton', label: 'Show print button', type: 'toggle',
            showIf: (state) => state.showToolbar === true },
          { key: 'showReadingTime', label: 'Show reading time', type: 'toggle',
            showIf: (state) => state.showToolbar === true },
          { key: 'backToTop', label: 'Back to top button', type: 'dropdown', options: [
            { value: 'off', text: 'No button' },
            { value: 'left', text: 'Bottom left' },
            { value: 'right', text: 'Bottom right' }] }
        ]
      },
      {
        name: 'File information',
        fields: [
          { key: 'showSourceInfo', label: 'Show file name and last updated', type: 'toggle' },
          { key: 'pinMeta', label: 'Keep it in view while scrolling', type: 'toggle',
            showIf: (state) => state.showSourceInfo === true }
        ]
      }
    ]
  }
];

let rememberMode: (mode: string) => void = () => undefined;

const panelHost: HTMLElement | null = document.getElementById('demo-panel');
const panelButton: HTMLElement | null = document.getElementById('demo-configure');
if (panelHost && panelButton) {
  /*
   * The pane sets the theme, so the reader's own switcher in the toolbar would
   * be the same control twice. It starts off here and stays a feature the pane
   * can turn back on. The bare harness has no pane, so it keeps the switcher.
   */
  state.showThemeSwitcher = false;

  /*
   * Colour mode follows the operating system until the reader picks one in the
   * pane, as it does on the rest of the site. Storage can throw in a private
   * window, so a failure just means the choice is not remembered.
   */
  const MODE_KEY: string = 'markstrata-site-mode';
  const query: MediaQueryList | null = window.matchMedia
    ? window.matchMedia('(prefers-color-scheme: dark)') : null;

  const storedMode = (): string | null => {
    try {
      const saved: string | null = window.localStorage.getItem(MODE_KEY);
      return saved === 'light' || saved === 'dark' ? saved : null;
    } catch (error) {
      return null;
    }
  };

  const applyMode = (mode: string): void => {
    state.mode = mode;
    document.documentElement.setAttribute('data-site-mode', mode);
  };

  applyMode(storedMode() || (query && query.matches ? 'dark' : 'light'));

  if (query && query.addEventListener) {
    query.addEventListener('change', () => {
      if (!storedMode()) {
        applyMode(query.matches ? 'dark' : 'light');
        draw();
      }
    });
  }

  rememberMode = (mode: string): void => {
    try {
      window.localStorage.setItem(MODE_KEY, mode);
    } catch (error) {
      /* The change still applies, it is just not remembered. */
    }
    document.documentElement.setAttribute('data-site-mode', mode);
    document.documentElement.style.colorScheme = mode;
    /* Said out loud, so the switch in the site header stays in step with the
       pane. Nothing here listens to it, and the listener below ignores a mode
       it is already in, so this cannot come back round. */
    window.dispatchEvent(new CustomEvent('strata-site-mode', { detail: mode }));
  };

  draw();
  let panel: PropertyPanel;
  panel = new PropertyPanel(panelHost, PANEL_PAGES, state, {
    onChange: (key, value) => {
      state[key] = value;
      if (key === 'mode') {
        rememberMode(String(value));
      }
      if (key === 'tocWidthUnit') {
        state.tocWidthValue = tocWidthForUnit(value as never, state.tocWidthValue as number);
      }
      /* These decide whether other fields apply, or what range they take. */
      if (key === 'tocWidthMode' || key === 'tocWidthUnit' || key === 'toc'
        || key === 'showSourceInfo' || key === 'enableMermaid'
        || key === 'showToolbar' || key === 'enableWikiLinks') {
        panel.refresh();
      }
      if (PROCESSOR_KEYS.indexOf(key) !== -1) {
        processor.updateOptions(processorOptions());
      }
      draw();
    },
    onClose: () => {
      document.body.classList.remove('pp-open');
      panelButton.setAttribute('aria-expanded', 'false');
      panelButton.focus();
    }
  });
  panelButton.addEventListener('click', () => {
    if (panel.isOpen) {
      panel.close();
      return;
    }
    document.body.classList.add('pp-open');
    panelButton.setAttribute('aria-expanded', 'true');
    panel.open();
  });
  document.addEventListener('keydown', (event: KeyboardEvent) => {
    if (event.key === 'Escape' && panel.isOpen) {
      panel.close();
    }
  });

  /*
   * The switch in the site header is the same choice as Colour mode in the
   * pane, so one has to move the other. The header sets the page and says so
   * with an event; this takes the web part and the pane's own field with it,
   * rather than leaving a pane that disagrees with the document beside it.
   */
  window.addEventListener('strata-site-mode', (event: Event) => {
    const chosen: string = String((event as CustomEvent).detail);
    if (state.mode === chosen) {
      return;
    }
    state.mode = chosen;
    panel.refresh();
    draw();
  });
}

const editButton: HTMLElement | null = document.getElementById('demo-edit');
if (editButton) {
  editButton.addEventListener('click', () => {
    state.editing = !state.editing;
    editButton.setAttribute('aria-pressed', String(state.editing));
    editButton.textContent = state.editing ? 'Back to reading' : 'Edit the markdown';
    draw();
  });
}
