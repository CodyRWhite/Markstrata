/**
 * .SYNOPSIS
 * One place that knows where the compiled test build lives, so the tests do
 * not each carry a long relative path. scripts/run-tests.js builds it.
 *
 * .USAGE
 *   npm test                       every test
 *   node --test tests/helpers.js   this one
 *
 * .NOTES
 * Since:     0.0.6
 * Ships in:  nothing - it runs at test time only
 * Requires:  nothing else in this project, jsdom
 */

const path = require('path');
const { JSDOM } = require('jsdom');

const TEST_LIB = path.join(__dirname, '..', 'temp', 'test-lib');

/*
 * A module missing from the build is a missing entry in tsconfig.test.json's
 * include list, and nothing else. Left as a bare require it takes down every
 * test file that asks for a helper, which reads as the whole suite breaking
 * rather than as one line of configuration being out of date.
 */
function lib(name) {
  try {
    return require(path.join(TEST_LIB, name));
  } catch (error) {
    if (error.code !== 'MODULE_NOT_FOUND') {
      throw error;
    }
    throw new Error(
      `${name} is not in the test build. Add `
      + `"src/webparts/markstrata/utils/${name}.ts" to the include list in `
      + 'tsconfig.test.json, which is what scripts/run-tests.js compiles.'
    );
  }
}

/*
 * DOMPurify needs a DOM, and Node has none. Handed no window it returns what it
 * was given, unchanged, so a test of a sanitiser would pass without a sanitiser
 * running - which is why htmlSanitiser refuses instead, and why the window is
 * installed here, once, before any test renders anything.
 *
 * jsdom is a devDependency. Nothing in the bundle reaches for it.
 */
const htmlSanitiser = lib('htmlSanitiser');
htmlSanitiser.useSanitiserWindow(new JSDOM('').window);

module.exports = {
  MarkdownProcessor: lib('MarkdownProcessor').MarkdownProcessor,
  htmlSanitiser: htmlSanitiser,
  ThemeManager: lib('ThemeManager').ThemeManager,
  codeBlocks: lib('codeBlocks'),
  imagePaths: lib('imagePaths'),
  mermaidConfig: lib('mermaidConfig'),
  tocWidth: lib('tocWidth'),
  callouts: lib('callouts'),
  frontMatter: lib('frontMatter'),
  readingTime: lib('readingTime'),
  wikiLinks: lib('wikiLinks'),
  documentParameter: lib('documentParameter'),
  remoteDocuments: lib('remoteDocuments'),
  remoteCode: lib('remoteCode'),
  tables: lib('tables')
};
