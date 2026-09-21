/**
 * .SYNOPSIS
 * Edit mode for the HTML web part: the document and its stylesheet in one
 * pane, a live preview in the other.
 *
 * .DESCRIPTION
 * The markdown editor's shape, because an author who has used one should not
 * have to learn the other: a plain textarea, Edit / Split / Preview, the panes
 * scrolling together, Ctrl+S, and one Save button that writes the document back
 * to SharePoint.
 *
 * Deliberately not Monaco, for the same reason: Monaco costs a large lazily
 * loaded bundle and a loader shim, and what actually happens in a SharePoint
 * page is short edits. A textarea that always loads beats an editor that
 * sometimes does not.
 *
 * WHY THE STYLESHEET IS A TAB AND NOT A THIRD COLUMN
 * Three columns in a web part column is three things too narrow to use. The
 * source pane carries two tabs instead, so whichever of the two an author is
 * working on gets the whole width of it, and the preview beside it is the same
 * preview either way - which is the point: a change to the CSS is seen against
 * the document it dresses, not on its own.
 *
 * WHAT THE STYLESHEET TAB CAN AND CANNOT EDIT
 * It edits what this web part owns, which is the stylesheet typed into the
 * property pane. A stylesheet that comes from a library or a URL belongs to
 * that file, and several web parts are probably reading it; editing it here
 * would mean either writing to a file this editor's Save button does not name,
 * or pretending a change had been kept when it had not. So it is shown, marked
 * as read only, and the pane says where it lives.
 *
 * WHICH WAY THIS FAILS
 * A preview that disagreed with the page would be the bad failure, because an
 * author would tune a document against the wrong renderer. So the preview is
 * the page's own render path with the furniture switched off, rather than a
 * second way of drawing a document. The one thing it cannot show is a document
 * whose scripts run, since those are paused for anybody editing the page; the
 * editor says so rather than leaving an author to wonder.
 *
 * .USAGE
 *   const editor = new HtmlEditModeManager(view, enhancer, {
 *     onChange: (html) => { properties.htmlContent = html; },
 *     onStyleChange: (css) => { properties.cssContent = css; },
 *     onSave: (html) => saveToSharePoint(html)
 *   });
 *   editor.render(container, html, options);
 *
 * .NOTES
 * Since:     0.0.22.0
 * Ships in:  the HTML web part bundle
 * Requires:  HtmlViewRenderer.ts, ContentEnhancer.ts, ThemeManager.ts,
 *            scrollSync.ts, MarkstrataWebPartStrings
 */

import * as strings from 'MarkstrataWebPartStrings';

import { ContentEnhancer } from '../../markstrata/utils/ContentEnhancer';
import { ThemeManager } from '../../markstrata/utils/ThemeManager';
import { ScrollSync } from '../../markstrata/utils/scrollSync';
import { HtmlViewRenderer, IHtmlViewOptions } from './HtmlViewRenderer';

export type EditorLayout = 'edit' | 'split' | 'preview';

/** Which of the source pane's two tabs is in front. */
export type SourceTab = 'html' | 'css';

export interface IHtmlEditOptions {
  /** Everything the preview is drawn from, which is what the page is drawn from. */
  view: IHtmlViewOptions;
  /** True when the document came from a file we are allowed to write back to. */
  canSave: boolean;
  saveTargetName: string;
  /** The stylesheet as it stands, and whether this editor may change it. */
  css: string;
  canEditCss: boolean;
  /**
   * Where the stylesheet comes from, for the line above a read-only one. Empty
   * when the author typed it here, which is when it can be edited.
   */
  cssOrigin: string;
  /**
   * True when the author has turned scripts on, which the preview cannot show.
   * Said once, above the editor, rather than left to be discovered.
   */
  scriptsPaused: boolean;
}

export interface IHtmlEditCallbacks {
  onChange: (html: string) => void;
  onStyleChange: (css: string) => void;
  onSave: (html: string) => Promise<boolean>;
}

const PREVIEW_DEBOUNCE_MS: number = 250;

export class HtmlEditModeManager {
  private view: HtmlViewRenderer;
  private enhancer: ContentEnhancer;
  private callbacks: IHtmlEditCallbacks;

  private layout: EditorLayout = 'split';
  private tab: SourceTab = 'html';
  private dirty: boolean = false;
  private previewTimer: number | undefined;
  private htmlInput: HTMLTextAreaElement | undefined;
  private cssInput: HTMLTextAreaElement | undefined;
  private previewBox: HTMLElement | undefined;
  private status: HTMLElement | undefined;
  private saveButton: HTMLButtonElement | undefined;
  private readonly scrollSync: ScrollSync = new ScrollSync();

  constructor(
    view: HtmlViewRenderer,
    enhancer: ContentEnhancer,
    callbacks: IHtmlEditCallbacks
  ) {
    this.view = view;
    this.enhancer = enhancer;
    this.callbacks = callbacks;
  }

  public get hasUnsavedChanges(): boolean {
    return this.dirty;
  }

  public render(container: HTMLElement, html: string, options: IHtmlEditOptions): void {
    const host: HTMLElement = ThemeManager.mount(
      container, options.view.settings, options.view.resolvedMode
    );
    host.setAttribute('data-strata-editing', 'true');
    /* The editor sizes itself, and the root the fitter was measuring is gone.
       The button back to the top has nothing to go back to here, and left
       behind it keeps the scroll listener the view attached. */
    this.enhancer.stopFilling();
    this.enhancer.stopBackToTop();

    const editor: HTMLElement = document.createElement('div');
    editor.className = 'strata-editor';
    editor.setAttribute('data-layout', this.layout);

    host.appendChild(this.buildToolbar(editor, options));

    if (options.scriptsPaused) {
      /* The same sentence the read view shows for the same reason, from the
         one place it is written. */
      host.appendChild(this.notice(strings.ScriptsPausedWhileEditing));
    }

    editor.appendChild(this.buildSourcePane(html, options));
    editor.appendChild(this.buildPreviewPane());
    host.appendChild(editor);

    /* Reading the source and reading the preview are the same act of reading,
       and a split view where the halves go their own ways is a split view
       nobody uses on a document long enough to need one. */
    if (this.htmlInput && this.previewBox) {
      this.scrollSync.pair(this.htmlInput, this.previewBox);
    }

    this.refreshPreview(html, options);
  }

  // ------------------------------------------------------------ the two panes

  /**
   * The document and its stylesheet, as two tabs over one box.
   *
   * Both textareas are built and both stay in the markup: the tab switch is a
   * matter of which is shown, so a half-typed stylesheet is still there when
   * an author comes back to it, and neither loses its scroll position or its
   * undo history to a rebuild.
   */
  private buildSourcePane(html: string, options: IHtmlEditOptions): HTMLElement {
    const pane: HTMLElement = document.createElement('div');
    pane.className = 'strata-editor-pane';
    pane.setAttribute('data-strata-tab', this.tab);

    pane.appendChild(this.buildTabs(pane, options));

    this.htmlInput = this.textarea(html, 'HTML source', 'html');
    this.htmlInput.addEventListener('input', () => this.onInput(options));
    this.htmlInput.addEventListener('keydown',
      (event: KeyboardEvent) => this.onTab(event, this.htmlInput, options));
    this.htmlInput.addEventListener('keydown',
      (event: KeyboardEvent) => this.onSaveShortcut(event, options));
    pane.appendChild(this.htmlInput);

    this.cssInput = this.textarea(options.css, 'Stylesheet source', 'css');
    this.cssInput.readOnly = !options.canEditCss;
    if (options.canEditCss) {
      this.cssInput.addEventListener('input', () => this.onStyleInput(options));
      this.cssInput.addEventListener('keydown',
        (event: KeyboardEvent) => this.onTab(event, this.cssInput, options));
      this.cssInput.addEventListener('keydown',
        (event: KeyboardEvent) => this.onSaveShortcut(event, options));
    }
    pane.appendChild(this.cssInput);

    if (!options.canEditCss) {
      pane.appendChild(this.notice(options.cssOrigin
        ? `This stylesheet is ${options.cssOrigin}. Other web parts may be using it, `
          + 'so it is read only here and is edited where it lives.'
        : 'No stylesheet is set. Choose one on the Stylesheet page of the property '
          + 'pane, or type one there to edit it here.'));
    }

    return pane;
  }

  /**
   * Which source is in front. Two buttons rather than a dropdown, because
   * there are two and both fit.
   */
  private buildTabs(pane: HTMLElement, options: IHtmlEditOptions): HTMLElement {
    const tabs: HTMLElement = document.createElement('div');
    tabs.className = 'strata-source-tabs';
    tabs.setAttribute('role', 'tablist');
    tabs.setAttribute('aria-label', 'What to edit');

    const entries: { key: SourceTab; label: string }[] = [
      { key: 'html', label: 'HTML' },
      { key: 'css', label: options.canEditCss ? 'CSS' : 'CSS (read only)' }
    ];

    entries.forEach((entry: { key: SourceTab; label: string }) => {
      const button: HTMLButtonElement = document.createElement('button');
      button.type = 'button';
      button.className = 'strata-pane-tab';
      button.textContent = entry.label;
      button.setAttribute('role', 'tab');
      button.setAttribute('aria-selected', String(this.tab === entry.key));
      button.addEventListener('click', () => {
        this.tab = entry.key;
        pane.setAttribute('data-strata-tab', entry.key);
        Array.prototype.slice.call(tabs.querySelectorAll('.strata-pane-tab'))
          .forEach((other: HTMLElement) =>
            other.setAttribute('aria-selected', String(other === button)));
        const showing: HTMLTextAreaElement | undefined =
          entry.key === 'html' ? this.htmlInput : this.cssInput;
        if (showing) {
          showing.focus();
        }
      });
      tabs.appendChild(button);
    });

    return tabs;
  }

  private buildPreviewPane(): HTMLElement {
    const pane: HTMLElement = document.createElement('div');
    pane.className = 'strata-preview-pane';
    pane.appendChild(this.paneLabel('Preview'));

    /* The box rather than the pane is what is bordered and what scrolls, so it
       lines up with the textarea beside it: both panes are a label above a
       box, and the labels sit outside the boxes in each. */
    this.previewBox = document.createElement('div');
    this.previewBox.className = 'strata-preview-box';
    pane.appendChild(this.previewBox);

    return pane;
  }

  // ---------------------------------------------------------------- toolbar

  private buildToolbar(editor: HTMLElement, options: IHtmlEditOptions): HTMLElement {
    const toolbar: HTMLElement = document.createElement('div');
    toolbar.className = 'strata-toolbar';

    const layouts: { key: EditorLayout; label: string }[] = [
      { key: 'edit', label: 'Edit' },
      { key: 'split', label: 'Split' },
      { key: 'preview', label: 'Preview' }
    ];

    layouts.forEach((entry: { key: EditorLayout; label: string }) => {
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
    this.status.textContent = options.canSave
      ? `Editing ${options.saveTargetName}`
      : 'Editing web part content';
    toolbar.appendChild(this.status);

    if (options.canSave) {
      const save: HTMLButtonElement = document.createElement('button');
      save.type = 'button';
      save.className = 'strata-btn strata-btn-primary';
      /* Named for what it writes, because the stylesheet beside it is not
         written by this button and an author should not have to guess which
         of the two "Save" would mean. */
      save.textContent = 'Save the document';
      save.title = 'Write the HTML back to the file in SharePoint';
      save.addEventListener('click', () => void this.save(save));
      toolbar.appendChild(save);
      this.saveButton = save;
    } else {
      this.saveButton = undefined;
    }

    return toolbar;
  }

  // ------------------------------------------------------------------- input

  private onInput(options: IHtmlEditOptions): void {
    if (!this.htmlInput) {
      return;
    }
    const value: string = this.htmlInput.value;
    this.dirty = true;
    this.callbacks.onChange(value);
    this.setStatus('Unsaved changes', '');
    this.schedulePreview(value, options);
  }

  /**
   * A change to the stylesheet is not an unsaved change to the document.
   *
   * It is stored with the web part, which SharePoint saves when the page is
   * saved, so marking the document dirty here would offer an author a Save
   * button that writes a file they have not touched.
   */
  private onStyleInput(options: IHtmlEditOptions): void {
    if (!this.cssInput || !this.htmlInput) {
      return;
    }
    this.callbacks.onStyleChange(this.cssInput.value);
    this.schedulePreview(this.htmlInput.value, options);
  }

  private schedulePreview(html: string, options: IHtmlEditOptions): void {
    if (this.previewTimer !== undefined) {
      window.clearTimeout(this.previewTimer);
    }
    this.previewTimer = window.setTimeout(
      () => this.refreshPreview(html, options), PREVIEW_DEBOUNCE_MS
    );
  }

  /**
   * Ctrl+S (Cmd+S on a Mac) saves without reaching for the button, which
   * matters most in a narrow column where the toolbar has wrapped.
   */
  private onSaveShortcut(event: KeyboardEvent, options: IHtmlEditOptions): void {
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
  private onTab(event: KeyboardEvent, input: HTMLTextAreaElement | undefined,
    options: IHtmlEditOptions): void {
    if (event.key !== 'Tab' || !input || input.readOnly) {
      return;
    }
    event.preventDefault();
    const start: number = input.selectionStart;
    const end: number = input.selectionEnd;
    const value: string = input.value;
    input.value = `${value.slice(0, start)}  ${value.slice(end)}`;
    input.selectionStart = input.selectionEnd = start + 2;

    if (input === this.cssInput) {
      this.onStyleInput(options);
    } else {
      this.onInput(options);
    }
  }

  // ----------------------------------------------------------------- preview

  /**
   * Draws the document into the preview box, in whichever render mode the page
   * is set to and with whatever stylesheet is in the other tab.
   */
  private refreshPreview(html: string, options: IHtmlEditOptions): void {
    if (!this.previewBox) {
      return;
    }
    this.view.preview(this.previewBox, html, {
      ...options.view,
      /* The stylesheet as it stands in the editor rather than as it was
         fetched, so a change to it is seen against the document at once. */
      sharedCss: this.cssInput ? this.cssInput.value : options.css
    });
  }

  // -------------------------------------------------------------------- save

  private async save(button: HTMLButtonElement): Promise<void> {
    if (!this.htmlInput) {
      return;
    }
    button.disabled = true;
    this.setStatus('Saving...', '');

    try {
      const saved: boolean = await this.callbacks.onSave(this.htmlInput.value);
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

  // ------------------------------------------------------------------ pieces

  private textarea(value: string, label: string, which: SourceTab): HTMLTextAreaElement {
    const input: HTMLTextAreaElement = document.createElement('textarea');
    input.className = 'strata-editor-input';
    input.value = value || '';
    input.spellcheck = false;
    input.setAttribute('aria-label', label);
    input.setAttribute('data-strata-source', which);
    return input;
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

  /** A line of explanation, styled as the banners elsewhere are. */
  private notice(text: string): HTMLElement {
    const notice: HTMLElement = document.createElement('div');
    notice.className = 'strata-status strata-editor-notice';
    notice.setAttribute('data-tone', 'info');
    notice.textContent = text;
    return notice;
  }

  public dispose(): void {
    if (this.previewTimer !== undefined) {
      window.clearTimeout(this.previewTimer);
    }
    this.scrollSync.stop();
  }
}
