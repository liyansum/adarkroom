/* Validate imported/cloud data before legacy game code consumes it. MPL-2.0. */
(function (root) {
  root.SaveFormat = {
    validate(state) {
      const bad = message => { throw new Error(message); };
      if (!state || typeof state !== 'object' || Array.isArray(state)) bad('存档格式不正确');
      if (state.version !== undefined && (!Number.isFinite(state.version) || state.version > 1.3)) bad('不支持此游戏存档版本');
      if (state.realm?.version > 1) bad('请更新游戏后再载入这个存档');
      let count = 0;
      function walk(value, depth) {
        if (++count > 100000 || depth > 35) bad('存档结构过于复杂');
        if (typeof value === 'number' && !Number.isFinite(value)) bad('存档包含无效数字');
        if (!value || typeof value !== 'object') return;
        for (const key of Object.keys(value)) {
          if (['__proto__', 'prototype', 'constructor'].includes(key) || !/^[\p{L}\p{N}_ .,:/-]+$/u.test(key)) bad('存档包含无效字段');
          walk(value[key], depth + 1);
        }
      }
      walk(state, 0);
      const object = value => value && typeof value === 'object' && !Array.isArray(value);
      for (const category of ['game', 'stores', 'outfit', 'income', 'config', 'features', 'character', 'previous', 'playStats', 'realm', 'expedition']) {
        if (state[category] !== undefined && !object(state[category])) bad('存档分类格式不正确');
      }
      for (const dict of [state.stores, state.outfit, state.game?.buildings, state.game?.workers, state.realm?.buildings]) {
        if (dict !== undefined && (!object(dict) || Object.values(dict).some(n => !Number.isFinite(n) || n < 0))) bad('资源、建筑或人口数据不正确');
      }
      if (state.realm) {
        const r = state.realm;
        for (const key of ['districts', 'techs', 'projects']) if (r[key] !== undefined && !object(r[key])) bad('领地数据不正确');
        if (r.log !== undefined && (!Array.isArray(r.log) || r.log.some(e => !object(e) || typeof e.text !== 'string' || !Number.isFinite(e.time)))) bad('纪事数据不正确');
        if (r.difficulty !== undefined && !['comfortable', 'classic'].includes(r.difficulty)) bad('难度设置不正确');
        if (r.policy !== undefined && !['balanced', 'production', 'trade', 'military'].includes(r.policy)) bad('政策设置不正确');
        for (const [key, d] of Object.entries(r.districts || {})) {
          if (!object(d) || !Number.isInteger(d.x) || !Number.isInteger(d.y) || d.x < 0 || d.x > 60 || d.y < 0 || d.y > 60 || key !== `${d.x},${d.y}` || !['farm', 'mine', 'village', 'trade'].includes(d.type) || !Number.isInteger(d.level) || d.level < 1 || d.level > 3 || !Number.isInteger(d.guards) || d.guards < 0 || d.guards > 8 || typeof d.route !== 'boolean') bad('辖地数据不正确');
        }
      }
      const worlds = [state.game?.world, state.world, state.expedition?.world];
      for (const world of worlds) {
        if (!world?.map) continue;
        if (!Array.isArray(world.map) || world.map.length !== 61 || world.map.some(col => !Array.isArray(col) || col.length !== 61 || col.some(tile => typeof tile !== 'string' || !/^[AICS;,.#HVOYPWBFMU]!?$/.test(tile)))) bad('地图数据不正确');
        if (!Array.isArray(world.mask) || world.mask.length !== 61 || world.mask.some(col => !Array.isArray(col) || col.length !== 61 || col.some(v => ![true, false, 0, 1, null].includes(v)))) bad('地图迷雾数据不正确');
      }
      if (state.expedition) {
        const e = state.expedition;
        if (!e.world?.map || !object(e.outfit) || Object.values(e.outfit).some(n => !Number.isFinite(n) || n < 0) || !Array.isArray(e.position) || e.position.length !== 2 || e.position.some(n => !Number.isInteger(n) || n < 0 || n > 60) || !Number.isFinite(e.health) || e.health <= 0 || !Number.isFinite(e.water) || e.water < 0) bad('远征检查点不完整');
      }
      return state;
    },
    parse(text) {
      if (text.length > 1500000) throw new Error('存档过大');
      let state;
      try { state = JSON.parse(text); } catch { state = JSON.parse(Base64.decode(text.replace(/\s/g, ''))); }
      return this.validate(state);
    }
  };
})(globalThis);
