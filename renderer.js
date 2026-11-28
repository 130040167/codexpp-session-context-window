codexPlus.extension({ inject: { sessionContext: { required: false }, 'codexpp.sessionContext': { required: false }, 'codexpp.usage': { required: false } }, apply(ctx) {
  const currentApi = ctx.get('sessionContext');
  const api = currentApi ?? ctx.get('codexpp.sessionContext');
  if (!api) return;
  const zh = () => (ctx.locale.current || document.documentElement.lang || 'en').startsWith('zh');
  const t = (cn, en) => zh() ? cn : en;
  const format = (value) => new Intl.NumberFormat(zh() ? 'zh-CN' : 'en-US').format(value);
  const compact = (value) => {
    if (value < 1000) return String(value);
    const fraction = String(value % 1000).padStart(3, '0').replace(/0+$/, '');
    return `${Math.trunc(value / 1000)}${fraction ? `.${fraction}` : ''}K`;
  };
  const parseWindow = (text) => {
    const match = /^(\d+)(?:\.(\d+))?\s*([km])?$/i.exec(text.trim());
    if (!match) return null;
    const places = match[3]?.toLowerCase() === 'm' ? 6 : match[3] ? 3 : 0;
    const fraction = (match[2] ?? '').replace(/0+$/, '');
    if (fraction.length > places) return null;
    const value = Number(match[1]) * 10 ** places + Number(fraction.padEnd(places, '0'));
    return Number.isSafeInteger(value) && value > 0 ? value : null;
  };
  const native = '[data-codex-composer-root] span[role="img"]:is([aria-label^="上下文用量"],[aria-label^="Context usage"],[aria-label^="Context window"],[aria-label^="Context used"])';
  const status = '#codex-plus-usage-statusline [data-usage="context"]';
  const targets = '[data-cx-context-target]';
  const isPickerSelection = (target) => target.closest?.('[role="menuitemradio"]')
    && document.querySelector('[data-model-picker-view]');
  let panel = null;
  let anchor = null;
  const make = (tag, name = '', text) => {
    const node = document.createElement(tag);
    node.dataset.codexPlusExt = 'session-context-window';
    node.className = name;
    if (text !== undefined) node.textContent = text;
    return node;
  };
  const close = () => {
    if (!panel) return;
    panel.remove(); panel = null;
    if (anchor?.isConnected) anchor.focus({ preventScroll: true });
    anchor = null;
  };
  const open = (button) => {
    let selected = api.read();
    if (!selected) return;
    close(); anchor = button;
    const dialog = panel = make('dialog', 'cx-context-panel');
    dialog.id = 'cx-context-panel'; dialog.setAttribute('aria-labelledby', 'cx-context-heading');
    const form = make('form', 'cx-context-form');
    const header = make('div', 'cx-context-head');
    const heading = make('h2', '', t('上下文窗口', 'Context window')); heading.id = 'cx-context-heading';
    const reset = make('button', 'cx-context-reset'); reset.type = 'button';
    reset.title = t('恢复默认', 'Reset to default'); reset.setAttribute('aria-label', reset.title);
    reset.innerHTML = '<svg viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="1.75" stroke-linecap="round" stroke-linejoin="round" aria-hidden="true"><path d="M3 12a9 9 0 1 1 2.6 6.4M3 6v6h6"/></svg>';
    header.append(heading, reset);
    const input = make('input', 'cx-context-input min-w-0 border text-default outline-none placeholder:text-tertiary aria-invalid:border-text-danger aria-invalid:ring-2 aria-invalid:ring-text-danger/20 disabled:cursor-not-allowed disabled:text-secondary w-full h-9 rounded-md bg-primary-soft px-2.5 text-sm focus:border-ring disabled:bg-text/5 border-primary-outline');
    input.id = 'cx-context-window'; input.type = 'text'; input.spellcheck = false; input.autocomplete = 'off';
    input.placeholder = '400K';
    input.setAttribute('aria-label', t('上下文窗口大小（tokens）', 'Context window size (tokens)'));
    input.setAttribute('aria-describedby', 'cx-context-default cx-context-error');
    const defaults = make('div', 'cx-context-default'); defaults.id = 'cx-context-default';
    const defaultValue = make('span', '', t('正在读取默认窗口…', 'Reading the default window…'));
    const scope = make('span', '', t('仅对本会话中的此模型生效', 'This chat and model only'));
    scope.id = 'cx-context-scope';
    defaults.append(defaultValue, ' · ', scope);
    const error = make('div', 'cx-context-error'); error.setAttribute('role', 'alert'); error.hidden = true;
    error.id = 'cx-context-error';
    const footer = make('div', 'cx-context-footer');
    const buttonStyle = 'no-drag cursor-interaction disabled:cursor-default focus:outline-hidden disabled:opacity-40 focus-visible:ring-2 focus-visible:ring-ring whitespace-nowrap border rounded-button-action border-default px-4 py-1.5 text-base leading-[18px]';
    const cancel = make('button', `${buttonStyle} bg-primary-soft-alpha hover:bg-primary-ghost-hover`, t('取消', 'Cancel')); cancel.type = 'button'; cancel.onclick = close;
    const save = make('button', `${buttonStyle} bg-primary-solid not-disabled:hover:bg-text/80 text-primary-solid`, t('应用', 'Apply')); save.type = 'submit'; footer.append(cancel, save);
    let verified = false;
    let edited = false;
    const sync = (busy) => {
      input.disabled = !selected.threadId || busy;
      save.disabled = input.disabled || !verified;
      reset.disabled = save.disabled || selected.override === null;
    };
    const showError = (reason) => {
      error.textContent = String(reason?.message || reason);
      error.hidden = false;
    };
    const apply = async (value) => {
      sync(true); error.hidden = true;
      try {
        const result = await api.set(selected.threadId, selected.model, value);
        if (result?.status === 'deferred') ctx.toast(t('已保存，下次发送前应用。', 'Saved. Applies before the next message.'));
        if (panel === dialog) close();
      }
      catch (reason) { if (panel === dialog) { showError(reason); sync(false); } }
    };
    input.oninput = () => {
      edited = true;
      input.removeAttribute('aria-invalid');
      if (verified) error.hidden = true;
    };
    reset.onclick = () => void apply(null);
    form.onsubmit = (event) => {
      event.preventDefault();
      if (save.disabled) return;
      const value = parseWindow(input.value);
      if (value !== null) { void apply(value); return; }
      input.setAttribute('aria-invalid', 'true');
      showError(t('请输入正整数 token 数，或使用 K、M，例如 400K 或 1.2M。', 'Enter a positive token count, or use K or M (for example, 400K or 1.2M).'));
      input.focus();
    };
    input.value = compact(selected.config.model_context_window);
    sync(false);
    form.append(header, make('div', 'cx-context-model', selected.label), input, defaults, error, footer);
    dialog.append(form); document.body.append(dialog); dialog.showModal();
    if (input.disabled) cancel.focus(); else { input.focus(); input.select(); }
    dialog.addEventListener('cancel', (event) => { event.preventDefault(); close(); });
    dialog.addEventListener('click', (event) => { if (event.target === dialog) close(); });
    void api.refresh().then((latest) => {
      if (panel !== dialog) return;
      if (!latest || latest.threadId !== selected.threadId || latest.model !== selected.model) { close(); return; }
      selected = latest;
      verified = true;
      if (!edited) {
        const value = compact(latest.config.model_context_window);
        if (input.value !== value) { input.value = value; if (document.activeElement === input) input.select(); }
      }
      defaultValue.textContent = t(`默认 ${compact(latest.defaultWindow)}`, `Default ${compact(latest.defaultWindow)}`);
      defaultValue.title = `${format(latest.defaultWindow)} tokens`;
      if (!selected.threadId) defaults.append(t(' · 首条消息发出后可修改', ' · Editable after the first message'));
      sync(false);
    }).catch((reason) => {
      if (panel !== dialog) return;
      defaultValue.textContent = t('未能读取默认窗口', 'Default window unavailable');
      showError(reason);
    });
  };
  const paint = () => {
    const current = api.read();
    const usage = current?.threadId ? ctx.get('codexpp.usage')?.cached(current.threadId) : null;
    const effective = current?.effectiveWindow ?? current?.config.model_context_window;
    const observed = usage?.modelContextWindow;
    const percent = effective && observed && usage?.context != null && (usage.context < 100 || effective <= observed)
      ? Math.round(Math.min(100, usage.context * observed / effective)) : null;
    for (const button of document.querySelectorAll(targets)) {
      const selector = button.dataset.cxContextTarget === 'native' ? native : status;
      if (!current || !button.previousElementSibling?.matches(selector)) button.remove();
    }
    if (current) for (const target of document.querySelectorAll(`${native},${status}`)) {
      let button = target.nextElementSibling?.matches(targets) ? target.nextElementSibling : null;
      if (!button && !target.getClientRects().length) continue;
      if (!button) {
        button = make('button', 'cx-context-target'); button.type = 'button';
        button.dataset.cxContextTarget = target.matches(status) ? 'status' : 'native';
        button.setAttribute('aria-haspopup', 'dialog');
        const ring = make('span', 'cx-context-ring'); ring.setAttribute('aria-hidden', 'true'); button.append(ring);
        if (target.matches(status)) button.append(make('span', 'cx-context-value'));
        target.after(button);
      }
      const title = t(`上下文设置 · ${format(effective)} tokens`, `Context settings · ${format(effective)} tokens`);
      if (button.title !== title) { button.title = title; button.setAttribute('aria-label', title); }
      const fill = `${percent ?? 0}%`;
      if (button.style.getPropertyValue('--cx-context-fill') !== fill) button.style.setProperty('--cx-context-fill', fill);
      const value = button.querySelector('.cx-context-value');
      const text = percent === null ? compact(effective) : `${percent}% · ${compact(effective)}`;
      if (value && value.textContent !== text) value.textContent = text;
    }
    if (panel && !anchor?.isConnected) close();
  };
  ctx.effect(() => {
    const style = make('style'); style.id = 'codex-plus-ext-session-context-window-style';
    style.textContent = `
      ${native}:has(+ ${targets}), ${status}:has(+ ${targets}){display:none!important}
      .cx-context-target{display:inline-flex;align-items:center;justify-content:center;gap:4px;border:0;background:none;color:var(--color-token-text-secondary,var(--codex-plus-muted));min-width:20px;height:20px;padding:0 3px;border-radius:5px;font:inherit;cursor:pointer;white-space:nowrap}
      .cx-context-target[data-cx-context-target="status"]{height:17px;min-width:77px;padding:0 2px;font-variant-numeric:tabular-nums}
      .cx-context-target:hover,.cx-context-reset:hover,.cx-context-cancel:hover{background:var(--color-token-bg-tertiary,var(--codex-plus-bg-hover,rgba(127,127,127,.14)))}
      .cx-context-ring{display:block;flex:0 0 12px;width:12px;height:12px;border-radius:50%;background:conic-gradient(currentColor var(--cx-context-fill),color-mix(in srgb,currentColor 28%,transparent) 0);mask:radial-gradient(transparent 48%,#000 54%)}
      #cx-context-panel{position:fixed;inset:0;margin:auto;box-sizing:border-box;width:min(420px,92vw);height:fit-content;max-height:calc(100vh - 24px);padding:0;border:0;border-radius:var(--radius-3xl,25px);color:var(--color-text,var(--color-token-text-primary));background:color-mix(in oklab,var(--color-surface-elevated-secondary,var(--codex-plus-bg-elevated)) 90%,transparent);box-shadow:0 0 0 .5px var(--color-border,var(--codex-plus-border)),var(--shadow-lg,0 4px 8px -2px #0002);backdrop-filter:blur(24px);font:inherit;overflow:auto}
      .cx-context-panel::backdrop{background:rgba(0,0,0,.20)}
      .cx-context-form{display:grid;gap:8px;padding:20px;font-size:13px}
      .cx-context-head,.cx-context-footer{display:flex;align-items:center;gap:12px;min-width:0}
      .cx-context-head{justify-content:space-between}.cx-context-head h2{margin:0;font-size:20px;line-height:28px;font-weight:600}
      .cx-context-model,.cx-context-default{color:var(--color-text-secondary,var(--codex-plus-muted));margin:0;overflow-wrap:anywhere}
      .cx-context-default{font-size:12px}.cx-context-model{margin-top:4px}
      .cx-context-input{font-variant-numeric:tabular-nums}
      .cx-context-footer{justify-content:flex-end;margin-top:4px;flex-wrap:wrap}
      .cx-context-reset{width:24px;height:24px;display:grid;place-items:center;padding:0;border:0;border-radius:4px;background:none;color:inherit;cursor:pointer}.cx-context-reset svg{width:16px;height:16px}
      .cx-context-reset:focus-visible,.cx-context-target:focus-visible{outline:2px solid var(--color-ring,currentColor);outline-offset:1px}
      .cx-context-reset:disabled{opacity:.4;cursor:default}.cx-context-error{color:var(--color-text-danger,#d63939);overflow-wrap:anywhere}
    `;
    document.head.append(style);
    return () => { close(); document.querySelectorAll(targets).forEach((button) => button.remove()); style.remove(); };
  });
  ctx.listen(document, 'click', (event) => {
    const button = event.target.closest?.(targets);
    if (button) { event.preventDefault(); open(button); }
  }, true);
  let cancelSelectionPaint;
  const afterPickerSelection = () => {
    cancelSelectionPaint?.();
    // The model options can be in a separate portal. Native commit and ring remount
    // are not necessarily in the same frame, so repaint after the picker closes.
    let remaining = 10;
    const renderSelection = () => {
      paint();
      if (--remaining) cancelSelectionPaint = ctx.setTimeout(renderSelection, 100);
    };
    cancelSelectionPaint = ctx.setTimeout(renderSelection, 0);
  };
  ctx.listen(window, 'pointerdown', (event) => {
    if (isPickerSelection(event.target)) afterPickerSelection();
  }, true);
  ctx.listen(window, 'keydown', (event) => {
    if (!panel?.contains(event.target)) {
      if ((event.key === 'Enter' || event.key === ' ') && isPickerSelection(event.target)) afterPickerSelection();
      return;
    }
    event.stopPropagation();
    if (event.key === 'Escape') { event.preventDefault(); close(); }
  }, true);
  ctx.listen(window, 'focus', () => { void api.refresh().then(paint).catch((reason) => ctx.fail(reason)); });
  ctx.on(currentApi ? 'sessionContext/changed' : 'session-context/changed', paint);
  ctx.onScan(paint, { phase: 'light' });
  paint();
} });
