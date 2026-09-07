/* Small accessible text interface; no external assets. MPL-2.0. */
var GameUI = {
  el(tag, text, className) {
    const el = document.createElement(tag);
    if (text !== undefined) el.textContent = text;
    if (className) el.className = className;
    return el;
  },
  button(text, action, disabled = false) {
    const b = this.el('button', text, 'realm-button'); b.type = 'button'; b.disabled = disabled;
    b.addEventListener('click', async () => {
      if (b.disabled) return;
      b.disabled = true;
      try { await action(); } catch (e) { GameUI.toast(e.message, true); }
      finally { b.disabled = disabled; }
    });
    return b;
  },
  toast(text, error = false) {
    let box = document.getElementById('realm-toast');
    if (!box) { box = this.el('div'); box.id = 'realm-toast'; box.setAttribute('role', 'status'); document.body.append(box); }
    box.textContent = text; box.className = error ? 'error' : ''; box.hidden = false;
    clearTimeout(this.toastTimer); this.toastTimer = setTimeout(() => { box.hidden = true; }, 7000);
  },
  dialog(title) {
    document.querySelectorAll('dialog').forEach(d => { d.close(); d.remove(); });
    const dialog = this.el('dialog', undefined, 'realm-dialog');
    const heading = this.el('h2', title); heading.id = 'dialog-title'; dialog.setAttribute('aria-labelledby', heading.id);
    const close = this.button('关闭', () => { dialog.close(); dialog.remove(); Engine.keyLock = !!Events.activeEvent(); }); close.classList.add('dialog-close');
    dialog.append(heading, close); document.body.append(dialog);
    Engine.keyLock = true;
    dialog.addEventListener('close', () => { Engine.keyLock = !!Events.activeEvent() || !!document.querySelector('dialog[open]'); dialog.remove(); });
    dialog.showModal();
    return dialog;
  },
  confirm(title, message, label, action) {
    const d = this.dialog(title); d.append(this.el('p', message));
    d.append(this.button(label, async () => { await action(); if (d.isConnected) d.close(); }));
    return d;
  },
  field(form, label, name, type = 'text') {
    const wrap = this.el('label', label);
    const input = this.el('input'); input.name = name; input.type = type; input.required = true;
    input.autocomplete = name === 'username' ? 'username' : name === 'password' ? 'current-password' : 'off';
    wrap.append(input); form.append(wrap); return input;
  },
  cost(cost) { return Object.entries(cost).map(([k, n]) => `${RealmCore.resources[k] || _(k)} ${Math.round(n * 100) / 100}`).join(' · '); },
  time(value) { return value ? new Date(value).toLocaleString('zh-CN', { hour12: false }) : '尚未保存'; },
  summary(state) {
    if (!state) return '空存档';
    return `${(RealmCore.stages[state.realm?.stage || 0] || RealmCore.stages[0]).name} · 人口 ${state.game?.population || 0} · 辖地 ${Object.keys(state.realm?.districts || {}).length}`;
  }
};
