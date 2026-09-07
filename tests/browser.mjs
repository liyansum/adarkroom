import assert from 'node:assert/strict';
import { chromium } from '@playwright/test';
const base = process.env.TEST_BASE_URL || 'http://127.0.0.1:8787';
const browser = await chromium.launch({ headless: true });
const errors = [];
function watch(page) { page.on('pageerror', e => { errors.push(e.message); console.error('PAGE ERROR:', e.stack); }); }
const seed = {
  version: 1.3,
  stores: { wood: 10000, fur: 3000, meat: 2000, leather: 1000, 'cured meat': 1000, stone: 5000, grain: 3000, influence: 500, iron: 500, coal: 400, steel: 300, sulphur: 100, compass: 1, rucksack: 1, waterskin: 1, 'iron sword': 1, 'l armour': 1, torch: 10, cloth: 100, scales: 50, teeth: 50 },
  game: { population: 80, buildings: { hut: 20, lodge: 1, 'trading post': 1, tannery: 1, smokehouse: 1, workshop: 1 }, workers: {}, builder: { level: 4 }, temperature: { value: 3 }, fire: { value: 4 } },
  realm: { version: 1, stage: 1, buildings: { lumberyard: 1, quarry: 1, well: 1, farm: 2, council: 1, housing: 1, depot: 1 }, lastTick: Date.now() },
  config: { soundOn: false }, playStats: { audioAlertShown: true }
};
async function seeded(context) {
  const page = await context.newPage(); watch(page);
  await page.addInitScript(seed => { if (!localStorage.getItem('browser-test-seeded')) { localStorage.setItem('adr:guest', JSON.stringify(seed)); localStorage.setItem('adr:migrated', '1'); localStorage.setItem('browser-test-seeded', '1'); } }, seed);
  await page.goto(base); await page.waitForFunction(() => window.Cloud?.ready);
  return page;
}
try {
  const desktop = await browser.newContext({ viewport: { width: 1280, height: 900 } });
  const page = await seeded(desktop);
  await page.locator('#location_realm').click();
  await page.locator('[data-building="quarry"] button').click();
  assert.equal(await page.evaluate(() => State.realm.buildings.quarry), 2);
  assert.equal(await page.evaluate(() => RealmCore.staff(State)), 14);
  await page.screenshot({ path: '/tmp/adarkroom-realm.png', fullPage: true });
  // A cleared point adjacent to home exercises claims, roads, promotion and save migration.
  await page.evaluate(() => { State.game.world.map[31][30] = 'P'; State.game.world.mask[31][30] = true; Realm.section = 'districts'; Realm.render(); });
  await page.getByRole('button', { name: '重建为辖地', exact: true }).first().click();
  await page.getByRole('button', { name: '修建运输道路', exact: true }).first().click();
  assert.equal(await page.evaluate(() => State.realm.districts['31,30'].route), true);
  await page.getByRole('button', { name: '建造', exact: true }).first().click();
  await page.getByRole('button', { name: '晋级城镇', exact: true }).click();
  assert.equal(await page.evaluate(() => State.realm.stage), 2);
  await page.evaluate(() => { Cloud.saveLocal(); }); await page.reload(); await page.waitForFunction(() => window.Cloud?.ready);
  assert.equal(await page.evaluate(() => State.realm.stage), 2);
  await page.locator('#location_path').click(); await page.getByRole('button', { name: '一键整备' }).click();
  assert.ok(await page.evaluate(() => Path.outfit['cured meat'] > 0 && Path.getFreeSpace() >= 0));
  await page.locator('#embarkButton').click(); await page.waitForFunction(() => Engine.activeModule === World);
  // Stable checkpoint must survive a reload away from home.
  await page.evaluate(() => { World.state.map[30][29] = '#'; World.state.mask[30][29] = true; World.move([0,-1]); Cloud.saveLocal(); });
  assert.deepEqual(await page.evaluate(() => World.curPos), [30,29]);
  await page.reload(); await page.waitForFunction(() => window.Cloud?.ready && Engine.activeModule === World);
  assert.deepEqual(await page.evaluate(() => World.curPos), [30,29]);
  assert.equal(await page.evaluate(() => SaveFormat.validate(Cloud.snapshot()).expedition.position[1]), 29);
  await page.screenshot({ path: '/tmp/adarkroom-map.png', fullPage: true });
  // An interrupted event restores the complete pre-event checkpoint, including its rewards.
  const beforeEvent = await page.evaluate(() => State.stores.scales);
  await page.evaluate(() => {
    Events.startEvent({ title: '检查点验证', scenes: { start: { text: ['未结束的事件'], reward: { scales: 99 }, buttons: { leave: { text: '离开', nextScene: 'end' } } } } });
    Cloud.saveLocal();
  });
  assert.equal(await page.evaluate(() => State.stores.scales), beforeEvent + 99);
  assert.equal(await page.evaluate(() => JSON.parse(localStorage.getItem(Cloud.key)).stores.scales), beforeEvent);
  await page.reload(); await page.waitForFunction(() => window.Cloud?.ready && Engine.activeModule === World);
  assert.equal(await page.evaluate(() => State.stores.scales), beforeEvent);
  assert.deepEqual(await page.evaluate(() => World.curPos), [30,29]);
  // Movement input is blocked by dialogs and active events.
  await page.getByRole('button', { name: '已发现地点' }).click();
  await page.evaluate(() => World.move([0,-1])); assert.deepEqual(await page.evaluate(() => World.curPos), [30,29]);
  await page.getByRole('button', { name: '关闭', exact: true }).click();
  await page.waitForFunction(() => !Engine.keyLock);
  await page.keyboard.press('ArrowDown'); await page.waitForFunction(() => Engine.activeModule === Path);
  assert.equal(await page.evaluate(() => !!State.expedition), false);
  // UI desktop has no horizontal page overflow.
  assert.ok(await page.evaluate(() => document.documentElement.scrollWidth <= innerWidth + 1));
  const mobile = await browser.newContext({ viewport: { width: 390, height: 844 }, isMobile: true, hasTouch: true });
  const phone = await seeded(mobile);
  await phone.locator('#location_realm').click();
  assert.ok(await phone.evaluate(() => document.documentElement.scrollWidth <= innerWidth + 1));
  await phone.screenshot({ path: '/tmp/adarkroom-mobile.png', fullPage: true });
  await phone.locator('#location_path').click(); await phone.getByRole('button', { name: '一键整备' }).click(); await phone.locator('#embarkButton').click();
  await phone.waitForFunction(() => Engine.activeModule === World);
  await phone.evaluate(() => { World.state.map[30][29] = '#'; });
  await phone.getByRole('button', { name: '↑ 北', exact: true }).tap();
  assert.deepEqual(await phone.evaluate(() => World.curPos), [30,29]);
  assert.ok(await phone.evaluate(() => document.documentElement.scrollWidth <= innerWidth + 1));
  await phone.screenshot({ path: '/tmp/adarkroom-mobile-map.png', fullPage: true });
  // Rescue commits recovered supplies once, and the original ship remains playable on a phone.
  const rescue = await phone.evaluate(() => {
    const before = State.stores['cured meat'], carried = Path.outfit['cured meat'];
    World.state.mask[0][0] = true; World.die();
    return { recovered: State.stores['cured meat'] - before, expected: Math.floor(carried / 2), mask: State.game.world.mask[0][0], cooldown: $('#embarkButton').data('cooldown') };
  });
  assert.equal(rescue.recovered, rescue.expected); assert.equal(rescue.mask, true); assert.equal(rescue.cooldown, 30);
  await phone.waitForFunction(() => Engine.activeModule === Room && !Engine.keyLock);
  await phone.waitForFunction(() => parseFloat($('#outerSlider').css('opacity')) > 0.99);
  await phone.evaluate(() => { Ship.init(); State.game.spaceShip.hull = 100; Engine.travelTo(Ship); Ship.liftOff(); });
  await phone.waitForFunction(() => Engine.activeModule === Space);
  assert.ok(await phone.locator('#spacePanel').isVisible());
  assert.ok(await phone.evaluate(() => { const box = Space.ship[0].getBoundingClientRect(); return box.left >= 0 && box.right <= innerWidth && box.top > 0; }));
  assert.ok(await phone.evaluate(() => document.documentElement.scrollWidth <= innerWidth + 1));
  const shipX = await phone.evaluate(() => parseFloat(Space.ship.css('left')));
  const control = phone.getByRole('button', { name: '飞船←', exact: true });
  await control.dispatchEvent('pointerdown', { pointerId: 1 });
  await phone.waitForFunction(x => parseFloat(Space.ship.css('left')) < x, shipX);
  await control.dispatchEvent('pointerup', { pointerId: 1 });
  await phone.screenshot({ path: '/tmp/adarkroom-mobile-ship.png', fullPage: true });
  await phone.evaluate(() => Space.crash());
  await phone.waitForFunction(() => Engine.activeModule === Ship && document.getElementById('space-pad').hidden);
  assert.ok(await phone.locator('#shipPanel').isVisible());
  assert.deepEqual(await phone.evaluate(() => { State.previous.score = 1234; State.realm.difficulty = 'classic'; const s = Cloud.newState(); return [s.previous.score, s.realm.difficulty, !!s.stores]; }), [1234, 'classic', false]);
  // Account creation through the real form, recovery-code acknowledgement and cloud sync.
  const account = await browser.newContext({ viewport: { width: 1100, height: 800 } });
  const auth = await seeded(account);
  await auth.locator('#cloud-status').click();
  await auth.getByRole('button', { name: '注册 / 登录', exact: true }).click();
  await auth.getByRole('button', { name: '注册', exact: true }).click();
  await auth.getByLabel('用户名', { exact: true }).fill(`browser_${Date.now().toString(36)}`);
  await auth.getByLabel('密码（8—128 位）', { exact: true }).fill('browser-check-password');
  await auth.getByRole('button', { name: '注册账号', exact: true }).click();
  await auth.getByRole('button', { name: '已保存，进入游戏', exact: true }).waitFor();
  assert.equal((await auth.getByRole('textbox', { name: '恢复码' }).inputValue()).length, 64);
  await auth.getByRole('button', { name: '已保存，进入游戏', exact: true }).click();
  await auth.waitForFunction(() => window.Cloud?.ready && !!Cloud.user && Cloud.meta.version >= 1);
  assert.equal(await auth.evaluate(() => State.game.population), 80);
  assert.equal(await auth.evaluate(() => Cloud.key.startsWith('adr:user:')), true);
  // Simulate another device committing, verify explicit conflict and local retention.
  await auth.evaluate(async () => {
    await Cloud.sync();
    const other = Cloud.snapshot(); other.stores.wood = 123;
    await Cloud.api('save', 'PUT', { version: Cloud.meta.version, state: other });
    State.stores.wood = 987; Cloud.dirty = true; await Cloud.sync();
  });
  assert.equal(await auth.evaluate(() => !!Cloud.conflict), true);
  assert.equal(await auth.evaluate(() => State.stores.wood), 987);
  await auth.locator('#cloud-status').click();
  await auth.getByRole('button', { name: '保留本机进度并更新云端', exact: true }).click();
  await auth.waitForFunction(() => !Cloud.conflict);
  assert.equal(await auth.evaluate(() => !!Cloud.conflict), false);
  await auth.locator('#cloud-status').click(); await auth.getByRole('button', { name: '退出账号', exact: true }).click();
  await auth.waitForFunction(() => window.Cloud?.ready && !Cloud.user);
  assert.equal(await auth.evaluate(() => Cloud.key), 'adr:guest');
  assert.ok(await auth.evaluate(() => Object.keys(localStorage).some(k => k.startsWith('adr:user:') && !k.endsWith(':meta'))));
  assert.deepEqual(errors, []);
  console.log('Browser checks passed: building, staffing, claim, route, promotion, reload, expedition/event checkpoints, keyboard/touch controls, rescue, mobile ship/crash, prestige, registration, guest migration, cloud conflict, logout isolation.');
} finally { await browser.close(); }
