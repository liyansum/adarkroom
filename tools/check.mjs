import { readdir } from 'node:fs/promises';
import { spawnSync } from 'node:child_process';
for (const dir of ['script', 'script/events', 'worker', 'tools']) {
  for (const file of await readdir(dir)) {
    if (!/\.(js|mjs)$/.test(file)) continue;
    const result = spawnSync(process.execPath, ['--check', `${dir}/${file}`], { stdio: 'inherit' });
    if (result.status) process.exit(result.status);
  }
}
console.log('JavaScript syntax checks passed.');
