"""
D1 · Paso 2: construcción de la base municipal a partir de d1/raw/ (sin datos externos).
Toda regla de limpieza queda registrada en d1/out/decisiones_limpieza.json con el
número de filas y el valor afectados.
"""
import os, json, re
import numpy as np, pandas as pd

H = os.path.dirname(os.path.dirname(os.path.abspath(__file__))); RAW = f"{H}/data/raw/"; OUT = f"{H}/data/out/"
os.makedirs(OUT, exist_ok=True)
DEC = []
def decision(regla, detalle, filas=None, valor=None):
    DEC.append({"regla": regla, "detalle": detalle, "filas_afectadas": filas,
                "valor_afectado_COP": None if valor is None else float(valor)})

def code5(s):
    """DIVIPOLA a 5 dígitos; acepta '5001', '5001.0', '05001'."""
    s = pd.Series(s, dtype="string").str.strip().str.replace(r"\.0$", "", regex=True)
    return s.where(s.str.fullmatch(r"\d+"), pd.NA).str.zfill(5)

# ---------- Universo: municipios DANE, población del año de corte ----------
pp = pd.read_excel(RAW + "dane_PPED-AreaMun-2018-2042_VP.xlsx", "PobMunicipalxÁrea", header=7)
# Año de población = año de la fecha de corte más reciente del dataset de financiación (acotado al rango DANE)
_fin = pd.read_csv(RAW + "financiacion_cultural.csv", dtype=str, usecols=["fecha_corte"])
ANIO_POB = int(min(max(pd.to_datetime(_fin.fecha_corte).dt.year.max(), 2018), 2042))
pp = pp.dropna(subset=["MPIO"]); pp["dv"] = code5(pp["MPIO"]); pp = pp[pp["AÑO"].astype(int) == ANIO_POB]
P = pp.pivot_table(index="dv", columns="ÁREA GEOGRÁFICA", values="TOTAL", aggfunc="sum")
P = P.rename(columns={"Cabecera Municipal": "pob_cabecera", "Centros Poblados y Rural Disperso": "pob_rural", "Total": "pob"})
P["pct_rural"] = 100 * P.pob_rural / P.pob
nom = pp.drop_duplicates("dv").set_index("dv")[["DPNOM", "DPMP"]].rename(columns={"DPNOM": "departamento", "DPMP": "municipio"})
M = nom.join(P[["pob", "pct_rural"]]); M["cod_depto"] = M.index.str[:2]
cero = M[M.pob <= 0]
decision("excluir_poblacion_cero", "Unidades con población DANE = 0 (no admiten cálculo per cápita): " + ", ".join(cero.municipio), len(cero))
M = M[M.pob > 0]
decision("universo", f"Municipios y áreas no municipalizadas con proyección DANE {ANIO_POB} (PPED, base CNPV 2018); año = año de corte de los datos de financiación.", len(M))

# ---------- Financiación cultural ----------
F = pd.read_csv(RAW + "financiacion_cultural.csv", dtype=str)
F["valor"] = pd.to_numeric(F["valor"]); F["dv"] = code5(F["divipola"])
n0, v0 = len(F), F.valor.sum()
# Regla 1: fila de totales incrustada (sin DIVIPOLA ni municipio, nombre = nº de filas restantes de su fuente,
# valor = suma exacta de las filas restantes de su fuente)
tot_rows = []
for fu, g in F.groupby("fuente"):
    for i, r in g[g.dv.isna() & g.municipio.isna()].iterrows():
        resto = g.drop(index=i)
        if str(r.nombre_del_proyecto).strip() == str(len(resto)) and np.isclose(r.valor, resto.valor.sum(), rtol=0, atol=1):
            tot_rows.append(i)
decision("excluir_fila_totales", "Fila cuyo valor es exactamente la suma del resto de su fuente y cuyo 'nombre' es el número de filas restantes.",
         len(tot_rows), F.loc[tot_rows, "valor"].sum())
F = F.drop(index=tot_rows)
decision("ceros", "Proyectos con valor = 0 se conservan (no alteran sumas; cuentan como proyecto).", int((F.valor == 0).sum()))
F["nivel"] = np.select([F.dv.isna().to_numpy(), F.dv.str.endswith("000").fillna(False).to_numpy(bool)], ["sin_codigo", "departamental"], "municipal")
for nv in ["sin_codigo", "departamental"]:
    s = F[F.nivel == nv]
    decision(f"excluir_{nv}", f"Proyectos de nivel '{nv}': no asignables a un municipio; se reportan aparte.", len(s), s.valor.sum())
fuera = F[(F.nivel == "municipal") & ~F.dv.isin(M.index).fillna(False)]
decision("excluir_codigo_no_DANE", "Código municipal sin correspondencia en el universo DANE del año de corte.", len(fuera), fuera.valor.sum())
F.to_csv(OUT + "financiacion_limpia.csv", index=False)
Fm = F[(F.nivel == "municipal") & F.dv.isin(M.index)]
ab = {"Ley de Espectáculos Públicos": "LEP", "Impuesto Nacional al Consumo": "INC", "Sistema General de Regalías": "SGR"}
nuevas = sorted(set(F.fuente.dropna()) - set(ab))
if nuevas:
    raise SystemExit(f"VALIDACIÓN: aparecieron fuentes no previstas {nuevas}. Se requiere revisión metodológica antes de publicar.")
Fm = Fm.assign(f=Fm.fuente.map(ab))
V = Fm.pivot_table(index="dv", columns="f", values="valor", aggfunc="sum").reindex(M.index).fillna(0)
N = Fm.pivot_table(index="dv", columns="f", values="valor", aggfunc="size").reindex(M.index).fillna(0)
for c in ["LEP", "INC", "SGR"]:
    M[f"valor_{c}"] = V.get(c, 0.0); M[f"n_{c}"] = N.get(c, 0).astype(int)
M["valor_total"] = M[[f"valor_{c}" for c in ["LEP", "INC", "SGR"]]].sum(axis=1)
for c in ["LEP", "INC", "SGR", "total"]:
    M[f"pc_{c}"] = M[f"valor_{c}"] / M.pob   # COP por habitante (población del año de corte)

# ---------- PDET ----------
pd_ = pd.read_csv(RAW + "municipios_pdet.csv", dtype=str); pd_["dv"] = code5(pd_.cod_muni)
M["pdet"] = M.index.isin(pd_.dv).astype(int)
M["subregion_pdet"] = M.index.map(pd_.set_index("dv").nom_subreg)
decision("pdet", "Municipios PDET (ART) cruzados por código DANE.", int(M.pdet.sum()))

# ---------- Víctimas (RUV, personas por lugar de ocurrencia, acumulado al corte más reciente) ----------
vi = pd.read_csv(RAW + "victimas_municipio_ocurrencia.csv", dtype=str); vi["dv"] = code5(vi.cod_ciudad_muni)
vi = vi.dropna(subset=["dv"]).set_index("dv")
M["victimas_ocurr"] = pd.to_numeric(vi.personas_ocurrencia).reindex(M.index)
decision("victimas_sin_match", "Municipios del universo sin registro en RUV (quedan NaN, no se imputan).", int(M.victimas_ocurr.isna().sum()))
M["victimas_x1000"] = 1000 * M.victimas_ocurr / M.pob

# ---------- MDM, año más reciente (DNP) ----------
md = pd.read_csv(RAW + "mdm_dnp.csv", dtype=str); md["dv"] = code5(md.codigo_entidad)
M["mdm"] = pd.to_numeric(md[md.indicador == "MDM"].set_index("dv").dato).reindex(M.index)
M["grupo_capacidad"] = md[md.indicador == "Grupo de dotaciones iniciales"].set_index("dv").etiqueta.reindex(M.index)

# ---------- Organizaciones culturales registradas (MinCulturas) ----------
og = pd.read_csv(RAW + "organizaciones_cultura.csv", dtype=str); og["dv"] = code5(og.divipola)
M["orgs_cultura"] = og.groupby("dv").size().reindex(M.index).fillna(0)
M["orgs_x10k"] = 1e4 * M.orgs_cultura / M.pob

# ---------- Beneficiarios MinCulturas 2023-2026 y centroides ----------
be = pd.read_csv(RAW + "beneficiarios_mincultura.csv", dtype=str); be["dv"] = code5(be.divipola)
M["benef_2023_26"] = pd.to_numeric(be.total_personas_atendidas).groupby(be.dv).sum().reindex(M.index)
M["benef_x1000"] = 1000 * M.benef_2023_26 / M.pob
cen = be.dropna(subset=["centroide_municipio"]).drop_duplicates("dv").set_index("dv").centroide_municipio
xy = cen.str.extract(r"POINT \(([-\d\.]+) ([-\d\.]+)\)").astype(float)
M["lon"], M["lat"] = xy[0].reindex(M.index), xy[1].reindex(M.index)
decision("centroides", "Centroides municipales tomados del dataset de beneficiarios (MinCulturas); municipios sin centroide.", int(M.lon.isna().sum()))

M.attrs["anio_pob"] = ANIO_POB
json.dump({"anio_poblacion": ANIO_POB}, open(OUT + "parametros.json", "w"))
M.to_csv(OUT + "base_municipal.csv")
json.dump(DEC, open(OUT + "decisiones_limpieza.json", "w"), ensure_ascii=False, indent=1)
print(f"Base: {len(M)} municipios; financiación original {n0} filas / {v0/1e9:.1f} mil M COP")
for d in DEC: print(" -", d["regla"], d["filas_afectadas"], "" if d["valor_afectado_COP"] is None else f"{d['valor_afectado_COP']/1e9:.1f} mil M")
print("Valor municipal analizado (mil M):", round(M.valor_total.sum()/1e9, 1), {c: round(M[f'valor_{c}'].sum()/1e9, 1) for c in ['LEP','INC','SGR']})
print("NaN:", M[["victimas_x1000","mdm","grupo_capacidad","benef_x1000","lon"]].isna().sum().to_dict())
