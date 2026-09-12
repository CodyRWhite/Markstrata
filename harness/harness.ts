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

declare const SAMPLE: string;

const processor = new MarkdownProcessor({ showLineNumbers: true });
const mermaid = new MermaidRenderer();
const enhancer = new ContentEnhancer();

const state = {
  markdown: SAMPLE,
  family: 'github' as 'github' | 'obsidian' | 'vscode',
  mode: 'light' as 'light' | 'dark',
  toc: 'left' as 'left' | 'right' | 'inline' | 'off',
  editing: false
};

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
    contentWidth: 'comfortable',
    density: 'normal',
    textSize: 'normal',
    codeSize: 'normal'
  };
}

function draw(): void {
  const mode = ThemeManager.resolveMode(state.mode);
  if (state.editing) {
    editor.render(host, state.markdown, {
      settings: settings(),
      resolvedMode: mode,
      enableMermaid: true,
      canSave: true,
      saveTargetName: 'handbook.md'
    });
    return;
  }

  view.render(host, state.markdown, {
    settings: settings(),
    resolvedMode: mode,
    showToolbar: true,
    showThemeSwitcher: true,
    showPrintButton: true,
    tocPosition: state.toc,
    tocMaxLevel: 3,
    showSourceInfo: true,
    enableMermaid: true,
    canReload: true,
    canShowVersions: true,
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
  toggleEdit: () => {
    state.editing = !state.editing;
    draw();
  },
  state: state
};

draw();
