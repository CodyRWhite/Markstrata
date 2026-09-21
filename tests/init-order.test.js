/**
 * .SYNOPSIS
 * The web part builds every collaborator before it uses one, and shuts them
 * down without assuming they were ever built.
 *
 * .DESCRIPTION
 * Both halves of this are a shipped bug rather than a precaution.
 *
 * 0.0.17.0 built the markdown processor from options that ask the navigator
 * which document is open, and built the navigator fifty lines later. So onInit
 * threw on every load; SharePoint then disposed a web part that had got half
 * way through starting, and the disposal threw as well - and that second error,
 * about reading 'dispose' of undefined, was the only one a reader ever saw.
 * The same commit handed the property pane's lists a SharePoint service that
 * did not exist yet, which is why its dropdowns came up empty.
 *
 * So: nothing in onInit may use a field before the line that builds it, and
 * onDispose may not assume any of them exist. A disposal that throws takes the
 * page down and hides whatever really went wrong, which is how one ordering
 * mistake turned into a blank page.
 *
 * .USAGE
 *   npm test                              every test
 *   node --test tests/init-order.test.js  this one
 *
 * .NOTES
 * Since:     0.0.17.1
 * Ships in:  nothing - it runs at test time only
 * Requires:  initOrder.js
 */

const test = require('node:test');
const assert = require('node:assert/strict');
const fs = require('node:fs');
const path = require('node:path');

const { analyse, blankCommentsAndStrings, lateFields, methodsOf } = require('./initOrder');

/*
 * The lifecycle moved. startUp, onDispose and every collaborator they build
 * live on StrataWebPart, which both web parts extend, so that is the file whose
 * ordering decides whether a web part can start. The subclass builds its own
 * renderers in buildRenderers, and that ordering is read separately below: one
 * file cannot answer for both, and checking only one would leave the other
 * free to reintroduce exactly the bug this exists for.
 */
const BASE = path.join(
  __dirname, '..', 'src', 'webparts', 'shared', 'StrataWebPart.ts'
);
const WEB_PART = path.join(
  __dirname, '..', 'src', 'webparts', 'markstrata', 'MarkstrataWebPart.ts'
);
const source = fs.readFileSync(BASE, 'utf8');
const webPartSource = fs.readFileSync(WEB_PART, 'utf8');

/*
 * startUp rather than onInit: onInit's whole body is now a try/catch around
 * it, so that a failure to start stays inside this web part instead of landing
 * in the page. The building is in startUp, and the order of the building is
 * what this reads.
 */
const BUILDS_IT = 'startUp';

test('the web part builds every collaborator before it uses one', () => {
  const problems = analyse(source, BUILDS_IT);
  const described = problems.map((problem) =>
    `${problem.field} is used on line ${problem.usedOnLine} (by ${problem.usedBy})` +
    ` but is not built until line ${problem.builtOnLine}`
  );
  assert.deepEqual(described, []);
});

test('the reading is actually reading something', () => {
  /* If the field or method patterns ever stop matching this file, the test
     above passes on an empty analysis and guards nothing. */
  const code = blankCommentsAndStrings(source);
  const fields = lateFields(code);
  const methods = methodsOf(code);

  /* Seven is what StrataWebPart actually has: lateFields excludes anything
     typed "| undefined", which is most of the state, and the five renderers
     now belong to the subclass and are counted by its own test below. The
     named checks that follow are the stronger half of this guard. */
  assert.ok(fields.size > 5, `only found ${fields.size} fields`);
  assert.ok(methods.has('onInit'), 'onInit was not found');
  assert.ok(methods.has(BUILDS_IT), `${BUILDS_IT} was not found`);
  assert.ok(methods.has('loadContent'), 'loadContent was not found');

  /* And onInit still reaches it, or the method read above is not the one that
     runs when SharePoint starts the web part. */
  assert.ok(
    methods.get('onInit').immediate.indexOf(`this.${BUILDS_IT}(`) !== -1,
    `onInit does not call ${BUILDS_IT}`
  );
  ['navigator', 'sharePoint', 'paneSources', 'versionPanel'].forEach((field) => {
    assert.ok(fields.has(field), `${field} was not recognised as a field`);
  });
});

/*
 * The subclass half of the same rule.
 *
 * startUp calls buildRenderers, so a renderer that reads another one before it
 * is built fails on exactly the path the shipped bug failed on - the base would
 * be innocent and the web part would still not start. Read here rather than
 * folded into the analysis above because the two are different methods in
 * different files and a single pass over either would miss it.
 */
test('the web part builds every renderer before it uses one', () => {
  const problems = analyse(webPartSource, 'buildRenderers');
  const described = problems.map((problem) =>
    `${problem.field} is used on line ${problem.usedOnLine} (by ${problem.usedBy})` +
    ` but is not built until line ${problem.builtOnLine}`
  );
  assert.deepEqual(described, []);
});

test('the renderer reading is actually reading something', () => {
  const code = blankCommentsAndStrings(webPartSource);
  const fields = lateFields(code);
  const methods = methodsOf(code);

  assert.ok(methods.has('buildRenderers'), 'buildRenderers was not found');
  assert.ok(methods.has('processorOptions'), 'processorOptions was not found');
  ['processor', 'enhancer', 'viewRenderer', 'editManager'].forEach((field) => {
    assert.ok(fields.has(field), `${field} was not recognised as a field`);
  });
});

test('disposeRenderers stops nothing without checking it is there', () => {
  /* The other half of onDispose. The base stops what it built; the subclass
     stops its renderers, and does it in a method of its own - so the same rule
     has to be read there. A disposal that throws takes the page down and hides
     whatever really went wrong, whichever class it happened in. */
  const code = blankCommentsAndStrings(webPartSource);
  const fields = lateFields(code);
  const dispose = methodsOf(code).get('disposeRenderers');

  assert.ok(dispose, 'disposeRenderers was not found');

  const body = dispose.body;
  const unguarded = [];
  const inspected = [];
  const use = /this\.([A-Za-z_$][\w$]*)\s*\./g;
  let match = use.exec(body);

  while (match) {
    const field = match[1];
    const before = body.slice(0, match.index);
    const guarded = new RegExp(`if\\s*\\(\\s*(?:[^)]*&&\\s*)?this\\.${field}\\b`).test(before);

    if (fields.has(field)) {
      inspected.push(field);
      if (!guarded) { unguarded.push(field); }
    }
    match = use.exec(body);
  }

  assert.ok(
    inspected.length >= 2,
    `only ${inspected.length} renderers were found in disposeRenderers to check`
  );
  assert.deepEqual(unguarded, [], 'these are stopped without checking they exist');
});

test('a class that uses a field before building it is caught', () => {
  /* The shape of the shipped bug, in miniature: a helper two calls deep reads
     a field that onInit has not reached yet. */
  const sample = [
    'class Sample {',
    '  private first: Thing;',
    '  private second: Other;',
    '',
    '  protected async onInit(): Promise<void> {',
    '    this.first = new Thing(this.options());',
    '    this.second = new Other();',
    '  }',
    '',
    '  private options(): IOptions {',
    '    return { where: this.second.path };',
    '  }',
    '}'
  ].join('\n');

  const problems = analyse(sample, 'onInit');
  assert.equal(problems.length, 1);
  assert.equal(problems[0].field, 'second');
  assert.equal(problems[0].usedBy, 'options()');
});

test('work handed to a collaborator to do later is not counted as now', () => {
  /* A callback runs long after onInit has finished, so a field it reads only
     has to exist by then. Counting those would make the check unusable. */
  const sample = [
    'class Sample {',
    '  private first: Thing;',
    '  private second: Other;',
    '',
    '  protected async onInit(): Promise<void> {',
    '    this.first = new Thing({ onDone: () => this.second.go() });',
    '    this.second = new Other();',
    '  }',
    '}'
  ].join('\n');

  assert.deepEqual(analyse(sample, 'onInit'), []);
});

test('onDispose shuts nothing down without checking it is there', () => {
  const code = blankCommentsAndStrings(source);
  const fields = lateFields(code);
  const dispose = methodsOf(code).get('onDispose');

  assert.ok(dispose, 'onDispose was not found');

  /* The whole body, not just what runs immediately: each thing being stopped
     is stopped inside a callback, so blanking those out would leave nothing to
     read and this would pass by finding nothing. */
  const body = dispose.body;
  const unguarded = [];
  const inspected = [];
  const use = /this\.([A-Za-z_$][\w$]*)\s*\./g;
  let match = use.exec(body);

  while (match) {
    const field = match[1];
    const before = body.slice(0, match.index);
    const guarded = new RegExp(`if\\s*\\(\\s*(?:[^)]*&&\\s*)?this\\.${field}\\b`).test(before);

    if (fields.has(field)) {
      inspected.push(field);
      if (!guarded) { unguarded.push(field); }
    }
    match = use.exec(body);
  }

  assert.ok(
    inspected.length >= 3,
    `only ${inspected.length} collaborators were found in onDispose to check`
  );
  assert.deepEqual(
    [...new Set(unguarded)],
    [],
    'a web part that never finished starting is still disposed, and a disposal ' +
    'that throws takes the page with it'
  );
});
