/**
 * .SYNOPSIS
 * The workflow that moves a tag cannot move one off the default branch.
 *
 * .DESCRIPTION
 * Moving a tag is how a rewritten history is finished: a tag left pointing into
 * the old history keeps it alive, and answers "what shipped?" with a straight
 * face and gets it wrong. The workflow exists because the sandbox this is built
 * in has a git remote that refuses tag pushes, so there is no other way to
 * reach one.
 *
 * A tool for repairing that fault must not be able to cause it. The guard is
 * one line of shell and would be easy to lose in a tidy-up, so it is asserted
 * here rather than trusted.
 *
 * The check is over the workflow's text, which is all a test can read: nothing
 * here runs GitHub Actions. It catches the guard being deleted, which is the
 * failure worth catching; it cannot catch the guard being subtly wrong, and
 * says so rather than implying otherwise.
 *
 * .USAGE
 *   npm test                                    every test
 *   node --test tests/retag-workflow.test.js    this one
 *
 * .NOTES
 * Since:     0.0.24.0
 * Ships in:  nothing - it runs at test time only
 * Requires:  .github/workflows/retag.yml
 */

const test = require('node:test');
const assert = require('node:assert/strict');
const fs = require('node:fs');
const path = require('node:path');

const WORKFLOW = fs.readFileSync(
  path.join(__dirname, '..', '.github', 'workflows', 'retag.yml'), 'utf8');

test('it refuses a commit that is not on the default branch', () => {
  assert.ok(WORKFLOW.indexOf('merge-base --is-ancestor') !== -1,
    'the ancestry guard is gone, so this could put a tag back onto an orphaned '
    + 'commit - which is the fault it exists to repair');
});

test('the default branch is read from the repository, not written in', () => {
  assert.ok(WORKFLOW.indexOf('github.event.repository.default_branch') !== -1,
    'a branch name written into the workflow silently stops guarding anything '
    + 'the day the default branch is renamed');
});

test('it retargets an existing tag rather than creating one', () => {
  assert.ok(WORKFLOW.indexOf('git rev-parse -q --verify "refs/tags/$TAG"') !== -1,
    'without this a mistyped tag name is created rather than refused');
});

test('it is only ever run by hand', () => {
  const triggers = (WORKFLOW.match(/^on:\n([\s\S]*?)\n\w/m) || ['', ''])[1];
  assert.ok(triggers.indexOf('workflow_dispatch') !== -1, 'no manual trigger');
  ['push:', 'pull_request:', 'schedule:'].forEach((trigger) => {
    assert.ok(triggers.indexOf(trigger) === -1,
      `${trigger} would move tags without anybody asking`);
  });
});
