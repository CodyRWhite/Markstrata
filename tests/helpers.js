/*
 * One place that knows where the compiled test build lives, so the tests do
 * not each carry a long relative path. scripts/run-tests.js builds it.
 */
const path = require('path');

const LIB = path.join(__dirname, '..', 'temp', 'test-lib');

/*
 * A module missing from the build is a missing entry in tsconfig.test.json's
 * include list, and nothing else. Left as a bare require it takes down every
 * test file that asks for a helper, which reads as the whole suite breaking
 * rather than as one line of configuration being out of date.
 */
function lib(name) {
  try {
    return require(path.join(LIB, name));
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

module.exports = {
  MarkdownProcessor: lib('MarkdownProcessor').MarkdownProcessor,
  ThemeManager: lib('ThemeManager').ThemeManager,
  codeBlocks: lib('codeBlocks'),
  imagePaths: lib('imagePaths'),
  mermaidConfig: lib('mermaidConfig'),
  tocWidth: lib('tocWidth'),
  callouts: lib('callouts'),
  frontMatter: lib('frontMatter'),
  readingTime: lib('readingTime'),
  wikiLinks: lib('wikiLinks'),
  tables: lib('tables')
};
