/* Integrates settlement progression with the original game. MPL-2.0. */
var Realm = {
  name: 'Realm', section: 'build', ready: false,
  init() {
    RealmCore.init(State);
    this.tab = Header.addLocation('家园建设', 'realm', this);
    this.panel = $('<div id="realmPanel" class="location"></div>').appendTo('#locationSlider');
    const top = GameUI.el('div'); top.id = 'realm-topbar';
    const title = GameUI.el('div', '从暗室到领邦', 'realm-brand');
    title.append(GameUI.el('small', '一簇火光，一片家园。'));
    top.append(title, GameUI.button('设置与帮助', () => this.settings()));
    document.getElementById('wrapper').prepend(top);
    const layout = GameUI.el('div'); layout.id = 'game-layout';
    const content = document.getElementById('content'); content.before(layout); layout.append(content);
    const sidebar = GameUI.el('aside'); sidebar.id = 'game-sidebar'; layout.append(sidebar);
    const news = GameUI.el('details'); news.id = 'news-panel'; news.open = true;
    news.append(GameUI.el('summary', '荒野纪事'));
    news.append(document.getElementById('notifications')); sidebar.append(news);
    const menu = document.querySelector('.menu'); menu.replaceChildren();
    const volume = GameUI.button(State.config.soundOn ? '关闭声音' : '开启声音', () => Engine.toggleVolume()); volume.classList.add('volume');
    const lights = GameUI.button(State.config.lightsOff ? '日间模式' : '夜间模式', () => Engine.turnLightsOff()); lights.classList.add('lightsOff');
    menu.append(volume, lights, GameUI.button('速度 ×1 / ×2', () => Engine.confirmHyperMode()), GameUI.button('存档', () => Cloud.panel()));
    const language = GameUI.el('select'); language.setAttribute('aria-label', '游戏语言');
    for (const [id, name] of Object.entries(langs)) { const option = GameUI.el('option', name); option.value = id; language.append(option); }
    language.value = lang;
    language.addEventListener('change', () => { Cloud.saveLocal(); const url = new URL(location.href); url.searchParams.set('lang', language.value); location.href = url; });
    const source = GameUI.el('a', 'GitHub'); source.href = 'https://github.com/liyansum/adarkroom'; source.target = '_blank'; source.rel = 'noopener'; menu.append(language, source);
    this.ready = true;
    this.refresh(); this.syncView();
    document.addEventListener('visibilitychange', () => { if (!document.hidden) this.tick(); });
    window.addEventListener('resize', () => this.syncView());
  },
  onArrival() { document.title = `${RealmCore.stages[State.realm.stage].name} · 从暗室到领邦`; this.render(); },
  unlocked() { return Number(State.game?.buildings?.hut) > 0 || State.realm.stage > 0; },
  syncView() {
    if (!this.ready) return;
    const mod = Engine.activeModule;
    document.querySelectorAll('.location').forEach(el => { el.style.display = mod?.panel?.[0] === el ? 'block' : 'none'; });
    document.getElementById('main').style.display = [World, Space].includes(mod) ? 'none' : 'block';
    document.getElementById('game-sidebar').hidden = [World, Space].includes(mod);
    document.getElementById('wrapper').classList.toggle('traveling', [World, Space].includes(mod));
    const spacePad = document.getElementById('space-pad');
    if (spacePad) spacePad.hidden = mod !== Space;
    if (mod === Space) Space.panel[0].style.zoom = Math.min(1, document.getElementById('content').clientWidth / 700);
    $('#location_realm').toggle(this.unlocked()).text(State.realm.pendingEvent ? '家园建设 · 新纪事' : '家园建设');
    $('#header .headerButton').removeClass('selected'); mod?.tab?.addClass('selected');
    if (![World, Space].includes(mod)) {
      const sidebar = document.getElementById('game-sidebar');
      for (const id of ['storesContainer', 'village', 'perks']) {
        const el = document.getElementById(id);
        if (el) { sidebar.prepend(el); el.style.display = id === 'village' && mod !== Outside ? 'none' : id === 'perks' && mod !== Path ? 'none' : 'block'; }
      }
    }
  },
  refresh() {
    if (!this.ready) return;
    if (Outside.tab) { Outside.updateVillage(); Outside.updateWorkersView(); Outside.updateVillageIncome(); }
    Room.updateStoresView(); Room.updateIncomeView(); Room.updateBuildButtons();
    if (Engine.activeModule === Path) Path.updateOutfitting();
    this.syncView();
    if (Engine.activeModule === this) this.render();
  },
  act(action) {
    RealmCore.advance(State); action(); RealmCore.checkVictory(State);
    this.refresh(); Engine.saveGame();
  },
  tick() {
    if (!window.State?.realm || !this.ready || Cloud.reloading) return;
    if (Engine.activeModule === Space || Engine.GAME_OVER) { State.realm.lastTick = Date.now(); return; }
    const result = RealmCore.advance(State);
    if (result.seconds) {
      $SM.fireUpdate('income', false);
      if (Engine.activeModule === this) this.render();
      this.syncView(); Engine.saveGame();
      if (result.seconds > 60) this.offline(result);
    }
  },
  offline(result) {
    if (!result || result.seconds < 60) return;
    const useful = Object.entries(result.delta).filter(([, n]) => Math.abs(n) >= 1);
    RealmCore.log(State, `离线结算 ${Math.floor(result.seconds / 60)} 分钟：${useful.length ? useful.map(([k, n]) => `${RealmCore.resources[k] || _(k)} ${n > 0 ? '+' : ''}${Math.floor(n)}`).join('，') : '原料不足，生产暂停'}。`);
    GameUI.toast(`离线生产已结算 ${Math.floor(result.seconds / 60)} 分钟，收支明细见建设纪事。`);
  },
  render() {
    const target = this.panel?.[0]; if (!target) return;
    // Preserve text selections and avoid replacing controls while the player uses them.
    if (target.contains(document.activeElement) && ['SELECT', 'INPUT'].includes(document.activeElement.tagName)) return;
    target.replaceChildren();
    const r = State.realm, stage = RealmCore.stages[r.stage], g = RealmCore.governance(State);
    const lead = GameUI.el('div', undefined, 'realm-lead');
    lead.append(GameUI.el('span', '家园 · ' + (r.stage + 1).toString().padStart(2, '0'), 'realm-eyebrow'), GameUI.el('h1', stage.name), GameUI.el('p', stage.narrative)); target.append(lead);
    const stats = GameUI.el('div', undefined, 'realm-stats');
    for (const [label, value] of [['人口', `${State.game.population || 0} / ${RealmCore.populationCap(State)}`], ['建设与驻军', `${RealmCore.staff(State)} 人`], ['空闲居民', `${RealmCore.freeWorkers(State)} 人`], ['辖地', `${RealmCore.countDistricts(State)} / ${RealmCore.districtLimit(State)}`], ['治安', `${g.security} / 100`], ['粮食消耗', `${g.grainCost.toFixed(1)} / 10秒`]]) {
      const cell = GameUI.el('div'); cell.append(GameUI.el('small', label), GameUI.el('strong', value)); stats.append(cell);
    } target.append(stats);
    const stock = GameUI.el('p', undefined, 'realm-stock');
    stock.textContent = Object.entries(RealmCore.resources).map(([k, name]) => `${name} ${Math.floor(State.stores[k] || 0)}`).join('　·　'); target.append(stock);
    const nav = GameUI.el('nav', undefined, 'realm-tabs'); nav.setAttribute('aria-label', '家园功能');
    for (const [id, name] of [['build', '建造'], ['districts', '领地'], ['research', '研究与工程'], ['chronicle', '纪事']]) {
      const b = GameUI.button(name, () => { this.section = id; this.render(); }); if (id === this.section) b.setAttribute('aria-current', 'page'); nav.append(b);
    } target.append(nav);
    if (this.section === 'build') this.renderBuild(target);
    if (this.section === 'districts') this.renderDistricts(target);
    if (this.section === 'research') this.renderResearch(target);
    if (this.section === 'chronicle') this.renderChronicle(target);
  },
  renderBuild(target) {
    const r = State.realm, next = RealmCore.stages[r.stage + 1];
    if (next) {
      const promotion = GameUI.el('section', undefined, 'realm-promotion');
      promotion.append(GameUI.el('h2', `下一步：${next.name}`));
      const requirements = RealmCore.stageRequirements(State);
      promotion.append(GameUI.el('p', requirements.map(x => `${x.met ? '✓' : '○'} ${x.text}`).join('　')));
      promotion.append(GameUI.el('p', GameUI.cost(next.cost), 'realm-muted'));
      promotion.append(GameUI.button(`晋级${next.name}`, () => this.act(() => RealmCore.upgrade(State)), requirements.some(x => !x.met) || !RealmCore.affordable(State, next.cost))); target.append(promotion);
    }
    target.append(GameUI.el('p', '建筑会自动安排居民工作。原有职业仍在村落页面分配；升级需要额外的空闲人口。', 'realm-muted'));
    const grid = GameUI.el('div', undefined, 'realm-grid');
    for (const [id, b] of Object.entries(RealmCore.buildings)) {
      if (b.stage > r.stage + 1) continue;
      const card = GameUI.el('article', undefined, 'realm-card'); card.dataset.building = id;
      const level = RealmCore.level(State, id), locked = b.stage > r.stage || (b.requires && !State.game.buildings[b.requires]);
      card.append(GameUI.el('h3', `${b.name} ${level ? '· ' + level + ' 级' : ''}`), GameUI.el('p', b.desc));
      if (id === 'housing') card.append(GameUI.el('p', `当前每级提供 ${RealmCore.stages[r.stage].housing} 人住房。`, 'realm-muted'));
      if (locked) card.append(GameUI.el('p', b.requires && !State.game.buildings[b.requires] ? `需要${_(b.requires)}` : `${RealmCore.stages[b.stage].name}阶段解锁`, 'realm-muted'));
      else if (level >= b.max) card.append(GameUI.el('p', '已完成全部升级', 'realm-muted'));
      else {
        const cost = RealmCore.buildingCost(State, id);
        card.append(GameUI.el('p', `${GameUI.cost(cost)}${b.staff ? ` · ${b.staff} 名居民` : ''}`, 'realm-cost'));
        card.append(GameUI.button(level ? '升级' : '建造', () => this.act(() => RealmCore.build(State, id)), !RealmCore.affordable(State, cost) || RealmCore.freeWorkers(State) < b.staff));
      }
      grid.append(card);
    } target.append(grid);
  },
  renderDistricts(target) {
    const r = State.realm;
    target.append(GameUI.el('p', '探索并清理据点，回城后投入物资重建。每处辖地初始占用 3 名建设工和 2 名守卫；驿站与运输道路让产出送回主城。'));
    const policies = GameUI.el('div', undefined, 'realm-actions');
    for (const [id, label] of [['balanced', '均衡发展'], ['production', '生产优先（产出 +20%）'], ['trade', '商贸优先（影响力 +50%）'], ['military', '军事优先（治安 +15，产出 -10%）']]) {
      const b = GameUI.button(label, () => this.act(() => { State.realm.policy = id; RealmCore.log(State, `施行政策：${label}。`); }), !RealmCore.level(State, 'council'));
      if (r.policy === id) b.classList.add('active'); policies.append(b);
    } target.append(policies);
    const grid = GameUI.el('div', undefined, 'realm-grid');
    for (const [key, d] of Object.entries(r.districts)) {
      const card = GameUI.el('article', undefined, 'realm-card');
      card.append(GameUI.el('h3', `${RealmCore.districtTypes[d.type].name} · ${d.level} 级`));
      card.append(GameUI.el('p', `坐标 ${d.x - 30}, ${d.y - 30} · 守卫 ${d.guards} 人 · ${d.route ? '运输已开通' : '等待道路'}`));
      const eff = RealmCore.districtEfficiency(State, d);
      card.append(GameUI.el('p', `基础产出 / 10秒：${GameUI.cost(RealmCore.districtTypes[d.type].output)} · 运输效率 ${Math.round(eff * 100)}%（另受等级、政策与粮食影响）`, 'realm-muted'));
      if (!d.route) {
        card.append(GameUI.el('p', '道路：木材 120 · 石料 80'));
        card.append(GameUI.button('修建运输道路', () => this.act(() => { RealmCore.improveDistrict(State, key, 'route'); this.connectRoad(d); }), !RealmCore.level(State, 'depot') || !RealmCore.affordable(State, { wood: 120, stone: 80 })));
      }
      if (d.level < 3) {
        const cost = { wood: 220 * d.level, stone: 100 * d.level, grain: 60 * d.level };
        card.append(GameUI.el('p', `升级：${GameUI.cost(cost)} · 3 名居民`));
        card.append(GameUI.button('升级辖地', () => this.act(() => RealmCore.improveDistrict(State, key, 'upgrade')), r.stage < d.level + 1 || RealmCore.freeWorkers(State) < 3 || !RealmCore.affordable(State, cost)));
      }
      card.append(GameUI.button('增派守卫', () => this.act(() => RealmCore.improveDistrict(State, key, 'guard')), !RealmCore.level(State, 'barracks') || d.guards >= 8 || RealmCore.freeWorkers(State) < 1));
      card.append(GameUI.button('召回守卫', () => this.act(() => RealmCore.improveDistrict(State, key, 'recall')), d.guards <= 0));
      const select = GameUI.el('select'); select.setAttribute('aria-label', '辖地经营方向');
      for (const [id, label] of [['balanced', '均衡经营'], ['production', '生产优先'], ['trade', '商贸优先']]) { const option = GameUI.el('option', label); option.value = id; select.append(option); }
      select.value = d.focus;
      select.addEventListener('change', () => { this.act(() => RealmCore.improveDistrict(State, key, select.value)); select.blur(); this.render(); });
      card.append(select); grid.append(card);
    }
    target.append(grid, GameUI.el('h2', '可发展的地点'));
    if (!State.game.world?.map) { target.append(GameUI.el('p', '获得指南针并踏上荒野之后，已发现的地点会出现在这里。', 'realm-muted')); return; }
    let n = 0;
    for (let x = 0; x < 61; x++) for (let y = 0; y < 61; y++) {
      if (r.districts[`${x},${y}`] || !RealmCore.candidate(State, x, y, true)) continue;
      const tile = State.game.world.map[x][y], diplomatic = ['O', 'Y'].includes(tile);
      const row = GameUI.el('article', undefined, 'realm-place');
      row.append(GameUI.el('strong', `${Expedition.tileName(tile)}（${x - 30}, ${y - 30}）`));
      if (diplomatic) {
        row.append(GameUI.el('p', '可亲自探索清理；建成使馆后，也可通过共同契约组织重建。', 'realm-muted'));
        const f = r.techs.diplomacy ? 0.75 : 1; const cost = { grain: 400 * f, influence: 180 * f, wood: 150 };
        row.append(GameUI.el('p', GameUI.cost(cost)));
        row.append(GameUI.button('交涉并纳入领地', () => this.act(() => RealmCore.claim(State, x, y, 'trade', true)), !RealmCore.level(State, 'embassy') || !RealmCore.level(State, 'council') || !RealmCore.affordable(State, cost) || RealmCore.freeWorkers(State) < 5 || RealmCore.countDistricts(State) >= RealmCore.districtLimit(State)));
      } else {
        const type = GameUI.el('select'); type.setAttribute('aria-label', '重建用途');
        for (const [id, d] of Object.entries(RealmCore.districtTypes)) { const o = GameUI.el('option', d.name); o.value = id; type.append(o); }
        if (['I', 'C', 'S'].includes(tile)) type.value = 'mine';
        row.append(type, GameUI.el('p', '木材 180 · 石料 60 · 粮食 40 · 5 名居民'));
        row.append(GameUI.button('重建为辖地', () => this.act(() => RealmCore.claim(State, x, y, type.value)), !RealmCore.level(State, 'council') || RealmCore.freeWorkers(State) < 5 || !RealmCore.affordable(State, { wood: 180, stone: 60, grain: 40 }) || RealmCore.countDistricts(State) >= RealmCore.districtLimit(State)));
      }
      target.append(row); n++;
    }
    if (!n) target.append(GameUI.el('p', '尚无可重建的地点。探索洞穴、房屋与城镇，清理后安全返回。', 'realm-muted'));
  },
  connectRoad(d) {
    const map = State.game.world.map, mask = State.game.world.mask;
    let [x, y] = [d.x, d.y];
    while (x !== 30 || y !== 30) {
      if (x !== 30) x += x < 30 ? 1 : -1; else y += y < 30 ? 1 : -1;
      if ([';', ',', '.', '#'].includes(map[x][y])) map[x][y] = '#';
      mask[x][y] = true;
    }
  },
  renderResearch(target) {
    target.append(GameUI.el('h2', '技术与经验'));
    if (!RealmCore.level(State, 'academy')) target.append(GameUI.el('p', '城镇阶段建成学院后开放研究。', 'realm-muted'));
    const grid = GameUI.el('div', undefined, 'realm-grid');
    for (const [id, t] of Object.entries(RealmCore.techs)) {
      const card = GameUI.el('article', undefined, 'realm-card');
      card.append(GameUI.el('h3', t.name), GameUI.el('p', t.desc), GameUI.el('p', GameUI.cost(t.cost), 'realm-muted'));
      card.append(GameUI.button(State.realm.techs[id] ? '已研究' : '研究', () => this.act(() => RealmCore.research(State, id)), !!State.realm.techs[id] || !RealmCore.level(State, 'academy') || !RealmCore.affordable(State, t.cost))); grid.append(card);
    } target.append(grid, GameUI.el('h2', '留下来的理由'));
    target.append(GameUI.el('p', State.realm.completed ? '八处聚落已经联合，公共工程全部落成。领邦的故事仍在继续，你可以继续扩张。' : '达到领邦阶段，联合 8 处辖地并完成三项公共工程，即可达成“留下建设”结局，之后仍可继续经营。'));
    for (const [id, p] of Object.entries(RealmCore.projects)) {
      const card = GameUI.el('article', undefined, 'realm-place');
      card.append(GameUI.el('h3', p.name), GameUI.el('p', p.desc), GameUI.el('p', `${RealmCore.stages[p.stage].name}阶段${p.districts ? ` · ${p.districts} 处辖地` : ''} · ${GameUI.cost(p.cost)}`, 'realm-muted'));
      card.append(GameUI.button(State.realm.projects[id] ? '工程已完成' : '建设工程', () => this.act(() => RealmCore.project(State, id)), !!State.realm.projects[id] || State.realm.stage < p.stage || RealmCore.countDistricts(State) < (p.districts || 0) || !RealmCore.affordable(State, p.cost))); target.append(card);
    }
    if (State.game.buildings['trading post'] && RealmCore.level(State, 'market')) {
      target.append(GameUI.el('h2', '市场大宗交易'));
      for (const [label, cost, reward] of [['粮食换腌肉', { grain: 40 }, { 'cured meat': 10 }], ['木材换毛皮', { wood: 100 }, { fur: 30 }], ['毛皮换布料', { fur: 60 }, { cloth: 10 }]]) target.append(GameUI.button(`${label}（${GameUI.cost(cost)} → ${GameUI.cost(reward)}）`, () => this.act(() => { RealmCore.pay(State, cost); for (const [k, v] of Object.entries(reward)) State.stores[k] = (State.stores[k] || 0) + v; }), !RealmCore.affordable(State, cost)));
    }
  },
  renderChronicle(target) {
    const event = RealmCore.events[State.realm.pendingEvent];
    if (event) {
      const card = GameUI.el('article', undefined, 'realm-promotion'); card.append(GameUI.el('h2', event.title), GameUI.el('p', event.text), GameUI.el('p', GameUI.cost(event.cost)));
      card.append(GameUI.button(event.accept, () => this.act(() => RealmCore.resolveEvent(State, true)), !RealmCore.affordable(State, event.cost)));
      card.append(GameUI.button('暂时婉拒', () => this.act(() => RealmCore.resolveEvent(State, false)))); target.append(card);
    }
    for (const entry of State.realm.log) { const row = GameUI.el('article', undefined, 'realm-log'); row.append(GameUI.el('small', GameUI.time(entry.time)), GameUI.el('p', entry.text)); target.append(row); }
    if (!State.realm.log.length) target.append(GameUI.el('p', '第一座新建筑落成时，这里将记下家园的故事。'));
  },
  settings() {
    if (Events.activeEvent()) { GameUI.toast('请先完成当前事件。'); return; }
    const d = GameUI.dialog('游玩设置');
    d.append(GameUI.el('p', '舒适模式扩大背包与携水量，失败保留地图探索并由救援队回收部分物资。经典难度保留原版探索损失；新增建筑和研究仍然生效。'));
    const select = GameUI.el('select'); select.setAttribute('aria-label', '探索难度');
    for (const [id, name] of [['comfortable', '舒适模式'], ['classic', '经典难度']]) { const o = GameUI.el('option', name); o.value = id; select.append(o); }
    select.value = State.realm.difficulty; select.disabled = Engine.activeModule === World || Engine.activeModule === Space;
    select.addEventListener('change', () => { this.act(() => { State.realm.difficulty = select.value; }); GameUI.toast('难度已保存。出发前请检查背包容量。'); }); d.append(select);
    if (select.disabled) d.append(GameUI.el('p', '返回家园后可调整难度。', 'realm-muted'));
    d.append(GameUI.el('h3', '建设与探索'));
    d.append(GameUI.el('p', '建造小屋后开放家园建设。晋级需要人口、建筑和辖地共同达标。粮食不足只会降低新增产业效率；已建领地不会自动消失。离线最多结算 8 小时，原料不足的产业自动暂停。'));
    d.append(GameUI.el('p', '地图可点击查看地点，用方向键、WASD 或屏幕方向按钮移动。驿站建成后可沿已探索道路自动行进，遇到事件或补给不足会停下。战斗或事件中断时恢复到进入前的远征检查点。'));
    d.append(GameUI.el('p', '账号进度每 30 秒尝试同步；离线时保存在本机。切换设备前可在账号面板点击立即同步。最近 5 次云端更新保留为历史备份。'));
    d.append(GameUI.button('账号与存档', () => Cloud.panel()));
  }
};

(function installRealm() {
  const originalInit = Engine.init;
  Engine.options.doubleTime = false;
  Engine.init = async function (options) {
    try { await Cloud.bootstrap(); }
    catch (e) { Cloud.bootError = e.message; }
    originalInit.call(Engine, options);
    Realm.init(); Realm.offline(Realm.offlineResult);
    Expedition.restore(); Cloud.start(); Realm.refresh();
  };
  Engine.loadGame = function () {
    try {
      const saved = localStorage.getItem(Cloud.key);
      window.State = saved ? SaveFormat.validate(JSON.parse(saved)) : {};
      $SM.updateOldState();
    } catch (e) {
      const raw = localStorage.getItem(Cloud.key);
      if (raw) localStorage.setItem(`${Cloud.key}:unreadable`, raw);
      window.State = {}; Cloud.bootError = '这份本机存档无法读取，原文件已保留。可在账号面板恢复云端历史或导入备份。';
      // Never replace a cloud save automatically after an invalid local load.
      Cloud.suspended = true;
    }
    State.version = 1.3; RealmCore.init(State);
    State.playStats ||= {}; State.playStats.audioAlertShown = true;
    Realm.offlineResult = RealmCore.advance(State);
  };
  Engine.saveGame = function () { Cloud.changed(); };
  Engine.exportImport = () => Cloud.panel();
  Engine.export64 = () => Base64.encode(JSON.stringify(Cloud.snapshot()));
  Engine.generateExport64 = Engine.export64;
  Engine.import64 = text => Cloud.apply(SaveFormat.parse(text), { ...Cloud.meta, dirty: true });
  Engine.confirmDelete = () => GameUI.confirm('重新开始', '当前进度会先保存为本机备份。周目奖励和设置会保留。', '重新开始', () => Cloud.apply(Cloud.newState(), { ...Cloud.meta, dirty: true }));
  Engine.deleteSave = () => Cloud.apply(Cloud.newState(), { ...Cloud.meta, dirty: true });
  Engine.isLightsOff = () => !!window.State?.config?.lightsOff;
  Engine.turnLightsOff = function () {
    State.config.lightsOff = !document.body.classList.contains('realm-dark');
    document.body.classList.toggle('realm-dark', State.config.lightsOff);
    $('.lightsOff').text(State.config.lightsOff ? '日间模式' : '夜间模式'); Engine.saveGame();
  };
  Engine.isMobile = () => false;
  Engine.disableSelection = Engine.enableSelection = () => { document.onselectstart = null; document.onmousedown = null; };
  Engine.updateSlider = Engine.updateOuterSlider = () => {};
  Engine.moveStoresView = () => {};
  Outside.scrollSidebar = Path.scrollSidebar = () => {};
  Engine.travelTo = function (module) {
    if (Events.activeEvent() || (Realm.ready && [World, Space].includes(Engine.activeModule)) || document.querySelector('dialog[open]')) return;
    Engine.activeModule = module; module.onArrival(0); Notifications.printQueue(module); Realm.syncView();
  };
  const keyDown = Engine.keyDown, keyUp = Engine.keyUp;
  const typing = e => $(e.target).closest('input,textarea,select,dialog').length || ($(e.target).closest('button').length && ![37, 38, 39, 40, 65, 68, 83, 87].includes(e.which));
  Engine.keyDown = function (e) { if (typing(e)) return; if ([37, 38, 39, 40].includes(e.which)) e.preventDefault(); return keyDown.call(Engine, e); };
  Engine.keyUp = function (e) { if (typing(e)) return; return keyUp.call(Engine, e); };
  // A single wall-clock simulation accounts for both visible and background production.
  $SM.collectIncome = function () { Realm.tick(); Engine._incomeTimeout = setTimeout($SM.collectIncome, 1000); };
  const originalGatherers = Outside.getNumGatherers;
  Outside.getNumGatherers = function () { return window.State?.realm ? RealmCore.freeWorkers(State) : originalGatherers.call(Outside); };
  Outside.getMaxPopulation = function () { return window.State?.realm ? RealmCore.populationCap(State) : $SM.get('game.buildings.hut', true) * 4; };
  const title = Outside.setTitle;
  Outside.setTitle = function () { title.call(Outside); if (State.realm?.stage > 0) $('#location_outside').text(RealmCore.stages[State.realm.stage].name); };
  const killVillagers = Outside.killVillagers;
  Outside.killVillagers = function (n) {
    if (State.realm?.difficulty === 'comfortable') n = Math.floor(Math.min(n, Math.max(1, (State.game.population || 0) * 0.1)) * Math.max(0.2, 0.75 - RealmCore.level(State, 'clinic') * 0.15 - RealmCore.level(State, 'walls') * 0.1));
    killVillagers.call(Outside, n);
    // Drop original job assignments if casualties leave too few residents for both systems.
    let excess = Math.max(0, RealmCore.staff(State) + Object.values(State.game.workers).reduce((a, b) => a + b, 0) - State.game.population);
    for (const job of Object.keys(State.game.workers)) { const n = Math.min(excess, State.game.workers[job]); State.game.workers[job] -= n; excess -= n; }
  };
  const destroyHuts = Outside.destroyHuts;
  if (destroyHuts) Outside.destroyHuts = function (n, allowEmpty) { if (State.realm?.difficulty === 'comfortable' && (RealmCore.level(State, 'well') || RealmCore.level(State, 'walls'))) { Notifications.notify(null, '居民及时扑灭火势，保住了房屋。'); return 0; } return destroyHuts.call(Outside, n, allowEmpty); };
  const getCapacity = Path.getCapacity, getWater = World.getMaxWater;
  Path.getCapacity = () => RealmCore.capacity(State, getCapacity.call(Path));
  World.getMaxWater = () => RealmCore.water(State, getWater.call(World));
  // Only gate the advertisement events; original story events are preserved.
  Events.Marketing = [];
  const initSpace = Space.init;
  Space.init = function (...args) { const result = initSpace.apply(Space, args); Expedition.spaceControls(); Realm.syncView(); return result; };
})();
