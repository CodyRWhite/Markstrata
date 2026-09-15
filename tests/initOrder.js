/**
 * .SYNOPSIS
 * Reads a class and works out whether anything it does while starting up uses
 * a field it has not built yet.
 *
 * .DESCRIPTION
 * This exists because of a shipped crash. The web part built its markdown
 * processor before it built the navigator, and the options the processor is
 * built from ask the navigator which document is open - so onInit threw on
 * every single load, SharePoint disposed a half-built web part, and the
 * disposal threw a second time and was the only error anybody saw.
 *
 * Nothing in a type checker catches that: every field is declared, and the
 * compiler cannot know the order the assignments will run in, let alone follow
 * a helper two calls deep to the field it reads. So it is read here instead.
 *
 * The reading is deliberately literal. Only code that runs immediately counts:
 * the body of an arrow function passed to a collaborator runs later, by which
 * time onInit has finished, so those are blanked out before anything is
 * looked at. Everything else - a field read, a helper called, a helper that
 * calls another helper - has to come after the assignment it depends on.
 *
 * .USAGE
 *   const { analyse } = require('./initOrder');
 *
 *   const problems = analyse(sourceText, 'onInit');
 *   // [] when every field is built before it is used, otherwise one entry
 *   // per use, each naming the field, the user and both line numbers.
 *
 * .NOTES
 * Since:     unreleased
 * Ships in:  nothing - it runs at test time only
 * Requires:  nothing else in this project
 */

/**
 * Replaces every comment and the inside of every string with spaces, so the
 * text keeps its length and its line numbers but holds only code. Prose is
 * full of words like "this.navigator" and none of them run.
 */
function blankCommentsAndStrings(source) {
  const characters = source.split('');
  let position = 0;

  while (position < characters.length) {
    const here = source[position];
    const next = source[position + 1];

    if (here === '/' && next === '*') {
      const end = source.indexOf('*/', position + 2);
      const stop = end === -1 ? source.length : end + 2;
      blankRange(characters, source, position, stop);
      position = stop;
      continue;
    }

    if (here === '/' && next === '/') {
      let stop = source.indexOf('\n', position);
      if (stop === -1) { stop = source.length; }
      blankRange(characters, source, position, stop);
      position = stop;
      continue;
    }

    if (here === '"' || here === "'" || here === '`') {
      const stop = endOfString(source, position, here);
      blankRange(characters, source, position + 1, stop - 1);
      position = stop;
      continue;
    }

    position += 1;
  }

  return characters.join('');
}

function blankRange(characters, source, from, to) {
  for (let index = from; index < to && index < characters.length; index += 1) {
    if (source[index] !== '\n') { characters[index] = ' '; }
  }
}

function endOfString(source, start, quote) {
  let position = start + 1;
  while (position < source.length) {
    const here = source[position];
    if (here === '\\') { position += 2; continue; }
    if (here === quote) { return position + 1; }
    position += 1;
  }
  return source.length;
}

/**
 * Blanks out every arrow function body, because none of it runs now. What is
 * left is the code that runs the moment the method is called.
 */
function blankDeferredBodies(text) {
  let characters = text.split('');
  let guard = 0;

  for (;;) {
    const current = characters.join('');
    const arrow = current.indexOf('=>');
    if (arrow === -1 || guard > 500) { return current; }

    const stop = endOfArrowBody(current, arrow + 2);
    blankRange(characters, current, arrow, stop);
    /* The arrow itself has to go too, or the next pass finds it again. */
    guard += 1;
  }
}

function endOfArrowBody(text, from) {
  let position = from;
  while (position < text.length && /\s/.test(text[position])) { position += 1; }

  let depth = 0;
  const braced = text[position] === '{';

  while (position < text.length) {
    const here = text[position];

    if (here === '(' || here === '[' || here === '{') { depth += 1; }
    else if (here === ')' || here === ']' || here === '}') {
      depth -= 1;
      if (depth === 0 && braced) { return position + 1; }
      if (depth < 0) { return position; }
    }
    else if (depth === 0 && !braced && (here === ',' || here === ';')) { return position; }

    position += 1;
  }
  return text.length;
}

/**
 * Every field that has to exist before anything uses it: declared with no
 * value of its own, and of a type that does not admit undefined.
 *
 * A field written `string | undefined` is left out on purpose. Being empty is
 * one of its legitimate states - an error that has not happened, a version
 * that is not being previewed - so reading one before it is set is reading it
 * as intended, not reading a hole.
 */
function lateFields(source) {
  const found = new Set();
  const pattern = /^ {2}(?:private|protected|public)\s+(?:readonly\s+)?([A-Za-z_$][\w$]*)(\??)\s*:\s*([^\n]*);\s*$/gm;

  let match = pattern.exec(source);
  while (match) {
    const optional = match[2] === '?';
    /* Arrow types are full of => and none of those are assignments. */
    const declaredType = match[3].split('=>').join(' ');
    const hasValueAlready = declaredType.indexOf('=') !== -1;
    const mayBeEmpty = optional || /\bundefined\b/.test(declaredType);

    if (!hasValueAlready && !mayBeEmpty) { found.add(match[1]); }
    match = pattern.exec(source);
  }
  return found;
}

/**
 * Every method of the class, with the part of its body that runs immediately.
 * A method starts at the class's own indent and ends at the brace that closes
 * it, which is the only one back at that indent again.
 */
function methodsOf(source) {
  const lines = source.split('\n');
  const start = /^ {2}(?:(?:public|private|protected|static|async|get|set)\s+)*([A-Za-z_$][\w$]*)\s*\(/;
  const methods = new Map();

  for (let index = 0; index < lines.length; index += 1) {
    const heading = start.exec(lines[index]);
    if (!heading || !lines[index].includes('{')) { continue; }

    let end = index;
    while (end < lines.length && lines[end] !== '  }') { end += 1; }

    const body = lines.slice(index + 1, end).join('\n');
    methods.set(heading[1], {
      line: index + 1,
      immediate: blankDeferredBodies(body),
      firstLine: index + 1
    });
    index = end;
  }
  return methods;
}

const USE = /this\.([A-Za-z_$][\w$]*)\s*(\()?/g;

/** The fields a piece of code reads, ignoring the ones it is assigning to. */
function fieldsUsedIn(text, fields, methods) {
  const read = new Set();
  const called = new Set();

  USE.lastIndex = 0;
  let match = USE.exec(text);
  while (match) {
    const name = match[1];
    const after = text.slice(match.index + match[0].length);
    const assigning = !match[2] && /^\s*=[^=]/.test(after);

    if (!assigning && match[2] && methods.has(name)) { called.add(name); }
    else if (!assigning && fields.has(name)) { read.add(name); }

    match = USE.exec(text);
  }
  return { read, called };
}

/** What a method ends up reading once every helper it calls is followed. */
function readsByMethod(fields, methods) {
  const direct = new Map();
  methods.forEach((method, name) => {
    direct.set(name, fieldsUsedIn(method.immediate, fields, methods));
  });

  const total = new Map();
  direct.forEach((use, name) => total.set(name, new Set(use.read)));

  let changed = true;
  while (changed) {
    changed = false;
    direct.forEach((use, name) => {
      const mine = total.get(name);
      use.called.forEach((other) => {
        const theirs = total.get(other);
        if (!theirs) { return; }
        theirs.forEach((field) => {
          if (!mine.has(field)) { mine.add(field); changed = true; }
        });
      });
    });
  }
  return total;
}

function lineOf(text, index) {
  return text.slice(0, index).split('\n').length;
}

/** Where a statement beginning at `from` ends, so an assignment counts once
    its whole right-hand side has run. */
function endOfStatement(text, from) {
  let depth = 0;
  for (let position = from; position < text.length; position += 1) {
    const here = text[position];
    if (here === '(' || here === '[' || here === '{') { depth += 1; }
    else if (here === ')' || here === ']' || here === '}') { depth -= 1; }
    else if (here === ';' && depth <= 0) { return position; }
  }
  return text.length;
}

/**
 * Walks a method from top to bottom and reports every field used before the
 * line that builds it.
 */
function analyse(source, methodName) {
  const code = blankCommentsAndStrings(source);
  const fields = lateFields(code);
  const methods = methodsOf(code);
  const reads = readsByMethod(fields, methods);

  const method = methods.get(methodName);
  if (!method) { throw new Error(`no method called ${methodName} was found`); }

  const body = method.immediate;
  const events = [];

  USE.lastIndex = 0;
  let match = USE.exec(body);
  while (match) {
    const name = match[1];
    const after = body.slice(match.index + match[0].length);
    const assigning = !match[2] && /^\s*=[^=]/.test(after);

    if (assigning && fields.has(name)) {
      events.push({ at: endOfStatement(body, match.index), kind: 'built', name: name });
    } else if (match[2] && methods.has(name)) {
      events.push({ at: match.index, kind: 'calls', name: name, needs: reads.get(name) });
    } else if (fields.has(name)) {
      events.push({ at: match.index, kind: 'reads', name: name, needs: new Set([name]) });
    }

    match = USE.exec(body);
  }

  events.sort((first, second) => first.at - second.at);

  const built = new Set();
  const builtAt = new Map();
  const problems = [];

  events.forEach((event) => {
    if (event.kind === 'built') {
      built.add(event.name);
      if (!builtAt.has(event.name)) {
        builtAt.set(event.name, method.firstLine + lineOf(body, event.at));
      }
      return;
    }
    event.needs.forEach((field) => {
      if (built.has(field)) { return; }
      problems.push({
        field: field,
        usedBy: event.kind === 'calls' ? `${event.name}()` : 'the line itself',
        usedOnLine: method.firstLine + lineOf(body, event.at),
        builtOnLine: undefined
      });
    });
  });

  return problems.map((problem) => ({
    ...problem,
    builtOnLine: builtAt.get(problem.field)
  }));
}

module.exports = { analyse, blankCommentsAndStrings, blankDeferredBodies, lateFields, methodsOf };
