// main.js — SOC Mapping Manager frontend entry point

import { API } from './api.js';
import { Toast } from './toast.js';
import { Drawer } from './drawer.js';
import { Pages } from './pages.js';

// ── Global state ──────────────────────────────────────────────────────────────
window.STATE = {
  schema:  null,   // live NetBox schema
  mapping: null,   // current mapping.yaml content
  gaps:    [],     // unmapped device functions
  dirty:   false,  // unsaved changes flag
};

// Expose helpers globally so inline onclick handlers work
window.Drawer = Drawer;
window.Toast  = Toast;

// ── App controller ────────────────────────────────────────────────────────────
window.App = {

  currentPage: 'dashboard',

  async init() {
    await this.reload();
  },

  async reload() {
    this._setStatus('loading', 'Connecting…');
    try {
      const [schema, mapping] = await Promise.all([
        API.getSchema(),
        API.getMapping(),
      ]);
      STATE.schema  = schema;
      STATE.mapping = mapping;
      STATE.dirty   = false;

      // Compute gaps client-side
      const mappedFns = new Set([
        ...Object.values(mapping.server_roles    || {}).map(r => r.device_function),
        ...Object.values(mapping.workstation_roles|| {}).map(r => r.device_function),
        ...Object.values(mapping.appliance_roles  || {}).map(r => r.device_function),
      ]);
      STATE.gaps = (schema.device_functions || []).filter(([v]) => !mappedFns.has(v))
                    .map(([v,l]) => ({ value: v, label: l }));
      // For dict-style choices (non-tuple)
      if (STATE.gaps.length === 0 && schema.device_functions?.[0]?.value) {
        STATE.gaps = (schema.device_functions || [])
          .filter(c => !mappedFns.has(c.value))
          .map(c => ({ value: c.value, label: c.label }));
      }

      this._setStatus('ok', `NetBox ${schema.meta?.netbox_version || 'connected'}`);
      this._updateSidebarCounts();
      this._setMappingStatus(true);
      this.render();
      Toast.show('Schema and mapping loaded', 'success');
    } catch (e) {
      this._setStatus('err', 'NetBox unreachable');
      Toast.show('Failed to load: ' + e.message, 'error');
      console.error(e);
    }
  },

  nav(el) {
    document.querySelectorAll('.nav-item').forEach(n => n.classList.remove('active'));
    el.classList.add('active');
    this.currentPage = el.dataset.page;
    this.render();
  },

  render() {
    const main = document.getElementById('main-content');
    if (!STATE.schema || !STATE.mapping) {
      main.innerHTML = `<div class="empty"><div class="icon">⏳</div><div class="msg">Loading…</div></div>`;
      return;
    }
    Pages.render(this.currentPage, main);
  },

  async save() {
    if (!STATE.dirty) { Toast.show('No unsaved changes', 'info'); return; }
    try {
      await API.saveMapping(STATE.mapping);
      STATE.dirty = false;
      this._setMappingStatus(true);
      Toast.show('mapping.yaml saved', 'success');
    } catch (e) {
      Toast.show('Save failed: ' + e.message, 'error');
    }
  },

  async validateAll() {
    Toast.show('Validating…', 'info');
    try {
      const result = await API.validate();
      if (result.valid && result.warnings.length === 0) {
        Toast.show(`✓ Valid — ${result.gap_count === 0 ? 'no gaps' : result.gap_count + ' gaps'}`, 'success');
      } else if (!result.valid) {
        Toast.show(`✗ ${result.errors.length} error(s) found`, 'error');
      } else {
        Toast.show(`⚠ ${result.warnings.length} warning(s)`, 'warning');
      }
      // Navigate to gaps page to show results
      const el = document.querySelector('[data-page="gaps"]');
      if (el) this.nav(el);
    } catch (e) {
      Toast.show('Validation failed: ' + e.message, 'error');
    }
  },

  async downloadForm() {
    Toast.show('Generating form…', 'info');
    try {
      const blob = await API.downloadForm();
      const url  = URL.createObjectURL(blob);
      const a    = document.createElement('a');
      a.href     = url;
      a.download = `device_onboarding_form_${new Date().toISOString().slice(0,10)}.html`;
      a.click();
      URL.revokeObjectURL(url);
      Toast.show('Form downloaded', 'success');
    } catch (e) {
      Toast.show('Form generation failed: ' + e.message, 'error');
    }
  },

  markDirty() {
    STATE.dirty = true;
    this._setMappingStatus(false);
  },

  _setStatus(state, text) {
    const dot  = document.getElementById('nb-dot');
    const span = document.getElementById('nb-status');
    dot.className  = 'status-dot ' + state;
    span.textContent = text;
  },

  _setMappingStatus(saved) {
    const bar  = document.getElementById('mapping-status-bar');
    const dot  = document.getElementById('mapping-dot');
    const text = document.getElementById('mapping-status-text');
    bar.style.display = '';
    dot.className  = 'status-dot ' + (saved ? 'ok' : 'err');
    text.textContent = saved ? 'mapping.yaml saved' : 'Unsaved changes';
  },

  _updateSidebarCounts() {
    const m = STATE.mapping;
    const g = STATE.gaps;
    const set = (id, val, hasGap) => {
      const el = document.getElementById(id);
      if (!el) return;
      el.textContent = val;
      el.className   = 'nav-badge' + (hasGap ? '' : ' ok');
    };
    set('nb-srv-count',  Object.keys(m.server_roles     || {}).length, false);
    set('nb-wrk-count',  Object.keys(m.workstation_roles|| {}).length, false);
    set('nb-apl-count',  Object.keys(m.appliance_roles  || {}).length, false);
    set('nb-prod-count', Object.keys(m.product_to_cis_app_benchmark || {}).length, false);
    set('nb-os-count',   Object.keys(m.os_to_cis_benchmark || {}).length, false);
    set('nb-gap-count',  g.length, g.length > 0);

    const meta = document.getElementById('sidebar-meta');
    if (meta) {
      const at = STATE.schema?.meta?.generated_at?.slice(0,16)?.replace('T',' ') || '';
      meta.textContent = `Schema: ${at}`;
    }
  },
};

// ── Boot ──────────────────────────────────────────────────────────────────────
App.init();
