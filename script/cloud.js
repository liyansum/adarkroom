/* Account-isolated local saves and optimistic cloud synchronization. MPL-2.0. */
var Cloud = {
  user: null, key: 'adr:guest', meta: {}, dirty: false, ready: false, suspended: false, reloading: false,
  async api(path, method = 'GET', data) {
    const response = await fetch(`/api/${path}`, {
      method, credentials: 'same-origin', cache: 'no-store', signal: AbortSignal.timeout(12000),
      headers: { 'Content-Type': 'application/json', 'X-ADR-Request': '1' },
      body: data === undefined ? undefined : JSON.stringify(data)
    });
    let result;
    try { result = await response.json(); } catch { throw new Error('账号服务不可用，请使用 Workers 启动游戏'); }
    if (!response.ok) throw Object.assign(new Error(result.error || '请求失败'), { status: response.status, result });
    return result;
  },
  read(key) {
    try { const value = localStorage.getItem(key); return value ? JSON.parse(value) : null; }
    catch { return null; }
  },
  write(key, data) { localStorage.setItem(key, JSON.stringify(data)); },
  async bootstrap() {
    if (!localStorage.getItem('adr:migrated')) {
      const legacy = localStorage.getItem('gameState');
      if (legacy && !localStorage.getItem('adr:guest')) localStorage.setItem('adr:guest', legacy);
      localStorage.setItem('adr:migrated', '1');
    }
    try {
      const { user } = await this.api('me'); this.user = user;
      this.write('adr:active-user', user);
    } catch {
      this.user = this.read('adr:active-user'); this.suspended = true;
    }
    this.key = this.user ? `adr:user:${this.user.id}` : 'adr:guest';
    this.meta = this.read(`${this.key}:meta`) || { version: 0 };
    if (this.user && !this.suspended) {
      try {
        const remote = await this.api('save');
        const local = this.read(this.key);
        if (!local && remote.state) { this.write(this.key, SaveFormat.validate(remote.state)); this.meta = { version: remote.version, updatedAt: remote.updatedAt }; }
        else if (local && remote.version !== (this.meta.version || 0)) this.conflict = remote;
        else if (!remote.state) this.dirty = true;
      } catch (e) { this.suspended = true; this.bootError = e.message; }
    }
    this.write(`${this.key}:meta`, this.meta);
    this.dirty ||= Boolean(this.meta.dirty);
  },
  snapshot() {
    if (window.Expedition && window.State) Expedition.capture();
    return JSON.parse(JSON.stringify(State));
  },
  saveLocal() {
    if (!this.ready || this.reloading) return;
    try {
      this.write(this.key, this.snapshot()); this.dirty = true;
      this.meta.dirty = true; this.write(`${this.key}:meta`, this.meta);
    } catch (e) { this.status('本地保存失败，请导出备份'); if (!this.storageError) { GameUI.toast('浏览器存储空间不足，请打开存档面板导出备份。', true); this.storageError = true; } }
  },
  changed() {
    if (!this.ready || this.reloading) return;
    if (!this.localTimer) this.localTimer = setTimeout(() => { this.localTimer = null; this.saveLocal(); }, 180);
  },
  status(text) { const el = document.getElementById('cloud-status'); if (el) el.textContent = text; },
  updateStatus() {
    this.status(this.conflict ? '存档有冲突 · 点击处理' : this.suspended ? '离线保存中 · 点击重连' : this.user ? `${this.user.username} · ${this.meta.updatedAt ? '云端 ' + new Date(this.meta.updatedAt).toLocaleTimeString('zh-CN', { hour12: false }) : '等待同步'}` : '游客 · 本地保存');
  },
  async sync() {
    if (!this.ready || this.reloading || !this.user || this.suspended || this.conflict || this.syncing || !this.dirty) return;
    this.syncing = true; this.saveLocal();
    const state = this.snapshot(); const encoded = JSON.stringify(state);
    try {
      const result = await this.api('save', 'PUT', { version: this.meta.version || 0, state });
      this.meta = { ...result, dirty: JSON.stringify(this.snapshot()) !== encoded };
      this.dirty = this.meta.dirty; this.write(`${this.key}:meta`, this.meta);
    } catch (e) {
      if (e.status === 409) this.conflict = e.result;
      else if (e.status === 401) this.suspended = true;
      else this.status('云同步失败 · 已保存在本机');
    } finally { this.syncing = false; this.updateStatus(); }
  },
  async reconnect() {
    const { user } = await this.api('me');
    if (!user || user.id !== this.user?.id) { this.authDialog(); return; }
    const remote = await this.api('save'); this.suspended = false;
    if (remote.version !== this.meta.version) { this.conflict = remote; this.conflictDialog(); }
    else await this.sync();
    this.updateStatus();
  },
  apply(state, meta) {
    SaveFormat.validate(state);
    this.saveLocal();
    this.write(`${this.key}:before-restore`, this.read(this.key));
    this.reloading = true;
    this.write(this.key, state); this.write(`${this.key}:meta`, meta);
    location.reload();
  },
  newState() {
    return { version: 1.3, previous: RealmCore.clone(State.previous || {}), config: RealmCore.clone(State.config || {}), realm: { version: 1, difficulty: State.realm.difficulty } };
  },
  conflictDialog() {
    if (!this.conflict) return;
    const remote = this.conflict;
    const d = GameUI.dialog('选择继续游玩的进度');
    d.append(GameUI.el('p', '另一台设备更新了云存档。自动同步已暂停，两份进度都保留着。'));
    d.append(GameUI.el('p', `本机：${GameUI.summary(State)}`));
    d.append(GameUI.el('p', `云端：${GameUI.summary(remote.state)} · ${GameUI.time(remote.updatedAt)}`));
    d.append(GameUI.button('使用云端进度', () => this.apply(remote.state || {}, { version: remote.version, updatedAt: remote.updatedAt })));
    d.append(GameUI.button('保留本机进度并更新云端', async () => {
      this.saveLocal();
      const state = this.snapshot(), encoded = JSON.stringify(state);
      try {
        const result = await this.api('save', 'PUT', { version: remote.version, state });
        this.dirty = JSON.stringify(this.snapshot()) !== encoded;
        this.meta = { ...result, dirty: this.dirty }; this.conflict = null; this.write(`${this.key}:meta`, this.meta); this.updateStatus(); d.close();
      } catch (e) {
        if (e.status === 409) { this.conflict = e.result; this.conflictDialog(); }
        else throw e;
      }
    }));
    d.append(GameUI.button('先导出本机备份', () => this.download()));
  },
  authDialog(mode = 'login') {
    if (Events.activeEvent()) { GameUI.toast('请先完成当前事件，再管理账号。'); return; }
    const d = GameUI.dialog(mode === 'register' ? '为家园建立账号' : mode === 'recover' ? '用恢复码重设密码' : '登录并继续建设');
    const nav = GameUI.el('div', undefined, 'realm-actions');
    for (const [id, name] of [['login', '登录'], ['register', '注册'], ['recover', '恢复账号']]) nav.append(GameUI.button(name, () => this.authDialog(id), mode === id));
    d.append(nav);
    const form = GameUI.el('form');
    const username = GameUI.field(form, '用户名', 'username'); username.minLength = 3; username.maxLength = 32;
    const password = GameUI.field(form, mode === 'recover' ? '新密码（8—128 位）' : '密码（8—128 位）', 'password', 'password'); password.minLength = 8; password.maxLength = 128;
    password.autocomplete = mode === 'login' ? 'current-password' : 'new-password';
    if (mode === 'recover') GameUI.field(form, '注册时保存的恢复码', 'recoveryCode');
    const status = GameUI.el('p', '', 'form-error'); status.setAttribute('role', 'alert');
    const submit = GameUI.el('button', mode === 'register' ? '注册账号' : mode === 'recover' ? '重设密码' : '登录', 'realm-button'); submit.type = 'submit';
    form.append(status, submit); d.append(form);
    d.append(GameUI.el('p', mode === 'register' ? '仅需用户名和密码。注册后提供一次性恢复码；当前游客进度会关联到新账号。' : '登录后可在不同设备继续游戏。本机其他账号与游客存档会分别保留。', 'realm-muted'));
    form.addEventListener('submit', async event => {
      event.preventDefault(); if (!form.reportValidity() || submit.disabled) return;
      submit.disabled = true; status.textContent = '正在处理…';
      try {
        this.saveLocal(); const guest = this.user ? null : this.snapshot();
        const data = Object.fromEntries(new FormData(form));
        data.passwordKey = await AuthKey.derive(data.username, data.password); delete data.password;
        const result = await this.api(mode, 'POST', data);
        const key = `adr:user:${result.user.id}`;
        if (mode === 'register' && guest && !this.read(key)) { this.write(key, guest); this.write(`${key}:meta`, { version: 0, dirty: true }); }
        this.write('adr:active-user', result.user);
        this.reloading = true;
        if (result.recoveryCode) {
          d.close(); const codeDialog = GameUI.dialog('请保存账号恢复码');
          codeDialog.querySelector('.dialog-close').remove();
          codeDialog.addEventListener('cancel', e => e.preventDefault());
          codeDialog.append(GameUI.el('p', '忘记密码时可凭此码找回账号。恢复码只显示这一次；使用后会生成新的恢复码。'));
          const code = GameUI.el('textarea'); code.value = result.recoveryCode; code.readOnly = true; code.setAttribute('aria-label', '恢复码'); codeDialog.append(code);
          codeDialog.append(GameUI.button('复制恢复码', async () => { await navigator.clipboard.writeText(result.recoveryCode); GameUI.toast('恢复码已复制'); }));
          codeDialog.append(GameUI.button('已保存，进入游戏', () => location.reload()));
        } else location.reload();
      } catch (e) { status.textContent = e.message; submit.disabled = false; }
    });
    username.focus();
  },
  download() {
    const state = this.snapshot();
    const url = URL.createObjectURL(new Blob([JSON.stringify(state, null, 2)], { type: 'application/json' }));
    const a = document.createElement('a'); a.href = url; a.download = `暗室领邦-${new Date().toISOString().slice(0, 10)}.json`; a.click(); setTimeout(() => URL.revokeObjectURL(url), 2000);
  },
  async panel() {
    if (Events.activeEvent()) { GameUI.toast('请先完成当前事件，再管理存档。'); return; }
    if (this.conflict) { this.conflictDialog(); return; }
    const d = GameUI.dialog('账号与存档');
    d.append(GameUI.el('p', this.user ? `当前账号：${this.user.username}` : '游客模式：进度保存在这台设备上。'));
    if (!this.user) d.append(GameUI.button('注册 / 登录', () => this.authDialog()));
    else {
      d.append(GameUI.button(this.suspended ? '重新连接云端' : '立即同步', async () => { if (this.suspended) await this.reconnect(); else { await this.sync(); if (this.conflict) this.conflictDialog(); } }));
      d.append(GameUI.button('退出账号', async () => { await this.sync(); if (this.conflict) { this.conflictDialog(); return; } await this.api('logout', 'POST', {}); this.saveLocal(); this.reloading = true; this.write('adr:active-user', null); location.reload(); }));
    }
    d.append(GameUI.button('下载存档备份', () => this.download()));
    const importBox = GameUI.el('details'); importBox.append(GameUI.el('summary', '导入原版或扩展版存档'));
    const file = GameUI.el('input'); file.type = 'file'; file.accept = '.json,.txt'; file.setAttribute('aria-label', '选择存档文件');
    const area = GameUI.el('textarea'); area.placeholder = '粘贴原版导出码或 JSON 存档'; area.setAttribute('aria-label', '存档内容');
    file.addEventListener('change', async () => { if (file.files[0]) area.value = await file.files[0].text(); });
    importBox.append(file, area, GameUI.button('检查并导入', () => {
      const state = SaveFormat.parse(area.value.trim());
      GameUI.confirm('导入存档', `将使用：${GameUI.summary(state)}。当前进度会额外保留一份本机备份。`, '导入并继续', () => this.apply(state, { ...this.meta, dirty: true }));
    })); d.append(importBox);
    const beforeRestore = this.read(`${this.key}:before-restore`);
    if (beforeRestore) d.append(GameUI.button('恢复上一次替换前的本机备份', () => GameUI.confirm('恢复本机备份', GameUI.summary(beforeRestore), '恢复', () => this.apply(beforeRestore, { ...this.meta, dirty: true }))));
    if (this.user && !this.suspended) {
      const title = GameUI.el('h3', '最近 5 次云端历史'); d.append(title);
      try {
        const { backups } = await this.api('backups');
        if (!backups.length) d.append(GameUI.el('p', '首次同步后，后续保存会自动保留历史。'));
        for (const row of backups) d.append(GameUI.button(`恢复版本 ${row.version} · ${GameUI.time(row.created_at)}`, async () => {
          const backup = await this.api(`backups/${row.version}`);
          GameUI.confirm('恢复历史进度', GameUI.summary(backup.state), '使用此备份', () => this.apply(backup.state, { ...this.meta, dirty: true }));
        }));
      } catch (e) { d.append(GameUI.el('p', e.message, 'form-error')); }
    }
    d.append(GameUI.button('重新开始', () => GameUI.confirm('重新开始', '当前进度会保留一份本机备份。新游戏保留周目奖励和设置，并使用同一账号继续同步。', '确认开始新游戏', () => this.apply(this.newState(), { ...this.meta, dirty: true }))));
  },
  start() {
    this.ready = true;
    const bar = document.getElementById('realm-topbar');
    const b = GameUI.button('', () => this.panel()); b.id = 'cloud-status'; bar.append(b); this.updateStatus();
    this.saveLocal();
    this.timer = setInterval(() => this.sync(), 30000);
    window.addEventListener('pagehide', () => this.saveLocal());
    document.addEventListener('visibilitychange', () => { if (document.hidden) { this.saveLocal(); this.sync(); } });
    window.addEventListener('online', () => { if (this.user) this.reconnect().catch(() => this.updateStatus()); });
    if (this.conflict) setTimeout(() => this.conflictDialog(), 600);
    if (this.bootError) GameUI.toast(this.bootError, true);
    if (this.user && !this.suspended && !this.conflict) this.sync();
  }
};
