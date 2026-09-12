const test = require('node:test');
const assert = require('node:assert/strict');
const fs = require('fs');
const path = require('path');
const { ThemeManager } = require('./helpers');

const STYLES = path.join(__dirname, '..', 'src', 'webparts', 'markdownFormatter', 'styles');
const THEME_FILES = ['github.css', 'obsidian.css', 'vscode.css'];
const STRUCTURAL_FILES = [
  'base.css',
  'typography.css',
  'code.css',
  'syntax.css',
  'callouts.css',
  'tables-lists.css',
  'extras.css',
  'chrome.css',
  'modifiers.css',
  'print.css'
];

function read(file) {
  return fs.readFileSync(path.join(STYLES, file), 'utf8');
}

function declaredTokens(css) {
  const tokens = new Set();
  const pattern = /(--mdf-[a-z0-9-]+)\s*:/g;
  let match;
  while ((match = pattern.exec(css)) !== null) {
    tokens.add(match[1]);
  }
  return tokens;
}

/**
 * Tokens declared in a theme's own blocks - the shared shape block and the two
 * colour blocks - ignoring per-element overrides such as the callout hue rules,
 * which are not part of the theme contract.
 */
function themeBlockTokens(css) {
  const blocks = css.match(/\.mdf-root\[data-mdf-theme=[^{]*\{[^}]*\}/g) || [];
  const tokens = new Set();
  blocks
    .filter((block) => block.indexOf('.mdf-callout') === -1)
    .forEach((block) => declaredTokens(block).forEach((token) => tokens.add(token)));
  return tokens;
}

/** Tokens used as `var(--x)` with no fallback value. */
function requiredTokens(css) {
  const tokens = new Set();
  const pattern = /var\(\s*(--mdf-[a-z0-9-]+)\s*\)/g;
  let match;
  while ((match = pattern.exec(css)) !== null) {
    tokens.add(match[1]);
  }
  return tokens;
}

test('every theme declares the same set of tokens', () => {
  const sets = THEME_FILES.map((file) => ({ file: file, tokens: themeBlockTokens(read(`themes/${file}`)) }));
  const reference = sets[0];

  sets.slice(1).forEach((entry) => {
    const missing = [...reference.tokens].filter((token) => !entry.tokens.has(token));
    const extra = [...entry.tokens].filter((token) => !reference.tokens.has(token));
    assert.deepEqual(missing, [], `${entry.file} is missing tokens that ${reference.file} declares`);
    assert.deepEqual(extra, [], `${entry.file} declares tokens ${reference.file} does not`);
  });
});

test('every theme defines both a light and a dark block', () => {
  THEME_FILES.forEach((file) => {
    const css = read(`themes/${file}`);
    const name = file.replace('.css', '');
    assert.match(css, new RegExp(`\\[data-mdf-theme='${name}'\\]\\[data-mdf-mode='light'\\]`), `${file} light block`);
    assert.match(css, new RegExp(`\\[data-mdf-theme='${name}'\\]\\[data-mdf-mode='dark'\\]`), `${file} dark block`);
  });
});

test('no rule depends on a token nothing defines', () => {
  const declared = new Set();
  STRUCTURAL_FILES.concat(THEME_FILES.map((file) => `themes/${file}`)).forEach((file) => {
    declaredTokens(read(file)).forEach((token) => declared.add(token));
  });

  const missing = new Set();
  STRUCTURAL_FILES.forEach((file) => {
    requiredTokens(read(file)).forEach((token) => {
      if (!declared.has(token)) {
        missing.add(`${token} (used in ${file})`);
      }
    });
  });

  assert.deepEqual([...missing], []);
});

test('the accent palette is complete and stored as RGB triples', () => {
  const hues = ['blue', 'cyan', 'green', 'yellow', 'orange', 'red', 'purple', 'pink', 'gray'];
  THEME_FILES.forEach((file) => {
    const css = read(`themes/${file}`);
    hues.forEach((hue) => {
      const matches = css.match(new RegExp(`--mdf-color-${hue}:\\s*\\d+,\\s*\\d+,\\s*\\d+;`, 'g')) || [];
      assert.equal(matches.length, 2, `${file} should set --mdf-color-${hue} in both light and dark`);
    });
  });
});

test('no structural rule hard-codes a hex colour', () => {
  STRUCTURAL_FILES.forEach((file) => {
    const css = read(file)
      // print.css deliberately forces black on white for paper.
      .replace(/@media print[\s\S]*$/, '');
    const hex = css.match(/#[0-9a-fA-F]{3,8}\b/g) || [];
    assert.deepEqual(hex, [], `${file} should take its colours from tokens`);
  });
});

test('resolveMode honours an explicit choice', () => {
  assert.equal(ThemeManager.resolveMode('light'), 'light');
  assert.equal(ThemeManager.resolveMode('dark'), 'dark');
  assert.equal(ThemeManager.resolveMode('light', true), 'light');
  assert.equal(ThemeManager.resolveMode('dark', false), 'dark');
});

test('auto follows the SharePoint page theme when it is known', () => {
  assert.equal(ThemeManager.resolveMode('auto', true), 'dark');
  assert.equal(ThemeManager.resolveMode('auto', false), 'light');
});

test('auto falls back to light when nothing can be detected', () => {
  assert.equal(ThemeManager.resolveMode('auto', undefined), 'light');
});

test('every theme and mode has a Mermaid palette', () => {
  const seen = new Set();
  ['github', 'obsidian', 'vscode'].forEach((family) => {
    ['light', 'dark'].forEach((mode) => {
      const config = ThemeManager.getMermaidTheme(family, mode);
      assert.equal(config.theme, 'base');
      assert.equal(config.themeVariables.darkMode, mode === 'dark');
      assert.match(config.themeVariables.background, /^#[0-9a-f]{6}$/i, `${family}/${mode} background`);
      assert.ok(config.themeVariables.fontFamily, `${family}/${mode} font`);
      seen.add(config.themeVariables.background + config.themeVariables.textColor);
    });
  });
  assert.equal(seen.size, 6, 'each theme and mode should have its own palette');
});
