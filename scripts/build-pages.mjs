/** Copy the existing buildless site into a clean, explicit Pages artifact. */
import { cpSync, existsSync, lstatSync, mkdirSync, rmSync } from 'node:fs';
import { basename, resolve, join } from 'node:path';
import { fileURLToPath, pathToFileURL } from 'node:url';

const repository = fileURLToPath(new URL('../', import.meta.url));
const publicFiles = ['index.html', 'styles.css', '.nojekyll', 'src', 'data', 'docs', 'README.md', 'SEMANTIC_MODEL.md', 'FINAL_REQUIREMENTS.md', 'FINAL_DEMO_PLAN.md'];

export function buildPages(destination = join(repository, 'dist')) {
  if (existsSync(destination) && lstatSync(destination).isSymbolicLink()) throw new Error('Pages output must not be a symbolic link.');
  rmSync(destination, { recursive: true, force: true }); mkdirSync(destination, { recursive: true });
  for (const name of publicFiles) cpSync(join(repository, name), join(destination, name), {
    recursive: true,
    filter(source) {
      if (lstatSync(source).isSymbolicLink()) throw new Error(`Pages assets must not contain symbolic links: ${source}`);
      const name = basename(source);
      return !name.startsWith('.') || name === '.nojekyll';
    },
  });
  return destination;
}

if (process.argv[1] && import.meta.url === pathToFileURL(resolve(process.argv[1])).href) {
  console.log(`Static Pages package ready: ${buildPages()}`);
}
