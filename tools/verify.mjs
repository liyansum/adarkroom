// Run integration checks against an isolated local Workers/D1 instance.
import { spawn } from 'node:child_process';
import { mkdtemp, readdir, rm } from 'node:fs/promises';
import { tmpdir } from 'node:os';
import { join } from 'node:path';
import { createServer } from 'node:net';
import { setTimeout as delay } from 'node:timers/promises';
import { once } from 'node:events';

const wrangler = 'node_modules/wrangler/bin/wrangler.js';
const persistence = await mkdtemp(join(tmpdir(), 'adr-verify-'));
const socket = createServer(); socket.listen(0, '127.0.0.1'); await once(socket, 'listening');
const port = socket.address().port; await new Promise(resolve => socket.close(resolve));
const env = { ...process.env, CI: 'true', WRANGLER_SEND_METRICS: 'false', TEST_BASE_URL: `http://127.0.0.1:${port}` };
let server, logs = '';
function run(args) {
  return new Promise((resolve, reject) => {
    const child = spawn(process.execPath, args, { env, stdio: 'inherit' });
    child.once('error', reject);
    child.once('exit', code => code === 0 ? resolve() : reject(new Error(`${args.join(' ')} exited with ${code}`)));
  });
}
function stop() { if (server?.pid) { try { process.kill(-server.pid, 'SIGTERM'); } catch {} } }
process.once('SIGINT', () => { stop(); process.exit(130); });
process.once('SIGTERM', () => { stop(); process.exit(143); });
try {
  await run(['tools/check.mjs']);
  await run(['tools/build.mjs']);
  await run([wrangler, 'd1', 'migrations', 'apply', 'DB', '--local', '--persist-to', persistence]);
  server = spawn(process.execPath, [wrangler, 'dev', '--ip', '127.0.0.1', '--port', String(port), '--inspector-port', '0', '--persist-to', persistence], { env, detached: true, stdio: ['ignore', 'pipe', 'pipe'] });
  const capture = chunk => { logs = (logs + chunk).slice(-16000); };
  server.stdout.on('data', capture); server.stderr.on('data', capture);
  let ready = false;
  for (let i = 0; i < 100; i++) {
    if (server.exitCode !== null) throw new Error('Local Worker exited before becoming ready');
    try { ready = (await fetch(`${env.TEST_BASE_URL}/api/health`, { signal: AbortSignal.timeout(1000) })).ok; } catch {}
    if (ready) break;
    await delay(200);
  }
  if (!ready) throw new Error('Local Worker failed to become ready');
  console.log(`Checking local Workers + D1 at ${env.TEST_BASE_URL}`);
  const tests = (await readdir('tests')).filter(file => file.endsWith('.test.mjs')).map(file => `tests/${file}`);
  await run(['--test', ...tests]);
  await run(['tests/browser.mjs']);
  console.log('All verification passed. No remote services were modified.');
} catch (error) {
  console.error(logs, '\n', error.message); process.exitCode = 1;
} finally {
  stop();
  if (server && server.exitCode === null) await Promise.race([once(server, 'exit'), delay(3000)]);
  await rm(persistence, { recursive: true, force: true });
}
