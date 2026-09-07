import '../script/save-format.js';
import { pbkdf2Sync, timingSafeEqual } from 'node:crypto';

const ITERATIONS = 10000;
const SESSION_MS = 30 * 86400000;
const encoder = new TextEncoder();
const hex = bytes => Array.from(bytes, b => b.toString(16).padStart(2, '0')).join('');
const random = () => hex(crypto.getRandomValues(new Uint8Array(32)));
const digest = async value => hex(new Uint8Array(await crypto.subtle.digest('SHA-256', encoder.encode(value))));
const passwordHash = (password, salt, iterations = ITERATIONS) => pbkdf2Sync(password, salt, iterations, 32, 'sha256').toString('hex');
const equal = (a, b) => typeof a === 'string' && typeof b === 'string' && a.length === b.length && timingSafeEqual(encoder.encode(a), encoder.encode(b));
const fail = (status, message) => { throw Object.assign(new Error(message), { status }); };
const json = (data, status = 200, headers = {}) => Response.json(data, { status, headers: { 'Cache-Control': 'no-store', 'X-Content-Type-Options': 'nosniff', ...headers } });

export function validateSave(state) {
  try { return globalThis.SaveFormat.validate(state); }
  catch (e) { fail(400, e.message); }
}

async function body(request, max = 1100000) {
  if (!request.headers.get('content-type')?.startsWith('application/json')) fail(415, '请使用 JSON 请求');
  if (Number(request.headers.get('content-length')) > max) fail(413, '请求过大');
  const reader = request.body?.getReader();
  if (!reader) fail(400, '请求内容为空');
  const parts = [];
  let size = 0;
  while (true) {
    const { value, done } = await reader.read();
    if (done) break;
    size += value.byteLength;
    if (size > max) { reader.releaseLock(); fail(413, '请求过大'); }
    parts.push(value);
  }
  const bytes = new Uint8Array(size);
  let offset = 0;
  for (const part of parts) { bytes.set(part, offset); offset += part.length; }
  try { return JSON.parse(new TextDecoder().decode(bytes)); } catch { fail(400, 'JSON 格式不正确'); }
}

function credentials(data) {
  if (!data || typeof data.username !== 'string' || typeof data.passwordKey !== 'string') fail(400, '请输入用户名和密码');
  const username = data.username.normalize('NFKC').trim();
  if (!/^[\p{L}\p{N}_-]{3,32}$/u.test(username)) fail(400, '用户名需为 3—32 个文字、数字、下划线或短横线');
  if (!/^[a-f0-9]{64}$/.test(data.passwordKey)) fail(400, '登录凭证格式不正确，请刷新游戏页面');
  return { username, key: username.toLowerCase(), password: data.passwordKey };
}

async function limit(db, key, max, windowMs) {
  const now = Date.now();
  const row = await db.prepare(`INSERT INTO rate_limits(key, hits, expires_at) VALUES(?, 1, ?)
    ON CONFLICT(key) DO UPDATE SET hits = CASE WHEN expires_at <= ? THEN 1 ELSE hits + 1 END,
    expires_at = CASE WHEN expires_at <= ? THEN ? ELSE expires_at END RETURNING hits`).bind(await digest(key), now + windowMs, now, now, now + windowMs).first();
  if (row.hits > max) fail(429, '尝试次数过多，请稍后再试');
}

const cookieName = request => new URL(request.url).protocol === 'https:' ? '__Host-adr_session' : 'adr_session';
const cookie = (request, token, maxAge = SESSION_MS / 1000) => `${cookieName(request)}=${token}; Path=/; HttpOnly; SameSite=Strict; Max-Age=${maxAge}${new URL(request.url).protocol === 'https:' ? '; Secure' : ''}`;
async function session(request, db) {
  const token = request.headers.get('Cookie')?.match(new RegExp(`(?:^|;\\s*)${cookieName(request)}=([a-f0-9]{64})(?:;|$)`))?.[1];
  if (!token) return null;
  return db.prepare(`SELECT u.id, u.username, s.token_hash FROM sessions s JOIN users u ON s.user_id = u.id
    WHERE s.token_hash = ? AND s.expires_at > ?`).bind(await digest(token), Date.now()).first();
}
async function issue(request, db, user, extra = {}) {
  const token = random();
  await db.prepare('INSERT INTO sessions(token_hash, user_id, expires_at) VALUES(?, ?, ?)').bind(await digest(token), user.id, Date.now() + SESSION_MS).run();
  return json({ user: { id: user.id, username: user.username }, ...extra }, 200, { 'Set-Cookie': cookie(request, token) });
}
async function readSave(db, id) {
  const row = await db.prepare('SELECT version, data, updated_at FROM saves WHERE user_id = ?').bind(id).first();
  return row ? { version: row.version, state: JSON.parse(row.data), updatedAt: row.updated_at } : { version: 0, state: null, updatedAt: null };
}

async function api(request, env, ctx) {
  const url = new URL(request.url);
  const path = url.pathname;
  if (!['GET', 'POST', 'PUT'].includes(request.method)) fail(405, '不支持的请求方法');
  if (request.method !== 'GET') {
    if (request.headers.get('Origin') !== url.origin || request.headers.get('X-ADR-Request') !== '1') fail(403, '请求来源不正确，请刷新页面');
  }
  if (!env.DB) fail(503, '数据库尚未绑定，请检查部署配置');
  if (path === '/api/health' && request.method === 'GET') {
    await env.DB.prepare('SELECT id FROM users LIMIT 1').first();
    return json({ ok: true, version: '2.0.0' });
  }
  if (['/api/register', '/api/login', '/api/recover'].includes(path) && request.method === 'POST') {
    const ip = request.headers.get('CF-Connecting-IP') || 'local';
    await limit(env.DB, `auth:ip:${ip}`, 30, 15 * 60000);
    const data = await body(request, 4096);
    const c = credentials(data);
    await limit(env.DB, `auth:user:${c.key}`, 12, 15 * 60000);
    if (path === '/api/register') {
      await limit(env.DB, `register:${ip}`, 8, 3600000);
      const salt = random(), recoveryCode = random();
      const user = { id: crypto.randomUUID(), username: c.username };
      const result = await env.DB.prepare(`INSERT INTO users(id, username, username_key, password_hash, salt, iterations, recovery_hash, created_at)
        VALUES(?, ?, ?, ?, ?, ?, ?, ?) ON CONFLICT(username_key) DO NOTHING`).bind(user.id, c.username, c.key, passwordHash(c.password, salt), salt, ITERATIONS, await digest(recoveryCode), Date.now()).run();
      if (!result.meta.changes) fail(409, '这个用户名已被使用');
      return issue(request, env.DB, user, { recoveryCode });
    }
    const user = await env.DB.prepare('SELECT * FROM users WHERE username_key = ?').bind(c.key).first();
    if (path === '/api/login') {
      // Always derive a hash, including for unknown accounts.
      const hash = passwordHash(c.password, user?.salt || '0'.repeat(64), user?.iterations || ITERATIONS);
      if (!user || !equal(hash, user.password_hash)) fail(401, '用户名或密码不正确');
      return issue(request, env.DB, user);
    }
    if (!user || typeof data.recoveryCode !== 'string' || data.recoveryCode.length > 128 || !equal(await digest(data.recoveryCode.trim()), user.recovery_hash)) fail(401, '用户名或恢复码不正确');
    const salt = random(), recoveryCode = random();
    const result = await env.DB.prepare('UPDATE users SET password_hash = ?, salt = ?, iterations = ?, recovery_hash = ? WHERE id = ? AND recovery_hash = ?')
      .bind(passwordHash(c.password, salt), salt, ITERATIONS, await digest(recoveryCode), user.id, user.recovery_hash).run();
    if (!result.meta.changes) fail(409, '恢复码已使用，请重新登录');
    await env.DB.prepare('DELETE FROM sessions WHERE user_id = ?').bind(user.id).run();
    return issue(request, env.DB, user, { recoveryCode });
  }
  const user = await session(request, env.DB);
  if (path === '/api/me' && request.method === 'GET') return json({ user: user ? { id: user.id, username: user.username } : null });
  if (!user) fail(401, '请先登录');
  if (path === '/api/logout' && request.method === 'POST') {
    await env.DB.prepare('DELETE FROM sessions WHERE token_hash = ?').bind(user.token_hash).run();
    return json({ ok: true }, 200, { 'Set-Cookie': cookie(request, '', 0) });
  }
  if (path === '/api/save' && request.method === 'GET') return json(await readSave(env.DB, user.id));
  if (path === '/api/save' && request.method === 'PUT') {
    await limit(env.DB, `save:${user.id}`, 90, 60000);
    const data = await body(request);
    if (!data || !Number.isSafeInteger(data.version) || data.version < 0) fail(400, '存档版本不正确');
    const state = JSON.stringify(validateSave(data.state));
    const now = Date.now();
    const result = data.version === 0
      ? await env.DB.prepare('INSERT INTO saves(user_id, version, data, updated_at) VALUES(?, 1, ?, ?) ON CONFLICT(user_id) DO NOTHING').bind(user.id, state, now).run()
      : await env.DB.prepare('UPDATE saves SET version = version + 1, data = ?, updated_at = ? WHERE user_id = ? AND version = ?').bind(state, now, user.id, data.version).run();
    if (!result.meta.changes) return json({ error: '云端有更新的进度，请选择要保留的存档', conflict: true, ...(await readSave(env.DB, user.id)) }, 409);
    if (ctx && Math.random() < 0.02) ctx.waitUntil(env.DB.batch([
      env.DB.prepare('DELETE FROM sessions WHERE expires_at < ?').bind(now),
      env.DB.prepare('DELETE FROM rate_limits WHERE expires_at < ?').bind(now)
    ]));
    return json({ version: data.version + 1, updatedAt: now });
  }
  if (path === '/api/backups' && request.method === 'GET') {
    const rows = await env.DB.prepare('SELECT version, created_at FROM backups WHERE user_id = ? ORDER BY version DESC').bind(user.id).all();
    return json({ backups: rows.results });
  }
  const backup = path.match(/^\/api\/backups\/(\d+)$/);
  if (backup && request.method === 'GET') {
    const row = await env.DB.prepare('SELECT data, version, created_at FROM backups WHERE user_id = ? AND version = ?').bind(user.id, Number(backup[1])).first();
    if (!row) fail(404, '备份不存在');
    return json({ state: JSON.parse(row.data), version: row.version, updatedAt: row.created_at });
  }
  fail(404, '接口不存在');
}

export default {
  async fetch(request, env, ctx) {
    if (!new URL(request.url).pathname.startsWith('/api/')) return env.ASSETS.fetch(request);
    try { return await api(request, env, ctx); }
    catch (error) {
      if (error.status) return json({ error: error.message }, error.status);
      console.error('API error:', error.message);
      return json({ error: /no such table/.test(error.message) ? '数据库正在初始化，请稍后重试' : '服务暂时不可用，请稍后重试' }, 503);
    }
  }
};
