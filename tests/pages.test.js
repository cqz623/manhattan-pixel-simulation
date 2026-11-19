import test from 'node:test';
import assert from 'node:assert/strict';
import { existsSync, mkdtempSync, mkdirSync, readFileSync, rmSync, writeFileSync } from 'node:fs';
import { tmpdir } from 'node:os';
import { dirname, join } from 'node:path';
import { buildPages } from '../scripts/build-pages.mjs';
import { collectPagesAssets } from '../scripts/check-pages.mjs';

function fixture(files, callback) {
  const directory = mkdtempSync(join(tmpdir(), 'pixel-pages-'));
  try {
    for (const [name, text] of Object.entries({ '.nojekyll': '', ...files })) { const path = join(directory, name); mkdirSync(dirname(path), { recursive: true }); writeFileSync(path, text); }
    callback(directory);
  } finally { rmSync(directory, { recursive: true, force: true }); }
}

test('Pages artifact preserves the existing app and linked documentation without development or Git files', () => {
  const directory = mkdtempSync(join(tmpdir(), 'pixel-pages-build-'));
  try {
    buildPages(directory);
    for (const name of ['index.html', 'styles.css', 'src/main.js', 'data/nyc-park-profile.js']) assert.deepEqual(readFileSync(join(directory, name)), readFileSync(new URL('../' + name, import.meta.url)));
    for (const name of ['node_modules', '.git', '.github', 'tests', 'scripts', 'package.json', 'package-lock.json']) assert.equal(existsSync(join(directory, name)), false);
    const graph = collectPagesAssets(directory);
    assert.ok(graph.has('src/agents/simulation.js')); assert.ok(graph.has('data/nyc-park-profile.js'));
    assert.ok(graph.has('README.md')); assert.ok(graph.has('data/PARK_PROFILE.md'));
    assert.ok(!graph.has('src/manhattan.js'), 'inactive island importer must remain outside the runtime graph');
  } finally { rmSync(directory, { recursive: true, force: true }); }
});

test('Pages validation rejects root-relative URLs and imports that escape the project prefix', () => {
  fixture({ 'index.html': '<script type="module" src="/src/main.js"></script>' }, directory => assert.throws(() => collectPagesAssets(directory), /Root\/absolute/));
  fixture({ 'index.html': '<script type="module" src="./src/main.js"></script>', 'src/main.js': "import '../../outside.js';" }, directory => assert.throws(() => collectPagesAssets(directory), /escapes repository/));
});

test('Pages validation catches missing and incorrectly cased module files on case-insensitive development systems', () => {
  for (const name of ['Main.js', 'missing.js']) fixture({ 'index.html': `<script type="module" src="./src/${name}"></script>`, 'src/main.js': 'export const ready = true;' }, directory => assert.throws(() => collectPagesAssets(directory), /Missing or incorrectly cased/));
});

test('Pages validation rejects browser imports that require an npm resolver', () => {
  fixture({ 'index.html': '<script type="module" src="./main.js"></script>', 'main.js': "import { parseHTML } from 'linkedom';" }, directory => assert.throws(() => collectPagesAssets(directory), /Browser imports must be relative/));
});
