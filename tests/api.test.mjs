import test from 'node:test';
import assert from 'node:assert/strict';
import '../script/auth-key.js';
const base = process.env.TEST_BASE_URL || 'http://127.0.0.1:8787';
const username = `api_${Date.now().toString(36)}`;
const password = 'a-good-testing-password';
async function call(path, { method = 'GET', body, cookie, origin = base } = {}) {
  if (body?.password) { body = { ...body, passwordKey: await AuthKey.derive(body.username, body.password) }; delete body.password; }
  const r = await fetch(base + '/api/' + path, { method, headers: { Origin: origin, 'Content-Type': 'application/json', 'X-ADR-Request': '1', ...(cookie ? { Cookie: cookie } : {}) }, body: body === undefined ? undefined : JSON.stringify(body) });
  return { status: r.status, data: await r.json(), cookie: r.headers.get('set-cookie')?.split(';')[0], headers: r.headers };
}
test('Workers + real D1: authentication, isolated saves, optimistic locking, backups and recovery', async () => {
  assert.equal((await call('health')).data.ok, true);
  assert.equal((await call('register', { method: 'POST', body: { username, password }, origin: 'https://wrong.example' })).status, 403);
  const registered = await call('register', { method: 'POST', body: { username, password } });
  assert.equal(registered.status, 200); assert.ok(registered.cookie); assert.equal(registered.data.recoveryCode.length, 64);
  assert.match(registered.headers.get('set-cookie'), /HttpOnly; SameSite=Strict/);
  assert.equal((await call('save')).status, 401);
  assert.equal((await call('register', { method: 'POST', body: { username: username.toUpperCase(), password } })).status, 409);
  assert.equal((await call('login', { method: 'POST', body: { username, password: 'wrong-password' } })).status, 401);
  const login = await call('login', { method: 'POST', body: { username, password } }); assert.equal(login.status, 200);
  const a = registered.cookie;
  const save = { version: 1.3, stores: { wood: 21 }, game: { population: 4 } };
  const initial = await call('save', { method: 'PUT', cookie: a, body: { version: 0, state: save } }); assert.equal(initial.data.version, 1);
  const race = await Promise.all([1,2].map(n => call('save', { method: 'PUT', cookie: a, body: { version: 1, state: { ...save, stores: { wood: n } } } })));
  assert.deepEqual(race.map(r => r.status).sort(), [200,409]);
  let version = 2;
  for (let i = 0; i < 7; i++) {
    const updated = await call('save', { method: 'PUT', cookie: a, body: { version, state: save } });
    assert.equal(updated.status, 200); version = updated.data.version;
  }
  const history = await call('backups', { cookie: a }); assert.equal(history.data.backups.length, 5);
  assert.equal((await call(`backups/${version - 1}`, { cookie: a })).data.state.stores.wood, 21);
  const second = await call('register', { method: 'POST', body: { username: username + '_b', password } });
  assert.equal((await call('save', { cookie: second.cookie })).data.state, null);
  assert.equal((await call(`backups/${version - 1}`, { cookie: second.cookie })).status, 404);
  const recovered = await call('recover', { method: 'POST', body: { username, password: 'replacement-password', recoveryCode: registered.data.recoveryCode } });
  assert.equal(recovered.status, 200); assert.notEqual(recovered.data.recoveryCode, registered.data.recoveryCode);
  assert.equal((await call('save', { cookie: a })).status, 401);
  assert.equal((await call('save', { cookie: recovered.cookie })).data.version, version);
  assert.equal((await call('recover', { method: 'POST', body: { username, password, recoveryCode: registered.data.recoveryCode } })).status, 401);
  assert.equal((await call('logout', { method: 'POST', cookie: recovered.cookie, body: {} })).status, 200);
  assert.equal((await call('save', { cookie: recovered.cookie })).status, 401);
});
test('malformed and oversized saves are rejected without changing the current version', async () => {
  const registered = await call('register', { method: 'POST', body: { username: username + '_bad', password } });
  assert.equal(registered.status, 200);
  const cookie = registered.cookie;
  const dangerous = JSON.parse('{"version":1.3,"stores":{"__proto__":{"x":1}}}');
  assert.equal((await call('save', { method: 'PUT', cookie, body: { version: 0, state: dangerous } })).status, 400);
  assert.equal((await call('save', { method: 'PUT', cookie, body: { version: 0, state: { oversized: 'x'.repeat(1200000) } } })).status, 413);
  assert.equal((await call('save', { cookie })).data.version, 0);
});
