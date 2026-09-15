/**
 * .SYNOPSIS
 * Stands in for @microsoft/sp-property-pane: the field descriptions the web
 * part builds its settings pane out of.
 *
 * .DESCRIPTION
 * Every one of these functions does in SharePoint exactly what it does here -
 * it describes a control rather than building one. The pane is a value the web
 * part returns, and something else turns it into a screen; in SharePoint that
 * is the page, and in the harness it is webPartPane.ts.
 *
 * Which means the harness pane is drawn from the same description the real one
 * is. A group that only appears under some setting, a dropdown whose contents
 * come from the site, a slider whose range moves with its unit: none of that
 * is reimplemented here, so none of it can quietly disagree.
 *
 * .USAGE
 *   // The harness build maps '@microsoft/sp-property-pane' onto this file.
 *   import { PropertyPaneDropdown } from '@microsoft/sp-property-pane';
 *
 *   PropertyPaneDropdown('themeFamily', { label: 'Theme', options: [...] })
 *   // -> { type: 'Dropdown', targetProperty: 'themeFamily', properties: {...} }
 *
 * .NOTES
 * Since:     unreleased
 * Ships in:  nothing - it stands in for SharePoint at harness time
 * Requires:  nothing else in this project
 */

export interface IPropertyPaneDropdownOption {
  key: string;
  text: string;
}

export interface IPropertyPaneField {
  type: string;
  targetProperty: string;
  properties: IFieldProperties;
}

export interface IFieldProperties {
  label?: string;
  description?: string;
  text?: string;
  options?: IPropertyPaneDropdownOption[];
  selectedKey?: string;
  checked?: boolean;
  value?: number | string;
  min?: number;
  max?: number;
  step?: number;
  multiline?: boolean;
  rows?: number;
  onText?: string;
  offText?: string;
  disabled?: boolean;
  placeholder?: string;
}

export interface IPropertyPaneGroup {
  groupName?: string;
  groupFields: IPropertyPaneField[];
}

export interface IPropertyPanePage {
  header?: { description?: string };
  groups: IPropertyPaneGroup[];
}

export interface IPropertyPaneConfiguration {
  pages: IPropertyPanePage[];
}

function field(type: string, targetProperty: string, properties: IFieldProperties): IPropertyPaneField {
  return { type: type, targetProperty: targetProperty, properties: properties };
}

export function PropertyPaneDropdown(targetProperty: string, properties: IFieldProperties): IPropertyPaneField {
  return field('Dropdown', targetProperty, properties);
}

export function PropertyPaneSlider(targetProperty: string, properties: IFieldProperties): IPropertyPaneField {
  return field('Slider', targetProperty, properties);
}

export function PropertyPaneTextField(targetProperty: string, properties: IFieldProperties): IPropertyPaneField {
  return field('TextField', targetProperty, properties);
}

export function PropertyPaneToggle(targetProperty: string, properties: IFieldProperties): IPropertyPaneField {
  return field('Toggle', targetProperty, properties);
}

/* A label has nothing to set, so it has no property to target. */
export function PropertyPaneLabel(targetProperty: string, properties: IFieldProperties): IPropertyPaneField {
  return field('Label', targetProperty, properties);
}
