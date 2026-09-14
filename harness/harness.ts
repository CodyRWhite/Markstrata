/*
 * Runs the web part's real renderer classes in a plain browser page.
 *
 * SPFx 1.21 has no local workbench any more, and the hosted one needs a
 * tenant. Everything below the web part shell is plain DOM code, so this
 * drives those classes directly: the same ViewModeRenderer, EditModeManager,
 * ContentEnhancer, MermaidRenderer and MarkdownProcessor a deployed page uses.
 */
import { MarkdownProcessor } from '../src/webparts/markstrata/utils/MarkdownProcessor';
import { MermaidRenderer } from '../src/webparts/markstrata/utils/MermaidRenderer';
import { ContentEnhancer } from '../src/webparts/markstrata/utils/ContentEnhancer';
import { ViewModeRenderer } from '../src/webparts/markstrata/utils/ViewModeRenderer';
import { EditModeManager } from '../src/webparts/markstrata/utils/EditModeManager';
import { ThemeManager } from '../src/webparts/markstrata/utils/ThemeManager';
import { PropertyPanel, IPanelPage } from './panel';
import { TOC_WIDTH_RANGES, tocWidthForUnit } from '../src/webparts/markstrata/utils/tocWidth';

declare const SAMPLE: string;

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
  toc: 'inline',
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
  enableWikiLinks: false,
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
    enableWikiLinks: state.enableWikiLinks
  };
}

const host = document.getElementById('host') as HTMLElement;

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
    tocWidth: state.tocWidthMode === 'auto'
      ? 'auto' : `${state.tocWidthValue}${state.tocWidthUnit}`,
    pinMeta: state.pinMeta,
    fillHeight: state.fillHeight
  };
}

function draw(): void {
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
      canSave: true,
      saveTargetName: 'handbook.md'
    });
    return;
  }

  view.render(host, state.markdown, {
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
    showReadingTime: state.showReadingTime,
    backToTop: state.backToTop,
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
    description: 'Theme and reading options.',
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
            { value: 'xlarge', text: 'Extra large' }] },
          { key: 'fillHeight', label: 'Fill the available height', type: 'toggle',
            hint: 'Gives the web part at least the room below it, so a short document '
              + 'does not stop halfway down the page and leave the canvas showing under '
              + 'it. The file name and modified date, if they are shown, sit at the '
              + 'bottom of that. Measured from where the web part starts, so a part '
              + 'placed below other content on a long page is left alone.' }
        ]
      },
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
      }
    ]
  },
  {
    description: 'The table of contents, and links to headings.',
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
      }
    ]
  },
  {
    description: 'What is rendered, and what is shown around it.',
    groups: [
      {
        name: 'Rendering',
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
              + 'axis and keeps the text readable.' },
          { key: 'enableImageZoom', label: 'Click an image to see it full size',
            type: 'toggle' },
          { key: 'enableWikiLinks', label: 'Wiki links', type: 'toggle',
            hint: 'Turns [[Another page]] into a link to that file in the same folder. '
              + 'There is no document library behind this page, so the links here go '
              + 'nowhere, but the syntax renders.' },
          { key: 'enableMath', label: 'Math (KaTeX)', type: 'toggle' },
          { key: 'allowHtml', label: 'Allow raw HTML in markdown', type: 'toggle',
            hint: 'Leave off unless you trust everyone who can edit the source. With it '
              + 'on, HTML in the markdown is rendered as-is.' }
        ]
      },
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
        || key === 'showToolbar') {
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
