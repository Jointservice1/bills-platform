(() => {
  'use strict';
  const $ = (s, el = document) => el.querySelector(s);
  const $$ = (s, el = document) => Array.from(el.querySelectorAll(s));

  const supportEmailHint = $('#support-phone-email');
  const supportPhoneLink = $('.foot a[href^="tel:"]');
  const isMobile = /Android|iPhone|iPad|iPod|Mobile/i.test(navigator.userAgent)
    || (navigator.platform === 'MacIntel' && navigator.maxTouchPoints > 1);
  if (supportEmailHint && supportPhoneLink && !isMobile) {
    supportPhoneLink.addEventListener('click', (event) => {
      event.preventDefault();
      supportEmailHint.hidden = false;
      $('a', supportEmailHint).focus();
    });
  }

  const help = $('#help-chat');
  if (help?.showModal) {
    const launcher = $('.help-launcher');
    const input = $('.help-form input', help);
    const log = $('.help-log', help);
    const email = $('template', help);
    const answers = JSON.parse(help.dataset.answers).map(([question, answer, pattern]) => ({
      question, answer, pattern: new RegExp(pattern, 'i'),
    }));

    function reply(question) {
      const normalized = question.trim().toLowerCase().replace(/[^a-z0-9]+/g, ' ').trim();
      if (!normalized) return;
      const match = answers.find((item) => item.question === question)
        || answers.find((item) => item.pattern.test(normalized));
      const message = document.createElement('p');
      message.className = 'help-user';
      message.textContent = question;
      const answer = document.createElement('p');
      answer.textContent = match?.answer || 'I couldn’t find an answer to that question.';
      if (!match && email) answer.append(' ', email.content.cloneNode(true));
      log.append(message, answer);
      log.scrollTop = log.scrollHeight;
    }

    launcher.addEventListener('click', () => help.showModal());
    $('[data-help-close]', help).addEventListener('click', () => help.close());
    help.addEventListener('close', () => launcher.focus());
    $$('[data-help-question]', help).forEach((button) => {
      button.addEventListener('click', () => reply(button.textContent));
    });
    $('.help-form', help).addEventListener('submit', (event) => {
      event.preventDefault();
      reply(input.value.trim());
      input.value = '';
    });
    launcher.hidden = false;
  }

  const numericValues = new WeakMap();
  const numericWarnings = new WeakMap();
  const numericFields = 'input[data-digit-limit], input[type=number]';
  let warningCount = 0;
  function showNumericWarning(input, message) {
    let warning = numericWarnings.get(input);
    if (!warning && message) {
      warning = document.createElement('small');
      warning.className = 'numeric-warning';
      warning.id = `numeric-warning-${++warningCount}`;
      warning.setAttribute('role', 'status');
      (input.closest('label') || input.parentElement).append(warning);
      numericWarnings.set(input, warning);
      const describedBy = input.getAttribute('aria-describedby');
      input.setAttribute('aria-describedby', [describedBy, warning.id].filter(Boolean).join(' '));
    }
    if (warning) warning.textContent = message;
    input.classList.toggle('numeric-limit', Boolean(message));
  }
  document.addEventListener('focusin', (e) => {
    if (e.target.matches(numericFields)) numericValues.set(e.target, e.target.value);
  });
  document.addEventListener('input', (e) => {
    const input = e.target;
    if (!input.matches(numericFields)) return;
    const limit = Number(input.dataset.digitLimit);
    let value = input.value;
    let message = '';
    if (limit) {
      value = value.replace(/[\s()-]/g, '');
      if (input.hasAttribute('data-local-phone')) {
        value = value.replace(/^\+234(?=\d)|^234(?=\d{9,10}$)/, '0');
      }
      if (!/^\d*$/.test(value) && !(input.hasAttribute('data-local-phone') && /^\+\d*$/.test(value))) {
        message = 'Enter digits only.';
      } else if (value.replace(/\D/g, '').length > limit) {
        message = `Maximum ${limit} digits. Check the number you entered.`;
      }
    } else if (input.validity.rangeOverflow) {
      message = `Maximum value is ${Number(input.max).toLocaleString('en-NG')}.`;
    }
    if (message) input.value = numericValues.get(input) ?? input.defaultValue;
    else {
      if (input.value !== value) input.value = value;
      numericValues.set(input, value);
    }
    showNumericWarning(input, message);
  }, true);
  const naira = (n) => `₦${Number(n).toLocaleString('en-NG', { maximumFractionDigits: 2 })}`;

  // Prevent double payment: disable the button on first submit.
  $$('form[data-once]').forEach((f) => f.addEventListener('submit', (e) => {
    const b = e.submitter || $('button', f);
    if (f.dataset.sent) return e.preventDefault();
    f.dataset.sent = '1';
    if (b) {
      if (b.name) { const h = document.createElement('input'); h.type = 'hidden'; h.name = b.name; h.value = b.value; f.append(h); }
      setTimeout(() => { b.disabled = true; b.textContent = 'Please wait…'; });
    }
  }));

  // Copy token / PIN.
  $$('[data-copy]').forEach((b) => b.addEventListener('click', async () => {
    const text = $(b.dataset.copy).textContent.trim();
    try { await navigator.clipboard.writeText(text); } catch {
      const r = document.createRange(); r.selectNodeContents($(b.dataset.copy));
      getSelection().removeAllRanges(); getSelection().addRange(r); document.execCommand('copy');
    }
    const old = b.innerHTML; b.textContent = 'Copied ✓'; setTimeout(() => { b.innerHTML = old; }, 1600);
  }));

  // Hover / focus tooltips (admin charts and KPIs).
  if ($('[data-tip]')) {
    const tip = document.createElement('div');
    tip.className = 'tip'; tip.hidden = true; tip.setAttribute('role', 'tooltip');
    document.body.append(tip);
    const show = (el, x, y) => {
      tip.textContent = el.dataset.tip; tip.hidden = false;
      const w = tip.offsetWidth, h = tip.offsetHeight;
      tip.style.left = `${Math.max(8, Math.min(innerWidth - w - 8, x - w / 2))}px`;
      tip.style.top = `${y - h - 12 < 8 ? y + 18 : y - h - 12}px`;
    };
    document.addEventListener('pointermove', (e) => {
      const el = e.target.closest?.('[data-tip]');
      if (el) show(el, e.clientX, e.clientY); else tip.hidden = true;
    });
    document.addEventListener('focusin', (e) => {
      const el = e.target.closest?.('[data-tip]');
      if (!el) { tip.hidden = true; return; }
      const r = el.getBoundingClientRect(); show(el, r.left + r.width / 2, r.top);
    });
    document.addEventListener('scroll', () => { tip.hidden = true; }, { passive: true });
  }

  // Admin: optional auto-refresh, remembered per browser.
  const auto = $('#autoRefresh');
  if (auto) {
    try { auto.checked = localStorage.getItem('adminAutoRefresh') === '1'; } catch {}
    auto.addEventListener('change', () => { try { localStorage.setItem('adminAutoRefresh', auto.checked ? '1' : '0'); } catch {} });
    setInterval(() => {
      const busy = document.activeElement?.matches('input:not([type=checkbox]),select,textarea');
      if (auto.checked && !busy && document.visibilityState === 'visible') location.reload();
    }, 30000);
  }

  // Quick amount chips.
  $$('[data-amount]').forEach((b) => b.addEventListener('click', () => {
    const input = $('input[name=amount]', b.closest('form'));
    input.value = b.dataset.amount;
    input.dispatchEvent(new Event('input', { bubbles: true }));
    input.focus();
  }));

  // Electricity: live estimate of units and when they will run out.
  const est = $('#estimator');
  if (est) {
    const cfg = JSON.parse($('#tariffs').textContent);
    const f = est.closest('form');
    const el = f.elements;
    const box = $('#estimate');
    const out = (k, v) => { $(`[data-e=${k}]`, est).textContent = v; };
    const days = (d) => (d < 1 ? 'Less than a day' : `About ${Math.floor(d)} day${Math.floor(d) === 1 ? '' : 's'}`);
    const fmtDate = (ms) => new Date(ms).toLocaleDateString('en-NG', { weekday: 'short', day: 'numeric', month: 'short', year: 'numeric' });
    const applBox = $('#applianceField');
    const rowsEl = $('#applRows');
    const presets = Object.fromEntries($$('#applianceList option').map((o) => [o.value.toLowerCase(), o.dataset]));

    // Appliance list: kWh/day = watts × how many × hours ÷ 1000, summed.
    const applKwh = () => $$('[data-appl]', rowsEl).reduce((t, r) => {
      const w = parseFloat($('[name=applWatts]', r).value), q = parseFloat($('[name=applQty]', r).value) || 1, h = parseFloat($('[name=applHours]', r).value) || 0;
      return w > 0 ? t + (w * q * h) / 1000 : t;
    }, 0);
    const addRow = () => {
      if ($$('[data-appl]', rowsEl).length >= cfg.max) return;
      rowsEl.append($('#applTemplate').content.cloneNode(true));
      $('[data-appl]:last-child [name=applName]', rowsEl).focus();
    };
    applBox.addEventListener('click', (e) => {
      if (e.target.closest('[data-appl-add]')) addRow();
      const rm = e.target.closest('[data-appl-remove]');
      if (rm) {
        const row = rm.closest('[data-appl]');
        if ($$('[data-appl]', rowsEl).length > 1) row.remove(); else $$('input', row).forEach((i) => { i.value = i.name === 'applQty' ? '1' : ''; });
        update();
      }
    });
    // Choosing a common appliance fills in typical watts and hours (only if still empty).
    rowsEl.addEventListener('input', (e) => {
      if (e.target.name !== 'applName') return;
      const p = presets[e.target.value.trim().toLowerCase()];
      if (!p) return;
      const row = e.target.closest('[data-appl]');
      const w = $('[name=applWatts]', row), h = $('[name=applHours]', row);
      if (!w.value) w.value = p.watts;
      if (!h.value) h.value = p.hours;
    });

    const update = () => {
      const prepaid = ($('input[name=meterType]:checked', f)?.value || 'prepaid') === 'prepaid';
      est.hidden = !prepaid;
      const mode = el.usage.value;
      $('#dailyKwhField').hidden = mode !== 'custom';
      applBox.hidden = mode !== 'appliances';
      const aKwh = applKwh();
      out('perDay', `${aKwh.toFixed(2)} kWh/day`);
      const amount = parseFloat(el.amount.value);
      const rate = cfg.tariffs[el.band.value];
      const perDay = mode === 'custom' ? parseFloat(el.dailyKwh.value) : mode === 'appliances' ? aKwh : cfg.usage[mode];
      box.hidden = !(amount > 0);
      if (box.hidden) return;
      if (!rate) {
        ['units', 'days', 'finish', 'recharge'].forEach((k) => out(k, '–'));
        out('note', 'Select your tariff band to estimate your units.');
        return;
      }
      const units = amount / (1 + cfg.vat) / rate;
      out('units', `≈ ${units.toFixed(1)} kWh`);
      if (perDay > 0) {
        const d = units / perDay;
        const buffer = Math.min(3, Math.max(1, d * 0.2)); // same rule as the server
        out('days', days(d));
        out('finish', fmtDate(Date.now() + d * 86400000));
        out('recharge', d - buffer <= 0 ? 'Today' : fmtDate(Date.now() + (d - buffer) * 86400000));
      } else {
        ['days', 'finish', 'recharge'].forEach((k) => out(k, '–'));
      }
      const how = mode === 'appliances'
        ? (perDay > 0 ? ` with your appliances using ~${perDay.toFixed(2)} kWh/day, assuming constant light (fewer hours of light means your units last longer)` : '. Add your appliances and their watts to see when it runs out')
        : perDay > 0 ? ` using ~${perDay} kWh/day` : '. Choose your usage to see when it runs out';
      out('note', `Estimate after ${cfg.vat * 100}% VAT at ₦${rate}/kWh${how}. Your DisCo confirms the actual units on your token.`);
    };
    f.addEventListener('input', update);
    f.addEventListener('change', update);
    f.addEventListener('click', (e) => { if (e.target.closest('[data-amount]')) update(); });
    update();
  }

  const form = $('#buy');
  if (!form) return;

  const serviceSelect = $('select[name=service]', form);
  const radios = $$('input[name=service]', form);
  const billerInput = $('input[name=biller]', form);
  const variationSelect = $('select[name=variation]', form);
  const prefixes = $('#prefixes') ? JSON.parse($('#prefixes').textContent) : null;
  let manualPick = false;
  let loadedFor = null;

  const selected = () => (serviceSelect ? serviceSelect.selectedOptions[0] : radios.find((r) => r.checked)) || null;
  const selectService = (id) => {
    if (serviceSelect) serviceSelect.value = id;
    else radios.forEach((r) => { r.checked = r.value === id; });
  };

  async function loadVariations(id) {
    if (loadedFor === id) return;
    loadedFor = id;
    const keep = variationSelect.dataset.selected || variationSelect.value;
    variationSelect.innerHTML = '<option value="">Loading plans…</option>';
    variationSelect.disabled = true;
    try {
      const res = await fetch(`/api/variations/${encodeURIComponent(id)}`, { headers: { accept: 'application/json' } });
      const list = await res.json();
      if (loadedFor !== id) return;
      if (!res.ok || !Array.isArray(list)) throw new Error(list.error || 'failed');
      variationSelect.innerHTML = `<option value="">${list.length ? 'Select a plan' : 'No plans available right now'}</option>` +
        list.map((v) => `<option value="${v.code}">${v.name.replace(/</g, '&lt;')} · ${naira(v.amount / 100)}</option>`).join('');
      if (keep && list.some((v) => v.code === keep)) variationSelect.value = keep;
      variationSelect.dataset.selected = '';
    } catch {
      variationSelect.innerHTML = '<option value="">Could not load plans. Tap to retry</option>';
      loadedFor = null;
    } finally {
      variationSelect.disabled = false;
    }
  }

  function sync() {
    const s = selected();
    const kind = s?.dataset.kind || '';
    const mode = $('input[name=tvMode]:checked', form)?.value;
    $$('[data-show]', form).forEach((el) => {
      const t = el.dataset.show.split(' ');
      el.hidden = !(t.includes(kind) || (kind === 'tv' && mode === 'change' && t.includes('tv-change')));
    });
    if (s) {
      $('#billerLabel').textContent = s.dataset.label;
      const limit = s.dataset.billerDigits;
      if (limit !== billerInput.dataset.digitLimit || billerInput.hasAttribute('data-local-phone') !== (s.dataset.label === 'Phone number')) {
        billerInput.dataset.digitLimit = limit;
        billerInput.toggleAttribute('data-local-phone', s.dataset.label === 'Phone number');
        billerInput.inputMode = Number(limit) ? 'numeric' : 'text';
        numericValues.set(billerInput, '');
        billerInput.dispatchEvent(new Event('input', { bubbles: true }));
      }
      const hint = $('#amountHint');
      if (hint && s.dataset.min) hint.textContent = `Min ${naira(s.dataset.min)} · Max ${naira(s.dataset.max)}`;
      const amount = $('input[name=amount]', form);
      if (amount) amount.max = s.dataset.max;
      if (variationSelect && !$('#variationField').hidden) loadVariations(s.value);
    }
  }

  function detectNetwork() {
    if (!prefixes) return;
    let d = billerInput.value.replace(/\D/g, '');
    if (d.startsWith('234')) d = `0${d.slice(3)}`;
    const hint = $('#netHint');
    if (d.length < 4) { hint.textContent = 'We detect the network from the number.'; return; }
    const net = Object.keys(prefixes).find((k) => prefixes[k].includes(d.slice(0, 4)));
    if (!net) { hint.textContent = 'Choose the network above.'; return; }
    const match = radios.find((r) => r.dataset.network === net);
    const cur = selected();
    const label = match ? match.closest('label').textContent.trim() : net;
    if (match && !manualPick && cur?.dataset.network !== net) { selectService(match.value); sync(); }
    hint.textContent = cur && cur.dataset.network !== net && manualPick
      ? `This looks like a ${label} number. Ported? Keep your choice.`
      : `${label} number detected. Ported number? Pick the right network above.`;
  }

  form.addEventListener('change', (e) => {
    if (e.target.name === 'service') { manualPick = e.isTrusted; loadedFor = null; variationSelect && (variationSelect.dataset.selected = ''); }
    if (['service', 'tvMode'].includes(e.target.name)) sync();
  });
  variationSelect?.addEventListener('focus', () => { if (!loadedFor && selected()) loadVariations(selected().value); });
  billerInput.addEventListener('input', detectNetwork);

  // Refill from a recent recipient.
  $$('[data-fill]').forEach((b) => b.addEventListener('click', () => {
    const f = JSON.parse(b.dataset.fill);
    selectService(f.service); manualPick = true; loadedFor = null;
    billerInput.value = f.biller;
    numericValues.set(billerInput, '');
    if (f.meterType) { const m = $(`input[name=meterType][value=${f.meterType}]`, form); if (m) m.checked = true; }
    sync();
    if (billerInput.value) billerInput.dispatchEvent(new Event('input', { bubbles: true }));
    ($('input[name=amount]', form) || variationSelect || billerInput)?.focus();
  }));

  // Prefill from the URL (Buy again).
  const q = new URLSearchParams(location.search);
  if (q.get('service') && !selected()) selectService(q.get('service'));
  sync();
  if (billerInput.value) detectNetwork();
})();
