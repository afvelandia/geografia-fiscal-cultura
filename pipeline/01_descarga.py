"""
D1 · Geografía fiscal de la cultura en Colombia
Paso 1: descarga de fuentes oficiales con registro de procedencia.

Cada fuente se guarda SIN MODIFICAR en d1/raw/. Para cada una se registra en
d1/raw/procedencia.json: entidad, identificador, URL exacta de la consulta
(con parámetros), fecha-hora UTC de descarga, filas, bytes y SHA-256.
También se guardan los metadatos oficiales de cada dataset (descripción,
entidad publicadora, fecha de actualización) tal como los publica el portal.
"""
import hashlib, json, os, io, datetime as dt, requests, urllib.parse
import pandas as pd

RAW = os.path.join(os.path.dirname(os.path.dirname(os.path.abspath(__file__))), "data", "raw")
os.makedirs(RAW, exist_ok=True)
SOC = "https://www.datos.gov.co"
LOG = []

def sha(b): return hashlib.sha256(b).hexdigest()

def save(name, content, meta):
    path = os.path.join(RAW, name)
    with open(path, "wb") as f: f.write(content)
    meta.update(archivo=name, bytes=len(content), sha256=sha(content),
                descargado_utc=dt.datetime.now(dt.timezone.utc).isoformat(timespec="seconds"))
    LOG.append(meta); print(f"{name}: {meta.get('filas','?')} filas, sha256={meta['sha256'][:12]}…")

def socrata(ds_id, fname, entidad, params=None):
    """Descarga completa paginada en CSV (formato original del portal)."""
    params = dict(params or {})
    # metadatos oficiales
    m = requests.get(f"{SOC}/api/views/{ds_id}.json", timeout=60); m.raise_for_status()
    mj = m.json()
    save(f"{fname}__metadatos.json", m.content,
         {"fuente": "datos.gov.co (metadatos oficiales)", "dataset_id": ds_id,
          "url": f"{SOC}/api/views/{ds_id}.json"})
    pages, offset, nrows = [], 0, 0
    while True:
        p = {**params, "$limit": 50000, "$offset": offset, "$order": params.get("$order", ":id")}
        url = f"{SOC}/resource/{ds_id}.csv?" + urllib.parse.urlencode(p)
        r = requests.get(url, timeout=600); r.raise_for_status()
        n = len(pd.read_csv(io.BytesIO(r.content), dtype=str, keep_default_na=False))  # registros reales
        body = r.content if not pages else r.content.split(b"\n", 1)[1]  # quitar encabezado repetido
        pages.append(body); nrows += n; offset += 50000
        if n < 50000: break
    content = b"".join(pages)
    chunks = range(nrows)
    # verificación cruzada con el conteo del servidor
    if "$group" not in params:
        cq = {"$select": "count(*)"}; 
        if "$where" in params: cq["$where"] = params["$where"]
        srv = int(requests.get(f"{SOC}/resource/{ds_id}.json", params=cq, timeout=120).json()[0]["count"])
        assert srv == nrows, f"{ds_id}: servidor={srv} vs descargado={nrows}"
    base_q = {k: v for k, v in params.items()}
    save(f"{fname}.csv", content,
         {"fuente": "datos.gov.co (API Socrata)", "entidad_publicadora": mj.get("attribution") or entidad,
          "dataset_id": ds_id, "nombre_oficial": mj.get("name"),
          "actualizado_portal": dt.datetime.fromtimestamp(mj.get("rowsUpdatedAt", 0), dt.timezone.utc).isoformat() if mj.get("rowsUpdatedAt") else None,
          "url": f"{SOC}/resource/{ds_id}.csv", "parametros_consulta": base_q,
          "filas": len(chunks)})

# 1. Proyectos financiados por fuentes de financiación cultural
socrata("tq67-uc4p", "financiacion_cultural", "Ministerio de las Culturas, las Artes y los Saberes")
# 2. Beneficiarios del Ministerio por municipio y vigencia
socrata("bq7b-e3sb", "beneficiarios_mincultura", "Ministerio de las Culturas, las Artes y los Saberes")
# 3. Organizaciones y entidades del sector cultura
socrata("eenq-ga7s", "organizaciones_cultura", "Ministerio de las Culturas, las Artes y los Saberes")
# 4. Municipios PDET
socrata("idrk-ba8y", "municipios_pdet", "Agencia de Renovación del Territorio (según metadatos)")
# 5. Víctimas por municipio de ocurrencia: agregación en el servidor, corte MÁS RECIENTE (se determina en cada ejecución)
_fc = requests.get(f"{SOC}/resource/ykxr-xynr.json", params={"$select": "fecha_corte", "$group": "fecha_corte", "$limit": 5000}, timeout=300).json()
def _pf(d):
    for fmt in ("%d/%m/%Y", "%Y/%m/%d", "%d/%m/%y", "%d/%m/%Y %H:%M", "%Y-%m-%dT%H:%M:%S.%f"):
        try: return dt.datetime.strptime(d.strip(), fmt)
        except ValueError: pass
    raise ValueError(f"Formato de fecha_corte no reconocido: {d!r}")
CORTE_VICT = max((x["fecha_corte"] for x in _fc if x.get("fecha_corte")), key=_pf)
print("Corte de víctimas más reciente:", CORTE_VICT)
socrata("ykxr-xynr", "victimas_municipio_ocurrencia", "Unidad para las Víctimas (RUV)",
        {"$select": "cod_ciudad_muni, sum(per_ocu) as personas_ocurrencia, sum(eventos) as eventos",
         "$where": f"fecha_corte='{CORTE_VICT}'", "$group": "cod_ciudad_muni", "$order": "cod_ciudad_muni"})
# 6. Medición de Desempeño Municipal (DNP): año MÁS RECIENTE publicado
ANIO_MDM = max(int(x["anio"]) for x in requests.get(f"{SOC}/resource/nkjx-rsq7.json", params={"$select": "anio", "$where": "indicador='MDM'", "$group": "anio"}, timeout=120).json())
print("Año MDM más reciente:", ANIO_MDM)
socrata("nkjx-rsq7", "mdm_dnp", "Departamento Nacional de Planeación",
        {"$where": f"anio='{ANIO_MDM}' AND (indicador='MDM' OR indicador='Grupo de dotaciones iniciales')"})
# 7. Proyecciones de población municipal DANE (CNPV 2018), 2018-2042
u = "https://www.dane.gov.co/files/censo2018/proyecciones-de-poblacion/Municipal/PPED-AreaMun-2018-2042_VP.xlsx"
r = requests.get(u, timeout=300); r.raise_for_status()
save("dane_PPED-AreaMun-2018-2042_VP.xlsx", r.content,
     {"fuente": "DANE, Proyecciones de población municipal por área 2018-2042 (base CNPV 2018)",
      "entidad_publicadora": "DANE", "url": u})

with open(os.path.join(RAW, "procedencia.json"), "w", encoding="utf-8") as f:
    json.dump(LOG, f, ensure_ascii=False, indent=1)
print("procedencia.json escrito con", len(LOG), "registros")
