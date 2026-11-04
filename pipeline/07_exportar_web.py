"""
Paso 7: validación y exportación de datos para el sitio web.
Si cualquier verificación falla, el script termina con error y el flujo de publicación se detiene:
el sitio conserva la última versión validada.
"""
import os, json, shutil, datetime as dt
import numpy as np, pandas as pd

ROOT = os.path.dirname(os.path.dirname(os.path.abspath(__file__)))
RAW, OUT = f"{ROOT}/data/raw/", f"{ROOT}/data/out/"
WEB = f"{ROOT}/site/data/"; DL = f"{ROOT}/site/descargas/"
os.makedirs(WEB, exist_ok=True); os.makedirs(DL, exist_ok=True)
ERR = []
def check(cond, msg):
    if not cond: ERR.append(msg)

M = pd.read_csv(OUT + "base_municipal.csv", dtype={"dv": str}).set_index("dv")
dec = json.load(open(OUT + "decisiones_limpieza.json"))
prov = [p for p in json.load(open(RAW + "procedencia.json")) if not p["archivo"].endswith("__metadatos.json")]
par = json.load(open(OUT + "parametros.json"))
t1 = pd.read_csv(OUT + "t1_brecha_pdet.csv"); t2 = pd.read_csv(OUT + "t2_desigualdad.csv")
t3 = pd.read_csv(OUT + "t3_ppml.csv"); t4 = pd.read_csv(OUT + "t4_espacial.csv")
t6 = pd.read_csv(OUT + "t6_topicos_nmf.csv"); t7 = pd.read_csv(OUT + "t7_concentracion.csv")
lisa = pd.read_csv(OUT + "lisa_municipios.csv", dtype={"dv": str}).set_index("dv")
F = pd.read_csv(RAW + "financiacion_cultural.csv", dtype=str); F["valor"] = pd.to_numeric(F.valor)

# ---------------- Validaciones ----------------
excl = sum(d["valor_afectado_COP"] or 0 for d in dec if d["regla"].startswith("excluir_") and d["regla"] != "excluir_poblacion_cero")
check(abs(F.valor.sum() - excl - M.valor_total.sum()) < 1, "Las sumas no cuadran: original − excluido ≠ analizado")
check(1100 <= len(M) <= 1130, f"Universo municipal inesperado: {len(M)}")
check(150 <= M.pdet.sum() <= 200, f"Número de municipios PDET inesperado: {M.pdet.sum()}")
for c in ["LEP", "INC", "SGR"]:
    check(M[f"valor_{c}"].sum() > 0, f"Fuente {c} sin recursos municipales")
check(M.pob.gt(0).all(), "Población no positiva en el universo")
check(t3.p.notna().all() and t1.razon_PDET_noPDET.notna().all(), "Resultados con valores faltantes")
prev = f"{WEB}resumen.json"
if os.path.exists(prev):
    old = json.load(open(prev))
    v_old, v_new = old["totales"]["valor_municipal_COP"], float(M.valor_total.sum())
    check(0.5 < v_new / v_old < 2.0, f"Cambio anómalo del valor total: {v_old:.0f} → {v_new:.0f} (requiere revisión)")
if ERR:
    open(OUT + "VALIDACION_FALLIDA.txt", "w").write("\n".join(ERR))
    raise SystemExit("VALIDACIÓN FALLIDA:\n- " + "\n- ".join(ERR))

# ---------------- Exportación ----------------
def rec(df): return json.loads(df.replace({np.nan: None}).to_json(orient="records"))
fc = F.groupby("fuente").fecha_corte.max().str[:10].to_dict()
meta_fin = json.load(open(RAW + "financiacion_cultural__metadatos.json"))
resumen = {
    "generado_utc": dt.datetime.now(dt.timezone.utc).isoformat(timespec="seconds"),
    "descarga_utc": min(p["descargado_utc"] for p in prov),
    "fecha_corte_por_fuente": fc, "anio_poblacion": par["anio_poblacion"],
    "corte_victimas": next((p["parametros_consulta"].get("$where", "") for p in prov if p["archivo"].startswith("victimas")), ""),
    "descripcion_oficial_financiacion": meta_fin.get("description"),
    "totales": {"filas_originales": int(len(F)), "valor_original_COP": float(F.valor.sum()),
                "valor_municipal_COP": float(M.valor_total.sum()), "municipios": int(len(M)),
                "municipios_pdet": int(M.pdet.sum()), "pct_pob_pdet": float(100 * M[M.pdet == 1].pob.sum() / M.pob.sum())},
    "decisiones": dec, "procedencia": prov,
    "procedencia_geo": json.load(open(f"{ROOT}/data/procedencia_geo.json")) if os.path.exists(f"{ROOT}/data/procedencia_geo.json") else None,
    "brecha": rec(t1), "desigualdad": rec(t2), "ppml": rec(t3), "espacial": rec(t4),
    "topicos": rec(t6), "concentracion": rec(t7),
}
json.dump(resumen, open(WEB + "resumen.json", "w"), ensure_ascii=False)
cols = ["municipio", "departamento", "pob", "pct_rural", "pdet", "subregion_pdet", "victimas_x1000", "mdm", "grupo_capacidad", "orgs_cultura"]
for c in ["LEP", "INC", "SGR", "total"]: cols += [f"valor_{c}", f"pc_{c}"]
for c in ["LEP", "INC", "SGR"]: cols += [f"n_{c}"]
mu = M[cols].copy()
for c in ["LEP", "INC", "SGR", "total"]: mu[f"lisa_{c}"] = lisa[f"lisa_{c}"].reindex(mu.index)
mu["rank_pc_total"] = mu.pc_total.rank(ascending=False, method="min").astype(int)
mu = mu.round({"pct_rural": 1, "victimas_x1000": 1, "mdm": 2, **{f"pc_{c}": 1 for c in ["LEP", "INC", "SGR", "total"]}})
json.dump({k: {kk: (None if (isinstance(vv, float) and np.isnan(vv)) else vv) for kk, vv in v.items()} for k, v in mu.to_dict(orient="index").items()},
          open(WEB + "municipios.json", "w"), ensure_ascii=False)
lor = json.load(open(OUT + "lorenz.json")); lw = {}
for c, d in lor.items():
    x, y = np.array(d["pob_acum"]), np.array(d["valor_acum"]); q = np.linspace(0, 1, 201)
    lw[c] = {"x": q.round(4).tolist(), "y": np.interp(q, x, y).round(4).tolist()}
json.dump(lw, open(WEB + "lorenz.json", "w"))
for f in ["base_municipal.csv", "t1_brecha_pdet.csv", "t2_desigualdad.csv", "t3_ppml.csv", "t4_espacial.csv",
          "t6_topicos_nmf.csv", "t7_concentracion.csv", "decisiones_limpieza.json"]:
    shutil.copy(OUT + f, DL + f)
shutil.copy(RAW + "procedencia.json", DL + "procedencia.json")
print("Exportación web OK:", len(mu), "municipios;", resumen["generado_utc"])
