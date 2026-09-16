/**
 * .SYNOPSIS
 * Serves the real English strings to the web part while it runs in the
 * harness.
 *
 * .DESCRIPTION
 * SharePoint maps the module name 'MarkstrataWebPartStrings' onto a file in
 * loc/, and that file is written the way SharePoint loads it, as an AMD
 * module. A plain browser page has no AMD loader, so this is the four lines of
 * one: catch the factory, call it, and hand back what it returns.
 *
 * The point of the detour is that the harness shows the strings the tenant
 * shows. A second copy of them here would drift, and a pane full of
 * placeholder labels would prove nothing about the pane.
 *
 * .USAGE
 *   // The harness build maps 'MarkstrataWebPartStrings' onto this file.
 *   import * as strings from 'MarkstrataWebPartStrings';
 *   strings.ContentGroupName;
 *
 * .NOTES
 * Since:     0.0.18.0
 * Ships in:  nothing - it stands in for SharePoint at harness time
 * Requires:  loc/en-us.js
 */

const collected = {};

/* en-us.js asks for define the moment it is loaded, so this has to be in place
   before the require below, not after it. */
globalThis.define = function (dependencies, factory) {
  Object.assign(collected, factory());
};

require('../../src/webparts/markstrata/loc/en-us.js');

module.exports = collected;
