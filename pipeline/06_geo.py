"""
Paso 6: geometría municipal para el mapa web.
Fuente: DANE, Marco Geoestadístico Nacional 2018 integrado con CNPV 2018, nivel municipio
(https://www.dane.gov.co/files/geoportal-provisional/SHP_MGN2018_INTGRD_MPIO.zip).
Se descarga solo si no existe la geometría ya generada (la cartografía no cambia mensualmente).
Simplificación con preservación de fronteras compartidas (shapely.coverage_simplify, tolerancia 1.500 m
en MAGNA-SIRGAS / Colombia Bogotá, EPSG:3116); coordenadas redondeadas a 3 decimales (~110 m).
"""
import os, re, json, hashlib, datetime as dt, requests
import geopandas as gpd
from shapely import coverage_simplify
from shapely.geometry import Polygon, MultiPolygon
from shapely.geometry.polygon import orient

ROOT = os.path.dirname(os.path.dirname(os.path.abspath(__file__)))
URL = "https://www.dane.gov.co/files/geoportal-provisional/SHP_MGN2018_INTGRD_MPIO.zip"
OUTGEO = os.path.join(ROOT, "site", "data", "municipios.geojson")
PROV = os.path.join(ROOT, "data", "procedencia_geo.json")
TOL = 1500

if os.path.exists(OUTGEO) and os.path.exists(PROV):
    print("Geometría ya generada; se reutiliza:", json.load(open(PROV))["sha256_zip"][:12]); raise SystemExit(0)

cache = os.path.join(ROOT, "data", "raw", "dane_SHP_MGN2018_INTGRD_MPIO.zip")
if not os.path.exists(cache):
    r = requests.get(URL, timeout=900); r.raise_for_status(); open(cache, "wb").write(r.content)
b = open(cache, "rb").read()
g = gpd.read_file(f"zip://{cache}!MGN_ANM_MPIOS.shp")
g["dv"] = g["MPIO_CDPMP"].astype(str).str.zfill(5)
gg = g[["dv", "geometry"]].to_crs(3116)
simp = gpd.GeoSeries(coverage_simplify(gg.geometry.values, tolerance=TOL), crs=3116).to_crs(4326)
# d3-geo exige anillos exteriores en sentido HORARIO (convención opuesta a RFC 7946): orient(sign=-1)
def cw(geom):
    if isinstance(geom, Polygon): return orient(geom, sign=-1.0)
    if isinstance(geom, MultiPolygon): return MultiPolygon([orient(p, sign=-1.0) for p in geom.geoms])
    return geom
simp = simp.apply(cw)
out = gpd.GeoDataFrame({"dv": gg.dv.values}, geometry=simp)
assert out.geometry.is_valid.all() and not out.geometry.is_empty.any(), "geometría inválida tras simplificar"
js = re.sub(r"(-?\d+\.\d{3})\d+", r"\1", json.dumps(json.loads(out.to_json(drop_id=True))))
os.makedirs(os.path.dirname(OUTGEO), exist_ok=True); open(OUTGEO, "w").write(js)
json.dump({"fuente": "DANE, MGN 2018 integrado CNPV 2018, nivel municipio", "url": URL,
           "sha256_zip": hashlib.sha256(b).hexdigest(), "bytes_zip": len(b), "poligonos": len(out),
           "simplificacion": f"shapely.coverage_simplify, tolerancia {TOL} m en EPSG:3116; 3 decimales",
           "generado_utc": dt.datetime.now(dt.timezone.utc).isoformat(timespec="seconds")},
          open(PROV, "w"), ensure_ascii=False, indent=1)
print("Geometría:", len(out), "polígonos,", len(js) // 1024, "KB")
