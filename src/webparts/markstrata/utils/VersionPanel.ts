/**
 * Version history panel for a markdown file held in a SharePoint library.
 * Lists the file's versions, previews one, and restores it by writing that
 * text back as a new version (never by deleting history).
 */

import { SharePointService } from './SharePointService';
import type { IVersionInfo } from './SharePointService';

export interface IVersionPanelCallbacks {
  onPreview: (content: string, label: string) => void;
  onRestored: () => void;
}

export class VersionPanel {
  private service: SharePointService;
  private callbacks: IVersionPanelCallbacks;
  private element: HTMLElement | undefined;

  constructor(service: SharePointService, callbacks: IVersionPanelCallbacks) {
    this.service = service;
    this.callbacks = callbacks;
  }

  public get isOpen(): boolean {
    return !!this.element;
  }

  public close(): void {
    if (this.element && this.element.parentElement) {
      this.element.parentElement.removeChild(this.element);
    }
    this.element = undefined;
  }

  public async open(host: HTMLElement, fileUrl: string): Promise<void> {
    this.close();

    const panel: HTMLElement = document.createElement('div');
    panel.className = 'ink-panel';

    const head: HTMLElement = document.createElement('div');
    head.className = 'ink-panel-head';
    head.appendChild(this.text('span', 'Version history'));

    const spacer: HTMLElement = document.createElement('div');
    spacer.className = 'ink-toolbar-spacer';
    head.appendChild(spacer);

    const close: HTMLButtonElement = document.createElement('button');
    close.type = 'button';
    close.className = 'ink-btn';
    close.textContent = 'Close';
    close.addEventListener('click', () => this.close());
    head.appendChild(close);

    const body: HTMLElement = document.createElement('div');
    body.appendChild(this.text('div', 'Loading versions...', 'ink-version'));

    body.className = 'ink-panel-body';
    panel.appendChild(head);
    panel.appendChild(body);
    host.insertBefore(panel, host.firstChild);
    this.element = panel;

    const versions: IVersionInfo[] = await this.service.getVersions(fileUrl);
    if (this.element !== panel) {
      // Closed, or reopened, while the versions were loading.
      return;
    }

    const list: HTMLElement = document.createElement('div');
    list.className = 'ink-panel-body';
    if (versions.length === 0) {
      list.appendChild(
        this.text('div', 'No previous versions. Versioning may be switched off for this library.', 'ink-version')
      );
    } else {
      versions.forEach((version: IVersionInfo) => list.appendChild(this.buildRow(version, fileUrl)));
    }

    panel.replaceChild(list, body);
  }

  private buildRow(version: IVersionInfo, fileUrl: string): HTMLElement {
    const row: HTMLElement = document.createElement('div');
    row.className = 'ink-version';

    row.appendChild(this.text('span', version.versionLabel, 'ink-version-label'));

    const created: string = version.created ? new Date(version.created).toLocaleString() : '';
    row.appendChild(this.text('span', `${created} - ${version.createdBy}`, 'ink-version-meta'));

    if (version.isCurrentVersion) {
      row.appendChild(this.text('span', 'Current', 'ink-version-current'));
      return row;
    }

    const preview: HTMLButtonElement = this.button('Preview', async () => {
      const content: string = await this.service.getVersionContent(version);
      this.callbacks.onPreview(content, version.versionLabel);
    });
    row.appendChild(preview);

    const restore: HTMLButtonElement = this.button('Restore', async () => {
      const confirmed: boolean = window.confirm(
        `Restore version ${version.versionLabel}? The current text is kept in history as its own version.`
      );
      if (!confirmed) {
        return;
      }
      const content: string = await this.service.getVersionContent(version);
      await this.service.saveFileContent(fileUrl, content);
      this.close();
      this.callbacks.onRestored();
    });
    row.appendChild(restore);

    return row;
  }

  private button(label: string, action: () => Promise<void>): HTMLButtonElement {
    const button: HTMLButtonElement = document.createElement('button');
    button.type = 'button';
    button.className = 'ink-btn';
    button.textContent = label;
    button.addEventListener('click', () => {
      button.disabled = true;
      action()
        .catch((error: Error) => window.alert(error.message || 'That version could not be read.'))
        .then(() => {
          button.disabled = false;
        })
        .catch(() => {
          button.disabled = false;
        });
    });
    return button;
  }

  private text(tag: string, content: string, className?: string): HTMLElement {
    const element: HTMLElement = document.createElement(tag);
    element.textContent = content;
    if (className) {
      element.className = className;
    }
    return element;
  }
}
