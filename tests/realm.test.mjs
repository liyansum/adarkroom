import test from 'node:test';
import assert from 'node:assert/strict';
import '../script/realm-core.js';
import '../script/save-format.js';
const C = globalThis.RealmCore;
function state() {
  const s = { version: 1.3, stores: { wood: 10000, stone: 10000, grain: 10000, influence: 10000, iron: 10000, coal: 10000, steel: 10000, leather: 10000, fur: 10000 }, game: { population: 20, buildings: { hut: 5 }, workers: {} }, income: { gatherer: { delay: 10, stores: { wood: 20 }, timeLeft: 10 } } };
  C.init(s, 1000); return s;
}
const world = () => ({ map: Array.from({ length: 61 }, () => Array(61).fill('.')), mask: Array.from({ length: 61 }, () => Array(61).fill(false)) });

test('production conserves staffing and never gives gatherers a second job', () => {
  const s = state(); C.build(s, 'lumberyard'); assert.equal(C.staff(s), 2); assert.equal(C.freeWorkers(s), 18);
  const before = s.stores.wood; C.advance(s, 11000);
  assert.equal(s.stores.wood - before, 18 + 7);
});
test('building requires real resources and free residents, and charges once', () => {
  const s = state(); s.stores.wood = 79;
  assert.throws(() => C.build(s, 'lumberyard'), /不足/); assert.equal(C.level(s, 'lumberyard'), 0); assert.equal(s.stores.wood, 79);
  s.stores.wood = 200; s.game.workers.hunter = 20;
  assert.throws(() => C.build(s, 'lumberyard'), /人口不足/); assert.equal(s.stores.wood, 200);
});
test('offline chains consume available raw materials and stop instead of creating negatives', () => {
  const s = state(); s.income = { tanner: { delay: 10, stores: { fur: -5, leather: 1 } } }; s.stores.fur = 12; s.stores.leather = 0;
  C.advance(s, 301000); assert.equal(s.stores.fur, 2); assert.equal(s.stores.leather, 2);
});
test('offline catchup is capped at eight hours and cannot be collected twice', () => {
  const s = state(); s.income = { gatherer: { delay: 10, stores: { wood: 20 } } }; s.stores.wood = 0;
  const result = C.advance(s, 24 * 3600000 + 1000);
  assert.equal(result.seconds, 28800); assert.equal(s.stores.wood, 57600);
  assert.equal(C.advance(s, 24 * 3600000 + 1000).seconds, 0);
});
test('known cleared sites can become productive districts only after a road is funded', () => {
  const s = state(); s.realm.stage = 1; s.realm.buildings = { council: 1, depot: 1 }; s.game.world = world();
  s.game.world.map[31][30] = 'P';
  assert.throws(() => C.claim(s, 31, 30), /无法/);
  s.game.world.mask[31][30] = true; C.claim(s, 31, 30, 'farm');
  const d = s.realm.districts['31,30']; assert.equal(C.districtEfficiency(s, d), 0);
  C.improveDistrict(s, '31,30', 'route'); assert.ok(C.districtEfficiency(s, d) > 0);
  assert.throws(() => C.claim(s, 31, 30), /无法/);
});
test('all stages can be reached with the published gates and housing capacities', () => {
  const s = state(); C.build(s, 'lumberyard'); C.build(s, 'well'); C.upgrade(s); assert.equal(s.realm.stage, 1);
  s.game.buildings.hut = 20; s.realm.buildings.housing = 3;
  for (let target = 2; target <= 4; target++) {
    const gate = C.stages[target];
    assert.ok(C.populationCap(s) >= gate.population, `stage ${target} population is reachable`);
    s.game.population = gate.population;
    for (const [id, n] of Object.entries(gate.required)) s.realm.buildings[id] = Math.max(n, s.realm.buildings[id] || 0);
    for (let i = 0; i < (gate.districts || 0); i++) s.realm.districts[`${i},0`] = { x: i, y: 0, type: 'farm', level: 1, guards: 2, route: true };
    C.upgrade(s); assert.equal(s.realm.stage, target);
  }
  assert.equal(C.populationCap(s), 1000);
});
test('classic/comfortable carrying capacity and rescue benefits are distinct', () => {
  const s = state(); assert.deepEqual([10,20,40,70].map(n => C.capacity(s, n)), [20,40,80,140]);
  assert.equal(C.water(s, 10), 15); assert.equal(C.retain(s), 0.5);
  s.realm.buildings.clinic = 3; s.realm.techs.medicine = true; assert.equal(C.retain(s), 0.9);
  s.realm.difficulty = 'classic'; assert.equal(C.capacity(s, 70), 70); assert.equal(C.retain(s), 0);
});
test('legacy progress survives extension initialization', () => {
  const s = { version: 1.3, game: { population: 80, buildings: { hut: 20 }, world: world() }, stores: { wood: 77 } };
  C.init(s, 1000); assert.equal(s.realm.stage, 1); assert.equal(s.stores.wood, 77); assert.equal(s.game.world.map.length, 61); assert.equal(C.populationCap(s), 80);
});
test('imports reject prototype, legacy eval and map markup injection', () => {
  assert.throws(() => SaveFormat.validate(JSON.parse('{"__proto__":{"admin":true}}')), /字段/);
  assert.throws(() => SaveFormat.validate({ stores: { "x\"];alert(1);//": 1 } }), /字段/);
  assert.throws(() => SaveFormat.validate({ stores: { 'x);alert(1);//': 1 } }), /字段/);
  assert.throws(() => SaveFormat.validate({ realm: { districts: { '0,0': null } } }), /辖地/);
  assert.throws(() => SaveFormat.validate({ stores: { wood: '<img src=x onerror=alert(1)>' } }), /资源/);
  const s = state(); s.game.world = world(); s.game.world.map[0][0] = '<img src=x onerror=alert(1)>';
  assert.throws(() => SaveFormat.validate(s), /地图/);
  s.game.world.map[0][0] = 'P'; assert.doesNotThrow(() => SaveFormat.validate(s));
});
test('public projects finish a continuing settlement ending', () => {
  const s = state(); s.realm.stage = 4;
  for (let i = 0; i < 8; i++) s.realm.districts[`${i},0`] = { x: i, y: 0, type: 'farm', level: 1, guards: 2, route: true };
  for (const id of Object.keys(C.projects)) C.project(s, id);
  assert.equal(s.realm.completed, true);
  const before = s.realm.log.length; C.checkVictory(s); assert.equal(s.realm.log.length, before);
});
