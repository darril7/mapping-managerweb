"""
SOC Mapping Manager — FastAPI Backend
======================================
Connects to NetBox and mapping.yaml.
Serves the frontend as static files from /app/static.

Environment variables (set in docker-compose.yml or .env):
    NETBOX_URL    — e.g. https://netbox.reduno.online
    NETBOX_TOKEN  — NetBox API token
    MAPPING_FILE  — path to mapping.yaml (default: /data/mapping.yaml)
    VERIFY_SSL    — true/false (default: false)
"""

import os, re, ast, json, asyncio
from copy import deepcopy
from datetime import datetime, timezone
from pathlib import Path
from typing import Any

import httpx
import yaml
from fastapi import FastAPI, HTTPException, Body
from fastapi.middleware.cors import CORSMiddleware
from fastapi.responses import HTMLResponse, FileResponse, JSONResponse
from fastapi.staticfiles import StaticFiles

# ── Config ─────────────────────────────────────────────────────────────────────
NETBOX_URL   = os.getenv("NETBOX_URL",   "https://netbox.reduno.online").rstrip("/")
NETBOX_TOKEN = os.getenv("NETBOX_TOKEN", "")
MAPPING_FILE = Path(os.getenv("MAPPING_FILE", "/data/mapping.yaml"))
VERIFY_SSL   = os.getenv("VERIFY_SSL", "false").lower() == "true"
STATIC_DIR   = Path("/app/static")

HEADERS = {
    "Authorization": f"Token {NETBOX_TOKEN}",
    "Content-Type":  "application/json",
    "Accept":        "application/json",
}

# ── App ────────────────────────────────────────────────────────────────────────
app = FastAPI(title="SOC Mapping Manager", version="1.0.0")

app.add_middleware(
    CORSMiddleware,
    allow_origins=["*"],
    allow_methods=["*"],
    allow_headers=["*"],
)

# ── NetBox helpers ─────────────────────────────────────────────────────────────
async def nb_get(endpoint: str) -> dict:
    url = f"{NETBOX_URL}/api/{endpoint}"
    async with httpx.AsyncClient(verify=VERIFY_SSL, timeout=20) as client:
        r = await client.get(url, headers=HEADERS)
        r.raise_for_status()
        return r.json()

async def nb_paginate(endpoint: str) -> list:
    results = []
    url = f"{NETBOX_URL}/api/{endpoint}"
    async with httpx.AsyncClient(verify=VERIFY_SSL, timeout=20) as client:
        while url:
            r = await client.get(url, headers=HEADERS)
            r.raise_for_status()
            data = r.json()
            results.extend(data.get("results", []))
            url = data.get("next")
    return results

async def nb_post(endpoint: str, payload: dict) -> dict:
    url = f"{NETBOX_URL}/api/{endpoint}"
    async with httpx.AsyncClient(verify=VERIFY_SSL, timeout=20) as client:
        r = await client.post(url, headers=HEADERS, json=payload)
        r.raise_for_status()
        return r.json()

async def nb_patch(endpoint: str, obj_id: int, payload: dict) -> dict:
    url = f"{NETBOX_URL}/api/{endpoint}{obj_id}/"
    async with httpx.AsyncClient(verify=VERIFY_SSL, timeout=20) as client:
        r = await client.patch(url, headers=HEADERS, json=payload)
        r.raise_for_status()
        return r.json()

def parse_choices(raw_choices: list) -> list[dict]:
    """Normalise choice list to [{value, label}] regardless of NetBox format."""
    result = []
    for c in raw_choices:
        if isinstance(c, dict):
            result.append({"value": c.get("value",""), "label": c.get("label","")})
        elif isinstance(c, list) and len(c) >= 2:
            result.append({"value": c[0], "label": c[1]})
        elif isinstance(c, str):
            try:
                p = ast.literal_eval(c)
                if isinstance(p, (list, tuple)):
                    result.append({"value": p[0], "label": p[1]})
            except Exception:
                result.append({"value": c, "label": c})
    return result

# ── Mapping helpers ────────────────────────────────────────────────────────────
def load_mapping() -> dict:
    if not MAPPING_FILE.exists():
        raise HTTPException(status_code=404, detail=f"mapping.yaml not found at {MAPPING_FILE}")
    with open(MAPPING_FILE, encoding="utf-8") as f:
        return yaml.safe_load(f) or {}

def save_mapping(data: dict) -> None:
    MAPPING_FILE.parent.mkdir(parents=True, exist_ok=True)
    # Write with a backup first
    backup = MAPPING_FILE.with_suffix(".yaml.bak")
    if MAPPING_FILE.exists():
        import shutil
        shutil.copy2(MAPPING_FILE, backup)
    with open(MAPPING_FILE, "w", encoding="utf-8") as f:
        yaml.dump(data, f, allow_unicode=True, default_flow_style=False,
                  sort_keys=False, width=120)

# ── Gap computation ────────────────────────────────────────────────────────────
def compute_gaps(schema: dict, mapping: dict) -> list[dict]:
    """Returns device_function values in NetBox not covered by any mapping role."""
    df_choices = {c["value"] for c in schema.get("device_functions", [])}
    mapped = set()
    for section in ["server_roles", "workstation_roles", "appliance_roles"]:
        for role in mapping.get(section, {}).values():
            fn = role.get("device_function", "")
            if fn:
                mapped.add(fn)
    return [
        {"value": v, "label": next((c["label"] for c in schema.get("device_functions",[]) if c["value"]==v), v)}
        for v in sorted(df_choices - mapped)
    ]

# ── API routes ─────────────────────────────────────────────────────────────────

@app.get("/api/health")
async def health():
    return {"status": "ok", "netbox_url": NETBOX_URL,
            "mapping_file": str(MAPPING_FILE),
            "mapping_exists": MAPPING_FILE.exists()}

@app.get("/api/schema")
async def get_schema():
    """Pull live choice sets, custom fields and sites from NetBox."""
    try:
        cs_raw = await nb_paginate("extras/custom-field-choice-sets/?limit=200")
        cf_raw = await nb_paginate("extras/custom-fields/?object_type=dcim.device&limit=200")
        sites  = await nb_paginate("dcim/sites/?limit=200")
        info   = await nb_get("status/")
    except httpx.HTTPStatusError as e:
        raise HTTPException(status_code=502, detail=f"NetBox error: {e.response.status_code} {e.response.text[:200]}")
    except Exception as e:
        raise HTTPException(status_code=502, detail=f"Cannot reach NetBox: {str(e)}")

    choice_sets = {}
    for cs in cs_raw:
        name = cs.get("name","")
        if name.startswith("SOC_"):
            choice_sets[name] = {
                "id":      cs["id"],
                "name":    name,
                "choices": parse_choices(cs.get("extra_choices", [])),
            }

    custom_fields = []
    for cf in cf_raw:
        cs_obj  = cf.get("choice_set") or {}
        cs_name = cs_obj.get("name","") if isinstance(cs_obj, dict) else ""
        custom_fields.append({
            "name":       cf.get("name",""),
            "label":      cf.get("label", cf.get("name","")),
            "type":       (cf.get("type") or {}).get("value","text"),
            "choice_set": cs_name,
        })

    # Build flat lists for easy consumption by the frontend
    def cs(name): return choice_sets.get(name,{}).get("choices",[])

    return {
        "meta": {
            "generated_at": datetime.now(timezone.utc).isoformat(),
            "netbox_url":   NETBOX_URL,
            "netbox_version": info.get("netbox-version",""),
        },
        "choice_sets":      choice_sets,
        "custom_fields":    custom_fields,
        "sites":            [{"slug": s["slug"], "name": s["name"]} for s in sites],
        # Flattened for frontend convenience
        "device_functions":    cs("SOC_DeviceFunction"),
        "cis_os":              cs("SOC_CIS_OS_Benchmark"),
        "cis_app":             cs("SOC_CIS_App_Benchmark"),
        "cis_profile":         cs("SOC_CIS_Profile"),
        "sigma_products":      cs("SOC_SigmaProduct"),
        "sigma_log_cats":      cs("SOC_SigmaLogCategories"),
        "log_collectors":      cs("SOC_LogCollector"),
        "hardening_statuses":  cs("SOC_HardeningStatus"),
        "log_coll_statuses":   cs("SOC_LogCollectionStatus"),
    }

@app.get("/api/mapping")
async def get_mapping():
    """Return the current mapping.yaml as structured JSON."""
    m = load_mapping()
    return m

@app.post("/api/mapping")
async def save_mapping_api(data: dict = Body(...)):
    """Overwrite mapping.yaml with the posted data."""
    # Basic validation
    required = ["os_to_cis_benchmark", "product_to_cis_app_benchmark",
                "product_to_sigma", "server_roles"]
    missing = [k for k in required if k not in data]
    if missing:
        raise HTTPException(status_code=400, detail=f"Missing required keys: {missing}")
    save_mapping(data)
    return {"ok": True, "saved_at": datetime.now(timezone.utc).isoformat()}

@app.get("/api/gaps")
async def get_gaps():
    """Compute mapping vs NetBox gaps — device_function values with no mapping entry."""
    try:
        schema = await get_schema()
    except Exception as e:
        raise HTTPException(status_code=502, detail=str(e))
    mapping = load_mapping()
    gaps = compute_gaps(schema, mapping)
    return {"gaps": gaps, "count": len(gaps)}

@app.post("/api/validate")
async def validate_mapping():
    """
    Validate every value in mapping.yaml against the live NetBox schema.
    Returns lists of errors and warnings.
    """
    try:
        schema = await get_schema()
    except Exception as e:
        raise HTTPException(status_code=502, detail=str(e))
    mapping = load_mapping()

    errors   = []
    warnings = []

    nb_df   = {c["value"] for c in schema["device_functions"]}
    nb_cis_os  = {c["value"] for c in schema["cis_os"]}
    nb_cis_app = {c["value"] for c in schema["cis_app"]}
    nb_sigma   = {c["value"] for c in schema["sigma_products"]}
    nb_logcat  = {c["value"] for c in schema["sigma_log_cats"]}
    nb_logcoll = {c["value"] for c in schema["log_collectors"]}

    for os_str, bm in mapping.get("os_to_cis_benchmark",{}).items():
        if bm not in nb_cis_os:
            errors.append(f"os_to_cis_benchmark: '{os_str}' → '{bm}' not in SOC_CIS_OS_Benchmark")

    for prod, bm in mapping.get("product_to_cis_app_benchmark",{}).items():
        if bm not in nb_cis_app:
            errors.append(f"product_to_cis_app_benchmark: '{prod}' → '{bm}' not in SOC_CIS_App_Benchmark")

    for prod, tags in mapping.get("product_to_sigma",{}).items():
        for t in tags:
            if t not in nb_sigma:
                errors.append(f"product_to_sigma: '{prod}' → '{t}' not in SOC_SigmaProduct")

    for section in ["server_roles","workstation_roles","appliance_roles"]:
        for code, cfg in mapping.get(section,{}).items():
            df = cfg.get("device_function","")
            if df and df not in nb_df:
                errors.append(f"{section}/{code}: device_function='{df}' not in SOC_DeviceFunction")
            for sp in cfg.get("sigma_product",[]):
                if sp not in nb_sigma:
                    errors.append(f"{section}/{code}: sigma_product='{sp}' not in SOC_SigmaProduct")
            for sc in cfg.get("sigma_log_categories",[]):
                if sc not in nb_logcat:
                    errors.append(f"{section}/{code}: sigma_log_categories='{sc}' not in SOC_SigmaLogCategories")
            lc = cfg.get("log_collector","")
            if lc and lc not in nb_logcoll:
                errors.append(f"{section}/{code}: log_collector='{lc}' not in SOC_LogCollector")

    gaps = compute_gaps(schema, mapping)
    for g in gaps:
        warnings.append(f"SOC_DeviceFunction '{g['value']}' has no mapping entry")

    return {
        "valid":    len(errors) == 0,
        "errors":   errors,
        "warnings": warnings,
        "gap_count": len(gaps),
    }

@app.post("/api/netbox/choiceset/add")
async def add_to_choiceset(payload: dict = Body(...)):
    """
    Add new values to an existing NetBox choice set.
    Body: { "choice_set": "SOC_DeviceFunction", "values": [["CODE","Label"], ...] }
    """
    cs_name = payload.get("choice_set","")
    new_vals = payload.get("values",[])
    if not cs_name or not new_vals:
        raise HTTPException(status_code=400, detail="choice_set and values are required")

    try:
        cs_raw = await nb_paginate(f"extras/custom-field-choice-sets/?name={cs_name}&limit=1")
    except Exception as e:
        raise HTTPException(status_code=502, detail=str(e))

    if not cs_raw:
        raise HTTPException(status_code=404, detail=f"Choice set '{cs_name}' not found in NetBox")

    cs = cs_raw[0]
    existing_vals = {c[0] if isinstance(c,list) else c.get("value","")
                     for c in cs.get("extra_choices",[])}
    to_add = [v for v in new_vals if v[0] not in existing_vals]
    if not to_add:
        return {"ok": True, "added": 0, "message": "All values already exist"}

    new_choices = list(cs.get("extra_choices",[])) + to_add
    try:
        await nb_patch("extras/custom-field-choice-sets/", cs["id"],
                       {"extra_choices": new_choices})
    except Exception as e:
        raise HTTPException(status_code=502, detail=str(e))

    return {"ok": True, "added": len(to_add),
            "values": [v[0] for v in to_add]}

@app.get("/api/form/generate", response_class=HTMLResponse)
async def generate_form():
    """Generate and return the device onboarding HTML form."""
    try:
        schema  = await get_schema()
        mapping = load_mapping()
    except Exception as e:
        raise HTTPException(status_code=500, detail=str(e))

    # Import the form builder from the schema pull script if available,
    # otherwise use the inline builder below
    try:
        import sys
        sys.path.insert(0, "/app")
        from netbox_schema_pull import build_html
        html = build_html(schema, mapping)
    except ImportError:
        html = _build_form_html(schema, mapping)

    return HTMLResponse(content=html)

@app.get("/api/form/download")
async def download_form():
    """Generate and download the onboarding form as a file."""
    try:
        schema  = await get_schema()
        mapping = load_mapping()
    except Exception as e:
        raise HTTPException(status_code=500, detail=str(e))

    try:
        import sys
        sys.path.insert(0, "/app")
        from netbox_schema_pull import build_html
        html = build_html(schema, mapping)
    except ImportError:
        html = _build_form_html(schema, mapping)

    date = datetime.now().strftime("%Y-%m-%d")
    out  = Path(f"/tmp/device_onboarding_form_{date}.html")
    out.write_text(html, encoding="utf-8")
    return FileResponse(path=str(out), filename=out.name,
                        media_type="text/html")

def _build_form_html(schema: dict, mapping: dict) -> str:
    """Minimal fallback if netbox_schema_pull.py is not present."""
    return f"""<!DOCTYPE html><html><head><title>Onboarding Form</title></head>
<body><h1>Device Onboarding</h1>
<p>Generated {datetime.now().isoformat()[:16]} from {schema['meta']['netbox_url']}</p>
<p>To get the full form, place netbox_schema_pull.py in /app/ inside the container.</p>
</body></html>"""

# ── Static files (frontend) ────────────────────────────────────────────────────
if STATIC_DIR.exists():
    app.mount("/", StaticFiles(directory=str(STATIC_DIR), html=True), name="static")
else:
    @app.get("/")
    async def root():
        return {"message": "Frontend not built yet. Run: docker compose up --build"}
