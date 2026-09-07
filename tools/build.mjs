import { cp, mkdir, writeFile } from 'node:fs/promises';
const root = new URL('../', import.meta.url);
const dist = new URL('dist/', root);
await mkdir(dist, { recursive: true });
for (const path of ['index.html', 'browserWarning.html', 'favicon.ico', 'css', 'script', 'lib', 'lang', 'audio', 'img', 'LICENSE.md']) {
  await cp(new URL(path, root), new URL(path, dist), { recursive: true, filter: p => !p.endsWith('.DS_Store') });
}
await writeFile(new URL('_headers', dist), `/*
  X-Content-Type-Options: nosniff
  X-Frame-Options: DENY
  Referrer-Policy: same-origin
  Permissions-Policy: camera=(), microphone=(), geolocation=()
/index.html
  Cache-Control: no-cache
/script/*
  Cache-Control: no-cache
/css/*
  Cache-Control: no-cache
`);
console.log('Built static game assets in dist/.');
