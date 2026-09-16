<#
.SYNOPSIS
Rewrites published GitHub release bodies from the sections in CHANGELOG.md.

.DESCRIPTION
A release body is written once, by the release workflow, out of the changelog
section for that version. When the changelog is later corrected the releases do
not follow: they keep whatever was true the day they were cut. Seven of them
were cut while their notes were sitting under another version's heading, so the
workflow found no section and fell back to a one-liner giving the version
number and where to download the package.

This reads the changelog the same way scripts/release-notes.js reads it, so a
release body ends up byte for byte what the workflow would write today, and
PATCHes it onto the release the tag names. Nothing else about the release is
touched: not the tag, not the commit it points at, not the assets, not whether
it is a pre-release.

It exists as PowerShell because release edits cannot be made from the sandbox
the rest of this work happens in. The API answers a release write with a bare
403 there, so this is run by hand, on a machine with a token.

It is safe to run more than once. A release whose body already matches its
section is left alone and reported as such.

.USAGE
  # See what would change, without changing anything:
  .\scripts\sync-release-notes.ps1 -Token $env:GITHUB_TOKEN -WhatIf

  # Do it, for the seven releases that carry the fallback text:
  .\scripts\sync-release-notes.ps1 -Token $env:GITHUB_TOKEN

  # Or name the versions yourself:
  .\scripts\sync-release-notes.ps1 -Token $t -Version 0.0.19.3, 0.0.18.4

  The token needs `contents: write` on the repository, which for a fine
  grained token is Contents: Read and write. Nothing else.

.NOTES
Since:     0.0.19.4
Ships in:  nothing - it is run by hand against the published releases
Requires:  CHANGELOG.md, PowerShell 5.1 or later, a GitHub token
#>

[CmdletBinding(SupportsShouldProcess = $true)]
param(
    # A GitHub token with contents: write. Read from GITHUB_TOKEN when absent.
    [string] $Token = $env:GITHUB_TOKEN,

    [string] $Owner = 'CodyRWhite',

    [string] $Repo = 'Markstrata',

    # The versions to rewrite. The default is every release whose notes were
    # sitting under another heading, plus the two whose sections changed with
    # them: 0.0.18.4, which is the heading they were under, and 0.0.19.3, which
    # gained the three bullets that belonged to it.
    [string[]] $Version = @(
        '0.0.18.4', '0.0.18.5', '0.0.18.6', '0.0.18.7', '0.0.18.8',
        '0.0.19.0', '0.0.19.1', '0.0.19.2', '0.0.19.3'
    ),

    # Where CHANGELOG.md is, if this is not being run from the repository root.
    [string] $ChangelogPath
)

Set-StrictMode -Version Latest
$ErrorActionPreference = 'Stop'

if (-not $Token) {
    throw 'No token. Pass -Token, or set GITHUB_TOKEN. It needs contents: write and nothing else.'
}

if (-not $ChangelogPath) {
    $root = Split-Path -Parent (Split-Path -Parent $MyInvocation.MyCommand.Path)
    $ChangelogPath = Join-Path $root 'CHANGELOG.md'
}
if (-not (Test-Path -LiteralPath $ChangelogPath)) {
    throw "No changelog at $ChangelogPath. Run this from the repository, or pass -ChangelogPath."
}

<#
The section for one version, read the way scripts/release-notes.js reads it.

The heading has to match the whole version rather than contain it: a substring
test reads the 0.0.10.0 section when asked for 0.0.1, which is the kind of
mistake that publishes the wrong notes and is never noticed. A three part
number also answers to its four part heading, since a release cut as 1.2.0 is
written up as 1.2.0.0.
#>
function Get-ChangelogSection {
    param([string[]] $Lines, [string] $Wanted)

    $forms = @($Wanted)
    if ($Wanted.Split('.').Count -eq 4) {
        $forms += ($Wanted -replace '\.0$', '')
    } else {
        $forms += "$Wanted.0"
    }

    $start = -1
    for ($i = 0; $i -lt $Lines.Count; $i++) {
        if ($Lines[$i].StartsWith('## ')) {
            $heading = $Lines[$i].Substring(3).Trim()
            if ($forms -contains $heading) { $start = $i; break }
        }
    }
    if ($start -lt 0) { return $null }

    $end = $Lines.Count
    for ($i = $start + 1; $i -lt $Lines.Count; $i++) {
        if ($Lines[$i].StartsWith('## ')) { $end = $i; break }
    }

    return ($Lines[($start + 1)..($end - 1)] -join "`n").Trim()
}

<#
One request to the API.

The body is encoded as UTF-8 bytes rather than handed over as a string, because
Windows PowerShell otherwise sends it as Latin-1 and every curly quote, arrow
and accented name in the changelog arrives mangled.
#>
function Invoke-GitHub {
    param([string] $Method, [string] $Url, $Body)

    $headers = @{
        Authorization          = "Bearer $Token"
        Accept                 = 'application/vnd.github+json'
        'X-GitHub-Api-Version' = '2022-11-28'
        'User-Agent'           = 'markstrata-sync-release-notes'
    }

    if ($null -eq $Body) {
        return Invoke-RestMethod -Method $Method -Uri $Url -Headers $headers
    }

    $json = $Body | ConvertTo-Json -Depth 5 -Compress
    $bytes = [System.Text.Encoding]::UTF8.GetBytes($json)
    return Invoke-RestMethod -Method $Method -Uri $Url -Headers $headers `
        -ContentType 'application/json; charset=utf-8' -Body $bytes
}

$lines = [System.IO.File]::ReadAllText($ChangelogPath) -split "`r?`n"
$api = "https://api.github.com/repos/$Owner/$Repo"

$changed = 0
$already = 0
$missing = 0

foreach ($v in $Version) {
    $tag = "v$v"
    $section = Get-ChangelogSection -Lines $lines -Wanted $v

    if (-not $section) {
        Write-Warning "$tag has no section in the changelog. Left alone."
        $missing++
        continue
    }

    try {
        $release = Invoke-GitHub -Method 'GET' -Url "$api/releases/tags/$tag"
    } catch {
        Write-Warning "$tag has no release. Left alone."
        $missing++
        continue
    }

    $current = if ($release.body) { $release.body -replace "`r`n", "`n" } else { '' }
    if ($current.Trim() -eq $section) {
        Write-Host ("{0,-10} already matches its section" -f $tag)
        $already++
        continue
    }

    $was = if ($current.Length -gt 0) { "$($current.Length) chars" } else { 'empty' }
    if (-not $PSCmdlet.ShouldProcess($tag, "replace release body ($was -> $($section.Length) chars)")) {
        continue
    }

    $updated = Invoke-GitHub -Method 'PATCH' -Url "$api/releases/$($release.id)" -Body @{ body = $section }

    # Read it back rather than trusting the write: this is the whole point of
    # running it, and a body that did not take should not be reported as done.
    $after = if ($updated.body) { $updated.body -replace "`r`n", "`n" } else { '' }
    if ($after.Trim() -ne $section) {
        throw "$tag was written but came back different. Stopping before the rest."
    }

    Write-Host ("{0,-10} rewritten, {1} -> {2} chars" -f $tag, $was, $section.Length)
    $changed++
}

Write-Host ''
Write-Host "$changed rewritten, $already already right, $missing skipped."
