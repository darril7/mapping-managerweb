// pages.js — renders each page into the main content area

import { Drawer } from './drawer.js';
import { Toast }  from './toast.js';
import { API }    from './api.js';

function esc(s) {
  return String(s ?? '').replace(/&/g,'&amp;').replace(/</g,'&lt;').replace(/>/g,'&gt;');
}

function pills(arr, color = '') {
  if (!arr?.length) return '<span style="color:var(--muted);font-size:11px">—</span>';
  return arr.map(v =>
    `<span class="pill" style="${color ? 'color:'+color : ''}">${esc(v)}</span>`
  ).join('');
}

function cisColor(v) {
  if (!v) return 'var(--muted)';
  if (v === 'NO-STANDARD' || v === 'OTHER' || v === 'NA') return 'var(--muted)';
  if (v === 'CUSTOM') return 'var(--yellow)';
  return 'var(--green)';
}

function sortTable(th, col) {
  const tbl = th.closest('table');
  const key = (tbl.id||'t')+'_'+col;
  window._sortDir = window._sortDir || {};
  const asc = window._sortDir[key] !== true;
  window._sortDir[key] = asc;
  tbl.querySelectorAll('thead th').forEach((h,i) => {
    const base = h.textContent.replace(/[↑↓↕]/g,'').trim();
    h.textContent = i===col ? base+(asc?' ↑':' ↓') : base+' ↕';
  });
  const rows = Array.from(tbl.querySelectorAll('tbody tr'));
  rows.sort((a,b) => {
    const av = a.cells[col]?.textContent.trim()||'';
    const bv = b.cells[col]?.textContent.trim()||'';
    return asc ? av.localeCompare(bv) : bv.localeCompare(av);
  });
  rows.forEach(r => tbl.querySelector('tbody').appendChild(r));
}
window._sortTable = sortTable;

function filterTable(q, id) {
  const lq = q.toLowerCase().trim();
  document.querySelectorAll(`#${id} tbody tr`).forEach(r => {
    r.style.display = (!lq || r.textContent.toLowerCase().includes(lq)) ? '' : 'none';
  });
}
window._filterTable = filterTable;

// ── Shared table shell ────────────────────────────────────────────────────────
function tableCard(title, count, searchId, newBtnLabel, onNew, theadHtml, tbodyHtml) {
  return `
  <div class="card">
    <div class="card-header">
      <span class="card-title">${esc(title)} <span style="font-weight:400;color:var(--muted);font-size:12px">— ${count}</span></span>
      <div class="toolbar">
        <input class="search-input" placeholder="Search…" oninput="_filterTable(this.value,'${searchId}')">
        <button class="btn primary sm" onclick="${onNew}">＋ ${esc(newBtnLabel)}</button>
        <button class="btn success sm" onclick="App.save()">💾 Save</button>
      </div>
    </div>
    <div class="tbl-wrap">
      <table id="${searchId}">
        <thead><tr>${theadHtml}</tr></thead>
        <tbody>${tbodyHtml}</tbody>
      </table>
    </div>
  </div>`;
}

function th(label, col, id) {
  return `<th onclick="_sortTable(this,${col})">${esc(label)} ↕</th>`;
}

// ── PAGES ─────────────────────────────────────────────────────────────────────
export const Pages = {

  render(page, container) {
    const renderers = {
      'dashboard':        () => this.dashboard(),
      'server-roles':     () => this.serverRoles(),
      'workstation-roles':() => this.workstationRoles(),
      'appliance-roles':  () => this.applianceRoles(),
      'products':         () => this.products(),
      'os-benchmarks':    () => this.osBenchmarks(),
      'choicesets':       () => this.choiceSets(),
      'gaps':             () => this.gaps(),
      'form-preview':     () => this.formPreview(),
      'yaml-export':      () => this.yamlExport(),
    };
    const fn = renderers[page] || (() => `<div class="empty"><div class="icon">🚧</div><div class="msg">Page not found</div></div>`);
    container.innerHTML = fn();
  },

  // ── Dashboard ────────────────────────────────────────────────────────────────
  dashboard() {
    const m  = STATE.mapping;
    const sc = STATE.schema;
    const g  = STATE.gaps;
    const srvCount  = Object.keys(m.server_roles     || {}).length;
    const wrkCount  = Object.keys(m.workstation_roles|| {}).length;
    const aplCount  = Object.keys(m.appliance_roles  || {}).length;
    const prodCount = Object.keys(m.product_to_cis_app_benchmark || {}).length;
    const osCount   = Object.keys(m.os_to_cis_benchmark || {}).length;
    const dfCount   = sc.device_functions?.length || 0;
    const sigCount  = sc.sigma_products?.length || 0;
    const logCount  = sc.sigma_log_cats?.length || 0;

    const gapBanner = g.length ? `
      <div class="card" style="border-color:rgba(234,179,8,0.4);margin-bottom:18px">
        <div class="card-header" style="background:rgba(234,179,8,0.08)">
          <span class="card-title" style="color:var(--yellow)">⚠ ${g.length} Unmapped Gap${g.length !== 1 ? 's' : ''}</span>
          <button class="btn sm" onclick="App.nav(document.querySelector('[data-page=gaps]'))">View Gaps →</button>
        </div>
        <div style="padding:12px 18px;display:flex;flex-wrap:wrap;gap:8px">
          ${g.map(gp => `
            <span style="display:inline-flex;align-items:center;gap:6px;background:rgba(234,179,8,0.1);border:1px solid rgba(234,179,8,0.3);padding:5px 12px;border-radius:8px;font-size:12px;color:var(--yellow)">
              <span class="mono">${esc(gp.value)}</span>
              <button class="btn sm primary" style="padding:3px 8px;font-size:11px" onclick="Drawer.openGap('${esc(gp.value)}','${esc(gp.label)}')">Fill</button>
            </span>`).join('')}
        </div>
      </div>` : `
      <div class="card" style="border-color:rgba(34,197,94,0.3);margin-bottom:18px">
        <div class="card-header" style="background:rgba(34,197,94,0.07)">
          <span class="card-title" style="color:var(--green)">✓ Mapping fully covered — no gaps</span>
        </div>
      </div>`;

    return `
      <div class="page-header">
        <div class="page-title">Dashboard</div>
        <div class="page-subtitle">SOC Mapping Manager — ${sc.meta?.netbox_url || ''}</div>
      </div>

      ${gapBanner}

      <div class="stat-grid">
        <div class="stat blue"><div class="lbl">Device Functions</div><div class="val">${dfCount}</div><div class="sub">in NetBox</div></div>
        <div class="stat purple"><div class="lbl">Server Roles</div><div class="val">${srvCount}</div><div class="sub">mapped</div></div>
        <div class="stat green"><div class="lbl">Workstation Types</div><div class="val">${wrkCount}</div><div class="sub">mapped</div></div>
        <div class="stat orange"><div class="lbl">Appliance Roles</div><div class="val">${aplCount}</div><div class="sub">mapped</div></div>
        <div class="stat yellow"><div class="lbl">Products</div><div class="val">${prodCount}</div><div class="sub">mapped</div></div>
        <div class="stat blue"><div class="lbl">OS Entries</div><div class="val">${osCount}</div><div class="sub">mapped</div></div>
        <div class="stat purple"><div class="lbl">Sigma Products</div><div class="val">${sigCount}</div><div class="sub">in NetBox</div></div>
        <div class="stat green"><div class="lbl">Log Categories</div><div class="val">${logCount}</div><div class="sub">in NetBox</div></div>
        ${g.length > 0 ? `<div class="stat red"><div class="lbl">Gaps</div><div class="val">${g.length}</div><div class="sub">unmapped</div></div>` : ''}
      </div>

      <div class="card">
        <div class="card-header"><span class="card-title">NetBox Info</span></div>
        <div class="card-body" style="display:grid;grid-template-columns:repeat(auto-fill,minmax(200px,1fr));gap:12px">
          ${[
            ['URL',      sc.meta?.netbox_url || '—'],
            ['Version',  sc.meta?.netbox_version || '—'],
            ['Pulled',   (sc.meta?.generated_at||'').slice(0,16).replace('T',' ') || '—'],
            ['Sites',    sc.sites?.length || 0],
            ['Choice Sets', Object.keys(sc.choice_sets||{}).length],
            ['Custom Fields', sc.custom_fields?.length || 0],
          ].map(([l,v]) => `
            <div style="background:rgba(255,255,255,0.05);border:1px solid var(--border);border-radius:10px;padding:10px 14px">
              <div style="font-size:10px;color:var(--muted);text-transform:uppercase;letter-spacing:0.7px;margin-bottom:5px">${esc(l)}</div>
              <div style="font-size:13px;font-weight:600" class="mono">${esc(String(v))}</div>
            </div>`).join('')}
        </div>
      </div>`;
  },

  // ── Server Roles ─────────────────────────────────────────────────────────────
  serverRoles() {
    const roles = STATE.mapping.server_roles || {};
    const rows = Object.entries(roles).map(([code, r], i) => `
      <tr>
        <td><span class="mono" style="color:var(--blue)">${esc(code)}</span></td>
        <td>${esc(r.label||'')}</td>
        <td><span class="pill">${esc(r.device_function||'')}</span></td>
        <td><span class="mono" style="color:${cisColor(r.cis_app_benchmark)}">${esc(r.cis_app_benchmark||'—')}</span></td>
        <td>${pills(r.sigma_product)}</td>
        <td>${pills(r.sigma_log_categories,'rgba(168,85,247,0.9)')}</td>
        <td>
          <span class="badge ${r.product_overrides ? 'b-blue' : 'b-gray'}">
            <span class="badge-dot"></span>${r.product_overrides ? 'Yes' : 'No'}
          </span>
        </td>
        <td><button class="btn sm secondary" onclick="Drawer.openServerRole('${esc(code)}')">Edit</button></td>
      </tr>`).join('');

    return `
      <div class="page-header">
        <div class="page-title">Server Roles</div>
        <div class="page-subtitle">Maps server role codes to device function, CIS benchmarks and Sigma tags</div>
      </div>
      ${tableCard('Server Roles', Object.keys(roles).length + ' roles', 'tbl-srv',
        'New Role', "Drawer.openServerRole(null)",
        `${th('Code',0)} ${th('Label',1)} ${th('Device Function',2)} ${th('CIS App',3)}
         <th>Sigma Products</th><th>Log Categories</th><th>Overrides</th><th></th>`,
        rows || `<tr><td colspan="8" class="empty"><div class="msg">No server roles defined</div></td></tr>`
      )}`;
  },

  // ── Workstation Roles ────────────────────────────────────────────────────────
  workstationRoles() {
    const roles = STATE.mapping.workstation_roles || {};
    const rows = Object.entries(roles).map(([code, r]) => `
      <tr>
        <td><span class="mono" style="color:var(--green)">${esc(code)}</span></td>
        <td>${esc(r.label||'')}</td>
        <td><span class="pill">${esc(r.device_function||'')}</span></td>
        <td><span class="mono" style="color:${cisColor(r.cis_app_benchmark)}">${esc(r.cis_app_benchmark||'—')}</span></td>
        <td>${pills(r.sigma_product)}</td>
        <td>${pills(r.sigma_log_categories,'rgba(168,85,247,0.9)')}</td>
        <td><button class="btn sm secondary" onclick="Drawer.openWorkstationRole('${esc(code)}')">Edit</button></td>
      </tr>`).join('');

    return `
      <div class="page-header">
        <div class="page-title">Workstation Roles</div>
        <div class="page-subtitle">Workstation type mapping — standard, developer, PAW, Mac</div>
      </div>
      ${tableCard('Workstation Roles', Object.keys(roles).length + ' roles', 'tbl-wrk',
        'New Type', "Drawer.openWorkstationRole(null)",
        `${th('Code',0)} ${th('Label',1)} ${th('Device Function',2)} ${th('CIS App',3)}
         <th>Sigma Products</th><th>Log Categories</th><th></th>`,
        rows || `<tr><td colspan="7" class="empty"><div class="msg">No workstation roles defined</div></td></tr>`
      )}`;
  },

  // ── Appliance Roles ──────────────────────────────────────────────────────────
  applianceRoles() {
    const roles = STATE.mapping.appliance_roles || {};
    const rows = Object.entries(roles).map(([code, r]) => `
      <tr>
        <td><span class="mono" style="color:var(--orange)">${esc(code)}</span></td>
        <td>${esc(r.label||'')}</td>
        <td><span class="pill">${esc(r.device_function||'')}</span></td>
        <td><span class="mono" style="color:var(--muted);font-size:11px">${esc(r.cis_os_benchmark||'—')}</span></td>
        <td><span class="mono" style="color:${cisColor(r.cis_app_benchmark)}">${esc(r.cis_app_benchmark||'—')}</span></td>
        <td>${pills(r.sigma_product)}</td>
        <td><span class="mono" style="font-size:11px">${esc(r.log_collector||'—')}</span></td>
        <td><button class="btn sm secondary" onclick="Drawer.openApplianceRole('${esc(code)}')">Edit</button></td>
      </tr>`).join('');

    return `
      <div class="page-header">
        <div class="page-title">Appliance Roles</div>
        <div class="page-subtitle">Firewall, switch, WAF, IDS, proxy, VPN, load balancer, VoIP</div>
      </div>
      ${tableCard('Appliance Roles', Object.keys(roles).length + ' roles', 'tbl-apl',
        'New Appliance', "Drawer.openApplianceRole(null)",
        `${th('Code',0)} ${th('Label',1)} ${th('Device Function',2)} <th>CIS OS</th>
         ${th('CIS App',4)} <th>Sigma Products</th><th>Log Collector</th><th></th>`,
        rows || `<tr><td colspan="8" class="empty"><div class="msg">No appliance roles defined</div></td></tr>`
      )}`;
  },

  // ── Products ─────────────────────────────────────────────────────────────────
  products() {
    const cisMap   = STATE.mapping.product_to_cis_app_benchmark || {};
    const sigmaMap = STATE.mapping.product_to_sigma || {};
    const allProds = [...new Set([...Object.keys(cisMap), ...Object.keys(sigmaMap)])].sort();

    const rows = allProds.map(name => `
      <tr>
        <td><span class="mono">${esc(name)}</span></td>
        <td><span class="mono" style="color:${cisColor(cisMap[name])}">${esc(cisMap[name]||'—')}</span></td>
        <td>${pills(sigmaMap[name]||[])}</td>
        <td><button class="btn sm secondary" onclick="Drawer.openProduct('${esc(name)}')">Edit</button></td>
      </tr>`).join('');

    return `
      <div class="page-header">
        <div class="page-title">Products</div>
        <div class="page-subtitle">Product → CIS App Benchmark + Sigma product tags</div>
      </div>
      ${tableCard('Products', allProds.length + ' products', 'tbl-prod',
        'New Product', "Drawer.openProduct(null)",
        `${th('Product',0)} ${th('CIS App Benchmark',1)} <th>Sigma Tags</th><th></th>`,
        rows || `<tr><td colspan="4" class="empty"><div class="msg">No products defined</div></td></tr>`
      )}`;
  },

  // ── OS Benchmarks ────────────────────────────────────────────────────────────
  osBenchmarks() {
    const osMap = STATE.mapping.os_to_cis_benchmark || {};
    const rows = Object.entries(osMap).map(([os, bm]) => `
      <tr>
        <td>${esc(os)}</td>
        <td><span class="mono" style="color:${bm==='OTHER'||bm==='VENDOR-OS'?'var(--muted)':'var(--green)'}">
          ${esc(bm)}
        </span></td>
        <td><button class="btn sm secondary" onclick="Drawer.openOS('${esc(os)}')">Edit</button></td>
      </tr>`).join('');

    return `
      <div class="page-header">
        <div class="page-title">OS Benchmarks</div>
        <div class="page-subtitle">OS string (as entered in form) → CIS OS Benchmark key in NetBox</div>
      </div>
      ${tableCard('OS Entries', Object.keys(osMap).length + ' entries', 'tbl-os',
        'New OS', "Drawer.openOS(null)",
        `${th('OS String',0)} ${th('CIS OS Benchmark',1)} <th></th>`,
        rows || `<tr><td colspan="3" class="empty"><div class="msg">No OS entries defined</div></td></tr>`
      )}`;
  },

  // ── Choice Sets ──────────────────────────────────────────────────────────────
  choiceSets() {
    const cs = STATE.schema.choice_sets || {};
    const names = Object.keys(cs).sort();

    const tabs = names.map((n,i) =>
      `<button class="tab-pill ${i===0?'active':''}" onclick="
        document.querySelectorAll('.tab-pill').forEach(t=>t.classList.remove('active'));
        this.classList.add('active');
        document.querySelectorAll('.tab-content').forEach(c=>c.classList.remove('active'));
        document.getElementById('cs-${i}').classList.add('active');
      ">${esc(n.replace('SOC_',''))} <span style="color:var(--muted);font-size:10px">${(cs[n].choices||[]).length}</span></button>`
    ).join('');

    const panels = names.map((n,i) => {
      const choices = cs[n].choices || [];
      const rows = choices.map(c => `
        <tr>
          <td><span class="mono">${esc(c.value||c[0]||'')}</span></td>
          <td style="color:var(--muted)">${esc(c.label||c[1]||'')}</td>
        </tr>`).join('');
      return `
        <div class="tab-content ${i===0?'active':''}" id="cs-${i}">
          <div style="margin-bottom:10px;display:flex;align-items:center;justify-content:space-between">
            <span style="font-size:12px;color:var(--muted)">${choices.length} values in NetBox</span>
            <button class="btn sm primary" onclick="Pages._addToChoiceSet('${esc(n)}')">＋ Add Value to NetBox</button>
          </div>
          <div class="tbl-wrap">
            <table><thead><tr><th>Value</th><th>Label</th></tr></thead>
            <tbody>${rows||'<tr><td colspan="2" style="color:var(--muted);text-align:center;padding:20px">Empty</td></tr>'}</tbody>
            </table>
          </div>
        </div>`;
    }).join('');

    return `
      <div class="page-header">
        <div class="page-title">Choice Sets</div>
        <div class="page-subtitle">Live SOC_* choice sets from NetBox — read and manage values</div>
      </div>
      <div class="card">
        <div class="card-header"><span class="card-title">SOC Choice Sets</span>
          <button class="btn sm" onclick="App.reload()">↺ Re-pull from NetBox</button>
        </div>
        <div class="card-body">
          <div class="tab-bar">${tabs}</div>
          ${panels}
        </div>
      </div>`;
  },

  async _addToChoiceSet(csName) {
    const value = prompt(`Add to ${csName}\n\nValue (code):`);
    if (!value) return;
    const label = prompt(`Label for "${value}":`, value);
    if (!label) return;
    try {
      const res = await API.addToChoiceset(csName, [[value, label]]);
      if (res.added === 0) {
        Toast.show(`"${value}" already exists in ${csName}`, 'warning');
      } else {
        Toast.show(`Added "${value}" to ${csName}`, 'success');
        await App.reload();
      }
    } catch(e) {
      Toast.show('Failed: ' + e.message, 'error');
    }
  },

  // ── Gaps ─────────────────────────────────────────────────────────────────────
  gaps() {
    const gaps = STATE.gaps;

    const gapRows = gaps.length ? gaps.map(g => `
      <tr>
        <td><span class="mono" style="color:var(--yellow)">${esc(g.value)}</span></td>
        <td style="color:var(--muted)">${esc(g.label||g.value)}</td>
        <td>
          <span class="badge b-yellow"><span class="badge-dot"></span>Unmapped</span>
        </td>
        <td>
          <button class="btn sm primary" onclick="Drawer.openGap('${esc(g.value)}','${esc(g.label||g.value)}')">
            Fill Gap
          </button>
        </td>
      </tr>`).join('')
    : '<tr><td colspan="4" style="text-align:center;padding:30px;color:var(--green)">✓ No gaps — all device functions are mapped</td></tr>';

    // Validation results if we have them
    const valCard = window._lastValidation ? `
      <div class="card" style="margin-bottom:18px">
        <div class="card-header">
          <span class="card-title" style="color:${window._lastValidation.valid?'var(--green)':'var(--red)'}">
            ${window._lastValidation.valid ? '✓ Validation passed' : `✗ ${window._lastValidation.errors.length} error(s)`}
          </span>
          <button class="btn sm" onclick="App.validateAll()">↺ Re-validate</button>
        </div>
        <div class="card-body">
          ${window._lastValidation.errors.length ? `
            <div style="margin-bottom:12px">
              <div style="font-size:11px;color:var(--red);text-transform:uppercase;letter-spacing:0.7px;margin-bottom:6px">Errors</div>
              <div class="val-list">${window._lastValidation.errors.map(e=>`<div class="val-error">✗ ${esc(e)}</div>`).join('')}</div>
            </div>` : ''}
          ${window._lastValidation.warnings.length ? `
            <div>
              <div style="font-size:11px;color:var(--yellow);text-transform:uppercase;letter-spacing:0.7px;margin-bottom:6px">Warnings</div>
              <div class="val-list">${window._lastValidation.warnings.map(w=>`<div class="val-warn">⚠ ${esc(w)}</div>`).join('')}</div>
            </div>` : ''}
          ${window._lastValidation.valid && !window._lastValidation.warnings.length ? `
            <div class="val-list"><div class="val-ok">✓ All mapping values exist in NetBox</div></div>` : ''}
        </div>
      </div>` : '';

    return `
      <div class="page-header">
        <div class="page-title">Gaps & Validation</div>
        <div class="page-subtitle">Device functions in NetBox with no mapping entry, and validation errors</div>
      </div>
      ${valCard}
      <div class="card">
        <div class="card-header">
          <span class="card-title">⚠ Unmapped Gaps <span style="font-weight:400;color:var(--muted);font-size:12px">— ${gaps.length}</span></span>
          <div class="toolbar">
            <button class="btn sm primary" onclick="App.validateAll()">✓ Run Validation</button>
          </div>
        </div>
        <div class="tbl-wrap">
          <table>
            <thead><tr><th>Device Function</th><th>Label</th><th>Status</th><th></th></tr></thead>
            <tbody>${gapRows}</tbody>
          </table>
        </div>
      </div>`;
  },

  // ── Form preview ─────────────────────────────────────────────────────────────
  formPreview() {
    return `
      <div class="page-header">
        <div class="page-title">Onboarding Form</div>
        <div class="page-subtitle">Generate and download the device onboarding HTML form</div>
      </div>
      <div class="card">
        <div class="card-header">
          <span class="card-title">📋 Device Onboarding Form</span>
          <div class="toolbar">
            <button class="btn primary" onclick="Pages._loadFormPreview()">👁 Preview</button>
            <button class="btn success" onclick="App.downloadForm()">⬇ Download</button>
          </div>
        </div>
        <div class="card-body">
          <p style="color:var(--muted);font-size:13px;margin-bottom:16px">
            The form is generated from the live NetBox schema + mapping.yaml.
            It includes all roles, products, OS options and UI conditions.
            Open it in any browser — no server required.
          </p>
          <div id="form-preview-frame" style="background:rgba(0,0,0,0.3);border:1px solid var(--border);border-radius:10px;min-height:200px;display:flex;align-items:center;justify-content:center;color:var(--muted);font-size:13px">
            Click Preview to load the form here
          </div>
        </div>
      </div>`;
  },

  async _loadFormPreview() {
    const frame = document.getElementById('form-preview-frame');
    frame.innerHTML = '<div class="spinner"></div>';
    try {
      const res  = await fetch('/api/form/generate');
      const html = await res.text();
      frame.innerHTML = `<iframe srcdoc="${html.replace(/"/g,'&quot;')}" style="width:100%;height:600px;border:none;border-radius:8px"></iframe>`;
    } catch(e) {
      frame.innerHTML = `<span style="color:var(--red)">Failed: ${esc(e.message)}</span>`;
    }
  },

  // ── YAML export ──────────────────────────────────────────────────────────────
  yamlExport() {
    return `
      <div class="page-header">
        <div class="page-title">Export YAML</div>
        <div class="page-subtitle">Preview the current mapping.yaml and download it</div>
      </div>
      <div class="card">
        <div class="card-header">
          <span class="card-title">mapping.yaml</span>
          <div class="toolbar">
            <button class="btn" onclick="Pages._refreshYaml()">↺ Refresh</button>
            <button class="btn success" onclick="Pages._downloadYaml()">⬇ Download</button>
            <button class="btn primary" onclick="App.save()">💾 Save to Server</button>
          </div>
        </div>
        <div class="card-body">
          <p style="font-size:12px;color:var(--muted);margin-bottom:12px">
            This is the current in-memory mapping.yaml including any unsaved edits.
            <strong style="color:var(--yellow)">Save to Server</strong> writes it to disk on the backend.
            <strong style="color:var(--green)">Download</strong> saves a local copy.
          </p>
          <pre id="yaml-preview" style="background:rgba(0,0,0,0.4);border:1px solid var(--border);border-radius:10px;padding:16px;font-family:ui-monospace,monospace;font-size:11px;color:#86efac;white-space:pre-wrap;word-break:break-all;max-height:600px;overflow-y:auto;line-height:1.6">Click Refresh to generate…</pre>
        </div>
      </div>`;
  },

  _refreshYaml() {
    const pre = document.getElementById('yaml-preview');
    if (!pre) return;
    pre.textContent = this._generateYaml();
  },

  _downloadYaml() {
    const yaml = this._generateYaml();
    const a = document.createElement('a');
    a.href = URL.createObjectURL(new Blob([yaml], { type: 'text/yaml' }));
    a.download = `mapping_${new Date().toISOString().slice(0,10)}.yaml`;
    a.click();
  },

  _generateYaml() {
    const m = STATE.mapping;
    const lines = [];
    const w = s => lines.push(s ?? '');
    const yi = (k, v, n=0) => w(`${' '.repeat(n)}${k}: "${v}"`);
    const yb = (k, v, n=0) => w(`${' '.repeat(n)}${k}: ${v}`);
    const yl = (k, a, n=0) => w(`${' '.repeat(n)}${k}: [${(a||[]).map(x=>`"${x}"`).join(', ')}]`);

    w(`# =============================================================================`);
    w(`# mapping.yaml — SOC Onboarding Mapping Configuration`);
    w(`# Generated by SOC Manager — ${new Date().toISOString().slice(0,16).replace('T',' ')} UTC`);
    w(`# =============================================================================`);
    w();

    w('os_to_cis_benchmark:');
    Object.entries(m.os_to_cis_benchmark||{}).forEach(([k,v]) => w(`  "${k}": "${v}"`));
    w();

    w('product_to_cis_app_benchmark:');
    Object.entries(m.product_to_cis_app_benchmark||{}).forEach(([k,v]) => w(`  ${k}: "${v}"`));
    w();

    w('product_to_sigma:');
    Object.entries(m.product_to_sigma||{}).forEach(([k,v]) => w(`  ${k}: [${(v||[]).map(x=>`"${x}"`).join(', ')}]`));
    w();

    w('server_roles:'); w();
    Object.entries(m.server_roles||{}).forEach(([code, r]) => {
      w(`  ${code}:`);
      yi('label', r.label||'', 4);
      yi('device_function', r.device_function||'', 4);
      yi('cis_app_benchmark', r.cis_app_benchmark||'', 4);
      yl('sigma_product', r.sigma_product, 4);
      yl('sigma_log_categories', r.sigma_log_categories, 4);
      yb('product_overrides', r.product_overrides ? 'true' : 'false', 4);
      if (r.flag_log_path) yb('flag_log_path', 'true', 4);
      if (r.log_collector) yi('log_collector', r.log_collector, 4);
      w();
    });

    w('workstation_default: "WRK-STD"'); w();
    w('workstation_roles:'); w();
    Object.entries(m.workstation_roles||{}).forEach(([code, r]) => {
      w(`  ${code}:`);
      yi('label', r.label||'', 4);
      yi('device_function', r.device_function||'', 4);
      yi('cis_app_benchmark', r.cis_app_benchmark||'NA', 4);
      yl('sigma_product', r.sigma_product, 4);
      yl('sigma_log_categories', r.sigma_log_categories, 4);
      w();
    });

    w('appliance_roles:'); w();
    Object.entries(m.appliance_roles||{}).forEach(([code, r]) => {
      w(`  ${code}:`);
      yi('label', r.label||'', 4);
      yi('device_function', r.device_function||'', 4);
      yi('cis_os_benchmark', r.cis_os_benchmark||'VENDOR-OS', 4);
      yi('cis_app_benchmark', r.cis_app_benchmark||'VENDOR-GUIDE', 4);
      yl('sigma_product', r.sigma_product, 4);
      yl('sigma_log_categories', r.sigma_log_categories, 4);
      if (r.log_collector) yi('log_collector', r.log_collector, 4);
      w();
    });

    // Preserve static sections
    const staticSections = [
      'asset_netbox_target','ui_conditions','escalation','defaults','field_names','multiselect_fields'
    ];
    staticSections.forEach(key => {
      if (m[key] !== undefined) {
        // Use a simple serialiser for known static sections
        w(`${key}:`);
        const val = m[key];
        if (Array.isArray(val)) {
          val.forEach(v => w(`  - ${v}`));
        } else if (typeof val === 'object') {
          Object.entries(val).forEach(([k, v]) => {
            if (typeof v === 'object' && !Array.isArray(v)) {
              w(`  ${k}:`);
              Object.entries(v).forEach(([k2, v2]) => w(`    ${k2}: ${JSON.stringify(v2)}`));
            } else if (Array.isArray(v)) {
              w(`  ${k}: [${v.map(x=>`"${x}"`).join(', ')}]`);
            } else {
              w(`  ${k}: ${JSON.stringify(v)}`);
            }
          });
        }
        w();
      }
    });

    return lines.join('\n');
  },
};

// Wire up validation results storage
const _origValidate = App.validateAll.bind(App);
App.validateAll = async function() {
  Toast.show('Validating…', 'info');
  try {
    const result = await API.validate();
    window._lastValidation = result;
    if (result.valid && result.warnings.length === 0) {
      Toast.show(`✓ Valid — ${result.gap_count === 0 ? 'no gaps' : result.gap_count + ' gaps'}`, 'success');
    } else if (!result.valid) {
      Toast.show(`✗ ${result.errors.length} error(s) found`, 'error');
    } else {
      Toast.show(`⚠ ${result.warnings.length} warning(s)`, 'warning');
    }
    const el = document.querySelector('[data-page="gaps"]');
    if (el) App.nav(el);
  } catch(e) {
    Toast.show('Validation failed: ' + e.message, 'error');
  }
};
