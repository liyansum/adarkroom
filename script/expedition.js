/* Readable text maps, safe expedition checkpoints, and touch controls. MPL-2.0. */
var Expedition = {
  fullMap: false, transitioning: false, safeState: null, selected: null, autoTimer: null,
  tiles: {
    A: ['家', '家园', 'home'], I: ['铁', '铁矿', 'mine'], C: ['煤', '煤矿', 'mine'], S: ['硫', '硫磺矿', 'mine'],
    ';': ['林', '森林', 'forest'], ',': ['原', '草原', 'field'], '.': ['荒', '荒地', 'barren'], '#': ['·', '道路', 'road'],
    H: ['屋', '旧房屋', 'landmark'], V: ['洞', '洞穴', 'landmark'], O: ['镇', '废弃城镇', 'landmark'], Y: ['城', '废墟城市', 'landmark'],
    P: ['哨', '补给哨站', 'outpost'], W: ['舰', '坠毁飞船', 'landmark'], B: ['井', '钻孔', 'landmark'], F: ['战', '古战场', 'landmark'],
    M: ['沼', '沼泽', 'landmark'], U: ['藏', '旧日遗藏', 'landmark']
  },
  tileName(tile) { return this.tiles[String(tile).charAt(0)]?.[1] || '未知区域'; },
  capture() {
    if (this.transitioning || this.moving || !window.State || Engine.activeModule !== World || !World.state || World.dead || Events.activeEvent()) return;
    State.expedition = {
      world: RealmCore.clone(World.state), position: World.curPos.slice(), health: World.health, water: World.water,
      outfit: RealmCore.clone(Path.outfit || {}), foodMove: World.foodMove || 0, waterMove: World.waterMove || 0,
      fightMove: World.fightMove || 0, starvation: !!World.starvation, thirst: !!World.thirst,
      usedOutposts: RealmCore.clone(World.usedOutposts || {}), roadMoves: this.roadMoves || 0
    };
    this.safeState = RealmCore.clone(State);
  },
  restore() {
    const e = State.expedition;
    if (!e || !Path.tab || !World.panel) return;
    World.state = RealmCore.clone(e.world); World.curPos = e.position.slice();
    Path.outfit = RealmCore.clone(e.outfit); State.outfit = Path.outfit;
    World.health = e.health; World.water = e.water;
    for (const name of ['foodMove', 'waterMove', 'fightMove', 'starvation', 'thirst']) World[name] = e[name] || 0;
    World.usedOutposts = e.usedOutposts || {}; this.roadMoves = e.roadMoves || 0;
    World.dead = false; Engine.activeModule = World; Engine.keyLock = false; Engine.tabNavigation = false;
    World.drawMap(); World.updateSupplies(); World.setHp(World.health); World.setWater(World.water); Realm.syncView(); this.capture();
    GameUI.toast('已恢复远征检查点。');
  },
  map() {
    if (!World.state || !World.curPos) return;
    const outer = document.getElementById('worldOuter'); if (!outer) return;
    let tools = document.getElementById('map-tools');
    if (!tools) {
      tools = GameUI.el('div'); tools.id = 'map-tools';
      const title = GameUI.el('h1', '荒野与领地'); tools.append(title);
      const actions = GameUI.el('div', undefined, 'realm-actions');
      actions.append(GameUI.button('局部 / 全图', () => { this.fullMap = !this.fullMap; this.map(); }));
      actions.append(GameUI.button('已发现地点', () => this.places()));
      actions.append(GameUI.button('沿道路返回家园', () => this.autoTravel([30, 30])));
      actions.append(GameUI.button('停止行进', () => this.stop()));
      tools.append(actions); outer.prepend(tools);
      const status = GameUI.el('p'); status.id = 'route-status'; outer.append(status);
      const legend = GameUI.el('p', '我：当前位置　家：家园　哨：补给　·：道路　边框：辖地　空白：未探索', 'map-legend'); outer.append(legend);
      const details = GameUI.el('div', '点击一个已探索格子查看地点。', 'map-details'); details.id = 'map-details'; outer.append(details);
      this.directionControls(outer);
    }
    let shell = document.getElementById('map-scroll');
    if (!shell) { shell = GameUI.el('div'); shell.id = 'map-scroll'; document.getElementById('route-status').before(shell); }
    let map = document.getElementById('map');
    if (!map) { map = GameUI.el('div'); map.id = 'map'; shell.append(map); }
    map.replaceChildren(); map.setAttribute('role', 'group'); map.setAttribute('aria-label', '荒野地图');
    const span = this.fullMap ? 61 : innerWidth < 600 ? 15 : 21;
    const startX = this.fullMap ? 0 : Math.min(61 - span, Math.max(0, World.curPos[0] - Math.floor(span / 2)));
    const startY = this.fullMap ? 0 : Math.min(61 - span, Math.max(0, World.curPos[1] - Math.floor(span / 2)));
    map.style.setProperty('--map-columns', span); map.classList.toggle('full-map', this.fullMap);
    const fragment = document.createDocumentFragment();
    for (let y = startY; y < startY + span; y++) for (let x = startX; x < startX + span; x++) {
      const seen = World.state.mask[x][y], current = x === World.curPos[0] && y === World.curPos[1];
      const tile = String(World.state.map[x][y]).charAt(0), def = this.tiles[tile] || ['', '未知区域', 'unknown'];
      const district = State.realm.districts[`${x},${y}`];
      const cell = GameUI.el('button', current ? '我' : seen ? def[0] : '', 'map-cell'); cell.type = 'button';
      cell.classList.add(current ? 'player' : seen ? def[2] : 'unknown');
      if (district && seen) cell.classList.add('owned');
      if (seen && this.selected?.[0] === x && this.selected?.[1] === y) cell.classList.add('map-selected');
      const label = `${x - 30}, ${y - 30}：${current ? '当前位置' : seen ? district ? RealmCore.districtTypes[district.type].name : def[1] : '尚未探索'}`;
      cell.setAttribute('aria-label', label); cell.title = label;
      cell.addEventListener('click', () => this.select(x, y)); fragment.append(cell);
    }
    map.append(fragment); this.status();
  },
  status() {
    const el = document.getElementById('route-status'); if (!el || !World.curPos || !World.state) return;
    const meat = Math.floor((Path.outfit?.['cured meat'] || 0) * 2 * ($SM.hasPerk('slow metabolism') ? 2 : 1));
    const water = Math.floor(World.water * ($SM.hasPerk('desert rat') ? 2 : 1));
    const distance = World.getDistance();
    el.textContent = `位置 ${World.curPos[0] - 30}, ${World.curPos[1] - 30} · 距家园 ${distance} 格 · 食物约 ${meat} 步 / 水约 ${water} 步（不含战斗消耗）${Math.min(meat, water) < distance ? ' · 返程补给不足，寻找哨站' : ''}`;
    el.classList.toggle('supply-warning', Math.min(meat, water) < distance);
  },
  select(x, y) {
    this.selected = [x, y];
    const details = document.getElementById('map-details'); details.replaceChildren();
    if (!World.state.mask[x][y]) { details.append(GameUI.el('p', '这里仍在迷雾之中。')); return; }
    const tile = World.state.map[x][y];
    const d = State.realm.districts[`${x},${y}`];
    details.append(GameUI.el('strong', `${d ? RealmCore.districtTypes[d.type].name : this.tileName(tile)}（${x - 30}, ${y - 30}）`));
    const danger = Math.abs(x - 30) + Math.abs(y - 30);
    details.append(GameUI.el('p', d ? `你的辖地 · ${d.level} 级 · ${d.guards} 名守卫 · ${d.route ? '运输正常' : '等待运输道路'}` : `距离当前位置 ${Math.abs(x - World.curPos[0]) + Math.abs(y - World.curPos[1])} 格 · ${danger > 20 ? '远方险境' : danger > 10 ? '需要良好装备' : '近郊荒野'}${tile.endsWith('!') ? ' · 已探索' : ''}`));
    if (tile === 'P') details.append(GameUI.el('p', World.outpostUsed(x, y) ? '本次远征已使用补给。' : '可以在此补充饮水并寻找食物。'));
    details.append(GameUI.button('沿已探索道路前往', () => this.autoTravel([x, y]), !RealmCore.level(State, 'depot')));
  },
  directionControls(parent) {
    const pad = GameUI.el('div', undefined, 'direction-pad'); pad.setAttribute('aria-label', '移动方向');
    for (const [name, arrow, direction] of [['north', '↑ 北', [0, -1]], ['west', '← 西', [-1, 0]], ['south', '↓ 南', [0, 1]], ['east', '→ 东', [1, 0]]]) {
      const b = GameUI.button(arrow, () => World.move(direction)); b.classList.add(name); pad.append(b);
    } parent.append(pad);
  },
  places() {
    if (Events.activeEvent()) return;
    const dialog = GameUI.dialog('已发现地点'); const list = GameUI.el('div', undefined, 'known-places');
    const entries = [];
    for (let x = 0; x < 61; x++) for (let y = 0; y < 61; y++) {
      if (!World.state.mask[x][y]) continue;
      const tile = World.state.map[x][y]; if ([';', '.', ',', '#'].includes(tile)) continue;
      entries.push({ x, y, tile, distance: Math.abs(x - World.curPos[0]) + Math.abs(y - World.curPos[1]) });
    }
    entries.sort((a, b) => a.distance - b.distance);
    for (const e of entries) list.append(GameUI.button(`${this.tileName(e.tile)} · ${e.x - 30}, ${e.y - 30} · ${e.distance} 格`, () => { dialog.close(); this.select(e.x, e.y); }));
    dialog.append(list);
  },
  route(target) {
    const start = World.curPos, key = p => p.join(',');
    const queue = [start], parents = new Map([[key(start), null]]);
    for (let i = 0; i < queue.length; i++) {
      const p = queue[i];
      if (key(p) === key(target)) { const path = []; let cursor = p; while (parents.get(key(cursor))) { path.unshift(cursor); cursor = parents.get(key(cursor)); } return path; }
      for (const [dx, dy] of [[0, -1], [0, 1], [-1, 0], [1, 0]]) {
        const next = [p[0] + dx, p[1] + dy], [x, y] = next;
        if (x < 0 || x > 60 || y < 0 || y > 60 || parents.has(key(next)) || !World.state.mask[x][y] || !['#', 'P', 'A', 'I', 'C', 'S'].includes(World.state.map[x][y])) continue;
        if (['I', 'C', 'S'].includes(World.state.map[x][y]) && !State.realm.districts[key(next)]?.route) continue;
        parents.set(key(next), p); queue.push(next);
      }
    }
    return null;
  },
  autoTravel(target) {
    this.stop();
    if (!RealmCore.level(State, 'depot')) throw new Error('建成驿站后可沿道路自动行进');
    const route = this.route(target); if (!route) throw new Error('没有连接到此处的已探索道路，请手动探路');
    const step = () => {
      if (!route.length || Events.activeEvent() || Engine.keyLock || Engine.activeModule !== World || World.water <= 3 || (Path.outfit['cured meat'] || 0) <= 2) { this.stop(); return; }
      const next = route.shift(); this.autoMoving = true;
      try { World.move([next[0] - World.curPos[0], next[1] - World.curPos[1]]); } finally { this.autoMoving = false; }
      this.autoTimer = setTimeout(step, 240);
    }; step();
  },
  stop() { clearTimeout(this.autoTimer); this.autoTimer = null; },
  outfit() {
    if (!Path.panel) return;
    let extras = document.getElementById('outfit-extras');
    if (!extras) {
      extras = GameUI.el('div'); extras.id = 'outfit-extras'; Path.panel[0].append(extras);
      extras.append(GameUI.button('一键整备', () => this.prepare()));
      const hint = GameUI.el('p'); hint.id = 'outfit-estimate'; extras.append(hint);
    }
    const n = document.getElementById('outfit-estimate');
    n.textContent = `负重 ${Math.ceil(Path.getCapacity() - Path.getFreeSpace())}/${Path.getCapacity()} · 满水约 ${World.getMaxWater() * ($SM.hasPerk('desert rat') ? 2 : 1)} 步 · 食物约 ${Math.floor((Path.outfit?.['cured meat'] || 0) * 2 * ($SM.hasPerk('slow metabolism') ? 2 : 1))} 步。食物也用于战斗治疗，请留余量。`;
  },
  prepare() {
    Path.outfit = {}; State.outfit = Path.outfit;
    const add = (key, n) => {
      const available = Math.max(0, (State.stores[key] || 0) - (Path.outfit[key] || 0));
      const amount = Math.max(0, Math.min(n, available, Math.floor(Path.getFreeSpace() / Path.getWeight(key))));
      if (amount) Path.outfit[key] = (Path.outfit[key] || 0) + amount;
    };
    const weapons = ['laser rifle', 'rifle', 'steel sword', 'iron sword', 'bone spear'];
    const weapon = weapons.find(k => State.stores[k] > 0 && (k !== 'rifle' || State.stores.bullets > 0) && (k !== 'laser rifle' || State.stores['energy cell'] > 0));
    if (weapon) add(weapon, 1);
    add('cured meat', Math.ceil(World.getMaxWater() / 2) + 4);
    if (weapon === 'rifle') add('bullets', 25);
    if (weapon === 'laser rifle') add('energy cell', 20);
    add('torch', 3); add('medicine', 2); add('cured meat', Math.max(0, Math.floor(Path.getFreeSpace() * 0.35)));
    Path.updateOutfitting(); Engine.saveGame();
  },
  spaceControls() {
    if (!Space.panel || document.getElementById('space-pad')) return;
    const pad = GameUI.el('div', undefined, 'direction-pad'); pad.id = 'space-pad';
    for (const [dir, label, placement] of [['up', '↑', 'north'], ['left', '←', 'west'], ['down', '↓', 'south'], ['right', '→', 'east']]) {
      const b = GameUI.el('button', label, `realm-button ${placement}`); b.type = 'button'; b.setAttribute('aria-label', `飞船${label}`);
      b.addEventListener('pointerdown', e => { e.preventDefault(); b.setPointerCapture(e.pointerId); Space[dir] = true; });
      for (const event of ['pointerup', 'pointercancel', 'lostpointercapture']) b.addEventListener(event, () => { Space[dir] = false; }); pad.append(b);
    } Space.panel[0].after(pad);
  }
};

(function installExpeditions() {
  const snapshot = Cloud.snapshot;
  Cloud.snapshot = function () {
    if (Engine.activeModule === World && Events.activeEvent() && Expedition.safeState && !Expedition.transitioning) return RealmCore.clone(Expedition.safeState);
    return snapshot.call(Cloud);
  };
  World.drawMap = () => Expedition.map();
  const move = World.move;
  World.move = function (direction) {
    if (Engine.activeModule !== World || Engine.keyLock || Events.activeEvent() || document.querySelector('dialog[open]') || World.dead || !World.state) return;
    if (!Array.isArray(direction) || Math.abs(direction[0]) + Math.abs(direction[1]) !== 1) return;
    const x = World.curPos[0] + direction[0], y = World.curPos[1] + direction[1];
    if (x < 0 || y < 0 || x > 60 || y > 60) return;
    if (!Expedition.autoMoving) Expedition.stop();
    Expedition.capture(); Expedition.moving = true;
    try { move.call(World, direction); } finally { Expedition.moving = false; }
    Expedition.capture(); Expedition.status(); Realm.syncView(); Engine.saveGame();
  };
  const embark = Path.embark;
  Path.embark = function () {
    if (Path.getFreeSpace() < 0) { GameUI.toast('背包超重，请减少携带物资。', true); return; }
    if (!(Path.outfit?.['cured meat'] > 0)) { GameUI.toast('至少携带一份腌肉再出发。', true); return; }
    for (const [k, n] of Object.entries(Path.outfit)) if (n < 0 || n > (State.stores[k] || 0)) { GameUI.toast('携带物资超过库存，请重新整备。', true); return; }
    embark.call(Path); Expedition.capture(); Realm.syncView(); Engine.saveGame();
  };
  const arrival = Path.onArrival;
  Path.onArrival = function (...args) { arrival.apply(Path, args); Expedition.outfit(); };
  const outfit = Path.updateOutfitting;
  Path.updateOutfitting = function (...args) { outfit.apply(Path, args); Expedition.outfit(); };
  const home = World.goHome;
  World.goHome = function () {
    Expedition.transitioning = true; Expedition.stop();
    try { home.call(World); delete State.expedition; Expedition.safeState = null; }
    finally { Expedition.transitioning = false; }
    Realm.refresh(); Engine.saveGame();
  };
  const die = World.die;
  World.die = function () {
    if (World.dead) return;
    Expedition.stop(); Expedition.transitioning = true;
    const returned = {};
    if (State.realm.difficulty === 'comfortable') {
      if (World.state?.mask) State.game.world.mask = RealmCore.clone(World.state.mask);
      const retain = RealmCore.retain(State);
      for (const [k, n] of Object.entries(Path.outfit || {})) returned[k] = World.Weapons[k] ? n : Math.floor(n * retain);
      RealmCore.log(State, `救援队将你带回家园，取回装备与约 ${Math.round(retain * 100)}% 的随身物资。已探索的地图保留下来。`);
    }
    World.DEATH_COOLDOWN = State.realm.difficulty === 'classic' ? 120 : Math.max(10, 30 - RealmCore.level(State, 'clinic') * 5);
    $('#embarkButton').data('cooldown', World.DEATH_COOLDOWN);
    die.call(World);
    for (const [k, n] of Object.entries(returned)) State.stores[k] = (State.stores[k] || 0) + n;
    delete State.expedition; Expedition.safeState = null; Expedition.transitioning = false;
    Engine.saveGame(); setTimeout(() => { Realm.refresh(); }, 2700);
  };
  const clear = World.clearDungeon;
  World.clearDungeon = function () {
    const tile = World.state.map[World.curPos[0]][World.curPos[1]];
    World.state.origins ||= {}; World.state.origins[World.curPos.join(',')] = tile;
    clear.call(World);
  };
  const light = World.lightMap;
  World.lightMap = function (...args) {
    const original = World.LIGHT_RADIUS;
    World.LIGHT_RADIUS = 2 + (RealmCore.level(State, 'watchtower') > 0 ? 1 : 0) + (State.realm.techs.surveying ? 1 : 0);
    try { return light.apply(World, args); } finally { World.LIGHT_RADIUS = original; }
  };
  const fight = World.checkFight;
  World.checkFight = function () {
    if (World.getTerrain() === '#' && RealmCore.level(State, 'depot')) return;
    const original = World.FIGHT_CHANCE;
    if (State.realm.difficulty === 'comfortable') World.FIGHT_CHANCE = 0.15;
    try { fight.call(World); } finally { World.FIGHT_CHANCE = original; }
  };
  const supplies = World.useSupplies;
  World.useSupplies = function () {
    if (World.getTerrain() === '#' && RealmCore.level(State, 'roadworks')) {
      Expedition.roadMoves = (Expedition.roadMoves || 0) + 1;
      if (Expedition.roadMoves % 3 === 0) return true;
    }
    return supplies.call(World);
  };
  const worldUpdate = World.updateSupplies;
  World.updateSupplies = function (...args) { worldUpdate.apply(World, args); Expedition.status(); };
  const end = Events.endEvent;
  Events.endEvent = function (...args) {
    end.apply(Events, args);
    setTimeout(() => { if (!Events.activeEvent()) { Expedition.capture(); Engine.saveGame(); Realm.syncView(); } }, Events._PANEL_FADE + 30);
  };
  const start = Events.startEvent;
  Events.startEvent = function (...args) { Expedition.capture(); Expedition.stop(); return start.apply(Events, args); };
  const liftOff = Ship.liftOff;
  Ship.liftOff = function (...args) { const result = liftOff.apply(Ship, args); Realm.syncView(); return result; };
  const spaceCrash = Space.crash;
  if (spaceCrash) Space.crash = function (...args) { const result = spaceCrash.apply(Space, args); Realm.syncView(); setTimeout(() => Realm.syncView(), 350); return result; };
})();
