/* Settlement simulation, shared by the browser and deterministic Node tests. MPL-2.0. */
(function (root) {
  'use strict';
  const buildings = {
    lumberyard: { name: '伐木场', stage: 0, max: 3, staff: 2, cost: { wood: 80 }, output: { wood: 7 }, desc: '组织伐木，每级每 10 秒产出 7 木材。' },
    quarry: { name: '采石场', stage: 0, max: 3, staff: 2, cost: { wood: 100 }, output: { stone: 5 }, desc: '开采建设城镇所需的石料，每级每 10 秒产出 5 石料。' },
    farm: { name: '农田', stage: 1, max: 3, staff: 3, cost: { wood: 160, stone: 30 }, output: { grain: 8 }, desc: '每级每 10 秒产出 8 粮食，供居民、驻军与外交使用。' },
    well: { name: '水井', stage: 0, max: 3, staff: 0, cost: { wood: 80 }, desc: '每级增加 5 点远征携水量，降低火灾损失。' },
    granary: { name: '粮仓', stage: 1, max: 3, staff: 0, cost: { wood: 180, stone: 50 }, desc: '每级提高农田产量 10%，保障粮食周转。库存无需扩容。' },
    housing: { name: '民居街区', stage: 1, max: 3, staff: 0, cost: { wood: 200, stone: 80 }, desc: '随聚落阶段提升住房容量；升级街区可容纳更多居民。' },
    market: { name: '市场', stage: 1, max: 3, staff: 2, cost: { wood: 220, stone: 80 }, input: { grain: 2 }, output: { fur: 4, influence: 0.5 }, desc: '每级每 10 秒以 2 粮食换取 4 毛皮和 0.5 影响力；开放大宗交易。' },
    depot: { name: '驿站', stage: 1, max: 3, staff: 1, cost: { wood: 200, stone: 60, leather: 20 }, desc: '提高辖地产出与运输效率，提供道路自动行进和据点补给。' },
    clinic: { name: '医馆', stage: 1, max: 3, staff: 2, cost: { wood: 250, stone: 100, fur: 50 }, desc: '每级降低灾害伤亡和远征物资损失；舒适模式下提供救援。' },
    watchtower: { name: '瞭望塔', stage: 1, max: 3, staff: 1, cost: { wood: 200, stone: 100 }, desc: '每级增加 10 治安；建成后探索视野增加一格。' },
    walls: { name: '城墙', stage: 2, max: 3, staff: 0, cost: { wood: 400, stone: 300, iron: 30 }, desc: '每级增加 10 治安，并减轻袭击损失。' },
    barracks: { name: '兵营', stage: 2, max: 3, staff: 3, cost: { wood: 350, stone: 180, iron: 40 }, desc: '组织巡逻与领地驻军，每级增加 8 治安。' },
    council: { name: '议事厅', stage: 1, max: 3, staff: 1, cost: { wood: 300, stone: 120 }, output: { influence: 1 }, desc: '每级每 10 秒积累 1 影响力，开放政策与领地重建。' },
    academy: { name: '学院', stage: 2, max: 3, staff: 3, cost: { wood: 450, stone: 250, iron: 40 }, input: { grain: 2 }, output: { influence: 2 }, desc: '开放农业、测绘、后勤、医学、冶金和外交研究。' },
    forge: { name: '精炼工坊', stage: 2, max: 3, staff: 2, cost: { wood: 350, stone: 180, iron: 60 }, input: { iron: 2, coal: 2 }, output: { steel: 3 }, desc: '每级每 10 秒将 2 铁、2 煤加工成 3 钢；需要原版炼钢坊。', requires: 'steelworks' },
    roadworks: { name: '道路工坊', stage: 2, max: 3, staff: 2, cost: { wood: 300, stone: 200, iron: 20 }, desc: '减少辖地运输距离带来的损耗，提高道路旅行效率。' },
    embassy: { name: '使馆', stage: 3, max: 3, staff: 2, cost: { wood: 600, stone: 400, steel: 40 }, desc: '可与已发现的废弃城镇交涉，用粮食和影响力换取加入。' },
    beacon: { name: '边境烽火台', stage: 3, max: 3, staff: 2, cost: { wood: 500, stone: 350, steel: 30 }, desc: '每级增加 8 治安，并增加辖地数量上限。' }
  };
  const stages = [
    { name: '营地', cap: 20, housing: 0, narrative: '火光照着几间小屋。人们开始相信，明天仍会有一个可以回来的地方。' },
    { name: '村落', cap: 80, housing: 16, population: 16, required: { lumberyard: 1, well: 1 }, cost: { wood: 200, stone: 40 }, narrative: '小径两旁升起炊烟。陌生人放下行囊，开始称这里为家。' },
    { name: '城镇', cap: 200, housing: 48, population: 60, required: { council: 1, farm: 2, housing: 1 }, districts: 1, cost: { wood: 900, stone: 400, grain: 200, influence: 40 }, narrative: '集市的叫卖声盖过风声。驿路把远方的矿场与家园连接起来。' },
    { name: '要塞城市', cap: 500, housing: 160, population: 150, required: { walls: 2, barracks: 2, academy: 1 }, districts: 3, cost: { wood: 2500, stone: 1400, iron: 300, grain: 700, influence: 180 }, narrative: '城墙上的守卫看见车队归来。城门内，工坊、学堂和民居延伸到视线之外。' },
    { name: '领邦', cap: 1000, housing: 350, population: 350, required: { embassy: 1, academy: 2, beacon: 1 }, districts: 6, cost: { wood: 6000, stone: 3500, steel: 400, grain: 1800, influence: 650 }, narrative: '从边境烽火到城中灯火，许多聚落共享同一条道路。你的决定已经影响一整片土地。' }
  ];
  const techs = {
    agriculture: { name: '轮作与灌溉', cost: { grain: 200, influence: 50 }, desc: '农田产量提高 25%。' },
    surveying: { name: '荒野测绘', cost: { wood: 300, influence: 60 }, desc: '探索视野再增加一格；地图显示地点距离。' },
    logistics: { name: '车队后勤', cost: { iron: 80, leather: 80, influence: 80 }, desc: '背包再增加 20 容量，辖地运输效率提高。' },
    medicine: { name: '战地医疗', cost: { fur: 150, influence: 90 }, desc: '舒适模式远征再减少 10% 物资损失。' },
    metallurgy: { name: '高炉冶炼', cost: { iron: 150, coal: 100, influence: 100 }, desc: '精炼工坊产量提高 25%。' },
    diplomacy: { name: '共同契约', cost: { grain: 300, influence: 120 }, desc: '降低交涉成本 25%，提高贸易政策的影响力收益。' }
  };
  const projects = {
    aqueduct: { name: '跨城引水渠', stage: 3, cost: { stone: 2500, iron: 250, grain: 800 }, desc: '农田产量再提高 25%，携水量增加 20。' },
    highway: { name: '领邦商道', stage: 3, cost: { stone: 3000, wood: 2000, influence: 300 }, districts: 4, desc: '所有辖地运输效率提高，建立一条贯通边境的商路。' },
    archive: { name: '旧世档案馆', stage: 4, cost: { stone: 2000, steel: 300, influence: 600 }, desc: '影响力产出提高 30%，保存这个时代重建的历史。' }
  };
  const resources = { stone: '石料', grain: '粮食', influence: '影响力' };
  const districtTypes = {
    farm: { name: '农庄', output: { grain: 14 } },
    mine: { name: '矿区', output: { iron: 5, coal: 3 } },
    village: { name: '附属村落', output: { wood: 12, fur: 5 } },
    trade: { name: '贸易站', output: { grain: 5, influence: 2, leather: 3 } }
  };
  const clone = value => JSON.parse(JSON.stringify(value));
  const number = value => Number.isFinite(value) ? Math.max(0, value) : 0;
  function init(state, now = Date.now()) {
    state.stores ||= {}; state.game ||= {}; state.game.buildings ||= {}; state.game.workers ||= {}; state.income ||= {};
    state.config ||= {};
    const fresh = !state.realm;
    state.realm ||= { version: 1, stage: number(state.game.population) > 20 ? 1 : 0 };
    const r = state.realm;
    if (r.version > 1) throw new Error('此存档来自更新版本，请更新游戏');
    r.version = 1;
    r.stage = Math.min(4, Math.floor(number(r.stage)));
    for (const key of ['buildings', 'districts', 'techs', 'projects']) r[key] ||= {};
    r.log ||= [];
    r.policy ||= 'balanced';
    r.lastTick = Number.isFinite(r.lastTick) ? Math.min(now, r.lastTick) : now;
    r.seconds = number(r.seconds);
    r.eventClock = number(r.eventClock);
    r.difficulty ||= 'comfortable';
    if (fresh && number(state.game.population) > 0) log(state, '新的规划铺在桌上。这片家园还有许多可以建设的地方。', now);
    return r;
  }
  const level = (s, id) => number(s.realm?.buildings?.[id]);
  const countDistricts = s => Object.keys(s.realm.districts).length;
  function log(s, text, now = Date.now()) { s.realm.log.unshift({ text, time: now }); s.realm.log = s.realm.log.slice(0, 40); }
  function populationCap(s) { const stage = stages[s.realm.stage]; return Math.min(stage.cap, number(s.game.buildings.hut) * 4 + level(s, 'housing') * stage.housing); }
  function staff(s) {
    return Object.entries(buildings).reduce((n, [id, b]) => n + b.staff * level(s, id), 0) + Object.values(s.realm.districts).reduce((n, d) => n + d.level * 3 + number(d.guards), 0);
  }
  function freeWorkers(s) { return Math.max(0, number(s.game.population) - Object.values(s.game.workers).reduce((n, v) => n + number(v), 0) - staff(s)); }
  const affordable = (s, cost) => Object.entries(cost).every(([k, v]) => number(s.stores[k]) + 1e-8 >= v);
  function pay(s, cost) { if (!affordable(s, cost)) throw new Error('物资不足'); for (const [k, v] of Object.entries(cost)) s.stores[k] = Math.max(0, number(s.stores[k]) - v); }
  function buildingCost(s, id) { const b = buildings[id]; if (!b) throw new Error('建筑不存在'); return Object.fromEntries(Object.entries(b.cost).map(([k, v]) => [k, Math.ceil(v * Math.pow(2.2, level(s, id)))])); }
  function build(s, id) {
    const b = buildings[id];
    if (!b || s.realm.stage < b.stage || level(s, id) >= b.max || (b.requires && !s.game.buildings[b.requires])) throw new Error('尚未满足建筑条件');
    if (freeWorkers(s) < b.staff) throw new Error('空闲人口不足，请从原有岗位释放一些工人');
    pay(s, buildingCost(s, id));
    s.realm.buildings[id] = level(s, id) + 1;
    log(s, `${b.name}升至 ${level(s, id)} 级。${b.staff ? '工人已经开始就位。' : '聚落有了新的变化。'}`);
  }
  function stageRequirements(s) {
    const next = stages[s.realm.stage + 1];
    if (!next) return [];
    const requirements = [{ text: `人口 ${next.population}`, met: number(s.game.population) >= next.population }];
    for (const [id, n] of Object.entries(next.required)) requirements.push({ text: `${buildings[id].name} ${n} 级`, met: level(s, id) >= n });
    if (next.districts) requirements.push({ text: `辖地 ${next.districts} 处`, met: countDistricts(s) >= next.districts });
    return requirements;
  }
  function upgrade(s) {
    const next = stages[s.realm.stage + 1];
    if (!next || stageRequirements(s).some(r => !r.met)) throw new Error('晋级条件尚未达成');
    pay(s, next.cost); s.realm.stage++; log(s, `聚落晋级为${next.name}。${next.narrative}`);
  }
  function research(s, id) {
    const t = techs[id];
    if (!t || !level(s, 'academy') || s.realm.techs[id]) throw new Error('尚不能研究这项技术');
    pay(s, t.cost); s.realm.techs[id] = true; log(s, `完成研究：${t.name}。${t.desc}`);
  }
  function project(s, id) {
    const p = projects[id];
    if (!p || s.realm.projects[id] || s.realm.stage < p.stage || countDistricts(s) < (p.districts || 0)) throw new Error('工程条件尚未达成');
    pay(s, p.cost); s.realm.projects[id] = true; log(s, `${p.name}完工。${p.desc}`); checkVictory(s);
  }
  const districtLimit = s => 2 + s.realm.stage * 2 + level(s, 'beacon') * 2;
  function candidate(s, x, y, allowUncleared = false) {
    const world = s.game.world;
    const tile = world?.map?.[x]?.[y];
    return Boolean(world?.mask?.[x]?.[y] && (tile === 'P' || (['I', 'C', 'S'].includes(tile) && world[{ I: 'ironmine', C: 'coalmine', S: 'sulphurmine' }[tile]]) || (allowUncleared && ['O', 'Y'].includes(tile))));
  }
  function claim(s, x, y, type = 'village', diplomatic = false) {
    const key = `${x},${y}`;
    if (!Number.isInteger(x) || !Number.isInteger(y) || !districtTypes[type] || s.realm.districts[key] || !level(s, 'council') || countDistricts(s) >= districtLimit(s) || !candidate(s, x, y, diplomatic)) throw new Error('暂时无法纳入这处领地');
    if (freeWorkers(s) < 5) throw new Error('需要 5 名空闲居民：3 名建设工和 2 名守卫');
    if (diplomatic && !level(s, 'embassy')) throw new Error('需要先建造使馆');
    const factor = s.realm.techs.diplomacy ? 0.75 : 1;
    pay(s, diplomatic ? { grain: 400 * factor, influence: 180 * factor, wood: 150 } : { wood: 180, stone: 60, grain: 40 });
    s.realm.districts[key] = { x, y, type, level: 1, guards: 2, focus: 'balanced', route: false };
    if (diplomatic) s.game.world.map[x][y] = 'P';
    log(s, `${districtTypes[type].name}（${x - 30}, ${y - 30}）${diplomatic ? '签署共同契约，加入你的领地' : '开始重建'}。修建运输道路后即可向主城供给。`);
    checkVictory(s);
  }
  function improveDistrict(s, key, action) {
    const d = s.realm.districts[key]; if (!d) throw new Error('辖地不存在');
    if (action === 'route') {
      if (d.route || !level(s, 'depot')) throw new Error('需要驿站，且道路尚未修建');
      pay(s, { wood: 120, stone: 80 }); d.route = true;
    } else if (action === 'upgrade') {
      if (d.level >= 3 || s.realm.stage < d.level + 1) throw new Error('请先提升聚落阶段');
      if (freeWorkers(s) < 3) throw new Error('需要 3 名空闲居民');
      pay(s, { wood: 220 * d.level, stone: 100 * d.level, grain: 60 * d.level }); d.level++;
    } else if (action === 'guard') {
      if (d.guards >= 8 || !level(s, 'barracks') || freeWorkers(s) < 1) throw new Error('需要兵营及空闲人口；每处最多 8 名守卫');
      d.guards++;
    } else if (action === 'recall') { if (d.guards <= 0) throw new Error('没有可撤回的守卫'); d.guards--; }
    else if (['balanced', 'production', 'trade'].includes(action)) d.focus = action;
    else throw new Error('不支持的辖地操作');
    log(s, `${districtTypes[d.type].name}（${d.x - 30}, ${d.y - 30}）${({ route: '运输道路开通', upgrade: '完成升级', guard: '增派一名守卫', recall: '召回一名守卫', balanced: '调整为均衡经营', production: '调整为生产优先', trade: '调整为商贸优先' })[action]}。`);
  }
  function governance(s) {
    const districts = Object.values(s.realm.districts);
    const security = Math.min(100, Math.max(10, 45 + level(s, 'walls') * 10 + level(s, 'watchtower') * 10 + level(s, 'barracks') * 8 + level(s, 'beacon') * 8 + (s.realm.policy === 'military' ? 15 : 0) - districts.length * 4));
    return { security, grainCost: level(s, 'farm') ? number(s.game.population) / 100 + districts.reduce((n, d) => n + d.guards / 5, 0) : 0, connected: districts.filter(d => d.route).length };
  }
  function districtEfficiency(s, d) {
    if (!d.route) return 0;
    const distance = Math.abs(d.x - 30) + Math.abs(d.y - 30);
    return Math.min(1.5, Math.max(0.25, 1 - distance * 0.008 + level(s, 'depot') * 0.08 + level(s, 'roadworks') * 0.07 + (s.realm.techs.logistics ? 0.15 : 0) + (s.realm.projects.highway ? 0.2 : 0))) * Math.min(1, 0.65 + d.guards * 0.1);
  }
  function process(s, input, output, multiplier = 1) {
    const cost = Object.fromEntries(Object.entries(input || {}).map(([k, v]) => [k, v * multiplier]));
    if (!affordable(s, cost)) return false;
    pay(s, cost);
    for (const [k, v] of Object.entries(output || {})) s.stores[k] = Math.min(99999999999999, number(s.stores[k]) + v * multiplier);
    return true;
  }
  function production(s) {
    if (!number(s.game.population)) return;
    const r = s.realm;
    const g = governance(s);
    const fed = number(s.stores.grain) >= g.grainCost;
    s.stores.grain = Math.max(0, number(s.stores.grain) - g.grainCost);
    const staffed = Math.min(1, number(s.game.population) / Math.max(1, staff(s) + Object.values(s.game.workers).reduce((n, v) => n + number(v), 0)));
    const common = (fed ? 1 : 0.75) * staffed * (r.policy === 'production' ? 1.2 : r.policy === 'military' ? 0.9 : 1);
    for (const [id, b] of Object.entries(buildings)) {
      const n = level(s, id); if (!n || !b.output) continue;
      let bonus = 1;
      if (id === 'farm') bonus += level(s, 'granary') * 0.1 + (r.techs.agriculture ? 0.25 : 0) + (r.projects.aqueduct ? 0.25 : 0);
      if (id === 'forge' && r.techs.metallurgy) bonus += 0.25;
      const output = Object.fromEntries(Object.entries(b.output).map(([k, v]) => [k, v * bonus * (k === 'influence' ? (r.policy === 'trade' ? (r.techs.diplomacy ? 1.7 : 1.5) : 1) * (r.projects.archive ? 1.3 : 1) : 1)]));
      process(s, b.input, output, n * common);
    }
    for (const d of Object.values(r.districts)) {
      const output = { ...districtTypes[d.type].output };
      if (d.focus === 'trade') { for (const k of Object.keys(output)) output[k] *= 0.65; output.influence = (output.influence || 0) + 2; }
      if (d.focus === 'production') for (const k of Object.keys(output)) if (k !== 'influence') output[k] *= 1.25;
      process(s, {}, output, d.level * districtEfficiency(s, d) * common * (g.security < 40 ? 0.8 : 1));
    }
  }
  function advance(s, now = Date.now()) {
    const r = init(s, now);
    const elapsed = Math.floor((now - r.lastTick) / 1000);
    if (elapsed <= 0) return { seconds: 0, delta: {} };
    const seconds = Math.min(8 * 3600, elapsed);
    const before = { ...s.stores };
    const speed = s.config.hyperMode ? 2 : 1;
    for (let i = 0; i < seconds * speed; i++) {
      // Recompute gatherers so new buildings and assigned workers cannot produce twice.
      if (s.income.gatherer) s.income.gatherer.stores.wood = freeWorkers(s);
      for (const [source, income] of Object.entries(s.income)) {
        if (!income || !income.stores) continue;
        income.timeLeft = (Number.isFinite(income.timeLeft) ? income.timeLeft : 0) - 1;
        if (income.timeLeft > 0) continue;
        const costs = {}, outputs = {};
        for (const [k, v] of Object.entries(income.stores)) {
          if (!Number.isFinite(v)) continue;
          if (v < 0) costs[k] = -v; else outputs[k] = v;
        }
        if (source === 'thieves') {
          for (const [k, v] of Object.entries(costs)) { const n = Math.min(number(s.stores[k]), v); s.stores[k] = number(s.stores[k]) - n; s.game.stolen ||= {}; s.game.stolen[k] = number(s.game.stolen[k]) + n; }
        } else process(s, costs, outputs);
        income.timeLeft = Math.max(1, number(income.delay));
      }
      r.seconds++;
      if (r.seconds >= 10) { r.seconds -= 10; production(s); }
      if (r.stage >= 1 && !r.pendingEvent) {
        r.eventClock++;
        if (r.eventClock >= 240) {
          r.eventClock = 0;
          const index = Math.floor(number(r.eventIndex)) % 5;
          r.eventIndex = index + 1;
          r.pendingEvent = ['refugees', 'caravan', 'harvest', 'scholar', 'border'][index];
        }
      }
    }
    r.lastTick = elapsed > seconds ? now : r.lastTick + seconds * 1000;
    const delta = {};
    for (const k of new Set([...Object.keys(before), ...Object.keys(s.stores)])) { const n = number(s.stores[k]) - number(before[k]); if (Math.abs(n) >= 0.01) delta[k] = Math.round(n * 100) / 100; }
    return { seconds, delta };
  }
  const events = {
    refugees: { title: '城门外的行囊', text: '几名流民沿着烟柱找到这里。他们愿意留下，帮助建设这个聚落。', cost: { grain: 30 }, accept: '提供食宿，接纳居民' },
    caravan: { title: '远方的商队', text: '商人需要木材修补车轴，愿意用皮革和毛皮交换。', cost: { wood: 100 }, accept: '交换物资' },
    harvest: { title: '丰收的提议', text: '农夫希望修整田埂，把这季的经验留给下一季。', cost: { stone: 40 }, accept: '修整农田' },
    scholar: { title: '旧书与新字', text: '一位旅人带来几本残缺的旧书。他愿意在这里讲述外面世界的经验。', cost: { grain: 40 }, accept: '款待旅人' },
    border: { title: '边境的篝火', text: '巡逻队在远处发现陌生营火。派人交涉，也许能把猜疑化为一条新的商路。', cost: { grain: 50 }, accept: '派出使者' }
  };
  function resolveEvent(s, accept) {
    const id = s.realm.pendingEvent, e = events[id]; if (!e) return;
    if (accept) {
      if (id === 'refugees' && number(s.game.population) >= populationCap(s)) throw new Error('住房已满，请先建设民居');
      pay(s, e.cost);
      if (id === 'refugees') s.game.population = Math.min(populationCap(s), number(s.game.population) + 6);
      if (id === 'caravan') process(s, {}, { leather: 25, fur: 40 });
      if (id === 'harvest') process(s, {}, { grain: 100 + level(s, 'farm') * 50 });
      if (id === 'scholar') process(s, {}, { influence: 40 });
      if (id === 'border') process(s, {}, { influence: governance(s).security >= 60 ? 70 : 35 });
      log(s, `${e.title}：${e.accept}，聚落的故事又多了一页。`);
    } else log(s, `${e.title}：你决定暂时保留物资。生活继续。`);
    delete s.realm.pendingEvent;
  }
  function checkVictory(s) {
    if (s.realm.stage === 4 && countDistricts(s) >= 8 && Object.keys(s.realm.projects).length >= 3 && !s.realm.completed) {
      s.realm.completed = true; log(s, '领邦建立：八处聚落的使者来到议事厅。道路、流水与文字把这片土地连接在一起。你选择留下，故事仍将继续。');
    }
  }
  const capacity = (s, vanilla) => (s.realm.difficulty === 'classic' ? vanilla : vanilla * 2) + (s.realm.techs.logistics ? 20 : 0);
  const water = (s, vanilla) => Math.floor(vanilla * (s.realm.difficulty === 'classic' ? 1 : 1.5)) + level(s, 'well') * 5 + (s.realm.projects.aqueduct ? 20 : 0);
  const retain = s => s.realm.difficulty === 'classic' ? 0 : Math.min(0.9, 0.5 + level(s, 'clinic') * 0.1 + (s.realm.techs.medicine ? 0.1 : 0));
  const api = { buildings, stages, techs, projects, resources, districtTypes, events, init, clone, log, level, countDistricts, populationCap, staff, freeWorkers, affordable, pay, buildingCost, build, stageRequirements, upgrade, research, project, districtLimit, candidate, claim, improveDistrict, governance, districtEfficiency, production, advance, resolveEvent, capacity, water, retain, checkVictory };
  root.RealmCore = api;
})(typeof globalThis !== 'undefined' ? globalThis : window);
