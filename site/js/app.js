/* Geografía fiscal de la cultura · interfaz v2
   Regla: toda cifra o afirmación cuantitativa se deriva de data/*.json en tiempo de ejecución. */
(async function () {
  "use strict";
  const L = d3.formatLocale({ decimal: ",", thousands: ".", grouping: [3], currency: ["$", ""] });
  const f0 = L.format(",.0f"), f1 = L.format(",.1f"), f2 = L.format(",.2f");
  const COL = { LEP: "#C2461A", INC: "#3B6CB1", SGR: "#178A7C", total: "#38383f" };
  const SRC = [
    { k: "LEP", name: "Ley de Espectáculos Públicos", short: "LEP", fuente: "Ley de Espectáculos Públicos" },
    { k: "INC", name: "Impuesto Nacional al Consumo", short: "INC", fuente: "Impuesto Nacional al Consumo" },
    { k: "SGR", name: "Sistema General de Regalías", short: "Regalías", fuente: "Sistema General de Regalías" },
    { k: "total", name: "Las tres fuentes", short: "Total", fuente: null },
  ];
  const S = Object.fromEntries(SRC.map(s => [s.k, s]));
  const ART = { LEP: "la Ley de Espectáculos Públicos", INC: "el Impuesto Nacional al Consumo", SGR: "el Sistema General de Regalías", total: "las tres fuentes" };
  const DE = k => (k === "LEP" ? "de " : k === "total" ? "de " : "del ") + ART[k].replace(/^(el|la) /, k === "LEP" ? "la " : "");
  const LISA = { "Alto-Alto": "#C2461A", "Bajo-Bajo": "#3B6CB1", "Alto-Bajo": "#EFA273", "Bajo-Alto": "#93B8DF", "No significativo": "#e8e3db" };
  const LISA_TXT = { "Alto-Alto": "valor alto, rodeado de vecinos altos", "Bajo-Bajo": "valor bajo, rodeado de vecinos bajos", "Alto-Bajo": "valor alto, rodeado de vecinos bajos", "Bajo-Alto": "valor bajo, rodeado de vecinos altos", "No significativo": "sin patrón significativo con sus vecinos" };
  const state = { src: "LEP", mode: "pc", sel: null, pdet: true };
  const $ = id => document.getElementById(id);
  const money = v => { if (v == null || isNaN(v)) return "—"; const a = Math.abs(v);
    if (a >= 1e12) return "$" + f2(v / 1e12) + " billones"; if (a >= 1e9) return "$" + f1(v / 1e9) + " mil millones";
    if (a >= 1e6) return "$" + f1(v / 1e6) + " millones"; return "$" + f0(v); };
  const pct = v => f1(v) + " %";
  const pval = p => p < 0.001 ? "p < 0,001" : "p = " + L.format(",.3f")(p);
  const fdate = s => { const d = new Date(s); return isNaN(d) ? s : d.toLocaleDateString("es-CO", { day: "numeric", month: "long", year: "numeric", timeZone: "UTC" }); };
  const lista = a => a.length <= 1 ? a.join("") : a.slice(0, -1).join(", ") + " y " + a[a.length - 1];
  const veces = v => v >= 10 ? f0(v) : f1(v);

  let R, MU, G, LZ;
  try {
    [R, MU, G, LZ] = await Promise.all(["data/resumen.json", "data/municipios.json", "data/municipios.geojson", "data/lorenz.json"]
      .map(u => fetch(u, { cache: "no-cache" }).then(r => { if (!r.ok) throw new Error(u); return r.json(); })));
  } catch (e) { $("stamp-corto").textContent = "No fue posible cargar los datos. Recarga la página."; console.error(e); return; }

  const IDS = Object.keys(MU), N = IDS.length;
  const NCIU = IDS.filter(i => MU[i].grupo_capacidad === "Ciudades").length;
  const B = Object.fromEntries(R.brecha.map(d => [d.fuente, d]));
  const D = Object.fromEntries(R.desigualdad.map(d => [d.fuente, d]));
  const C = Object.fromEntries(R.concentracion.map(d => [d.fuente, d]));
  const E = Object.fromEntries(R.espacial.map(d => [d.fuente, d]));
  const P = (src, prefix) => R.ppml.find(d => d.fuente === src && d.modelo.startsWith(prefix));
  const MAIN = src => P(src, "4_");
  const sig = d => d && d.p < 0.05;
  const eclass = d => d.elast_IC95_lo > 1 ? "mas" : d.elast_IC95_hi < 1 ? "menos" : "igual";
  const dbl = e => Math.pow(2, e);

  const FCOL = { SGP: "#6B4FA0", EST: "#A9791C", LEPR: "#E07B4F" };
  const FK = [
    { k: "SGP", short: "SGP", long: "SGP Cultura", name: "Sistema General de Participaciones – Cultura", p: "Transferencia de la Nación a cada municipio dentro del SGP de propósito general, con destinación a cultura. Es la fuente que más municipios alcanza.", cta: "1.1.02.06.001.03.02" },
    { k: "EST", short: "Estampilla", name: "Estampilla Procultura", p: "Ingreso tributario propio de cada entidad territorial con destinación cultural. Se reporta en la categoría de ingresos tributarios del catálogo presupuestal.", cta: "1.1.01.02.300.55" },
    { k: "LEPR", short: "LEP girada", name: "LEP efectivamente girada", p: "La contribución de la Ley de Espectáculos Públicos que MinCulturas gira al municipio donde se generó (Ley 1493 de 2011, art. 12). Es el flujo anual de la misma fuente cuyos proyectos se ven arriba.", cta: "1.1.02.06.003.02.02" },
  ];
  const FL = Object.fromEntries((R.flujos || []).map(d => [d.fuente, d]));
  const unstable = (lo, hi) => (1 + hi / 100) / Math.max(1e-9, 1 + lo / 100) > 25;
  /* ---------------- Portada ---------------- */
  const cortes = Object.values(R.fecha_corte_por_fuente).sort();
  $("stamp-corto").textContent = "Actualizado el " + fdate(R.descarga_utc) + " · datos oficiales";
  $("h-municipios").textContent = f0(R.totales.municipios);
  $("stamp").textContent = `Fuentes consultadas el ${fdate(R.descarga_utc)} · corte de financiación al ${fdate(cortes[cortes.length - 1])} · población DANE ${R.anio_poblacion} · se actualiza automáticamente el día 5 de cada mes`;
  const eL = MAIN("LEP"), cL = C.LEP, anyPdet = SRC.some(s => sig(MAIN(s.k)));
  const cls = k => eclass(MAIN(k));
  const nameOf = { INC: "el Impuesto al Consumo", SGR: "las regalías" };
  const peq = ["INC", "SGR"].filter(k => cls(k) === "menos").map(k => nameOf[k]);
  $("answer").innerHTML = `<span class="answer__label">La respuesta corta</span><p>Depende de la fuente. ${cls("LEP") === "mas" ? "La Ley de Espectáculos Públicos se concentra en las ciudades grandes" : "La Ley de Espectáculos Públicos tiene una cobertura muy limitada"}: ${cL.municipio_top1.replace(", D.C.", "")} recibe ${pct(cL.pct_top1)} y solo ${f0(B.LEP.municipios_con_recursos)} municipios tienen recursos. ${peq.length ? `${lista(peq).replace(/^./, c => c.toUpperCase())}, en cambio, dan más por habitante a los municipios pequeños. ` : ""}${anyPdet ? "Los territorios PDET muestran diferencias significativas incluso al comparar municipios parecidos." : "Y los territorios PDET no reciben menos que municipios parecidos a ellos: la brecha que se ve a primera vista es de tamaño, no de condición."}${R.flujos ? ` Las transferencias que llegan cada año por otras vías, el SGP para cultura y la Estampilla Procultura, alcanzan a ${f0(Math.min(FL.SGP.municipios_con_recursos, FL.EST.municipios_con_recursos))} municipios o más.` : ""}</p>`;
  $("kpis").innerHTML = [
    { v: money(R.totales.valor_municipal_COP).replace(/ (billones|mil millones|millones)$/, "<small> $1</small>"), l: "en proyectos culturales asignados a municipios", s: `de ${money(R.totales.valor_original_COP)} en el dataset original; la diferencia se explica en “Reglas de depuración”` },
    { v: `${f0(B.LEP.municipios_con_recursos)}<small> de ${f0(N)}</small>`, l: "municipios reciben recursos de la Ley de Espectáculos Públicos", s: `${pct(100 - D.LEP.pct_municipios_sin_recursos)} de los municipios del país` },
    { v: pct(cL.pct_top1), l: `de esos recursos va a ${cL.municipio_top1}`, s: `los cinco primeros municipios suman ${pct(cL.pct_top5)}` },
    { v: `×${veces(dbl(eL.elasticidad_pob))}`, l: "más recursos de la LEP para un municipio con el doble de población", s: `comparando municipios parecidos; IC 95 %: ×${veces(dbl(eL.elast_IC95_lo))} a ×${veces(dbl(eL.elast_IC95_hi))}` },
  ].map(k => `<div class="kpi"><div class="kpi__v">${k.v}</div><div class="kpi__l">${k.l}</div><div class="kpi__s">${k.s}</div></div>`).join("");

  /* ---------------- Hallazgos ---------------- */
  const mas = SRC.filter(s => s.k !== "total" && eclass(MAIN(s.k)) === "mas").map(s => s.short);
  const menos = SRC.filter(s => s.k !== "total" && eclass(MAIN(s.k)) === "menos").map(s => s.short);
  const sigP = SRC.filter(s => sig(MAIN(s.k)));
  const tech = rows => `<details class="tech"><summary>Detalle técnico</summary>${rows}</details>`;
  const F = [
    { h: "La LEP se queda en pocas ciudades",
      big: `${pct(cL.pct_top5)}<small>de la LEP municipal va a solo cinco municipios: ${cL.top5.split("; ").join(", ")}</small>`,
      p: `De ${f0(N)} municipios, solo ${f0(B.LEP.municipios_con_recursos)} reciben recursos de la Ley de Espectáculos Públicos. El ${pct(D.LEP.pct_municipios_sin_recursos)} restante no registra ninguno.`,
      t: `<p>Gini del valor por habitante, ponderado por población: ${f2(D.LEP.gini_pc_ponderado_pob)}; Theil T: ${f2(D.LEP.theil_T)}. El primer municipio concentra ${pct(cL.pct_top1)}, los 10 primeros ${pct(cL.pct_top10)}. Valor municipal analizado: ${money(B.LEP.valor_mil_M * 1e9)}.</p>` },
    { h: "Cada fuente sigue una lógica de escala distinta",
      big: `×${veces(dbl(eL.elasticidad_pob))} <small>recibe de la LEP un municipio con el doble de población, frente a ×${veces(dbl(MAIN("INC").elasticidad_pob))} del INC y ×${veces(dbl(MAIN("SGR").elasticidad_pob))} de las regalías</small>`,
      p: `${mas.length ? `${lista(mas)} crece${mas.length > 1 ? "n" : ""} más rápido que la población: favorece${mas.length > 1 ? "n" : ""} a los municipios grandes. ` : ""}${menos.length ? `${lista(menos)} crece${menos.length > 1 ? "n" : ""} más despacio que la población: por habitante, los municipios pequeños reciben más.` : ""}`,
      t: `<p>Elasticidades respecto a la población (PPML con controles y efectos fijos de departamento): ${SRC.filter(s => s.k !== "total").map(s => { const e = MAIN(s.k); return `${s.short} ${f2(e.elasticidad_pob)} (IC 95 % ${f2(e.elast_IC95_lo)}–${f2(e.elast_IC95_hi)}; prueba de igualdad a 1: ${pval(e.p_elast_igual_1)})`; }).join("; ")}. “×2^β” traduce la elasticidad β al efecto de duplicar la población.</p>` },
    { h: anyPdet ? "La condición PDET sí importa" : "La brecha PDET es de tamaño, no de condición",
      big: `${f2(B.LEP.razon_PDET_noPDET)}<small>pesos de LEP recibe por habitante un municipio PDET por cada peso que recibe el resto (sin ajustar)</small>`,
      p: sigP.length === 0
        ? `A primera vista los municipios PDET reciben mucho menos de la LEP y más de las regalías. Pero al compararlos con municipios de tamaño, ruralidad y capacidad parecidos, en el mismo departamento, <strong>la diferencia deja de ser estadísticamente distinguible de cero en las tres fuentes</strong>.`
        : `Incluso comparando municipios parecidos, hay diferencias significativas en ${lista(sigP.map(s => s.short))}.`,
      t: `<p>Razones sin ajustar (PDET / no PDET, IC 95 % bootstrap): ${SRC.map(s => `${s.short} ${f2(B[s.k].razon_PDET_noPDET)} (${f2(B[s.k].IC95_lo)}–${f2(B[s.k].IC95_hi)})`).join("; ")}. Efecto PDET en el modelo principal: ${SRC.map(s => { const d = MAIN(s.k); return `${s.short} ${d.efecto_pct > 0 ? "+" : ""}${f0(d.efecto_pct)} % (${pval(d.p)})`; }).join("; ")}.</p>` },
  ];
  if (R.flujos) { const sg = FL.SGP, es = FL.EST, A = R.parametros_extra.anios_cuipo;
    const sgTxt = sg.ppml_p < 0.05 && sg.R3_p >= 0.05 ? `En el SGP para cultura, los PDET reciben más por habitante que municipios parecidos (${sg.ppml_efecto_PDET_pct > 0 ? "+" : ""}${f0(sg.ppml_efecto_PDET_pct)} %), pero la diferencia desaparece al tener en cuenta la pobreza: la ventaja acompaña a la pobreza, no a la condición PDET.`
      : sg.ppml_p < 0.05 ? `En el SGP para cultura, los PDET reciben más que municipios parecidos (${sg.ppml_efecto_PDET_pct > 0 ? "+" : ""}${f0(sg.ppml_efecto_PDET_pct)} %), aun teniendo en cuenta la pobreza.` : `En el SGP para cultura no hay diferencia significativa entre los PDET y municipios parecidos.`;
    const esTxt = es.R3_p < 0.05 && es.R3_efecto_PDET_pct > 0 ? ` En la Estampilla Procultura, los PDET recaudan más que municipios parecidos incluso con la pobreza en cuenta (${es.R3_efecto_PDET_pct > 0 ? "+" : ""}${f0(es.R3_efecto_PDET_pct)} %). Es una pista que merece un estudio propio, no una explicación.`
      : es.ppml_p < 0.05 ? ` En la Estampilla Procultura la diferencia PDET (${f0(es.ppml_efecto_PDET_pct)} %) no resiste el control por pobreza.` : ` En la Estampilla Procultura no hay diferencia significativa.`;
    F.push({ h: "Las transferencias anuales sí llegan a casi todo el país",
      big: `${f0(sg.municipios_con_recursos)}<small>municipios reciben SGP para cultura (promedio ${A[0]}–${A[A.length - 1]}), frente a ${f0(B.LEP.municipios_con_recursos)} con proyectos de la LEP</small>`,
      p: sgTxt + esTxt,
      t: `<p>Reportes CUIPO de la Contraloría, cortes de diciembre. Gini por habitante: SGP ${f2(sg.gini_pc_ponderado_pob)}, Estampilla ${f2(es.gini_pc_ponderado_pob)}, LEP girada ${f2(FL.LEPR.gini_pc_ponderado_pob)}. Efecto PDET (PPML, controles y efectos fijos de departamento): SGP ${f0(sg.ppml_efecto_PDET_pct)} % (${pval(sg.ppml_p)}) → con IPM ${f0(sg.R3_efecto_PDET_pct)} % (${pval(sg.R3_p)}); Estampilla ${f0(es.ppml_efecto_PDET_pct)} % (${pval(es.ppml_p)}) → con IPM ${f0(es.R3_efecto_PDET_pct)} % (${pval(es.R3_p)}). Detalle en «Flujos anuales».</p>` }); }
  $("findings").innerHTML = F.map(x => `<li><h3>${x.h}</h3><div class="big">${x.big}</div><p class="plain">${x.p}</p>${tech(x.t)}</li>`).join("");

  /* ---------------- Fuentes ---------------- */
  const DESC = {
    LEP: { p: "Contribución del 10 % sobre las boletas de espectáculos de artes escénicas de 3 UVT o más. MinCulturas la recauda y la gira al municipio donde se generó, para las artes escénicas de ese municipio.", c: "Ley 1493 de 2011, arts. 7, 8 y 12 (texto oficial, sección «Contexto»)." },
    INC: { p: "Parte del Impuesto Nacional al Consumo sobre telefonía, datos e internet móvil destinada a cultura. Se gira a Bogotá y a los departamentos, que la ejecutan con sus municipios.", c: "Decreto 359 de 2018, art. 2.11.1 (texto oficial, sección «Contexto»)." },
    SGR: { p: "Recursos del Sistema General de Regalías aprobados para proyectos culturales.", c: "Descripción oficial del dataset de MinCulturas (tq67-uc4p)." },
  };
  $("sources").innerHTML = SRC.filter(s => s.fuente).map(s => { const b = B[s.k], c = C[s.k];
    return `<article class="src" style="--c:${COL[s.k]}"><span class="src__tag">${s.short}</span><h3>${s.name}</h3><p>${DESC[s.k].p}</p>
      <dl><div><dt>Valor municipal</dt><dd>${money(b.valor_mil_M * 1e9).replace(" mil millones", " mil M")}</dd></div>
      <div><dt>Municipios con recursos</dt><dd>${f0(b.municipios_con_recursos)}</dd></div>
      <div><dt>Primer municipio</dt><dd>${pct(c.pct_top1)}</dd></div>
      <div><dt>A municipios PDET</dt><dd>${pct(b.pct_valor_a_PDET)}</dd></div></dl>
      <p class="cite-s">Fuente de la descripción: ${DESC[s.k].c} Cifras: dataset oficial, corte ${fdate(R.fecha_corte_por_fuente[s.fuente])}.</p></article>`; }).join("");

  /* ---------------- Selector ---------------- */
  $("seg").innerHTML = SRC.map(s => `<button type="button" role="radio" aria-checked="${s.k === state.src}" data-k="${s.k}"><span class="sw" style="background:${COL[s.k]}"></span>${s.k === "total" ? "Las tres" : s.short}</button>`).join("");
  $("seg").addEventListener("click", e => { const b = e.target.closest("button"); if (b) { state.src = b.dataset.k; update(); } });
  $("seg").addEventListener("keydown", e => { if (!["ArrowRight", "ArrowLeft"].includes(e.key)) return; const i = SRC.findIndex(s => s.k === state.src); state.src = SRC[(i + (e.key === "ArrowRight" ? 1 : SRC.length - 1)) % SRC.length].k; update(); $("seg").querySelector(`[data-k="${state.src}"]`).focus(); });
  $("map-mode").addEventListener("click", e => { const b = e.target.closest("button"); if (b) { state.mode = b.dataset.mode; update(); } });
  $("pdet-toggle").addEventListener("change", e => { state.pdet = e.target.checked; drawPdet(); });

  /* ---------------- Mapa ---------------- */
  const W = 800, H = 1000;
  const svg = d3.select("#map").attr("viewBox", `0 0 ${W} ${H}`).attr("preserveAspectRatio", "xMidYMid meet");
  svg.append("defs").html(`<pattern id="hatch" width="6" height="6" patternUnits="userSpaceOnUse" patternTransform="rotate(45)"><rect width="6" height="6" fill="#f2efe9"/><line x1="0" y1="0" x2="0" y2="6" stroke="#cfc8bc" stroke-width="2"/></pattern>`);
  const isl = f => f.properties.dv.startsWith("88");
  const main = { type: "FeatureCollection", features: G.features.filter(f => !isl(f)) };
  const proj = d3.geoMercator().fitExtent([[24, 24], [W - 24, H - 24]], main), path = d3.geoPath(proj);
  const gZoom = svg.append("g"), gM = gZoom.append("g"), gP = gZoom.append("g");
  const pMain = gM.selectAll("path").data(main.features).join("path").attr("class", "m").attr("d", path);
  const insets = svg.append("g").attr("transform", "translate(22,22)");
  const islNodes = [];
  G.features.filter(isl).forEach((f, i) => {
    const g = insets.append("g").attr("transform", `translate(${i * 98},0)`);
    g.append("rect").attr("width", 90).attr("height", 96).attr("rx", 9).attr("fill", "#fff").attr("stroke", "#e2dcd2");
    const pr = d3.geoMercator().fitExtent([[18, 10], [72, 66]], f);
    islNodes.push(g.append("path").datum(f).attr("class", "m").attr("d", d3.geoPath(pr)).node());
    g.append("text").attr("x", 45).attr("y", 86).attr("text-anchor", "middle").attr("class", "lbl-s").attr("fill", "#6b6b74").style("font-size", "10px").text(MU[f.properties.dv] ? MU[f.properties.dv].municipio : "");
  });
  const allPaths = d3.selectAll([...pMain.nodes(), ...islNodes]);
  $("map-loading").remove();
  const zoom = d3.zoom().scaleExtent([1, 14]).translateExtent([[0, 0], [W, H]]).on("zoom", e => gZoom.attr("transform", e.transform));
  svg.call(zoom).on("dblclick.zoom", null);
  $("zoom-in").onclick = () => svg.transition().duration(350).call(zoom.scaleBy, 1.7);
  $("zoom-out").onclick = () => svg.transition().duration(350).call(zoom.scaleBy, 1 / 1.7);
  $("zoom-reset").onclick = () => svg.transition().duration(450).call(zoom.transform, d3.zoomIdentity);
  function drawPdet() {
    gP.selectAll("path").data(state.pdet ? main.features.filter(f => MU[f.properties.dv] && MU[f.properties.dv].pdet === 1) : [])
      .join("path").attr("class", "pdet").attr("d", path).attr("fill", "none").attr("stroke", "#161618").attr("stroke-width", 0.75).attr("stroke-opacity", 0.62)
      .attr("vector-effect", "non-scaling-stroke").attr("pointer-events", "none");
  }
  drawPdet();
  const tip = $("tooltip"), wrap = $("map-wrap");
  allPaths.on("mousemove", (e, f) => {
    const m = MU[f.properties.dv], r = wrap.getBoundingClientRect(), k = state.src;
    tip.hidden = false;
    tip.innerHTML = m ? `<b>${m.municipio}</b>, ${m.departamento}${m.pdet ? " · PDET" : ""}<span class="tt-v">${m["pc_" + k] > 0 ? "$" + f0(m["pc_" + k]) + " por habitante" : "Sin recursos registrados"}</span><span class="tt-m">${S[k].short}: ${money(m["valor_" + k])} · ${f0(m.pob)} hab.${state.mode === "lisa" ? `<br>${LISA_TXT[m["lisa_" + k]] || "sin dato espacial"}` : ""}</span>`
      : `<b>Sin datos</b><span class="tt-m">código ${f.properties.dv}</span>`;
    let x = e.clientX - r.left + 16, y = e.clientY - r.top + 16;
    if (x > r.width - 280) x -= 300; if (y > r.height - 110) y -= 120;
    tip.style.left = x + "px"; tip.style.top = y + "px";
  }).on("mouseleave", () => tip.hidden = true)
    .on("click", (e, f) => { if (MU[f.properties.dv]) { select(f.properties.dv); } });

  function colorFor(src) {
    const vals = IDS.map(i => MU[i]["pc_" + src]).filter(v => v > 0).sort(d3.ascending);
    const q = [1, 2, 3, 4, 5, 6].map(i => d3.quantileSorted(vals, i / 7));
    const cols = d3.range(7).map(i => d3.interpolateLab("#f6ece0", COL[src])(0.14 + i * 0.86 / 6));
    return { sc: d3.scaleThreshold().domain(q).range(cols), q, cols };
  }
  const shortMoney = v => v >= 1e6 ? "$" + f1(v / 1e6) + " M" : v >= 1e3 ? "$" + f0(v / 1e3) + " mil" : "$" + f0(v);
  function paint() {
    const src = state.src, nz = B[src].municipios_con_recursos;
    if (state.mode === "pc") {
      const { sc, q, cols } = colorFor(src);
      allPaths.attr("fill", f => { const m = MU[f.properties.dv]; if (!m) return "url(#hatch)"; const v = m["pc_" + src]; return v > 0 ? sc(v) : "#e9e4dc"; });
      $("legend").innerHTML = `<div><div class="ramp">${cols.map(c => `<span style="background:${c}"></span>`).join("")}</div><div class="ticks"><span>menos</span>${q.filter((_, i) => i % 2 === 1).map(v => `<span>${shortMoney(v)}</span>`).join("")}<span>más</span></div></div>
        <span class="item"><i style="background:#e9e4dc"></i>Sin recursos (${f0(N - nz)})</span><span class="item"><i style="background:#fff;border:1.5px solid #161618"></i>Contorno: PDET</span><span class="item"><i style="background:url(#);background-image:repeating-linear-gradient(45deg,#cfc8bc 0 2px,#f2efe9 2px 5px)"></i>Sin dato</span>`;
    } else {
      allPaths.attr("fill", f => { const m = MU[f.properties.dv]; return m ? LISA[m["lisa_" + src]] || "#e8e3db" : "url(#hatch)"; });
      const cnt = d3.rollup(IDS, v => v.length, i => MU[i]["lisa_" + src]);
      $("legend").innerHTML = Object.keys(LISA).map(k => `<span class="item" title="${LISA_TXT[k]}"><i style="background:${LISA[k]}"></i>${k} · ${f0(cnt.get(k) || 0)}</span>`).join("") + `<span class="stat">I de Moran ${f2(E[src].moran_I)} (${pval(E[src].p_perm)})</span>`;
    }
    allPaths.classed("sel", f => f.properties.dv === state.sel);
    $("map-title").textContent = state.mode === "pc" ? `${S[src].name}: ¿cuánto llega por habitante?` : `${S[src].name}: ¿dónde se agrupan los valores altos y bajos?`;
    $("map-lede").textContent = state.mode === "pc"
      ? `${f0(nz)} de ${f0(N)} municipios reciben recursos de ${src === "total" ? "alguna de las tres fuentes" : "esta fuente"}. Entre más intenso el color, más dinero por habitante; en gris quedan los municipios que no registran recursos.`
      : `Este modo resalta zonas donde municipios vecinos se parecen más de lo esperable por azar: grupos de valores altos (rojo) o bajos (azul), y municipios que contrastan con su entorno.`;
    $("map-howto").innerHTML = state.mode === "pc"
      ? `<ul><li>Los colores dividen a los municipios con recursos en siete grupos de igual tamaño (septiles) según el valor por habitante.</li><li>El contorno negro marca los ${f0(R.totales.municipios_pdet)} municipios PDET.</li><li>Valores acumulados del dataset de MinCulturas, asignados al municipio donde se ejecuta el proyecto, divididos entre la población DANE ${R.anio_poblacion}.</li><li>Arrastra para moverte; usa + y − o la rueda del ratón para acercarte. Haz clic en un municipio para ver su ficha.</li></ul>`
      : `<ul><li><b>Alto-Alto</b>: ${LISA_TXT["Alto-Alto"]}. <b>Bajo-Bajo</b>: ${LISA_TXT["Bajo-Bajo"]}. <b>Alto-Bajo</b> y <b>Bajo-Alto</b>: municipios que contrastan con sus vecinos.</li><li>Método LISA (Anselin, 1995) sobre el logaritmo del valor por habitante, con 8 vecinos más cercanos y 9.999 permutaciones; se controla la tasa de falsos descubrimientos al 5 %.</li><li>Cuando la mayoría de municipios tiene valor cero (como en la LEP), el método detecta pocos grupos: la ausencia de color no significa ausencia de desigualdad.</li></ul>`;
  }

  /* ---------------- Ficha municipal ---------------- */
  const ranks = {}, nPos = {};
  SRC.forEach(s => { const o = IDS.slice().sort((a, b) => MU[b]["pc_" + s.k] - MU[a]["pc_" + s.k]); ranks[s.k] = Object.fromEntries(o.map((id, i) => [id, i + 1])); nPos[s.k] = IDS.filter(i => MU[i]["valor_" + s.k] > 0).length; });
  const opts = IDS.map(id => ({ id, label: `${MU[id].municipio}, ${MU[id].departamento}` })).sort((a, b) => a.label.localeCompare(b.label, "es"));
  $("muni-list").innerHTML = opts.map(o => `<option value="${o.label}"></option>`).join("");
  const norm = s => s.normalize("NFD").replace(/[\u0300-\u036f]/g, "").toLowerCase().trim();
  const byLabel = Object.fromEntries(opts.map(o => [norm(o.label), o.id]));
  const byName = d3.group(opts, o => norm(MU[o.id].municipio));
  $("muni-search").addEventListener("change", e => { const v = norm(e.target.value); const id = byLabel[v] || (byName.get(v) && byName.get(v).length === 1 ? byName.get(v)[0].id : null); if (id) select(id); });
  const titleCase = s => s.toLowerCase().replace(/(^|\s|-)\S/g, t => t.toUpperCase());
  function select(id) {
    state.sel = id; const m = MU[id];
    const rows = SRC.map(s => { const pc = m["pc_" + s.k], v = m["valor_" + s.k], rk = ranks[s.k][id], has = v > 0;
      return `<div class="mrow"><div class="mrow__top"><span class="lab"><i style="background:${COL[s.k]}"></i>${s.k === "total" ? "Las tres fuentes" : s.name}</span><span class="val">${has ? "$" + f0(pc) + " /hab." : "—"}</span></div>
        <div class="bar"><span style="width:${has ? (100 * (1 - (rk - 1) / N)).toFixed(1) : 0}%;background:${COL[s.k]}"></span></div>
        <div class="ctx">${has ? `${money(v)} · puesto ${f0(rk)} de ${f0(N)} por habitante` : `Sin recursos registrados, como ${f0(N - nPos[s.k])} municipios`}</div></div>`; }).join("");
    const frows = R.flujos ? `<p class="mgroup">Flujos anuales ${R.parametros_extra.anios_cuipo[0]}–${R.parametros_extra.anios_cuipo.slice(-1)[0]} (CUIPO, promedio)</p>` + FK.map(f => { const v = m["valor_" + f.k];
      return `<div class="mrow mrow--flat"><div class="mrow__top"><span class="lab"><i style="background:${FCOL[f.k]}"></i>${f.long || f.name}</span><span class="val">${v > 0 ? "$" + f0(m["pc_" + f.k]) + " /hab." : "—"}</span></div><div class="ctx">${v > 0 ? money(v) + " al año" : "Sin reporte en CUIPO"}</div></div>`; }).join("") : "";
    $("muni-detail").innerHTML = `<h3>${m.municipio}${m.pdet ? `<span class="tag">PDET</span>` : ""}</h3>
      <p class="sub">${m.departamento}${m.subregion_pdet ? ` · subregión PDET ${titleCase(m.subregion_pdet)}` : ""}<br>${f0(m.pob)} habitantes (DANE ${R.anio_poblacion}) · ${f1(m.pct_rural)} % rural</p>${rows}
      ${frows}<p class="muni-foot">La barra indica la posición del municipio en el país (más larga = más recursos por habitante).<br>Capacidad (DNP ${R.parametros_extra ? R.parametros_extra.anio_mdm : ""}): ${m.grupo_capacidad || "sin dato"} · MDM: ${m.mdm != null ? f2(m.mdm) : "sin dato"} · IPM ${R.parametros_extra ? R.parametros_extra.anio_ipm : ""}: ${m.ipm != null ? f1(m.ipm) + " %" : "sin dato"} · Escenarios habilitados (PULEP): ${f0(m.escenarios_lep || 0)} · Víctimas por lugar de ocurrencia: ${m.victimas_x1000 != null ? f1(m.victimas_x1000) + " por mil hab." : "sin dato"} · Organizaciones culturales registradas: ${f0(m.orgs_cultura)}</p>`;
    allPaths.classed("sel", f => f.properties.dv === id);
  }

  /* ---------------- Gráficos ---------------- */
  const frame = (sel, w, h, m) => { const s = d3.select(sel).attr("viewBox", `0 0 ${w} ${h}`); s.selectAll("*").remove(); return s.append("g").attr("transform", `translate(${m.l},${m.t})`); };
  const tidy = sel => { d3.select(sel).selectAll(".grid line").attr("stroke", "#efe9e0"); d3.select(sel).selectAll(".axis line").attr("stroke", "#d3ccc0"); d3.select(sel).selectAll(".axis text").attr("fill", "#6b6b74"); d3.select(sel).selectAll(".domain").remove(); };
  function scatter() {
    const src = state.src, w = 560, h = 400, m = { l: 86, r: 18, t: 14, b: 58 }, iw = w - m.l - m.r, ih = h - m.t - m.b;
    const g = frame("#scatter", w, h, m);
    const pts = IDS.map(id => ({ id, ...MU[id], v: MU[id]["valor_" + src] }));
    const pos = pts.filter(d => d.v > 0), zero = pts.filter(d => !(d.v > 0));
    const x = d3.scaleLog().domain(d3.extent(pts, d => d.pob)).nice().range([0, iw]);
    const y = d3.scaleLog().domain(d3.extent(pos, d => d.v)).nice().range([ih - 38, 0]);
    g.append("g").attr("class", "grid").call(d3.axisLeft(y).ticks(5).tickSize(-iw).tickFormat("")).call(a => a.select(".domain").remove());
    g.append("g").attr("class", "axis").attr("transform", `translate(0,${ih})`).call(d3.axisBottom(x).ticks(5).tickFormat(v => [1e3, 1e4, 1e5, 1e6, 1e7].includes(v) ? (v >= 1e6 ? f0(v / 1e6) + " M" : f0(v / 1e3) + " mil") : ""));
    g.append("g").attr("class", "axis").call(d3.axisLeft(y).ticks(5).tickFormat(v => { const e = Math.log10(v); return Number.isInteger(e) ? (e >= 9 ? "$" + f0(v / 1e9) + " mil M" : "$" + f0(v / 1e6) + " M") : ""; }));
    g.append("text").attr("class", "lbl").attr("x", iw / 2).attr("y", ih + 42).attr("text-anchor", "middle").text("Población del municipio (escala logarítmica)");
    g.append("text").attr("class", "lbl").attr("transform", "rotate(-90)").attr("x", -(ih - 38) / 2).attr("y", -70).attr("text-anchor", "middle").text("Valor recibido (escala logarítmica)");
    g.append("rect").attr("x", 0).attr("y", ih - 26).attr("width", iw).attr("height", 22).attr("fill", "#f7f4ee").attr("rx", 4);
    g.append("text").attr("class", "lbl-s").attr("x", 6).attr("y", ih - 30).text(`Sin recursos: ${f0(zero.length)} municipios`);
    const rnd = d3.randomUniform.source(d3.randomLcg(7))(-7, 7);
    g.append("g").selectAll("circle").data(zero).join("circle").attr("cx", d => x(d.pob)).attr("cy", () => ih - 15 + rnd()).attr("r", 1.5).attr("fill", "#c8c0b3");
    g.append("g").selectAll("circle").data(pos.sort((a, b) => a.pdet - b.pdet)).join("circle").attr("cx", d => x(d.pob)).attr("cy", d => y(d.v)).attr("r", d => d.pdet ? 3.6 : 3.2)
      .attr("fill", d => d.pdet ? "#161618" : COL[src]).attr("fill-opacity", d => d.pdet ? .85 : .55).attr("stroke", "#fff").attr("stroke-width", .5)
      .append("title").text(d => `${d.municipio}, ${d.departamento}${d.pdet ? " (PDET)" : ""}: ${money(d.v)}; ${f0(d.pob)} hab.`);
    const top = pos.slice().sort((a, b) => b.v - a.v).slice(0, 3);
    top.forEach((d, i) => { const cx = x(d.pob), cy = y(d.v);
      g.append("line").attr("x1", cx).attr("y1", cy).attr("x2", cx - 16).attr("y2", cy + 12 + i * 14).attr("stroke", "#9a9aa3").attr("stroke-width", .8);
      g.append("text").attr("class", "lbl-s").attr("x", cx - 19).attr("y", cy + 16 + i * 14).attr("text-anchor", "end").text(d.municipio.replace(", D.C.", "")); });
    const lg = g.append("g").attr("transform", "translate(8,8)");
    [[COL[src], "Otros municipios", .55], ["#161618", "Municipios PDET", .85]].forEach(([c, t, o], i) => { lg.append("circle").attr("cx", 4).attr("cy", i * 17).attr("r", 4).attr("fill", c).attr("fill-opacity", o); lg.append("text").attr("class", "lbl-s").attr("x", 13).attr("y", i * 17 + 4).text(t); });
    const e = MAIN(src);
    tidy("#scatter");
    $("scale-src").textContent = S[src].name;
    $("scatter-note").textContent = `Cada punto es un municipio. Pasa el cursor sobre un punto para identificarlo. Elasticidad estimada (${S[src].short}): ${f2(e.elasticidad_pob)}, IC 95 % ${f2(e.elast_IC95_lo)}–${f2(e.elast_IC95_hi)}; N = ${f0(e.N)} municipios en el modelo.`;
    const c = eclass(e);
    $("scale-lede").textContent = c === "mas" ? `En ${ART[src]}, el dinero crece más rápido que la población: los municipios grandes reciben proporcionalmente más.` : c === "menos" ? `En ${ART[src]}, el dinero crece más despacio que la población: por habitante, los municipios pequeños reciben más.` : `En ${ART[src]}, el dinero crece aproximadamente en proporción a la población.`;
    $("doubling").innerHTML = `<div class="callout__n">×${veces(dbl(e.elasticidad_pob))}</div><p><strong>Si un municipio tiene el doble de población que otro parecido</strong> (mismo departamento, ruralidad, desempeño y capacidad institucional), recibe en promedio ${veces(dbl(e.elasticidad_pob))} veces más recursos ${DE(src)}. Si el reparto fuera proporcional a la población, sería exactamente el doble. Intervalo de confianza al 95 %: ${veces(dbl(e.elast_IC95_lo))} a ${veces(dbl(e.elast_IC95_hi))} veces.</p>`;
  }
  function dotCI(sel, rows, opt) {
    const w = 560, h = 46 + rows.length * 48, m = { l: opt.ml || 110, r: 58, t: 8, b: 42 }, iw = w - m.l - m.r, ih = h - m.t - m.b;
    const g = frame(sel, w, h, m);
    const x = (opt.log ? d3.scaleLog() : d3.scaleLinear()).domain(opt.domain).range([0, iw]);
    const yb = d3.scaleBand().domain(rows.map(r => r.k)).range([0, ih]).padding(.38);
    g.append("g").attr("class", "grid").attr("transform", `translate(0,${ih})`).call(d3.axisBottom(x).tickValues(opt.ticks).tickSize(-ih).tickFormat("")).call(a => a.select(".domain").remove());
    g.append("g").attr("class", "axis").attr("transform", `translate(0,${ih})`).call(d3.axisBottom(x).tickValues(opt.ticks).tickFormat(opt.tf).tickSize(4));
    g.append("line").attr("x1", x(opt.ref)).attr("x2", x(opt.ref)).attr("y1", -4).attr("y2", ih).attr("stroke", "#8a8a93").attr("stroke-dasharray", "3 3");
    if (opt.refLabel) g.append("text").attr("class", "lbl-s").attr("x", x(opt.ref) + 5).attr("y", 4).text(opt.refLabel);
    if (opt.xlabel) g.append("text").attr("class", "lbl").attr("x", iw / 2).attr("y", ih + 36).attr("text-anchor", "middle").text(opt.xlabel);
    const lo = opt.domain[0];
    rows.forEach(r => { const yy = yb(r.k) + yb.bandwidth() / 2, a = r.sel ? 1 : .32;
      g.append("text").attr("class", "lbl").attr("x", -12).attr("y", yy + 4).attr("text-anchor", "end").style("font-weight", r.sel ? 600 : 400).text(r.label);
      g.append("line").attr("x1", x(Math.max(r.lo, lo))).attr("x2", x(Math.min(r.hi, opt.domain[1]))).attr("y1", yy).attr("y2", yy).attr("stroke", r.c).attr("stroke-width", 3).attr("stroke-linecap", "round").attr("opacity", a);
      if (r.lo < lo) g.append("path").attr("d", `M${x(lo) - 2},${yy}l8,-4.5v9z`).attr("fill", r.c).attr("opacity", a);
      if (r.v >= opt.domain[0] && r.v <= opt.domain[1]) g.append("circle").attr("cx", x(r.v)).attr("cy", yy).attr("r", 6).attr("fill", r.hollow ? "#fff" : r.c).attr("stroke", r.c).attr("stroke-width", 2.2).attr("opacity", a);
      g.append("text").attr("class", "val-lbl").attr("x", x(Math.min(r.hi, opt.domain[1])) + 9).attr("y", yy + 4).attr("opacity", a).text(r.txt); });
    tidy(sel);
  }
  function elast() {
    const rows = SRC.map(s => { const e = MAIN(s.k); return { k: s.k, label: s.k === "total" ? "Las tres" : s.short, v: e.elasticidad_pob, lo: e.elast_IC95_lo, hi: e.elast_IC95_hi, c: COL[s.k], sel: s.k === state.src, txt: f2(e.elasticidad_pob) }; });
    const mx = Math.max(2.5, d3.max(rows, r => r.hi) + .2);
    dotCI("#elast", rows, { domain: [0, mx], ticks: d3.range(0, mx + .01, .5), tf: v => L.format(",")(v), ref: 1, refLabel: "proporcional", ml: 78, xlabel: "Elasticidad respecto a la población" });
  }
  function ratio() {
    const rows = SRC.map(s => { const b = B[s.k]; return { k: s.k, label: s.k === "total" ? "Las tres" : s.short, v: b.razon_PDET_noPDET, lo: b.IC95_lo, hi: b.IC95_hi, c: COL[s.k], sel: s.k === state.src, txt: f2(b.razon_PDET_noPDET) }; });
    dotCI("#ratio", rows, { log: true, domain: [0.03, 8], ticks: [0.05, 0.1, 0.25, 0.5, 1, 2, 4, 8], tf: v => L.format(",")(v), ref: 1, refLabel: "igualdad", ml: 78, xlabel: "Pesos por habitante PDET ÷ resto" });
    const b = B.LEP, s = B.SGR, t = B.total;
    $("pdet-lede").innerHTML = `Los ${f0(R.totales.municipios_pdet)} municipios de los Programas de Desarrollo con Enfoque Territorial (PDET) fueron priorizados por el Acuerdo de Paz y reúnen el ${pct(R.totales.pct_pob_pdet)} de la población. A primera vista reciben por habitante ${f2(b.razon_PDET_noPDET)} veces lo que el resto en la LEP y ${f2(s.razon_PDET_noPDET)} veces en regalías. ¿Se debe a que son PDET o a que suelen ser municipios más pequeños y rurales?`;
  }
  function steps() {
    const src = state.src;
    const lab = { "1_": "Sin ajustar", "2_": "Mismo tamaño", "3_": "+ ruralidad y capacidad", "4_": "+ mismo departamento", "R1": `Sin las ${f0(NCIU)} ciudades` };
    const rows = Object.keys(lab).map(k => { const d = P(src, k); return { k, label: lab[k], v: Math.exp(d.coef), lo: Math.exp(d.coef - 1.96 * d.ee_cluster), hi: Math.exp(d.coef + 1.96 * d.ee_cluster), c: COL[src], sel: true, hollow: !sig(d), txt: `${d.efecto_pct > 0 ? "+" : ""}${f0(d.efecto_pct)} %` }; });
    const tf = v => { const p = (v - 1) * 100; return (p > 0 ? "+" : "") + f0(p) + " %"; };
    dotCI("#steps", rows, { log: true, domain: [0.01, 12], ticks: [0.02, 0.1, 1, 10], tf, ref: 1, refLabel: "sin diferencia", ml: 150, xlabel: "Diferencia de los municipios PDET (escala log)" });
    $("step-src").textContent = S[src].name;
    const d4 = MAIN(src), d1 = P(src, "1_");
    $("steps-tech").innerHTML = `Modelos PPML (GLM Poisson, enlace log) del valor de ${S[src].short}. Fila 1: solo la variable PDET (${d1.efecto_pct > 0 ? "+" : ""}${f0(d1.efecto_pct)} %, ${pval(d1.p)}). Fila 2: + log de la población. Fila 3: + % rural, MDM y grupo de capacidades iniciales (DNP, ${R.parametros_extra ? R.parametros_extra.anio_mdm : ""}) y organizaciones culturales por 10.000 hab. Fila 4 (principal): + efectos fijos de departamento; ${d4.efecto_pct > 0 ? "+" : ""}${f0(d4.efecto_pct)} %, IC 95 % ${f0(d4.IC95_pct_lo)} a ${f0(d4.IC95_pct_hi)} %, ${pval(d4.p)}; N = ${f0(d4.N)}${d4.excluidos_separacion ? `; se excluyen ${f0(d4.excluidos_separacion)} municipios de departamentos sin ningún recurso (separación)` : ""}. Fila 5: igual a la 4, sin los ${f0(NCIU)} municipios del grupo “Ciudades” del DNP. Errores estándar agrupados por departamento. La tabla «Todos los modelos» (sección Método) incluye además dos pruebas de robustez: víctimas en lugar de PDET, y + IPM y escenarios habilitados.`;
  }
  function lorenz() {
    const w = 560, h = 400, m = { l: 52, r: 18, t: 12, b: 50 }, iw = w - m.l - m.r, ih = h - m.t - m.b;
    const g = frame("#lorenz", w, h, m), x = d3.scaleLinear().range([0, iw]), y = d3.scaleLinear().range([ih, 0]);
    g.append("g").attr("class", "grid").call(d3.axisLeft(y).ticks(5).tickSize(-iw).tickFormat("")).call(a => a.select(".domain").remove());
    g.append("g").attr("class", "axis").attr("transform", `translate(0,${ih})`).call(d3.axisBottom(x).ticks(5).tickFormat(v => f0(v * 100) + " %"));
    g.append("g").attr("class", "axis").call(d3.axisLeft(y).ticks(5).tickFormat(v => f0(v * 100) + " %"));
    g.append("line").attr("x1", 0).attr("y1", ih).attr("x2", iw).attr("y2", 0).attr("stroke", "#b8b2a8").attr("stroke-dasharray", "3 3");
    g.append("text").attr("class", "lbl-s").attr("transform", `translate(${iw * .52},${ih * .44}) rotate(${-Math.atan(ih / iw) * 180 / Math.PI})`).attr("text-anchor", "middle").text("reparto perfectamente igual");
    g.append("text").attr("class", "lbl").attr("x", iw / 2).attr("y", ih + 40).attr("text-anchor", "middle").text("% de la población (de menos a más recursos por habitante)");
    g.append("text").attr("class", "lbl").attr("transform", "rotate(-90)").attr("x", -ih / 2).attr("y", -40).attr("text-anchor", "middle").text("% del dinero");
    const ln = d3.line().x(d => x(d[0])).y(d => y(d[1])).curve(d3.curveMonotoneX);
    SRC.forEach(s => { const z = LZ[s.k]; g.append("path").attr("d", ln(z.x.map((v, i) => [v, z.y[i]]))).attr("fill", "none").attr("stroke", COL[s.k]).attr("stroke-width", s.k === state.src ? 3 : 1.4).attr("opacity", s.k === state.src ? 1 : .4); });
    const lg = g.append("g").attr("transform", "translate(10,10)");
    SRC.forEach((s, i) => { lg.append("line").attr("x1", 0).attr("x2", 18).attr("y1", i * 18).attr("y2", i * 18).attr("stroke", COL[s.k]).attr("stroke-width", s.k === state.src ? 3 : 1.6); lg.append("text").attr("class", "lbl-s").attr("x", 24).attr("y", i * 18 + 4).style("font-weight", s.k === state.src ? 600 : 400).style("fill", s.k === state.src ? "#161618" : null).text(`${s.k === "total" ? "Las tres" : s.short} · Gini ${f2(D[s.k].gini_pc_ponderado_pob)}`); });
    tidy("#lorenz");
    $("lorenz-note").textContent = `Si el dinero se repartiera igual por habitante, la curva seguiría la diagonal. Entre más se hunde, más concentrado está. Gini de ${S[state.src].short}: ${f2(D[state.src].gini_pc_ponderado_pob)} (0 = igualdad total; 1 = todo en un solo lugar). La diferencia entre PDET y no PDET explica solo el ${pct(D[state.src].pct_entre)} de esa desigualdad (descomposición de Theil).`;
  }
  function top5() {
    const src = state.src, tot = d3.sum(IDS, i => MU[i]["valor_" + src]);
    const t = IDS.slice().sort((a, b) => MU[b]["valor_" + src] - MU[a]["valor_" + src]).slice(0, 5);
    $("top5").innerHTML = t.map((id, i) => { const m = MU[id], sh = 100 * m["valor_" + src] / tot;
      return `<div class="row"><div class="row__top"><span class="row__n">${i + 1}</span><span class="row__name">${m.municipio}<span class="muted">, ${m.departamento}</span>${m.pdet ? `<span class="tag">PDET</span>` : ""}</span><b>${pct(sh)}</b></div><div class="bar"><span style="width:${sh}%;background:${COL[src]}"></span></div></div>`; }).join("")
      + `<p class="note">Porcentaje del valor municipal ${DE(src)} (${money(tot)}) que recibe cada municipio.</p>`;
    $("top-src").textContent = S[src].name;
  }
  function topics() {
    const fu = SRC.filter(s => s.fuente);
    $("topics").innerHTML = R.topicos.slice().sort((a, b) => b.proyectos - a.proyectos).map(t => {
      const vals = fu.map(s => ({ s, v: t[s.fuente] || 0 })), tot = d3.sum(vals, d => d.v);
      const terms = t.terminos_principales.split(", ").filter((w, i, a) => !a.some((o, j) => j < i && o.includes(w))).slice(0, 6);
      return `<div class="topic"><p class="terms">${terms.map((w, i) => i < 3 ? `<b>${w}</b>` : `<span>${w}</span>`).join(" · ")}</p>
        <div class="stack" role="img" aria-label="Reparto del valor por fuente">${vals.filter(d => d.v > 0).map(d => `<span style="width:${100 * d.v / tot}%;background:${COL[d.s.k]}" title="${d.s.short}: ${money(d.v * 1e9)}"></span>`).join("")}</div>
        <div class="meta"><span>${f0(t.proyectos)} proyectos · ${money(tot * 1e9)} · ${pct(t.pct_proyectos_en_PDET)} en municipios PDET</span><span class="dots">${vals.map(d => `<span><span style="color:${COL[d.s.k]}">●</span> ${d.s.short} ${f0(tot ? 100 * d.v / tot : 0)} %</span>`).join("")}</span></div></div>`;
    }).join("");
  }

  /* ---------------- Flujos anuales (CUIPO) ---------------- */
  function flows() {
    if (!R.flujos) return;
    const A = R.parametros_extra.anios_cuipo, y0 = A[0], y1 = A[A.length - 1];
    const cmp = d => d.IC95_lo > 1 ? "mas" : d.IC95_hi < 1 ? "menos" : "igual";
    const desc = FK.map(f => { const d = FL[f.k], c = cmp(d);
      return `${f.short}: ${c === "mas" ? `los PDET reciben ${f2(d.razon_PDET_noPDET)} veces lo del resto por habitante` : c === "menos" ? `los PDET reciben solo ${f2(d.razon_PDET_noPDET)} pesos por cada peso del resto` : `razón PDET/resto de ${f2(d.razon_PDET_noPDET)}, pero su intervalo de confianza (${f2(d.IC95_lo)}–${f2(d.IC95_hi)}) incluye el 1, así que no se distingue de la igualdad`}`; });
    $("flu-lede").innerHTML = `Los proyectos de las secciones anteriores forman un inventario acumulado y no tienen año. La Contraloría General publica, en cambio, lo que cada municipio reporta haber recibido cada año (CUIPO). Con esos reportes (${y0}–${y1}) se añaden las dos fuentes que faltaban, el <strong>SGP para cultura</strong> y la <strong>Estampilla Procultura</strong>, y se mide la <strong>LEP efectivamente girada</strong>. Por habitante y sin ajustar: ${desc.join("; ")}.`;
    $("flu-cards").innerHTML = FK.map(f => { const d = FL[f.k];
      return `<article class="src" style="--c:${FCOL[f.k]}"><span class="src__tag">${f.short}</span><h3>${f.name}</h3><p>${f.p}</p>
      <dl><div><dt>Promedio anual</dt><dd>${money(d.valor_anual_mil_M * 1e9).replace(" mil millones", " mil M")}</dd></div>
      <div><dt>Municipios con recursos</dt><dd>${f0(d.municipios_con_recursos)}</dd></div>
      <div><dt>Primer municipio</dt><dd>${pct(d.pct_top1)}</dd></div>
      <div><dt>A municipios PDET</dt><dd>${pct(d.pct_valor_a_PDET)}</dd></div></dl>
      <p class="cite-s">Primer municipio: ${d.municipio_top1}. Los PDET tienen el ${pct(d.pct_poblacion_PDET)} de la población. Fuente: CUIPO, Contraloría General de la República (datos.gov.co 9axr-9gnb), cuenta <code>${f.cta}</code>, promedio de los cortes de diciembre ${y0}–${y1}.</p></article>`; }).join("");
    // Barras por año
    const Y = R.flujos_anio, w = 560, h = 360, m = { l: 64, r: 12, t: 18, b: 64 }, iw = w - m.l - m.r, ih = h - m.t - m.b;
    const g = frame("#flu-years", w, h, m);
    const x0 = d3.scaleBand().domain(FK.map(f => f.k)).range([0, iw]).padding(.22), x1 = d3.scaleBand().domain(A.map(Number)).range([0, x0.bandwidth()]).padding(.12);
    const y = d3.scaleLinear().domain([0, d3.max(Y, d => d.valor_mil_M) * 1.12]).nice().range([ih, 0]);
    g.append("g").attr("class", "grid").call(d3.axisLeft(y).ticks(5).tickSize(-iw).tickFormat("")).call(a => a.select(".domain").remove());
    g.append("g").attr("class", "axis").call(d3.axisLeft(y).ticks(5).tickFormat(v => "$" + f0(v)));
    g.append("text").attr("class", "lbl").attr("transform", "rotate(-90)").attr("x", -ih / 2).attr("y", -50).attr("text-anchor", "middle").text("Miles de millones de pesos");
    FK.forEach(f => { const gg = g.append("g").attr("transform", `translate(${x0(f.k)},0)`);
      Y.filter(d => d.fuente === f.k).forEach((d, i) => { const op = .45 + .55 * (i / Math.max(1, A.length - 1));
        gg.append("rect").attr("x", x1(d.anio)).attr("y", y(d.valor_mil_M)).attr("width", x1.bandwidth()).attr("height", ih - y(d.valor_mil_M)).attr("rx", 3).attr("fill", FCOL[f.k]).attr("opacity", op)
          .append("title").text(`${f.short} ${d.anio}: ${money(d.valor_mil_M * 1e9)}; ${f0(d.municipios_con_dato)} municipios con dato`);
        gg.append("text").attr("class", "val-lbl").attr("x", x1(d.anio) + x1.bandwidth() / 2).attr("y", y(d.valor_mil_M) - 5).attr("text-anchor", "middle").style("font-size", "10.5px").text(f0(d.valor_mil_M));
        gg.append("text").attr("class", "lbl-s").attr("x", x1(d.anio) + x1.bandwidth() / 2).attr("y", ih + 15).attr("text-anchor", "middle").text(String(d.anio).slice(2).padStart(3, "’")); });
      gg.append("text").attr("class", "lbl").attr("x", x0.bandwidth() / 2).attr("y", ih + 38).attr("text-anchor", "middle").style("font-weight", 600).text(f.short); });
    tidy("#flu-years");
    const yy = k => Y.filter(d => d.fuente === k).map(d => d.municipios_con_dato);
    $("flu-years-note").textContent = `Valores nominales (sin ajustar por inflación), tal como los reporta cada municipio. Municipios con dato por año: SGP ${yy("SGP").map(f0).join(" · ")}; Estampilla ${yy("EST").map(f0).join(" · ")}; LEP ${yy("LEPR").map(f0).join(" · ")}.`;
    // Efecto PDET condicional
    const rows = [];
    FK.forEach(f => { const d = FL[f.k];
      [["principal", d.ppml_efecto_PDET_pct, d.ppml_IC95_lo, d.ppml_IC95_hi, d.ppml_p], ["+ IPM y escenarios", d.R3_efecto_PDET_pct, d.R3_IC95_lo, d.R3_IC95_hi, d.R3_p]].forEach(([lab, e, lo, hi, pv]) => {
        const un = unstable(lo, hi);
        rows.push({ k: f.k + lab, label: `${f.short} · ${lab === "principal" ? "principal" : "+ IPM"}`, v: 1 + e / 100, lo: 1 + lo / 100, hi: 1 + hi / 100, c: FCOL[f.k], sel: !un, hollow: !(pv < 0.05) || un, txt: un ? "imprecisa" : `${e > 0 ? "+" : ""}${f0(e)} %` }); }); });
    const tf = v => { const q = (v - 1) * 100; return (q > 0 ? "+" : "") + f0(q) + " %"; };
    dotCI("#flu-pdet", rows, { log: true, domain: [0.25, 8], ticks: [0.25, 0.5, 1, 2, 4, 8], tf, ref: 1, refLabel: "sin diferencia", ml: 150, xlabel: "Diferencia de los municipios PDET (escala log)" });
    const s = FL.SGP, e = FL.EST;
    $("flu-tech").innerHTML = `PPML del promedio anual ${y0}–${y1} con los mismos controles y efectos fijos de departamento del modelo principal: log de la población, % rural, MDM y grupo de capacidades (DNP, ${R.parametros_extra.anio_mdm}) y organizaciones culturales. La segunda fila añade el IPM censal ${R.parametros_extra.anio_ipm} y el log de los escenarios habilitados (PULEP). SGP: ${s.ppml_efecto_PDET_pct > 0 ? "+" : ""}${f0(s.ppml_efecto_PDET_pct)} % (${pval(s.ppml_p)}); con IPM, ${s.R3_efecto_PDET_pct > 0 ? "+" : ""}${f0(s.R3_efecto_PDET_pct)} % (${pval(s.R3_p)}), coeficiente del IPM ${pval(s.R3_p_ipm)}. Estampilla: ${e.ppml_efecto_PDET_pct > 0 ? "+" : ""}${f0(e.ppml_efecto_PDET_pct)} % (${pval(e.ppml_p)}); con IPM, ${e.R3_efecto_PDET_pct > 0 ? "+" : ""}${f0(e.R3_efecto_PDET_pct)} % (${pval(e.R3_p)}). Elasticidades respecto a la población: ${FK.map(f => `${f.short} ${f2(FL[f.k].elasticidad_pob)} (IC 95 % ${f2(FL[f.k].elast_IC95_lo)}–${f2(FL[f.k].elast_IC95_hi)})`).join("; ")}. La LEP girada solo es positiva en ${f0(FL.LEPR.municipios_con_recursos)} municipios, por lo que sus estimaciones condicionales son imprecisas. Una estimación se marca «imprecisa» cuando el extremo superior de su intervalo multiplicativo es más de 25 veces el inferior.`;
    const V = R.validacion_lep;
    $("flu-val").innerHTML = `<div class="callout__n">r = ${f2(V.pearson_log_ambas)}</div><p><strong>Dos registros independientes cuentan la misma geografía.</strong> En los ${f0(V.municipios_ambas)} municipios que aparecen en ambos, el valor de los proyectos LEP (MinCulturas) y el de la LEP girada (CUIPO) están fuertemente correlacionados (en logaritmos, ${pval(V.p)}). Bogotá concentra el ${pct(V.pct_bogota_proyectos)} en el primero y el ${pct(V.pct_bogota_cuipo)} en el segundo; los cinco primeros municipios, ${pct(V.pct_top5_proyectos)} y ${pct(V.pct_top5_cuipo)}. ${f0(V.solo_proyectos)} municipios tienen proyectos sin giro reportado en ${y0}–${y1} y ${f0(V.solo_cuipo)} reportan giros sin proyectos en el inventario.</p>`;
  }

  /* ---------------- Contexto: normas y antecedentes ---------------- */
  function context() {
    if (R.normas) $("laws").innerHTML = R.normas.map(n => `<article class="law card"><p class="law__src"><a href="${n.url}">${n.norma}</a><span>${n.fuente}</span></p>
      <ol>${n.articulos.map(a => `<li><span class="law__art">${a.articulo}</span><p>${a.en_palabras_simples}</p><q>${a.texto_literal}…</q></li>`).join("")}</ol>
      <p class="law__ver">Texto oficial consultado el ${fdate(n.consultado_utc)} · SHA-256 <code title="${n.sha256_html}">${n.sha256_html.slice(0, 12)}…</code></p></article>`).join("");
    const AN = R.antecedentes; if (!AN) return;
    $("ant-meta").textContent = AN.metodo;
    const item = r => `<details class="ant"><summary><span class="ant__tipo">${r.tipo.replace(/\s*\(.*\)$/, "")}</span><span class="ant__cita">${r.cita}</span></summary>
      <div class="ant__body"><p><b>Qué aporta.</b> ${r.aporta}</p><p><b>Relación con este estudio.</b> ${r.relacion}</p><p class="muted small"><b>Verificación.</b> ${r.verificado.replace(/</g, "&lt;")} · <a href="${r.url}">${r.url.replace(/^https?:\/\//, "").slice(0, 60)}${r.url.length > 68 ? "…" : ""}</a></p></div></details>`;
    const acad = AN.referencias.filter(r => /doi\.org/.test(r.url)), ofi = AN.referencias.filter(r => !/doi\.org/.test(r.url));
    $("ants").innerHTML = `<div><h4>Estudios (${acad.length})</h4>${acad.map(item).join("")}</div><div><h4>Documentos oficiales (${ofi.length})</h4>${ofi.map(item).join("")}</div>`;
  }

  /* ---------------- Método ---------------- */
  function method() {
    const ts = s => s.replace("T", " ").replace("+00:00", "");
    $("prov-table").querySelector("tbody").innerHTML = R.procedencia.map(p => `<tr><td><code>${p.archivo}</code></td><td>${(p.entidad_publicadora || p.fuente || "").replace(/, Bogot[aá] D\.?C\.?$/, "")}</td><td>${p.dataset_id ? `<a href="https://www.datos.gov.co/d/${p.dataset_id}">${p.dataset_id}</a>` : `<a href="${p.url}">${p.url.split("/").pop()}</a>`}</td><td class="num">${p.filas != null ? f0(p.filas) : "—"}</td><td class="num">${ts(p.descargado_utc)}</td><td><code title="${p.sha256}">${p.sha256.slice(0, 12)}…</code></td></tr>`).join("")
      + (R.procedencia_geo ? `<tr><td><code>municipios.geojson</code></td><td>DANE</td><td><a href="${R.procedencia_geo.url}">${R.procedencia_geo.url.split("/").pop()}</a></td><td class="num">${f0(R.procedencia_geo.poligonos)}</td><td class="num">${ts(R.procedencia_geo.generado_utc)}</td><td><code title="${R.procedencia_geo.sha256_zip}">${R.procedencia_geo.sha256_zip.slice(0, 12)}…</code></td></tr>` : "");
    $("desc-oficial").innerHTML = `Según su descripción oficial, el dataset de financiación de MinCulturas reúne cinco fuentes: SGR, SGP, LEP, INC y Estampilla Procultura. <strong>Los datos publicados solo contienen tres:</strong> ${SRC.filter(s => s.fuente).map(s => s.fuente).join(", ")}. Las otras dos (SGP y Estampilla) se analizan con los reportes CUIPO de la Contraloría en «Flujos anuales».`;
    if (R.procedencia_geo) $("geo-note").textContent = `Cartografía: ${R.procedencia_geo.fuente}; ${R.procedencia_geo.simplificacion}.`;
    const DEC_TXT = { universo: "Universo de análisis", excluir_poblacion_cero: "Excluir población cero", excluir_fila_totales: "Excluir fila de totales", ceros: "Conservar valores cero", excluir_sin_codigo: "Excluir proyectos sin código", excluir_departamental: "Excluir proyectos departamentales", excluir_codigo_no_DANE: "Excluir códigos inexistentes", pdet: "Cruce PDET", victimas_sin_match: "Cruce de víctimas", centroides: "Centroides espaciales", mdm_terridata: "Desempeño y capacidad (DNP)", ipm_ruralidad: "Pobreza y ruralidad", escenarios_lep: "Escenarios habilitados", cuipo_cruce: "Cruce CUIPO–DIVIPOLA", cuipo_panel: "Panel anual CUIPO" };
    $("dec-table").querySelector("tbody").innerHTML = R.decisiones.map(d => `<tr><td><strong>${DEC_TXT[d.regla] || d.regla}</strong><br><code>${d.regla}</code></td><td>${d.detalle}</td><td class="num">${d.filas_afectadas != null ? f0(d.filas_afectadas) : ""}</td><td class="num">${d.valor_afectado_COP != null ? f1(d.valor_afectado_COP / 1e9) : ""}</td></tr>`).join("");
    const lab = { "1_solo_PDET": "Sin ajustar", "2_+log_pob": "+ población", "3_+controles": "+ controles", "4_+EF_depto (principal)": "+ EF departamento (principal)", "R1_sin_Ciudades": "Sin ciudades", "R2_victimas_en_vez_PDET": "Víctimas en lugar de PDET", "R3_+IPM_y_escenarios": "+ IPM y escenarios (robustez)" };
    $("ppml-table").querySelector("tbody").innerHTML = R.ppml.map(d => `<tr${d.modelo.startsWith("4_") ? ' style="font-weight:600"' : ""}><td>${S[d.fuente].short}</td><td>${lab[d.modelo] || d.modelo}</td><td class="num">${f0(d.N)}</td><td class="num">${d.efecto_pct > 0 ? "+" : ""}${f1(d.efecto_pct)} %${unstable(d.IC95_pct_lo, d.IC95_pct_hi) ? `<sup title="Intervalo muy amplio: estimación imprecisa">†</sup>` : ""}</td><td class="num">${f0(d.IC95_pct_lo)} a ${f0(d.IC95_pct_hi)} %</td><td class="num">${d.p < 0.001 ? "<0,001" : f2(d.p)}</td><td class="num">${d.elasticidad_pob != null ? f2(d.elasticidad_pob) : "—"}</td></tr>`).join("");
    const dep = R.decisiones.find(d => d.regla === "excluir_departamental"), tr = R.decisiones.find(d => d.regla === "excluir_fila_totales");
    $("limits").innerHTML = [
      `El dataset de MinCulturas describe cinco fuentes, pero solo publica ${SRC.filter(s => s.fuente).length}. El SGP para cultura y la Estampilla Procultura se toman de CUIPO (Contraloría), que es autorreportado por cada municipio y registra recaudo de caja, no asignaciones.`,
      R.parametros_extra ? `CUIPO empieza en ${R.parametros_extra.anios_cuipo[0]}; los valores anuales son nominales. Las entidades descentralizadas de cultura (institutos o corporaciones municipales) reportan por separado y no se suman a su municipio.` : null,
      R.parametros_extra ? `El MDM y el grupo de capacidades son de ${R.parametros_extra.anio_mdm}, el último año en que TerriData publica ambos. Desde entonces el MDM aparece sin grupos (hasta ${R.parametros_extra.anio_mdm_ultimo}), lo que sugiere un cambio de metodología, así que no se mezclan años. El IPM es censal (${R.parametros_extra.anio_ipm}).` : null,
      `El inventario de escenarios habilitados (PULEP) no tiene fecha de registro: refleja la oferta vigente, no la de cada año.`,
      `El dataset de proyectos no informa el año de cada proyecto, y “valor” mezcla montos aprobados y ejecutados: describe el acumulado publicado a la fecha de corte. Los flujos anuales se miden aparte con CUIPO.`,
      dep ? `Se excluyen ${money(dep.valor_afectado_COP)} en ${f0(dep.filas_afectadas)} proyectos de nivel departamental, que no se pueden asignar a un municipio. Esto puede subestimar la redistribución de las regalías.` : null,
      tr && tr.filas_afectadas ? `El dataset trae una fila de totales incrustada (${money(tr.valor_afectado_COP)}), que se excluye para no contar el INC dos veces.` : null,
      `La población de referencia es la proyección DANE de ${R.anio_poblacion}. Las víctimas son un acumulado histórico por lugar de ocurrencia (RUV).`,
      `Es un estudio observacional: muestra asociaciones, no efectos causales. El análisis de temas es exploratorio.`,
      `La cartografía usa los límites del MGN del DANE indicado en “Fuentes”. Los municipios sin polígono aparecen en los cálculos pero no en el mapa.`,
    ].filter(Boolean).map(x => `<li>${x}</li>`).join("");
    const GL = [
      ["LEP", "Ley de Espectáculos Públicos (Ley 1493 de 2011). Contribución parafiscal del 10 % sobre la boletería de espectáculos de artes escénicas, que se devuelve al municipio donde se generó."],
      ["INC", "Impuesto Nacional al Consumo sobre telefonía, datos e internet móvil; la parte destinada a cultura se gira a Bogotá y a los departamentos (Decreto 359 de 2018)."],
      ["SGP Cultura", "Recursos del Sistema General de Participaciones que la Nación transfiere a cada municipio con destinación a cultura (cuenta CUIPO 1.1.02.06.001.03.02)."],
      ["Estampilla Procultura", "Ingreso tributario territorial con destinación cultural; aquí, el recaudo que cada municipio reporta en CUIPO."],
      ["CUIPO", "Categoría Única de Información del Presupuesto Ordinario: los reportes de ejecución presupuestal de las entidades territoriales que publica la Contraloría General de la República."],
      ["IPM", "Índice de pobreza multidimensional del DANE: porcentaje de personas con privaciones en educación, salud, trabajo, vivienda y niñez. Aquí, el censal municipal."],
      ["MDM", "Medición de Desempeño Municipal del DNP: puntaje de gestión y resultados de cada alcaldía, con grupos de capacidades iniciales para comparar municipios parecidos."],
      ["SGR", "Sistema General de Regalías: aquí, los proyectos culturales aprobados con esos recursos que registra MinCulturas."],
      ["PDET", "Programas de Desarrollo con Enfoque Territorial: 170 municipios priorizados por el Acuerdo de Paz (lista oficial de la Agencia de Renovación del Territorio)."],
      ["Pesos por habitante", "Valor total recibido por un municipio dividido entre su población proyectada por el DANE."],
      ["Elasticidad", "Cambio porcentual del valor recibido cuando la población aumenta 1 %, entre municipios comparables. 1 = proporcional."],
      ["Intervalo de confianza (IC 95 %)", "Rango de valores compatibles con los datos. Si un efecto incluye el cero (o la razón incluye el 1), no se distingue de la ausencia de diferencia."],
      ["Valor p", "Probabilidad de observar una diferencia igual o mayor si en realidad no existiera. Por debajo de 0,05 se considera estadísticamente significativa."],
      ["PPML", "Regresión de Poisson pseudo-máxima verosimilitud. Modela valores en pesos aunque muchos municipios tengan cero."],
      ["Efectos fijos de departamento", "Comparación de cada municipio solo con otros de su mismo departamento, lo que neutraliza diferencias regionales."],
      ["Gini", "Medida de concentración entre 0 (todos reciben lo mismo por habitante) y 1 (todo va a un solo lugar)."],
      ["Theil", "Medida de desigualdad que separa cuánto se debe a diferencias entre grupos y cuánto a diferencias dentro de ellos."],
      ["LISA", "Indicador local de asociación espacial. Detecta grupos de municipios vecinos con valores parecidos o contrastantes."],
      ["Septiles", "División de los municipios con recursos en siete grupos del mismo tamaño, de menor a mayor valor."],
      ["NMF", "Factorización de matrices no negativas. Agrupa textos en temas según las palabras que comparten."],
    ];
    $("glossary").innerHTML = GL.map(([t, d]) => `<dt>${t}</dt><dd>${d}</dd>`).join("");
    const DL = [["base_municipal.csv", "Base municipal completa", "CSV"], ["t3_ppml.csv", "Resultados de los modelos", "CSV"], ["t1_brecha_pdet.csv", "Brecha PDET", "CSV"], ["t2_desigualdad.csv", "Desigualdad", "CSV"], ["t4_espacial.csv", "Análisis espacial", "CSV"], ["t6_topicos_nmf.csv", "Temas de los proyectos", "CSV"], ["t8_flujos_cuipo.csv", "Flujos anuales CUIPO", "CSV"], ["t8b_flujos_por_anio.csv", "Flujos por año", "CSV"], ["normas_verificadas.json", "Normas verificadas", "JSON"], ["antecedentes.json", "Antecedentes verificados", "JSON"], ["decisiones_limpieza.json", "Reglas de depuración", "JSON"], ["procedencia.json", "Procedencia y checksums", "JSON"]];
    $("downloads").innerHTML = DL.map(([f, t, k]) => `<a class="dl" href="descargas/${f}" download><i>${k}</i><span>${t}</span></a>`).join("");
    const y = new Date(R.generado_utc).getUTCFullYear();
    const cite = `afvelandia (${y}). Geografía fiscal de la cultura en Colombia [sitio web interactivo], versión del ${fdate(R.generado_utc)}. https://afvelandia.github.io/geografia-fiscal-cultura/`;
    $("cite").textContent = cite;
    $("cite-copy").onclick = async () => { try { await navigator.clipboard.writeText(cite); $("cite-copy").textContent = "Copiada ✓"; setTimeout(() => $("cite-copy").textContent = "Copiar cita", 1800); } catch (e) { } };
    const REFS = [
      ["Anselin, L. (1995). Local Indicators of Spatial Association—LISA. Geographical Analysis, 27(2), 93–115.", "10.1111/j.1538-4632.1995.tb00338.x"],
      ["Benjamini, Y. y Hochberg, Y. (1995). Controlling the False Discovery Rate: A practical and powerful approach to multiple testing. Journal of the Royal Statistical Society: Series B, 57(1), 289–300.", "10.1111/j.2517-6161.1995.tb02031.x"],
      ["Correia, S., Guimarães, P. y Zylkin, T. (2020). Fast Poisson estimation with high-dimensional fixed effects. The Stata Journal, 20(1), 95–115.", "10.1177/1536867X20909691"],
      ["Efron, B. y Tibshirani, R. (1994). An Introduction to the Bootstrap. Chapman and Hall/CRC.", "10.1201/9780429246593"],
      ["Gómez García, P. A. (2016). Comentarios a la contribución parafiscal cultural de los espectáculos públicos de las artes escénicas. Revista de Derecho Fiscal, 8.", "10.18601/16926722.n8.05"],
      ["Lee, D. y Seung, H. (1999). Learning the parts of objects by non-negative matrix factorization. Nature, 401, 788–791.", "10.1038/44565"],
      ["Santos Silva, J. M. C. y Tenreyro, S. (2006). The log of gravity. The Review of Economics and Statistics, 88(4), 641–658.", "10.1162/rest.88.4.641"],
      ["Shorrocks, A. (1980). The class of additively decomposable inequality measures. Econometrica, 48(3), 613–625.", "10.2307/1913126"],
    ].concat((R.referencias_extra || []).map(r => [r.cita, r.doi]));
    $("refs").innerHTML = REFS.sort((a, b) => a[0].localeCompare(b[0], "es")).map(([c, d]) => `<li>${c} ${d ? `<a href="${d.startsWith("http") ? d : "https://doi.org/" + d}">${d.startsWith("http") ? d : "doi:" + d}</a>` : ""}</li>`).join("");
  }

  /* ---------------- Navegación ---------------- */
  const navLinks = [...document.querySelectorAll("#nav a")];
  const secs = navLinks.map(a => document.querySelector(a.getAttribute("href")));
  const io = new IntersectionObserver(es => es.forEach(e => { if (e.isIntersecting) navLinks.forEach(a => a.classList.toggle("on", a.getAttribute("href") === "#" + e.target.id)); }), { rootMargin: "-45% 0px -50% 0px" });
  secs.forEach(s => s && io.observe(s));
  const bar = $("progress");
  addEventListener("scroll", () => { const h = document.documentElement; bar.style.width = (100 * h.scrollTop / (h.scrollHeight - h.clientHeight)).toFixed(1) + "%"; }, { passive: true });

  function update() {
    document.querySelectorAll("#seg button").forEach(b => { b.setAttribute("aria-checked", b.dataset.k === state.src); b.tabIndex = b.dataset.k === state.src ? 0 : -1; });
    document.querySelectorAll("#map-mode button").forEach(b => b.setAttribute("aria-checked", b.dataset.mode === state.mode));
    document.documentElement.style.setProperty("--accent", COL[state.src]);
    paint(); scatter(); elast(); ratio(); steps(); lorenz(); top5();
    if (state.sel) select(state.sel);
  }
  topics(); method(); flows(); context(); update();
})();
