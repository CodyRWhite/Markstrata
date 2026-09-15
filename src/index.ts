/**
 * .SYNOPSIS
 * The entry file the TypeScript compiler expects, and nothing more.
 *
 * .DESCRIPTION
 * The compiler wants a file at the root of src/. The web part is bundled from
 * its own entry point, which config/config.json names, so nothing is exported
 * from here and nothing should be: a symbol added here would be compiled into
 * the solution without ever being part of a web part.
 *
 * .USAGE
 *   Nothing imports this file. Leave it as it is.
 *
 * .NOTES
 * Since:     0.0.6
 * Ships in:  the web part bundle
 * Requires:  nothing else in this project
 */
export {};
