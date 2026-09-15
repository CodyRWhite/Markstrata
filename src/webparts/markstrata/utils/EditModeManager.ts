/**
 * Edit mode: a plain textarea next to a live preview.
 *
 * This is deliberately not Monaco. Monaco costs a large lazy-loaded bundle and
 * a loader shim, and in a SharePoint page the editing that actually happens is
 * short edits to prose - so the trade is a textarea that always loads against
 * an editor that sometimes does not.
 */

import { MarkdownProcessor } from './MarkdownProcessor';
import { MermaidRenderer } from './MermaidRenderer';
import { ContentEnhancer } from './ContentEnhancer';
import { DiagramWidth } from './mermaidConfig';
import { ThemeManager, IThemeSettings, ResolvedMode } from './ThemeManager';

export type EditorLayout = 'edit' | 'split' | 'preview';

export interface IEditOptions {
  settings: IThemeSettings;
  resolvedMode: ResolvedMode;
  enableMermaid: boolean;
  /** What a diagram does when it wants more width than the column gives. */
  diagramWidth?: DiagramWidth;
  enableImageZoom?: boolean;
  /** True when the content came from a file we are allowed to write back to. */
  canSave: boolean;
  saveTargetName: string;
}

export interface IEditCallbacks {
  onChange: (markdown: string) => void;
  onSave: (markdown: string) => Promise<boolean>;
}

const PREVIEW_DEBOUNCE_MS: number = 250;

export class EditModeManager {
  private processor: MarkdownProcessor;
  private mermaid: MermaidRenderer;
  private enhancer: ContentEnhancer;
  private callbacks: IEditCallbacks;

  private layout: EditorLayout = 'split';
  private dirty: boolean = false;
  private previewTimer: number | undefined;
  private textarea: HTMLTextAreaElement | undefined;
  private preview: HTMLElement | undefined;
  private status: HTMLElement | undefined;
  private saveButton: HTMLButtonElement | undefined;

  constructor(
    processor: MarkdownProcessor,
    mermaid: MermaidRenderer,
    enhancer: ContentEnhancer,
    callbacks: IEditCallbacks
  ) {
    this.processor = processor;
    this.mermaid = mermaid;
    this.enhancer = enhancer;
    this.callbacks = callbacks;
  }

  public get hasUnsavedChanges(): boolean {
    return this.dirty;
  }

  public render(container: HTMLElement, markdown: string, options: IEditOptions): void {
    const host: HTMLElement = ThemeManager.mount(container, options.settings, options.resolvedMode);
    host.setAttribute('data-strata-editing', 'true');
    // The editor sizes itself, and the root the fitter was measuring is gone.
    this.enhancer.stopFilling();
    /* Editing is not reading: the button back to the top of the document has
       nothing to go back to here, and left behind it kept the scroll listener
       the view had attached, so it stayed on screen showing the state it was
       last in. */
    this.enhancer.stopBackToTop();

    const editor: HTMLElement = document.createElement('div');
    editor.className = 'strata-editor';
    editor.setAttribute('data-layout', this.layout);

    host.appendChild(this.buildToolbar(editor, options));

    const editorPane: HTMLElement = document.createElement('div');
    editorPane.className = 'strata-editor-pane';
    editorPane.appendChild(this.paneLabel('Markdown'));

    this.textarea = document.createElement('textarea');
    this.textarea.className = 'strata-editor-input';
    this.textarea.value = markdown || '';
    this.textarea.spellcheck = false;
    this.textarea.setAttribute('aria-label', 'Markdown source');
    this.textarea.addEventListener('input', () => this.onInput(options));
    this.textarea.addEventListener('keydown', (event: KeyboardEvent) => this.onKeyDown(event, options));
    this.textarea.addEventListener('keydown', (event: KeyboardEvent) => this.onSaveShortcut(event, options));
    editorPane.appendChild(this.textarea);

    const previewPane: HTMLElement = document.createElement('div');
    previewPane.className = 'strata-preview-pane';
    previewPane.appendChild(this.paneLabel('Preview'));

    this.preview = document.createElement('div');
    this.preview.className = 'strata-content';
    previewPane.appendChild(this.preview);

    editor.appendChild(editorPane);
    editor.appendChild(previewPane);
    host.appendChild(editor);

    this.refreshPreview(markdown, options);
  }

  private buildToolbar(editor: HTMLElement, options: IEditOptions): HTMLElement {
    const toolbar: HTMLElement = document.createElement('div');
    toolbar.className = 'strata-toolbar';

    const layouts: { key: EditorLayout; label: string }[] = [
      { key: 'edit', label: 'Edit' },
      { key: 'split', label: 'Split' },
      { key: 'preview', label: 'Preview' }
    ];

    layouts.forEach((entry) => {
      const button: HTMLButtonElement = document.createElement('button');
      button.type = 'button';
      button.className = 'strata-btn';
      button.textContent = entry.label;
      button.setAttribute('aria-pressed', String(this.layout === entry.key));
      button.addEventListener('click', () => {
        this.layout = entry.key;
        editor.setAttribute('data-layout', entry.key);
        Array.prototype.slice
          .call(toolbar.querySelectorAll('.strata-btn[aria-pressed]'))
          .forEach((other: HTMLElement) =>
            other.setAttribute('aria-pressed', String(other.textContent === entry.label))
          );
      });
      toolbar.appendChild(button);
    });

    const spacer: HTMLElement = document.createElement('div');
    spacer.className = 'strata-toolbar-spacer';
    toolbar.appendChild(spacer);

    this.status = document.createElement('span');
    this.status.className = 'strata-status';
    // Announce save results to screen readers without stealing focus.
    this.status.setAttribute('role', 'status');
    this.status.setAttribute('aria-live', 'polite');
    this.status.textContent = options.canSave ? `Editing ${options.saveTargetName}` : 'Editing web part content';
    toolbar.appendChild(this.status);

    if (options.canSave) {
      const save: HTMLButtonElement = document.createElement('button');
      save.type = 'button';
      save.className = 'strata-btn strata-btn-primary';
      save.textContent = 'Save to SharePoint';
      save.addEventListener('click', () => void this.save(save));
      toolbar.appendChild(save);
      this.saveButton = save;
    } else {
      this.saveButton = undefined;
    }

    return toolbar;
  }

  /**
   * Ctrl+S (Cmd+S on a Mac) saves without reaching for the button, which
   * matters most in a narrow column where the toolbar has wrapped.
   */
  private onSaveShortcut(event: KeyboardEvent, options: IEditOptions): void {
    if (!(event.ctrlKey || event.metaKey) || event.key.toLowerCase() !== 's') {
      return;
    }
    event.preventDefault();
    if (!options.canSave || !this.saveButton) {
      this.setStatus('Nothing to save to - this content is stored with the web part', '');
      return;
    }
    void this.save(this.saveButton);
  }

  /** Tab inserts two spaces instead of leaving the textarea. */
  private onKeyDown(event: KeyboardEvent, options: IEditOptions): void {
    if (event.key !== 'Tab' || !this.textarea) {
      return;
    }
    event.preventDefault();
    const start: number = this.textarea.selectionStart;
    const end: number = this.textarea.selectionEnd;
    const value: string = this.textarea.value;
    this.textarea.value = `${value.slice(0, start)}  ${value.slice(end)}`;
    this.textarea.selectionStart = this.textarea.selectionEnd = start + 2;
    this.onInput(options);
  }

  private onInput(options: IEditOptions): void {
    if (!this.textarea) {
      return;
    }
    const value: string = this.textarea.value;
    this.dirty = true;
    this.callbacks.onChange(value);
    this.setStatus('Unsaved changes', '');

    if (this.previewTimer !== undefined) {
      window.clearTimeout(this.previewTimer);
    }
    this.previewTimer = window.setTimeout(() => this.refreshPreview(value, options), PREVIEW_DEBOUNCE_MS);
  }

  private refreshPreview(markdown: string, options: IEditOptions): void {
    if (!this.preview) {
      return;
    }
    const preview: HTMLElement = this.preview;
    preview.innerHTML = this.processor.render(markdown);
    this.enhancer.attachCopyButtons(preview);
    this.enhancer.secureExternalLinks(preview);
    this.enhancer.enhanceImages(preview, options.enableImageZoom !== false);
    if (options.enableMermaid) {
      void this.mermaid.render(preview, options.settings.themeFamily, options.resolvedMode,
        options.diagramWidth)
        .then(() => this.enhancer.attachDiagramTools(preview, options.enableImageZoom !== false));
    }
  }

  private async save(button: HTMLButtonElement): Promise<void> {
    if (!this.textarea) {
      return;
    }
    button.disabled = true;
    this.setStatus('Saving...', '');

    try {
      const saved: boolean = await this.callbacks.onSave(this.textarea.value);
      if (saved) {
        this.dirty = false;
        this.setStatus('Saved', 'success');
      } else {
        this.setStatus('Not saved', 'error');
      }
    } catch (error) {
      this.setStatus((error as Error).message || 'Save failed', 'error');
    } finally {
      button.disabled = false;
    }
  }

  private setStatus(message: string, tone: string): void {
    if (!this.status) {
      return;
    }
    this.status.textContent = message;
    if (tone) {
      this.status.setAttribute('data-tone', tone);
    } else {
      this.status.removeAttribute('data-tone');
    }
  }

  private paneLabel(text: string): HTMLElement {
    const label: HTMLElement = document.createElement('div');
    label.className = 'strata-pane-label';
    label.textContent = text;
    return label;
  }

  public dispose(): void {
    if (this.previewTimer !== undefined) {
      window.clearTimeout(this.previewTimer);
    }
  }
}
