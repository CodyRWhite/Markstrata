/**
 * .SYNOPSIS
 * Draws the settings pane the web part describes, in a plain page.
 *
 * .DESCRIPTION
 * The web part does not build its pane; it returns a description of one, and
 * SharePoint draws it. So this draws the same description, which means the
 * pane in the harness is the pane in the tenant: the same pages, the same
 * groups, the same labels, the same dropdown contents. A group that only
 * appears under some setting appears here under that setting, because the
 * condition is in the description and not in this file.
 *
 * That is worth having for one reason above the rest. The lists in those
 * dropdowns come from the site, through the web part, and when 0.0.17.0 built
 * them from a connection that did not exist yet they came up empty in every
 * tenant and in nothing a test could see. Here they are visible.
 *
 * Changing a control does what SharePoint does: writes the value, tells the
 * web part, and draws again - see webPartBase.ts, which owns that order.
 *
 * .USAGE
 *   import { WebPartPane } from './webPartPane';
 *
 *   const pane = new WebPartPane(document.getElementById('demo-panel'), {
 *     read: () => webPart.pane(),
 *     value: (path) => webPart.settings()[path],
 *     change: (path, value) => webPart.changeProperty(path, value),
 *     close: () => pane.hide()
 *   });
 *   pane.show();
 *   pane.refresh();
 *
 * .NOTES
 * Since:     unreleased
 * Ships in:  nothing - it builds or drives what ships
 * Requires:  spfx/propertyPane.ts
 */

import {
  IPropertyPaneConfiguration,
  IPropertyPaneField,
  IPropertyPaneGroup,
  IPropertyPanePage,
  IPropertyPaneDropdownOption
} from './spfx/propertyPane';

export interface IPaneCallbacks {
  /** The description as the web part gives it, read fresh every draw. */
  read: () => IPropertyPaneConfiguration;
  value: (propertyPath: string) => unknown;
  change: (propertyPath: string, newValue: unknown) => void;
  close: () => void;
}

function element(tag: string, className: string, text?: string): HTMLElement {
  const node: HTMLElement = document.createElement(tag);
  node.className = className;
  if (text !== undefined) { node.textContent = text; }
  return node;
}

export class WebPartPane {
  private readonly host: HTMLElement;
  private readonly callbacks: IPaneCallbacks;
  private pageIndex: number = 0;

  public constructor(host: HTMLElement, callbacks: IPaneCallbacks) {
    this.host = host;
    this.callbacks = callbacks;
  }

  public show(): void {
    this.host.hidden = false;
    document.body.classList.add('pp-open');
    this.refresh();
  }

  public hide(): void {
    this.host.hidden = true;
    document.body.classList.remove('pp-open');
  }

  public get isOpen(): boolean {
    return !this.host.hidden;
  }

  /** Draws the pane again from the description as it now stands. */
  public refresh(): void {
    if (this.host.hidden) { return; }

    const configuration: IPropertyPaneConfiguration = this.callbacks.read();
    const pages: IPropertyPanePage[] = configuration.pages || [];
    if (this.pageIndex >= pages.length) { this.pageIndex = 0; }

    this.host.textContent = '';
    this.host.appendChild(this.header());
    this.host.appendChild(this.body(pages[this.pageIndex]));
    this.host.appendChild(this.footer(pages.length));
  }

  private header(): HTMLElement {
    const header: HTMLElement = element('div', 'pp-header');
    const heading: HTMLElement = element('div', 'pp-heading');
    heading.appendChild(element('div', 'pp-title', 'Markstrata'));
    heading.appendChild(element('div', 'pp-subtitle', 'Web part properties'));
    header.appendChild(heading);

    const close: HTMLElement = element('button', 'pp-close', '✕');
    close.setAttribute('type', 'button');
    close.setAttribute('aria-label', 'Close the property pane');
    close.addEventListener('click', () => this.callbacks.close());
    header.appendChild(close);
    return header;
  }

  private body(page: IPropertyPanePage | undefined): HTMLElement {
    const body: HTMLElement = element('div', 'pp-body');
    if (!page) { return body; }

    if (page.header && page.header.description) {
      body.appendChild(element('p', 'pp-description', page.header.description));
    }

    (page.groups || []).forEach((group: IPropertyPaneGroup) => {
      if (group.groupName) {
        body.appendChild(element('h3', 'pp-group', group.groupName));
      }
      (group.groupFields || []).forEach((field: IPropertyPaneField) => {
        const drawn: HTMLElement | undefined = this.field(field);
        if (drawn) { body.appendChild(drawn); }
      });
    });
    return body;
  }

  private footer(pageCount: number): HTMLElement {
    const footer: HTMLElement = element('div', 'pp-footer');
    footer.appendChild(this.step('Back', this.pageIndex > 0, -1));
    footer.appendChild(
      element('span', 'pp-count', `${this.pageIndex + 1} of ${pageCount}`)
    );
    footer.appendChild(this.step('Next', this.pageIndex < pageCount - 1, 1));
    return footer;
  }

  private step(label: string, enabled: boolean, by: number): HTMLElement {
    const button: HTMLElement = element('button', 'pp-step', label);
    button.setAttribute('type', 'button');
    if (!enabled) {
      button.setAttribute('disabled', 'disabled');
    } else {
      button.addEventListener('click', () => {
        this.pageIndex += by;
        this.refresh();
      });
    }
    return button;
  }

  // ----------------------------------------------------------- the controls

  private field(field: IPropertyPaneField): HTMLElement | undefined {
    switch (field.type) {
      case 'Dropdown': return this.dropdown(field);
      case 'Toggle': return this.toggle(field);
      case 'Slider': return this.slider(field);
      case 'TextField': return this.textField(field);
      case 'Label': return this.label(field);
      default: return undefined;
    }
  }

  /*
   * Every control reads its value from the properties rather than from the
   * description, which is what SharePoint does: the description says what the
   * control is, the properties say what it currently holds.
   */
  private dropdown(field: IPropertyPaneField): HTMLElement {
    const wrapper: HTMLElement = element('div', 'pp-field');
    const id: string = `pp-${field.targetProperty}`;
    wrapper.appendChild(this.labelFor(id, field));

    const select: HTMLSelectElement = document.createElement('select');
    select.className = 'pp-select';
    select.id = id;
    select.setAttribute('data-property', field.targetProperty);

    const options: IPropertyPaneDropdownOption[] = field.properties.options || [];
    options.forEach((option: IPropertyPaneDropdownOption) => {
      const item: HTMLOptionElement = document.createElement('option');
      item.value = String(option.key);
      item.textContent = option.text;
      select.appendChild(item);
    });
    select.value = String(this.callbacks.value(field.targetProperty) ?? '');

    select.addEventListener('change', () => {
      this.callbacks.change(field.targetProperty, select.value);
    });
    wrapper.appendChild(select);
    this.addHint(wrapper, field);
    return wrapper;
  }

  private toggle(field: IPropertyPaneField): HTMLElement {
    const wrapper: HTMLElement = element('div', 'pp-field');
    wrapper.appendChild(element('label', 'pp-label', field.properties.label || ''));

    const row: HTMLElement = element('div', 'pp-toggle-row');
    const button: HTMLElement = element('button', 'pp-toggle');
    const on: boolean = this.callbacks.value(field.targetProperty) === true;

    button.setAttribute('type', 'button');
    button.setAttribute('role', 'switch');
    button.setAttribute('aria-checked', on ? 'true' : 'false');
    button.setAttribute('aria-label', field.properties.label || field.targetProperty);
    button.setAttribute('data-property', field.targetProperty);
    button.appendChild(element('span', 'pp-toggle-thumb'));
    button.addEventListener('click', () => {
      this.callbacks.change(field.targetProperty, !on);
    });

    row.appendChild(button);
    row.appendChild(element(
      'span', 'pp-toggle-word',
      on ? (field.properties.onText || 'On') : (field.properties.offText || 'Off')
    ));
    wrapper.appendChild(row);
    this.addHint(wrapper, field);
    return wrapper;
  }

  private slider(field: IPropertyPaneField): HTMLElement {
    const wrapper: HTMLElement = element('div', 'pp-field');
    const id: string = `pp-${field.targetProperty}`;
    wrapper.appendChild(this.labelFor(id, field));

    const row: HTMLElement = element('div', 'pp-slider-row');
    const input: HTMLInputElement = document.createElement('input');
    input.type = 'range';
    input.className = 'pp-slider';
    input.id = id;
    input.setAttribute('data-property', field.targetProperty);
    input.min = String(field.properties.min ?? 0);
    input.max = String(field.properties.max ?? 100);
    input.step = String(field.properties.step ?? 1);
    input.value = String(this.callbacks.value(field.targetProperty) ?? input.min);

    const readout: HTMLElement = element('span', 'pp-slider-value', input.value);
    input.addEventListener('input', () => {
      readout.textContent = input.value;
      this.callbacks.change(field.targetProperty, Number(input.value));
    });

    row.appendChild(input);
    row.appendChild(readout);
    wrapper.appendChild(row);
    this.addHint(wrapper, field);
    return wrapper;
  }

  private textField(field: IPropertyPaneField): HTMLElement {
    const wrapper: HTMLElement = element('div', 'pp-field');
    const id: string = `pp-${field.targetProperty}`;
    wrapper.appendChild(this.labelFor(id, field));

    const multiline: boolean = field.properties.multiline === true;
    const input: HTMLInputElement | HTMLTextAreaElement = multiline
      ? document.createElement('textarea')
      : document.createElement('input');
    input.className = 'pp-text';
    input.id = id;
    input.setAttribute('data-property', field.targetProperty);
    if (multiline) {
      (input as HTMLTextAreaElement).rows = field.properties.rows || 6;
    }
    input.value = String(this.callbacks.value(field.targetProperty) ?? '');

    /* On change rather than on every keystroke: the real pane does not rebuild
       the web part between two letters of a file name. */
    input.addEventListener('change', () => {
      this.callbacks.change(field.targetProperty, input.value);
    });
    wrapper.appendChild(input);
    this.addHint(wrapper, field);
    return wrapper;
  }

  private label(field: IPropertyPaneField): HTMLElement {
    const wrapper: HTMLElement = element('div', 'pp-field');
    wrapper.appendChild(element('p', 'pp-hint', field.properties.text || ''));
    return wrapper;
  }

  private labelFor(id: string, field: IPropertyPaneField): HTMLElement {
    const label: HTMLElement = element('label', 'pp-label', field.properties.label || '');
    label.setAttribute('for', id);
    return label;
  }

  private addHint(wrapper: HTMLElement, field: IPropertyPaneField): void {
    if (field.properties.description) {
      wrapper.appendChild(element('p', 'pp-hint', field.properties.description));
    }
  }
}
