import { readdir } from 'node:fs/promises';
import { spawnSync } from 'node:child_process';
import { fileURLToPath } from 'node:url';
import path from 'node:path';

const root = fileURLToPath(new URL('../', import.meta.url));

async function javascriptFiles(directory) {
  const entries = await readdir(directory, { withFileTypes: true });
  const files = await Promise.all(entries.map(entry => {
    const file = path.join(directory, entry.name);
    return entry.isDirectory() ? javascriptFiles(file) : file.endsWith('.js') ? [file] : [];
  }));
  return files.flat();
}

const files = (await Promise.all(['src', 'tests', 'scripts'].map(dir => javascriptFiles(path.join(root, dir))))).flat();
for (const file of files) {
  const result = spawnSync(process.execPath, ['--check', file], { stdio: 'inherit' });
  if (result.error) throw result.error;
  if (result.status !== 0) process.exit(result.status ?? 1);
}
console.log(`Sintaxis JavaScript válida: ${files.length} archivos.`);
