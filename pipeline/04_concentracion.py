"""D1 · Paso 4: concentración de cada fuente en los municipios con mayor valor (desde out/base_municipal.csv)."""
import os, pandas as pd
M = pd.read_csv(os.path.join(os.path.dirname(os.path.dirname(os.path.abspath(__file__))),"data","out","base_municipal.csv"), dtype={"dv": str}).set_index("dv")
rows = []
for c in ["LEP", "INC", "SGR", "total"]:
    s = M[f"valor_{c}"].sort_values(ascending=False); tot = s.sum()
    rows.append({"fuente": c, "municipios_con_recursos": int((s > 0).sum()),
                 "pct_top1": 100*s.iloc[0]/tot, "municipio_top1": M.loc[s.index[0], "municipio"],
                 "pct_top5": 100*s.iloc[:5].sum()/tot, "top5": "; ".join(M.loc[s.index[:5], "municipio"]),
                 "pct_top10": 100*s.iloc[:10].sum()/tot})
pd.DataFrame(rows).to_csv(os.path.join(os.path.dirname(os.path.dirname(os.path.abspath(__file__))),"data","out","t7_concentracion.csv"), index=False)
print(pd.DataFrame(rows).round(1).to_string())
