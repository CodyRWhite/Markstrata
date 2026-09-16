/**
 * .SYNOPSIS
 * Walking a library's folders, including the ones inside other folders.
 *
 * .DESCRIPTION
 * The property pane asked SharePoint for a library's folders once, which
 * answers with the folders at its root and nothing below them, so an author
 * could choose `Runbooks` and never `Runbooks/Database`. These cover the walk
 * that replaced it: that it goes down, that it stops going down where it is
 * told to, and that one folder a reader cannot open does not cost them the
 * rest of the library.
 *
 * The listing is a stub rather than SharePoint, which is the point of the
 * module being separate from SharePointService: what is worth testing here is
 * the walking, and the asking needs a tenant.
 *
 * .USAGE
 *   npm test                              every test
 *   node --test tests/folder-tree.test.js   this one
 *
 * .NOTES
 * Since:     0.0.19.4
 * Ships in:  nothing - it runs at test time only
 * Requires:  helpers.js
 */

const test = require('node:test');
const assert = require('node:assert/strict');
const { folderTree } = require('./helpers');

const { collectFolderPaths, MAX_FOLDER_DEPTH, MAX_FOLDERS } = folderTree;

/**
 * A stand-in for SharePoint, built from a map of folder path to the names
 * directly inside it. The root is the empty string, and a path the map does
 * not mention is an empty folder.
 *
 * Counts its calls, because how many round trips the walk costs is as much a
 * part of the behaviour as what it returns.
 */
function library(tree) {
  const asked = [];
  const list = (relativePath) => {
    asked.push(relativePath);
    return Promise.resolve((tree[relativePath] || []).slice());
  };
  list.asked = asked;
  return list;
}

test('a folder inside a folder is found', async () => {
  const found = await collectFolderPaths(library({
    '': ['Runbooks'],
    'Runbooks': ['Database']
  }));

  assert.deepEqual(found, ['Runbooks', 'Runbooks/Database']);
});

test('the walk keeps going down, not just one level', async () => {
  const found = await collectFolderPaths(library({
    '': ['A'],
    'A': ['B'],
    'A/B': ['C'],
    'A/B/C': ['D']
  }));

  assert.deepEqual(found, ['A', 'A/B', 'A/B/C', 'A/B/C/D']);
});

test('paths are relative to the library root and separated by a slash', async () => {
  const found = await collectFolderPaths(library({
    '': ['Shared notes'],
    'Shared notes': ['Q1 2026']
  }));

  assert.deepEqual(found, ['Shared notes', 'Shared notes/Q1 2026']);
});

test('a library with no folders gives nothing back', async () => {
  const found = await collectFolderPaths(library({}));
  assert.deepEqual(found, []);
});

test('the root is asked for once, and each folder found is asked for once', async () => {
  const list = library({
    '': ['One', 'Two'],
    'One': ['Deep']
  });
  await collectFolderPaths(list);

  assert.deepEqual(list.asked.slice().sort(), ['', 'One', 'One/Deep', 'Two']);
});

test('the walk stops at the depth it is given', async () => {
  const found = await collectFolderPaths(library({
    '': ['A'],
    'A': ['B'],
    'A/B': ['C']
  }), 2);

  assert.deepEqual(found, ['A', 'A/B']);
});

test('nothing below the depth limit is even asked for', async () => {
  const list = library({
    '': ['A'],
    'A': ['B'],
    'A/B': ['C']
  });
  await collectFolderPaths(list, 2);

  assert.equal(list.asked.indexOf('A/B'), -1);
});

test('the walk stops once it has gathered the folders it is allowed', async () => {
  const found = await collectFolderPaths(library({
    '': ['A', 'B', 'C', 'D', 'E']
  }), 5, 3);

  assert.equal(found.length, 3);
});

test('the shallow folders are the ones that survive the total limit', async () => {
  /* Breadth first, so a library that is wide at the top does not spend the
     whole allowance on one branch before the siblings are seen. */
  const found = await collectFolderPaths(library({
    '': ['A', 'B'],
    'A': ['A deep'],
    'B': ['B deep']
  }), 5, 2);

  assert.deepEqual(found, ['A', 'B']);
});

test('a folder that cannot be read is treated as empty', async () => {
  const found = await collectFolderPaths((relativePath) => {
    if (relativePath === 'Private') {
      return Promise.reject(new Error('Access denied'));
    }
    return Promise.resolve(relativePath === '' ? ['Private', 'Public'] : []);
  });

  assert.deepEqual(found, ['Private', 'Public']);
});

test('one unreadable folder does not cost the rest of the library', async () => {
  const found = await collectFolderPaths((relativePath) => {
    if (relativePath === 'Private') {
      return Promise.reject(new Error('Access denied'));
    }
    if (relativePath === '') {
      return Promise.resolve(['Private', 'Runbooks']);
    }
    if (relativePath === 'Runbooks') {
      return Promise.resolve(['Database']);
    }
    return Promise.resolve([]);
  });

  assert.deepEqual(found, ['Private', 'Runbooks', 'Runbooks/Database']);
});

test('a listing that answers with nothing at all is not a crash', async () => {
  const found = await collectFolderPaths((relativePath) =>
    Promise.resolve(relativePath === '' ? undefined : []));

  assert.deepEqual(found, []);
});

test('a folder sorts immediately before the folders inside it', async () => {
  /* The case a plain string comparison gets wrong: a sibling whose name starts
     with the same letters sorts between a folder and its own children, because
     a space is a smaller character than a slash. */
  const found = await collectFolderPaths(library({
    '': ['Runbooks', 'Runbooks archive'],
    'Runbooks': ['Database']
  }));

  assert.deepEqual(found, ['Runbooks', 'Runbooks/Database', 'Runbooks archive']);
});

test('the defaults are the ones the property pane relies on', () => {
  assert.equal(MAX_FOLDER_DEPTH, 5);
  assert.equal(MAX_FOLDERS, 500);
});
