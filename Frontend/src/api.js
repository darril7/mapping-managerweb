// api.js — all calls to the FastAPI backend

const BASE = import.meta.env?.VITE_API_URL || '';

async function request(path, opts = {}) {
  const res = await fetch(BASE + path, {
    headers: { 'Content-Type': 'application/json', ...(opts.headers || {}) },
    ...opts,
  });
  if (!res.ok) {
    let detail = res.statusText;
    try { const j = await res.json(); detail = j.detail || JSON.stringify(j); } catch {}
    throw new Error(`${res.status} ${detail}`);
  }
  return res;
}

export const API = {
  async getSchema()         { return (await request('/api/schema')).json(); },
  async getMapping()        { return (await request('/api/mapping')).json(); },
  async saveMapping(data)   { return (await request('/api/mapping', { method:'POST', body: JSON.stringify(data) })).json(); },
  async getGaps()           { return (await request('/api/gaps')).json(); },
  async validate()          { return (await request('/api/validate', { method:'POST' })).json(); },
  async health()            { return (await request('/api/health')).json(); },
  async addToChoiceset(cs_name, values) {
    return (await request('/api/netbox/choiceset/add', {
      method: 'POST',
      body: JSON.stringify({ choice_set: cs_name, values }),
    })).json();
  },
  async downloadForm() {
    const res = await request('/api/form/download');
    return res.blob();
  },
};
