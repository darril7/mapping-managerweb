// drawer.js — edit drawer for all mapping entries

import { Toast } from './toast.js';

let _ctx = null; // { type, key, isNew, isGap }

// ── Helpers ───────────────────────────────────────────────────────────────────
const nb  = () => window.STATE.schema;
const map = () => window.STATE.mapping;

function csOptions(choiceArr, selected = '') {
  const arr = Array.isArray(choiceArr) ? choiceArr : [];
  return arr.map(c => {
    const val = c.value ?? c[0] ?? c;
    const lbl = c.label ?? c[1] ?? c;
    return `<option value="${esc(val)}" ${val === selected ? 'selected' : ''}>${esc(lbl)}</option>`;
  }).join('');
}

function buildChips(arr, key) {
  return (arr || []).map(v =>
    `<span class="chip" onclick="Drawer._removeChip('${key}','${esc(v)}')">${esc(v)} ✕</span>`
  ).join('');
}

function getChips(key) {
  const wrap = document.getElementById(`chips-${key}`);
  if (!wrap) return [];
  return [...wrap.querySelectorAll('.chip')]
    .map(c => c.textContent.replace(' ✕','').trim());
}

function chipsWidget(key, arr, choices) {
  const opts = (Array.isArray(choices) ? choices : [])
    .map(c => { const v = c.value ?? c[0] ?? c; return `<option value="${esc(v)}">${esc(v)}</option>`; })
    .join('');
  return `
    <div class="chips-wrap" id="chips-${key}">${buildChips(arr, key)}</div>
    <select class="field-select" id="add-${key}" onchange="Drawer._addChip('${key}',this)">
      <option value="">＋ Add…</option>${opts}
    </select>`;
}

function fld(label, content, { auto, manual, req } = {}) {
  const tags = [
    req    ? `<span class="tag-req">*</span>` : '',
    auto   ? `<span class="tag-auto">${auto}</span>` : '',
    manual ? `<span class="tag-manual">${manual}</span>` : '',
  ].join('');
  return `
    <div class="field-group">
      <div class="field-label">${esc(label)} ${tags}</div>
      ${content}
    </div>`;
}

function inp(id, val = '', placeholder = '') {
  return `<input class="field-input" id="${id}" value="${esc(val)}" placeholder="${esc(placeholder)}">`;
}

function sel(id, choices, selected = '') {
  return `<select class="field-select" id="${id}">
    <option value="">—</option>${csOptions(choices, selected)}
  </select>`;
}

function toggle(id, checked = false, label = '') {
  return `
    <div class="toggle-wrap">
      <label class="toggle">
        <input type="checkbox" id="${id}" ${checked ? 'checked' : ''}>
        <span class="toggle-slider"></span>
      </label>
      <span class="toggle-lbl">${esc(label)}</span>
    </div>`;
}

function v(id) { const el = document.getElementById(id); return el ? el.value : ''; }
function chk(id) { const el = document.getElementById(id); return el ? el.checked : false; }
function esc(s) { return String(s ?? '').replace(/&/g,'&amp;').replace(/"/g,'&quot;').replace(/</g,'&lt;').replace(/>/g,'&gt;'); }

// ── Public API ────────────────────────────────────────────────────────────────
export const Drawer = {

  openServerRole(key) {
    const entry = key ? (map().server_roles?.[key] || {}) : {};
    _ctx = { type: 'server', key, isNew: !key };
    this._build('server', key, entry, false);
    this._show();
  },

  openWorkstationRole(key) {
    const entry = key ? (map().workstation_roles?.[key] || {}) : {};
    _ctx = { type: 'workstation', key, isNew: !key };
    this._build('workstation', key, entry, false);
    this._show();
  },

  openApplianceRole(key) {
    const entry = key ? (map().appliance_roles?.[key] || {}) : {};
    _ctx = { type: 'appliance', key, isNew: !key };
    this._build('appliance', key, entry, false);
    this._show();
  },

  openProduct(name) {
    const cis   = name ? (map().product_to_cis_app_benchmark?.[name] || '') : '';
    const sigma = name ? (map().product_to_sigma?.[name] || []) : [];
    _ctx = { type: 'product', key: name, isNew: !name };
    this._buildProduct(name, cis, sigma);
    this._show();
  },

  openOS(os) {
    const benchmark = os ? (map().os_to_cis_benchmark?.[os] || '') : '';
    _ctx = { type: 'os', key: os, isNew: !os };
    this._buildOS(os, benchmark);
    this._show();
  },

  openGap(value, label) {
    _ctx = { type: 'server', key: null, isNew: true, isGap: true };
    const prefilled = {
      code: value, label: (label || value).split('—').pop().trim(),
      device_function: value, cis_app_benchmark: 'NO-STANDARD',
      sigma_product: [], sigma_log_categories: ['process_creation','authentication'],
      product_overrides: false, flag_log_path: false,
    };
    this._build('server', null, prefilled, true);
    this._show();
  },

  close() {
    document.getElementById('drawer-overlay').classList.remove('open');
    _ctx = null;
  },

  onBg(e) {
    if (e.target === document.getElementById('drawer-overlay')) this.close();
  },

  save() {
    if (!_ctx) return;
    try {
      if (_ctx.type === 'os')          this._saveOS();
      else if (_ctx.type === 'product') this._saveProduct();
      else                              this._saveRole(_ctx.type);
      window.App.markDirty();
      this.close();
      window.App.render();
      Toast.show('Entry saved — click Save in toolbar to persist', 'success');
    } catch (e) {
      Toast.show(e.message, 'error');
    }
  },

  delete() {
    if (!_ctx || _ctx.isNew) return;
    if (!confirm(`Delete this entry?`)) return;
    const m = map();
    if (_ctx.type === 'server')           delete m.server_roles[_ctx.key];
    else if (_ctx.type === 'workstation') delete m.workstation_roles[_ctx.key];
    else if (_ctx.type === 'appliance')   delete m.appliance_roles[_ctx.key];
    else if (_ctx.type === 'product') {
      delete m.product_to_cis_app_benchmark[_ctx.key];
      delete m.product_to_sigma[_ctx.key];
    }
    else if (_ctx.type === 'os')          delete m.os_to_cis_benchmark[_ctx.key];
    window.App.markDirty();
    this.close();
    window.App.render();
    Toast.show('Entry deleted', 'warning');
  },

  // ── Internal builders ──────────────────────────────────────────────────────
  _build(type, key, e, isGap) {
    const title = _ctx.isNew ? `New ${type} role` : `Edit ${e.code || key || ''}`;
    const sub   = isGap
      ? '⚠ Gap — orange fields require manual input'
      : type === 'server'      ? 'Server role → CIS benchmark, Sigma tags, log categories'
      : type === 'workstation' ? 'Workstation type → CIS and Sigma configuration'
      : 'Appliance role → OS/App benchmark, Sigma, log collector';

    document.getElementById('drawer-title').textContent    = title;
    document.getElementById('drawer-subtitle').textContent = sub;
    document.getElementById('drawer-delete').style.display = _ctx.isNew ? 'none' : 'inline-flex';

    const schema = nb();
    let html = '';

    html += fld('Role Code', inp('f-code', e.code || key || '', 'e.g. SRV-VOIP'),
                { req: true, auto: 'matches SOC_DeviceFunction' });
    html += fld('Label', inp('f-label', e.label || '', 'e.g. VoIP / Telephony Server'), { req: true });
    html += fld('Device Function', sel('f-df', schema.device_functions, e.device_function),
                { req: true, auto: 'must exist in NetBox SOC_DeviceFunction' });

    html += `<div class="section-divider">Hardening</div>`;
    html += fld('CIS App Benchmark', sel('f-cis-app', schema.cis_app, e.cis_app_benchmark),
                { manual: 'does a CIS standard exist for software on this role?' });

    if (type === 'appliance') {
      html += fld('CIS OS Benchmark', sel('f-cis-os', schema.cis_os, e.cis_os_benchmark || 'VENDOR-OS'),
                  { auto: 'always VENDOR-OS for appliances' });
    }

    html += `<div class="section-divider">Sigma / Log Collection</div>`;
    html += fld('Sigma Product Tags',
                chipsWidget('sigma', e.sigma_product || [], schema.sigma_products),
                { manual: 'which Sigma product tags apply?' });
    html += fld('Sigma Log Categories',
                chipsWidget('logcat', e.sigma_log_categories || [], schema.sigma_log_cats),
                { manual: 'which log categories matter for this role?' });

    if (type === 'appliance') {
      html += fld('Log Collector', sel('f-log-coll', schema.log_collectors, e.log_collector || 'SYSLOG'),
                  { auto: 'usually SYSLOG for appliances' });
    }

    if (type === 'server') {
      html += `<div class="section-divider">Behaviour</div>`;
      html += fld('Product Overrides',
                  toggle('f-prod-override', e.product_overrides,
                    'Yes — Q2 product selection overrides CIS app benchmark and Sigma tags'),
                  { auto: 'set Yes if Q2 product changes the CIS/Sigma mapping' });
      html += fld('Flag Log Path',
                  toggle('f-flag-log', e.flag_log_path,
                    'Yes — Blue Team must define business_app_log_path for this role'),
                  { auto: 'set Yes for SRV-APP, SRV-ERP' });
    }

    document.getElementById('drawer-body').innerHTML = html;
  },

  _buildProduct(name, cis, sigma) {
    document.getElementById('drawer-title').textContent    = name ? `Edit product: ${name}` : 'New Product';
    document.getElementById('drawer-subtitle').textContent = 'Product → CIS App Benchmark + Sigma product tags';
    document.getElementById('drawer-delete').style.display = _ctx.isNew ? 'none' : 'inline-flex';

    const schema = nb();
    let html = '';
    html += fld('Product Name (lowercase key)', inp('f-prod-name', name || '', 'e.g. kafka'),
                { req: true, auto: 'lowercase, used as key in mapping' });
    html += fld('CIS App Benchmark', sel('f-prod-cis', schema.cis_app, cis),
                { manual: 'does a CIS standard exist for this product?' });
    html += fld('Sigma Product Tags',
                chipsWidget('prod-sigma', sigma, schema.sigma_products),
                { manual: 'which Sigma product tags apply?' });
    document.getElementById('drawer-body').innerHTML = html;
  },

  _buildOS(os, benchmark) {
    document.getElementById('drawer-title').textContent    = os ? `Edit OS: ${os}` : 'New OS Entry';
    document.getElementById('drawer-subtitle').textContent = 'OS string (as shown in form) → CIS OS Benchmark key';
    document.getElementById('drawer-delete').style.display = _ctx.isNew ? 'none' : 'inline-flex';

    const schema = nb();
    let html = '';
    html += fld('OS String', inp('f-os', os || '', 'e.g. Windows Server 2022'),
                { req: true, manual: 'exact string from the OS dropdown' });
    html += fld('CIS OS Benchmark', sel('f-os-bm', schema.cis_os, benchmark),
                { req: true, manual: 'select matching CIS benchmark key' });
    document.getElementById('drawer-body').innerHTML = html;
  },

  // ── Save handlers ──────────────────────────────────────────────────────────
  _saveRole(type) {
    const code = v('f-code').trim().toUpperCase();
    const df   = v('f-df');
    if (!code) throw new Error('Role Code is required');
    if (!df)   throw new Error('Device Function is required');

    const entry = {
      label:                v('f-label').trim(),
      device_function:      df,
      cis_app_benchmark:    v('f-cis-app'),
      sigma_product:        getChips('sigma'),
      sigma_log_categories: getChips('logcat'),
    };
    if (type === 'appliance') {
      entry.cis_os_benchmark = v('f-cis-os');
      entry.log_collector    = v('f-log-coll');
    }
    if (type === 'server') {
      entry.product_overrides = chk('f-prod-override');
      entry.flag_log_path     = chk('f-flag-log');
    }

    const m = map();
    const section = type === 'server' ? 'server_roles'
                  : type === 'workstation' ? 'workstation_roles'
                  : 'appliance_roles';
    if (!m[section]) m[section] = {};

    // If renaming key, delete the old one
    if (_ctx.key && _ctx.key !== code) delete m[section][_ctx.key];
    m[section][code] = entry;
  },

  _saveProduct() {
    const name = v('f-prod-name').trim().toLowerCase();
    if (!name) throw new Error('Product name is required');
    const m = map();
    if (!m.product_to_cis_app_benchmark) m.product_to_cis_app_benchmark = {};
    if (!m.product_to_sigma)             m.product_to_sigma = {};
    if (_ctx.key && _ctx.key !== name) {
      delete m.product_to_cis_app_benchmark[_ctx.key];
      delete m.product_to_sigma[_ctx.key];
    }
    m.product_to_cis_app_benchmark[name] = v('f-prod-cis');
    m.product_to_sigma[name]             = getChips('prod-sigma');
  },

  _saveOS() {
    const os = v('f-os').trim();
    const bm = v('f-os-bm');
    if (!os) throw new Error('OS string is required');
    if (!bm) throw new Error('CIS OS Benchmark is required');
    const m = map();
    if (!m.os_to_cis_benchmark) m.os_to_cis_benchmark = {};
    if (_ctx.key && _ctx.key !== os) delete m.os_to_cis_benchmark[_ctx.key];
    m.os_to_cis_benchmark[os] = bm;
  },

  // ── Chip helpers (called from inline onclick) ──────────────────────────────
  _addChip(key, sel) {
    const val = sel.value; if (!val) return; sel.value = '';
    const wrap = document.getElementById(`chips-${key}`);
    if (!wrap) return;
    if ([...wrap.querySelectorAll('.chip')].some(c => c.textContent.replace(' ✕','').trim() === val)) return;
    const chip = document.createElement('span');
    chip.className = 'chip';
    chip.onclick   = () => chip.remove();
    chip.textContent = val + ' ✕';
    wrap.appendChild(chip);
  },

  _removeChip(key, val) {
    const wrap = document.getElementById(`chips-${key}`);
    if (!wrap) return;
    [...wrap.querySelectorAll('.chip')]
      .filter(c => c.textContent.replace(' ✕','').trim() === val)
      .forEach(c => c.remove());
  },

  _show() {
    document.getElementById('drawer-overlay').classList.add('open');
  },
};
