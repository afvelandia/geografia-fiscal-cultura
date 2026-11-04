"""
D1 · Paso 3: análisis. Entrada: d1/out/base_municipal.csv, d1/out/financiacion_limpia.csv.
Salidas: tablas CSV/JSON en d1/out/. Semilla fija para bootstrap y permutaciones.
Métodos:
  - Gini y Theil T ponderados por población; descomposición del Theil entre/dentro de grupos (Shorrocks 1980).
  - Pesos per cápita por grupo = Σ valor / Σ población; IC 95 % por bootstrap de municipios estratificado (2.000 réplicas).
  - PPML (Santos Silva & Tenreyro 2006): GLM Poisson con enlace log, EF de departamento, EE agrupados por departamento.
  - I de Moran global y LISA (Anselin 1995), pesos KNN k=8 sobre centroides, 9.999 permutaciones, FDR (Benjamini-Hochberg).
  - Categorías oficiales del dataset y NMF exploratorio (Lee & Seung 1999) sobre TF-IDF de nombres de proyecto.
"""
import os, json, re, unicodedata
import numpy as np, pandas as pd
import statsmodels.api as sm, statsmodels.formula.api as smf
from libpysal.weights import KNN
from esda.moran import Moran, Moran_Local
from statsmodels.stats.multitest import multipletests

H = os.path.dirname(os.path.dirname(os.path.abspath(__file__))); OUT = f"{H}/data/out/"
rng = np.random.default_rng(20261104)
M = pd.read_csv(OUT + "base_municipal.csv", dtype={"dv": str}).set_index("dv")
SRC = ["LEP", "INC", "SGR", "total"]
R = {}

# ---------- A. Descriptivos y brecha per cápita ----------
def pc_group(df, c): return df[f"valor_{c}"].sum() / df.pob.sum()
rows = []
for c in SRC:
    g1, g0 = M[M.pdet == 1], M[M.pdet == 0]
    pc1, pc0 = pc_group(g1, c), pc_group(g0, c)
    boots = []
    for _ in range(2000):
        b1 = g1.iloc[rng.integers(0, len(g1), len(g1))]; b0 = g0.iloc[rng.integers(0, len(g0), len(g0))]
        boots.append(pc_group(b1, c) / pc_group(b0, c))
    lo, hi = np.percentile(boots, [2.5, 97.5])
    rows.append({"fuente": c, "valor_mil_M": M[f"valor_{c}"].sum() / 1e9,
                 "municipios_con_recursos": int((M[f"valor_{c}"] > 0).sum()),
                 "pct_valor_a_PDET": 100 * g1[f"valor_{c}"].sum() / M[f"valor_{c}"].sum(),
                 "pct_poblacion_PDET": 100 * g1.pob.sum() / M.pob.sum(),
                 "pct_municipios_PDET": 100 * len(g1) / len(M),
                 "COP_por_hab_PDET": pc1, "COP_por_hab_noPDET": pc0,
                 "razon_PDET_noPDET": pc1 / pc0, "IC95_lo": lo, "IC95_hi": hi})
T1 = pd.DataFrame(rows); T1.to_csv(OUT + "t1_brecha_pdet.csv", index=False); print(T1.round(2).to_string())

# ---------- B. Desigualdad ----------
def gini_w(y, w):
    o = np.argsort(y); y, w = np.asarray(y)[o], np.asarray(w)[o]
    cw = np.cumsum(w) / w.sum(); cy = np.cumsum(y * w) / (y * w).sum()
    return 1 - np.sum((cw - np.r_[0, cw[:-1]]) * (cy + np.r_[0, cy[:-1]]))
def theil_T(v, p):
    s, q = v / v.sum(), p / p.sum(); m = s > 0
    return float(np.sum(s[m] * np.log(s[m] / q[m])))
rows = []
for c in SRC:
    v, p = M[f"valor_{c}"].values, M.pob.values
    T = theil_T(v, p); S = {}; within = 0.0; between = 0.0
    for gname, g in M.groupby("pdet"):
        Sg = g[f"valor_{c}"].sum() / v.sum(); Pg = g.pob.sum() / p.sum()
        between += Sg * np.log(Sg / Pg) if Sg > 0 else 0
        within += Sg * theil_T(g[f"valor_{c}"].values, g.pob.values)
    rows.append({"fuente": c, "gini_pc_ponderado_pob": gini_w(v / p, p), "theil_T": T,
                 "theil_entre_PDET": between, "theil_dentro": within, "pct_entre": 100 * between / T,
                 "pct_municipios_sin_recursos": 100 * (v == 0).mean()})
T2 = pd.DataFrame(rows); T2.to_csv(OUT + "t2_desigualdad.csv", index=False); print(T2.round(3).to_string())
lor = {}
for c in SRC:
    o = np.argsort(M[f"pc_{c}"].values); w = M.pob.values[o]; y = M[f"valor_{c}"].values[o]
    lor[c] = {"pob_acum": list(np.r_[0, np.cumsum(w) / w.sum()]), "valor_acum": list(np.r_[0, np.cumsum(y) / y.sum()])}
json.dump(lor, open(OUT + "lorenz.json", "w"))

# ---------- C. PPML ----------
D = M.dropna(subset=["mdm", "grupo_capacidad"]).copy()
D["log_pob"] = np.log(D.pob); D["log_vict"] = np.log1p(D.victimas_x1000)
CTRL = "pct_rural + mdm + orgs_x10k + C(grupo_capacidad)"
def ppml(dd, y, rhs, fe):
    dd = dd.copy(); drop = 0
    if fe:  # separación: excluir departamentos con resultado siempre 0 (Correia, Guimarães & Zylkin 2020)
        s = dd.groupby("cod_depto")[y].transform("sum"); drop = int((s == 0).sum()); dd = dd[s > 0]
        rhs = rhs + " + C(cod_depto)"
    m = smf.glm(f"{y} ~ {rhs}", dd, family=sm.families.Poisson()).fit(cov_type="cluster", cov_kwds={"groups": dd.cod_depto.astype(str)}, maxiter=300)
    return m, drop
rows = []
for c in SRC:
    y = f"valor_{c}"
    specs = [("1_solo_PDET", "pdet", "pdet", False, D),
             ("2_+log_pob", "pdet", "pdet + log_pob", False, D),
             ("3_+controles", "pdet", f"pdet + log_pob + {CTRL}", False, D),
             ("4_+EF_depto (principal)", "pdet", f"pdet + log_pob + {CTRL}", True, D),
             ("R1_sin_Ciudades", "pdet", f"pdet + log_pob + {CTRL}", True, D[D.grupo_capacidad != "Ciudades"]),
             ("R2_victimas_en_vez_PDET", "log_vict", f"log_vict + log_pob + {CTRL}", True, D)]
    for name, x, rhs, fe, dd in specs:
        m, drop = ppml(dd, y, rhs, fe); b, se = m.params[x], m.bse[x]
        rows.append({"fuente": c, "modelo": name, "variable": x, "N": int(m.nobs), "excluidos_separacion": drop,
                     "coef": b, "ee_cluster": se, "p": m.pvalues[x], "efecto_pct": 100*(np.exp(b)-1),
                     "IC95_pct_lo": 100*(np.exp(b-1.96*se)-1), "IC95_pct_hi": 100*(np.exp(b+1.96*se)-1),
                     "elasticidad_pob": m.params.get("log_pob", np.nan),
                     "elast_IC95_lo": m.params.get("log_pob", np.nan) - 1.96*m.bse.get("log_pob", np.nan),
                     "elast_IC95_hi": m.params.get("log_pob", np.nan) + 1.96*m.bse.get("log_pob", np.nan),
                     "p_elast_igual_1": 2*(1-__import__("scipy").stats.norm.cdf(abs((m.params.get("log_pob", np.nan)-1)/m.bse.get("log_pob", np.nan)))) if "log_pob" in m.params else np.nan})
T3 = pd.DataFrame(rows); T3.to_csv(OUT + "t3_ppml.csv", index=False); print(T3.round(3).to_string())

# ---------- D. Espacial ----------
S_ = M.dropna(subset=["lon", "lat"]).copy()
W = KNN.from_array(S_[["lon", "lat"]].values, k=8); W.transform = "r"
rows = []; lisa_out = S_[["municipio", "departamento", "pdet", "lon", "lat"]].copy()
for c in SRC:
    y = np.log1p(S_[f"pc_{c}"].values)
    mi = Moran(y, W, permutations=9999)
    li = Moran_Local(y, W, permutations=9999, seed=20261104)
    sig = multipletests(li.p_sim, alpha=0.05, method="fdr_bh")[0]
    lab = np.where(~sig, "No significativo", pd.Series(li.q).map({1: "Alto-Alto", 2: "Bajo-Alto", 3: "Bajo-Bajo", 4: "Alto-Bajo"}).values)
    lisa_out[f"lisa_{c}"] = lab
    ll = lab == "Bajo-Bajo"
    rows.append({"fuente": c, "moran_I": mi.I, "p_perm": mi.p_sim, "n_bajo_bajo": int(ll.sum()),
                 "n_alto_alto": int((lab == "Alto-Alto").sum()),
                 "pct_PDET_en_bajo_bajo": 100 * S_.pdet.values[ll].mean() if ll.any() else np.nan,
                 "pob_en_bajo_bajo": int(S_.pob.values[ll].sum())})
T4 = pd.DataFrame(rows); T4.to_csv(OUT + "t4_espacial.csv", index=False); lisa_out.to_csv(OUT + "lisa_municipios.csv")
print(T4.round(4).to_string())

# ---------- E. Contenido ----------
F = pd.read_csv(OUT + "financiacion_limpia.csv", dtype={"dv": str})
F = F[F.nivel == "municipal"].copy(); F["pdet"] = F.dv.isin(M.index[M.pdet == 1])
cat = F.groupby(["fuente", "categoria"]).agg(proyectos=("valor", "size"), valor_mil_M=("valor", lambda s: s.sum() / 1e9)).reset_index()
cat.to_csv(OUT + "t5_categorias_oficiales.csv", index=False)
from sklearn.feature_extraction.text import TfidfVectorizer
from sklearn.decomposition import NMF
STOP = set("""de la el en y del los las para a por con al un una su sus se que como mas o e lo le municipio municipal departamento
departamental proyecto programa fortalecimiento desarrollo implementacion apoyo realizacion ejecucion vigencia ano anos ciudad
fase etapa n no traves mediante través dirigido dirigida""".split())
def nrm(s):
    s = unicodedata.normalize("NFKD", str(s)).encode("ascii", "ignore").decode().lower()
    return re.sub(r"[^a-z ]", " ", s)
txt = F.nombre_del_proyecto.fillna("").map(nrm)
vec = TfidfVectorizer(stop_words=list(STOP), min_df=5, max_df=0.5, ngram_range=(1, 2))
X = vec.fit_transform(txt); nmf = NMF(n_components=8, random_state=0, init="nndsvd", max_iter=500).fit(X)
terms = np.array(vec.get_feature_names_out())
topics = [{"topico": k, "terminos_principales": ", ".join(terms[np.argsort(-nmf.components_[k])[:10]])} for k in range(8)]
F["topico"] = nmf.transform(X).argmax(1)
tp = F.groupby(["topico", "fuente"]).valor.sum().unstack(fill_value=0).div(1e9)
tp2 = F.groupby("topico").agg(proyectos=("valor", "size"), pct_proyectos_en_PDET=("pdet", lambda s: 100 * s.mean()))
T6 = pd.DataFrame(topics).set_index("topico").join(tp2).join(tp); T6.to_csv(OUT + "t6_topicos_nmf.csv"); print(T6.to_string())
print("OK")
