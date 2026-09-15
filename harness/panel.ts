/**
 * .SYNOPSIS
 * A stand-in for the SharePoint property pane, drawn in a plain page.
 *
 * .DESCRIPTION
 * A stand-in for the SharePoint property pane, for the demo page.
 *
 * The demo runs the web part's real renderer classes but there is no
 * SharePoint around them, so there is no pane to change their settings from.
 * This draws one: the same fields, in the same groups, on the same paged
 * layout, reading the labels the web part itself uses so the two cannot drift
 * apart in wording.
 *
 * It deliberately leaves out the Content page. Source, document library,
 * folder and file only mean something against a real tenant, and a pane full
 * of controls that quietly do nothing is worse than a shorter honest one.
 *
 * .USAGE
 *   import { PropertyPanel, IPanelPage } from './panel';
 *
 *   const panel: PropertyPanel = new PropertyPanel(PANEL_PAGES, state, {
 *     onChange: (key, value) => { state[key] = value; draw(); }
 *   });
 *   panel.mount(document.body);
 *
 * .NOTES
 * Since:     0.0.8
 * Ships in:  nothing - it builds or drives what ships
 * Requires:  nothing else in this project
 */

export type FieldType = 'dropdown' | 'toggle' | 'slider';

export interface IPanelOption {
  value: string;
  text: string;
}

export interface IPanelField {
  key: string;
  label: string;
  type: FieldType;
  options?: IPanelOption[];
  /* A number, or read from the state: a slider's useful range can depend on
     another setting, the way a width's does on the unit it is measured in. */
  min?: number | ((state: IPanelState) => number);
  max?: number | ((state: IPanelState) => number);
  /** Small print under the control, as the real pane uses for its warnings. */
  hint?: string;
  /** Fields that only apply given some other setting are left out until then. */
  showIf?: (state: IPanelState) => boolean;
}

export interface IPanelGroup {
  name: string;
  fields: IPanelField[];
}

export interface IPanelPage {
  description: string;
  groups: IPanelGroup[];
}

export interface IPanelState {
  [key: string]: string | number | boolean;
}

export interface IPanelHandlers {
  onChange: (key: string, value: string | number | boolean) => void;
  onClose: () => void;
}

export class PropertyPanel {
  private readonly host: HTMLElement;
  private readonly pages: IPanelPage[];
  private readonly state: IPanelState;
  private readonly handlers: IPanelHandlers;
  private pageIndex: number = 0;

  public constructor(host: HTMLElement, pages: IPanelPage[], state: IPanelState,
    handlers: IPanelHandlers) {
    this.host = host;
    this.pages = pages;
    this.state = state;
    this.handlers = handlers;
  }

  public open(): void {
    this.host.hidden = false;
    this.render();
    const first: HTMLElement | null = this.host.querySelector('.pp-close');
    if (first) {
      first.focus();
    }
  }

  public close(): void {
    this.host.hidden = true;
    this.handlers.onClose();
  }

  public get isOpen(): boolean {
    return !this.host.hidden;
  }

  /*
   * Redraws the pane against the current state, keeping the page you are on.
   * Some settings decide whether others apply at all, and a control that has
   * just become relevant has to appear; SharePoint's own pane has the same
   * call for the same reason. Not done on every change, because rebuilding a
   * slider under the pointer interrupts the drag.
   */
  public refresh(): void {
    if (this.isOpen) {
      this.render();
    }
  }

  private render(): void {
    const page: IPanelPage = this.pages[this.pageIndex];
    this.host.textContent = '';
    this.host.appendChild(this.header());

    const body: HTMLElement = el('div', 'pp-body');
    body.appendChild(el('p', 'pp-description', page.description));
    page.groups.forEach((group) => {
      body.appendChild(el('h3', 'pp-group', group.name));
      group.fields
        .filter((field) => !field.showIf || field.showIf(this.state))
        .forEach((field) => body.appendChild(this.field(field)));
    });
    this.host.appendChild(body);
    this.host.appendChild(this.footer());
  }

  private header(): HTMLElement {
    const head: HTMLElement = el('div', 'pp-header');
    const text: HTMLElement = el('div', 'pp-heading');
    text.appendChild(el('div', 'pp-title', 'Markstrata'));
    text.appendChild(el('div', 'pp-subtitle', 'Web part properties'));
    head.appendChild(text);

    const close: HTMLElement = el('button', 'pp-close', '✕');
    close.setAttribute('type', 'button');
    close.setAttribute('aria-label', 'Close the property pane');
    close.addEventListener('click', () => this.close());
    head.appendChild(close);
    return head;
  }

  private footer(): HTMLElement {
    const foot: HTMLElement = el('div', 'pp-footer');
    const back: HTMLElement = this.step('‹ Back', this.pageIndex > 0, () => {
      this.pageIndex -= 1;
      this.render();
    });
    const next: HTMLElement = this.step('Next ›', this.pageIndex < this.pages.length - 1, () => {
      this.pageIndex += 1;
      this.render();
    });
    foot.appendChild(back);
    foot.appendChild(el('span', 'pp-count', `${this.pageIndex + 1} of ${this.pages.length}`));
    foot.appendChild(next);
    return foot;
  }

  private step(label: string, enabled: boolean, onPress: () => void): HTMLElement {
    const button: HTMLElement = el('button', 'pp-step', label);
    button.setAttribute('type', 'button');
    if (!enabled) {
      button.setAttribute('disabled', 'disabled');
    } else {
      button.addEventListener('click', onPress);
    }
    return button;
  }

  private field(field: IPanelField): HTMLElement {
    const wrap: HTMLElement = el('div', 'pp-field');
    const id: string = `pp-${field.key}`;

    if (field.type === 'toggle') {
      wrap.appendChild(this.toggle(field, id));
    } else {
      const label: HTMLElement = el('label', 'pp-label', field.label);
      label.setAttribute('for', id);
      wrap.appendChild(label);
      wrap.appendChild(field.type === 'slider' ? this.slider(field, id) : this.dropdown(field, id));
    }

    if (field.hint) {
      wrap.appendChild(el('p', 'pp-hint', field.hint));
    }
    return wrap;
  }

  private dropdown(field: IPanelField, id: string): HTMLElement {
    const select: HTMLSelectElement = document.createElement('select');
    select.className = 'pp-select';
    select.id = id;
    (field.options || []).forEach((option) => {
      const node: HTMLOptionElement = document.createElement('option');
      node.value = option.value;
      node.textContent = option.text;
      if (String(this.state[field.key]) === option.value) {
        node.selected = true;
      }
      select.appendChild(node);
    });
    select.addEventListener('change', () => this.handlers.onChange(field.key, select.value));
    return select;
  }

  private slider(field: IPanelField, id: string): HTMLElement {
    const row: HTMLElement = el('div', 'pp-slider-row');
    const input: HTMLInputElement = document.createElement('input');
    input.type = 'range';
    input.className = 'pp-slider';
    input.id = id;
    input.min = String(this.bound(field.min, 1));
    input.max = String(this.bound(field.max, 6));
    input.value = String(this.state[field.key]);
    const readout: HTMLElement = el('span', 'pp-slider-value', input.value);
    input.addEventListener('input', () => {
      readout.textContent = input.value;
      this.handlers.onChange(field.key, parseInt(input.value, 10));
    });
    row.appendChild(input);
    row.appendChild(readout);
    return row;
  }

  private bound(value: number | ((state: IPanelState) => number) | undefined,
    fallback: number): number {
    if (value === undefined) {
      return fallback;
    }
    return typeof value === 'function' ? value(this.state) : value;
  }

  /*
   * SharePoint's toggle puts its label above the control and the on or off
   * word beside it, which is the part people recognise, so it is drawn rather
   * than left as a checkbox.
   */
  private toggle(field: IPanelField, id: string): HTMLElement {
    const block: HTMLElement = el('div', 'pp-toggle-block');
    const label: HTMLElement = el('label', 'pp-label', field.label);
    label.setAttribute('for', id);
    block.appendChild(label);

    const row: HTMLElement = el('div', 'pp-toggle-row');
    const button: HTMLElement = el('button', 'pp-toggle');
    button.setAttribute('type', 'button');
    button.id = id;
    button.setAttribute('role', 'switch');
    const word: HTMLElement = el('span', 'pp-toggle-word');

    const paint = (isOn: boolean): void => {
      button.setAttribute('aria-checked', String(isOn));
      word.textContent = isOn ? 'On' : 'Off';
    };
    paint(Boolean(this.state[field.key]));

    button.addEventListener('click', () => {
      const next: boolean = !(this.state[field.key] as boolean);
      paint(next);
      this.handlers.onChange(field.key, next);
    });

    button.appendChild(el('span', 'pp-toggle-thumb'));
    row.appendChild(button);
    row.appendChild(word);
    block.appendChild(row);
    return block;
  }
}

function el(tag: string, className: string, text?: string): HTMLElement {
  const node: HTMLElement = document.createElement(tag);
  node.className = className;
  if (text !== undefined) {
    node.textContent = text;
  }
  return node;
}
