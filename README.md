# Geografía fiscal de la cultura en Colombia

Sitio web interactivo, reproducible y con actualización automática mensual. Analiza cómo se distribuyen entre los municipios de Colombia los recursos de las cinco fuentes de financiación cultural que reconoce el Ministerio de las Culturas:

- **Inventario de proyectos** (MinCulturas, `tq67-uc4p`): Ley de Espectáculos Públicos (**LEP**), Impuesto Nacional al Consumo (**INC**) y Sistema General de Regalías (**SGR**).
- **Flujos anuales** (CUIPO, Contraloría General de la República, `9axr-9gnb`): **SGP – Cultura**, **Estampilla Procultura** y **LEP efectivamente girada** al municipio, desde 2023.

Todas las cifras provienen de fuentes oficiales y se recalculan con el mismo pipeline cada mes. Las normas citadas (Ley 1493 de 2011, Decreto 359 de 2018) y los antecedentes se verificaron en su fuente oficial: `data/normas_verificadas.json` y `data/antecedentes.json`.

## Cómo funciona

```
pipeline/01_descarga.py       Descarga las fuentes oficiales (datos.gov.co, TerriData-DNP, DANE). Registra el SHA-256
                              de cada archivo y verifica que los conteos coincidan con el servidor.
pipeline/02_base.py           Construye la base municipal y aplica reglas de depuración explícitas
                              (registradas en data/out/decisiones_limpieza.json).
pipeline/03_analisis.py       Bootstrap, Gini/Theil, PPML con efectos fijos y robustez (IPM, escenarios),
                              Moran/LISA, NMF, flujos anuales CUIPO y validación cruzada de la LEP.
pipeline/04_concentracion.py  Concentración en los municipios principales.
pipeline/06_geo.py            Geometría municipal (DANE MGN 2025), simplificada conservando fronteras.
pipeline/07_exportar_web.py   Validaciones; si alguna falla, no se publica. Exporta los datos del sitio.
site/                         Sitio estático (HTML/CSS/JS + D3 incluido localmente; sin servicios externos).
.github/workflows/            Tarea mensual: pipeline → validaciones → historial → release con crudos → publicación.
```

### Validaciones que bloquean la publicación
- Cuadre de sumas: valor original − valor excluido = valor analizado.
- Tamaño del universo municipal (1.100–1.130) y número de municipios PDET (150–200).
- Aparición de fuentes de financiación no previstas: exige revisión metodológica antes de publicar.
- Cambio del valor total mayor que ×2 o menor que ×0,5 frente a la versión publicada.
- Conteo de registros descargados distinto del informado por el servidor.
- Cobertura anual de CUIPO (SGP y Estampilla ≥ 900 municipios; LEP girada ≥ 15) y cartografía de 1.100–1.130 polígonos.

Si una validación falla, GitHub Actions marca la ejecución como fallida, notifica al responsable del repositorio y **el sitio conserva la última versión válida**.

## Reproducir localmente

```bash
python -m venv .venv && source .venv/bin/activate
pip install -r requirements.txt
for s in 01_descarga 02_base 03_analisis 04_concentracion 06_geo 07_exportar_web; do python -W ignore pipeline/$s.py; done
python -m http.server -d site 8000   # abrir http://localhost:8000
```

## Publicar (GitHub Pages)
1. Sube este repositorio a GitHub.
2. En *Settings → Pages*, elige **Source: GitHub Actions**.
3. En *Actions*, ejecuta **"Actualización mensual y publicación" → Run workflow**.

Desde entonces, el sitio se actualiza solo el día 5 de cada mes.

## Fuentes
| Fuente | Entidad | Identificador |
|---|---|---|
| Proyectos por fuente de financiación cultural | MinCulturas | datos.gov.co `tq67-uc4p` |
| Beneficiarios; organizaciones; espacios culturales (escenarios PULEP) | MinCulturas | `bq7b-e3sb`, `eenq-ga7s`, `te39-v28f` |
| CUIPO – Ejecución de ingresos | Contraloría General de la República | `9axr-9gnb` |
| Municipios PDET | Agencia de Renovación del Territorio | `idrk-ba8y` |
| Víctimas por municipio (RUV) | Unidad para las Víctimas | `ykxr-xynr` |
| MDM y grupos de capacidades; ruralidad; IPM censal | DNP – TerriData | Dimensiones 8, 1 y 14 |
| Proyecciones de población municipal 2018–2042 | DANE | `PPED-AreaMun-2018-2042_VP.xlsx` |
| Marco Geoestadístico Nacional 2025, municipios | DANE | `MGN2025_MPIO_GRAFICO.zip` |

## Limitaciones
Se documentan en el propio sitio (sección "Método, datos y trazabilidad") y se generan a partir de los datos de cada versión.

## Licencias
- Código: MIT.
- D3.js: licencia ISC (`site/vendor/D3_LICENSE.txt`).
- Datos: según las condiciones de cada entidad publicadora.
