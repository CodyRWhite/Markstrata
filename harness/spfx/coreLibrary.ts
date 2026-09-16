/**
 * .SYNOPSIS
 * Stands in for @microsoft/sp-core-library while the web part runs in a plain
 * browser page.
 *
 * .DESCRIPTION
 * The web part uses two things from that package and neither of them needs
 * SharePoint: a version number it hands back to say what shape its saved
 * properties are in, and the enum that says whether the page is being read or
 * edited. Both are written out here so the harness can load the real web part
 * without loading the SharePoint module system with it.
 *
 * Nothing here is a guess. The names, the values and the meanings are the
 * ones SPFx uses; DisplayMode.Read is 1 and Edit is 2 in SharePoint, so they
 * are 1 and 2 here, because a harness that agreed with itself but not with
 * SharePoint would be worse than no harness.
 *
 * .USAGE
 *   // Never imported by name: the harness build maps
 *   // '@microsoft/sp-core-library' onto this file.
 *   import { Version, DisplayMode } from '@microsoft/sp-core-library';
 *
 * .NOTES
 * Since:     0.0.18.0
 * Ships in:  nothing - it stands in for SharePoint at harness time
 * Requires:  nothing else in this project
 */

/** Read is what a visitor sees; Edit is an author with the page open. */
export enum DisplayMode {
  Read = 1,
  Edit = 2
}

export class Version {
  private readonly parts: number[];

  private constructor(parts: number[]) {
    this.parts = parts;
  }

  public static parse(text: string): Version {
    return new Version(text.split('.').map((part: string) => Number(part) || 0));
  }

  public toString(): string {
    return this.parts.join('.');
  }
}
