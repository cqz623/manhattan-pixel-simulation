/** Validate actual files/ES imports and serve them beneath a strict Pages repository prefix. */
import assert from 'node:assert/strict';
import { existsSync, readFileSync, readdirSync, statSync } from 'node:fs';
import { createServer } from 'node:http';
import { extname, join, resolve } from 'node:path';
import { fileURLToPath, pathToFileURL } from 'node:url';

const repository = fileURLToPath(new URL('../', import.meta.url));
const origin = 'https://pages.invalid';
const types = { '.html': 'text/html', '.js': 'text/javascript', '.css': 'text/css', '.json': 'application/json', '.geojson': 'application/geo+json', '.md': 'text/plain', '.csv': 'text/csv', '.png': 'image/png' };
const ignored = /^(?:https?:|data:|blob:|mailto:|#)/i;

function exactFile(directory, relative) {
  let current = directory;
  for (const part of relative.split('/')) {
    assert.ok(readdirSync(current).includes(part), `Missing or incorrectly cased Pages asset: ${relative}`);
    current = join(current, part);
  }
  assert.ok(statSync(current).isFile(), `Pages asset must be a file: ${relative}`);
  return current;
}

export function collectPagesAssets(directory, prefix = '/manhattan-pixel-simulation/') {
  assert.match(prefix, /^\/(?:[\w.-]+\/)+$/, 'Use a repository base path with leading/trailing slashes.');
  assert.ok(!prefix.split('/').some(part => part === '.' || part === '..'), 'Invalid base path.');
  const files = new Set(), queue = ['index.html'];
  while (queue.length) {
    const relative = queue.shift(); if (files.has(relative)) continue;
    const file = exactFile(directory, relative); files.add(relative);
    const extension = extname(file);
    if (!['.html', '.css', '.js', '.md'].includes(extension)) continue;
    const text = readFileSync(file, 'utf8'), references = [];
    if (extension === '.html') for (const match of text.matchAll(/\b(?:src|href)\s*=\s*(['"])(.*?)\1/g)) references.push(match[2]);
    if (extension === '.css') for (const match of text.matchAll(/url\(\s*(['"]?)(.*?)\1\s*\)/g)) references.push(match[2]);
    if (extension === '.md') for (const match of text.matchAll(/\]\(([^\s)]+)(?:\s+['"].*?['"])?\)/g)) references.push(match[1]);
    if (extension === '.js') {
      const imports = [...text.matchAll(/^\s*(?:import|export)\s+(?:[^'";]*?\sfrom\s*)?['"]([^'"]+)['"]/gm), ...text.matchAll(/\bimport\(\s*['"]([^'"]+)['"]\s*\)/g)];
      for (const match of imports) {
        assert.ok(match[1].startsWith('./') || match[1].startsWith('../'), `Browser imports must be relative: ${relative}: ${match[1]}`);
        references.push(match[1]);
      }
    }
    for (const reference of references) {
      if (!reference || ignored.test(reference)) continue;
      assert.ok(!reference.startsWith('/') && !reference.includes('\\'), `Root/absolute asset URL will escape the repository: ${relative}: ${reference}`);
      const url = new URL(reference, `${origin}${prefix}${relative}`);
      assert.ok(url.origin === origin && url.pathname.startsWith(prefix), `Asset escapes repository prefix: ${relative}: ${reference}`);
      let target = decodeURIComponent(url.pathname.slice(prefix.length));
      if (!target || target.endsWith('/')) target += 'index.html';
      queue.push(target);
    }
  }
  assert.ok(existsSync(join(directory, '.nojekyll')), 'The static package must include .nojekyll.');
  return files;
}

export async function checkPages(directory = join(repository, 'dist'), prefix = '/manhattan-pixel-simulation/') {
  const assets = collectPagesAssets(directory, prefix);
  const server = createServer((request, response) => {
    const pathname = new URL(request.url, origin).pathname;
    if (pathname === prefix.slice(0, -1)) { response.writeHead(301, { Location: prefix }); response.end(); return; }
    if (!pathname.startsWith(prefix)) { response.writeHead(404); response.end(); return; }
    const relative = decodeURIComponent(pathname.slice(prefix.length)) || 'index.html';
    if (!assets.has(relative)) { response.writeHead(404); response.end(); return; }
    response.writeHead(200, { 'Content-Type': `${types[extname(relative)] || 'application/octet-stream'}; charset=utf-8` });
    response.end(readFileSync(join(directory, relative)));
  });
  await new Promise((done, reject) => { server.once('error', reject); server.listen(0, '127.0.0.1', done); });
  const base = `http://127.0.0.1:${server.address().port}`;
  try {
    const redirect = await fetch(base + prefix.slice(0, -1), { redirect: 'manual' });
    assert.equal(redirect.status, 301); assert.equal(redirect.headers.get('location'), prefix);
    const landing = await fetch(base + prefix); assert.equal(landing.status, 200);
    for (const relative of assets) {
      const response = await fetch(base + prefix + relative);
      assert.equal(response.status, 200, relative);
      assert.deepEqual(Buffer.from(await response.arrayBuffer()), readFileSync(join(directory, relative)), relative);
      if (['.html', '.js', '.css'].includes(extname(relative))) assert.ok(response.headers.get('content-type').startsWith(types[extname(relative)]), `Invalid browser MIME type: ${relative}`);
    }
    for (const path of ['/src/main.js', '/styles.css', prefix + 'missing.js']) assert.equal((await fetch(base + path)).status, 404, 'Prefix check must not pass through a root or SPA fallback.');
    return { prefix, assets: assets.size, modules: [...assets].filter(file => file.endsWith('.js')).length };
  } finally { await new Promise(done => { server.close(done); server.closeAllConnections(); }); }
}

if (process.argv[1] && import.meta.url === pathToFileURL(resolve(process.argv[1])).href) {
  const result = await checkPages(undefined, process.argv[2]);
  console.log(`Pages check passed: ${result.assets} files, ${result.modules} ES modules under ${result.prefix}; exact case, HTTP content and module MIME types verified.`);
}
