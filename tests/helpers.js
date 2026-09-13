/*
 * One place that knows where the compiled test build lives, so the tests do
 * not each carry a long relative path. scripts/run-tests.js builds it.
 */
const path = require('path');

const LIB = path.join(__dirname, '..', 'temp', 'test-lib');

module.exports = {
  MarkdownProcessor: require(path.join(LIB, 'MarkdownProcessor')).MarkdownProcessor,
  ThemeManager: require(path.join(LIB, 'ThemeManager')).ThemeManager,
  codeBlocks: require(path.join(LIB, 'codeBlocks')),
  imagePaths: require(path.join(LIB, 'imagePaths')),
  callouts: require(path.join(LIB, 'callouts'))
};
