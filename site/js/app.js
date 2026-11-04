/* Geografía fiscal de la cultura — interfaz. Todo texto con cifras se deriva de data/*.json */
(async function () {
  "use strict";
  const L = d3.formatLocale({ decimal: ",", thousands: ".", grouping: [3], currency: ["$", ""] });
  const f0 = L.format(",.0f"), f1 = L.format(",.1f"), f2 = L.format(",.2f");
  const COL = { LEP: "#C1440E", INC: "#3E6FB0", SGR: "#1F8A7E", total: "#3a3a40" };
  const SRC = [
    { k: "LEP", name: "Ley de Espectáculos Públicos", short: "LEP", fuente: "Ley de Espectáculos Públicos" },
    { k: "INC", name: "Impuesto Nacional al Consumo (destinación cultural)", short: "INC", fuente: "Impuesto Nacional al Consumo" },
    { k: "SGR", name: "Sistema General de Regalías", short: "Regalías", fuente: "Sistema General de Regalías" },
    { k: "total", name: "Las tres fuentes", short: "Total", fuente: null },
  ];
  const S = Object.fromEntries(SRC.map(s => [s.k, s]));
  const LISA = { "Alto-Alto": "#C1440E", "Bajo-Bajo": "#3E6FB0", "Alto-Bajo": "#F4A261", "Bajo-Alto": "#8AB6D6", "No significativo": "#e7e2da" };
  const LISA_TXT = { "Alto-Alto": "alto rodeado de altos", "Bajo-Bajo": "bajo rodeado de bajos", "Alto-Bajo": "alto rodeado de bajos", "Bajo-Alto": "bajo rodeado de altos", "No significativo": "sin agrupamiento significativo" };
  const state = { src: "LEP", mode: "pc", sel: null, pdet: true };

  const money = v => {
    if (v == null || isNaN(v)) return "—";
    const a = Math.abs(v);
    if (a >= 1e12) return "$" + f2(v / 1e12) + " billones";
    if (a >= 1e9) return "$" + f1(v / 1e9) + " mil millones";
    if (a >= 1e6) return "$" + f1(v / 1e6) + " millones";
    return "$" + f0(v);
  };
  const pct = v => f1(v) + " %";
  const fdate = s => { const d = new Date(s); return isNaN(d) ? s : d.toLocaleDateString("es-CO", { day: "numeric", month: "long", year: "numeric", timeZone: "UTC" }); };
  const $ = id => document.getElementById(id);

  let R, MU, G, LZ;
  try {
    [R, MU, G, LZ] = await Promise.all(["data/resumen.json", "data/municipios.json", "data/municipios.geojson", "data/lorenz.json"].map(u => fetch(u).then(r => { if (!r.ok) throw new Error(u); return r.json(); })));
  } catch (e) {
    $("stamp-corto").textContent = "no fue posible cargar los datos"; console.error(e); return;
  }
  const IDS = Object.keys(MU), N = IDS.length;
  const B = Object.fromEntries(R.brecha.map(d => [d.fuente, d]));
  const D = Object.fromEntries(R.desigualdad.map(d => [d.fuente, d]));
  const C = Object.fromEntries(R.concentracion.map(d => [d.fuente, d]));
  const E = Object.fromEntries(R.espacial.map(d => [d.fuente, d]));
  const P = (src, prefix) => R.ppml.find(d => d.fuente === src && d.modelo.startsWith(prefix));
  const MAIN = src => P(src, "4_");
  const sig = d => d && d.p < 0.05;
  const elastClass = d => d.elast_IC95_lo > 1 ? "mas" : d.elast_IC95_hi < 1 ? "menos" : "igual";

  // ---------- Encabezado ----------
  const cortes = Object.values(R.fecha_corte_por_fuente).sort();
  $("stamp-corto").textContent = "actualizado el " + fdate(R.descarga_utc);
  $("h-municipios").textContent = f0(R.totales.municipios);
  $("stamp").innerHTML = `<span class="dot"></span>Datos descargados de las fuentes oficiales el ${fdate(R.descarga_utc)} · corte de financiación al ${fdate(cortes[cortes.length - 1])} · población DANE ${R.anio_poblacion} · actualización automática mensual`;
  $("footer-stamp").textContent = `Versión generada el ${fdate(R.generado_utc)} (UTC). Pipeline y validaciones descritos en “Método, datos y trazabilidad”.`;
  const eL = MAIN("LEP"), cL = C.LEP;
  const kpis = [
    { v: money(R.totales.valor_municipal_COP), l: "asignados a municipios y analizados", s: `de ${money(R.totales.valor_original_COP)} en el dataset original (ver depuración)` },
    { v: `${f0(B.LEP.municipios_con_recursos)} <small>de ${f0(N)}</small>`, l: "municipios reciben recursos de la LEP", s: `${pct(100 - D.LEP.pct_municipios_sin_recursos)} del total` },
    { v: pct(cL.pct_top1), l: `de la LEP municipal va a ${cL.municipio_top1}`, s: `los 5 primeros: ${pct(cL.pct_top5)}` },
    { v: f2(eL.elasticidad_pob), l: "elasticidad de la LEP respecto a la población", s: `IC 95 %: ${f2(eL.elast_IC95_lo)}–${f2(eL.elast_IC95_hi)} · 1 = proporcional` },
  ];
  $("kpis").innerHTML = kpis.map(k => `<div class="kpi"><div class="kpi__v">${k.v}</div><div class="kpi__l">${k.l}</div><div class="kpi__s">${k.s}</div></div>`).join("");

  // ---------- Hallazgos (texto condicionado a los resultados) ----------
  const ecl = SRC.map(s => ({ s, d: MAIN(s.k) }));
  const mas = ecl.filter(x => elastClass(x.d) === "mas").map(x => x.s.short), menos = ecl.filter(x => x.s.k !== "total" && elastClass(x.d) === "menos").map(x => x.s.short);
  const lista = a => a.length <= 1 ? a.join("") : a.slice(0, -1).join(", ") + " y " + a[a.length - 1];
  const sigPdet = SRC.filter(s => sig(MAIN(s.k)));
  const f3 = sigPdet.length === 0
    ? `Con controles por tamaño, ruralidad, desempeño municipal, capacidad institucional y departamento, ser municipio PDET <strong>no tiene un efecto estadísticamente distinguible de cero</strong> en ninguna de las fuentes.`
    : `Con controles, el efecto PDET es estadísticamente significativo en ${lista(sigPdet.map(s => `${s.short} (${MAIN(s.k).efecto_pct > 0 ? "+" : ""}${f0(MAIN(s.k).efecto_pct)} %)`))}.`;
  const F = [
    { h: "La LEP se queda en pocas ciudades", p: `Los recursos de la Ley de Espectáculos Públicos llegan a ${f0(B.LEP.municipios_con_recursos)} de ${f0(N)} municipios. ${cL.municipio_top1} recibe el ${pct(cL.pct_top1)} y los cinco primeros (${cL.top5.replace(/;/g, ",")}) el ${pct(cL.pct_top5)}.` },
    { h: "Cada fuente sigue una lógica de escala distinta", p: `${mas.length ? `${lista(mas)} crece${mas.length > 1 ? "n" : ""} más que proporcionalmente con la población (elasticidad LEP ${f2(eL.elasticidad_pob)}). ` : ""}${menos.length ? `${lista(menos)} crece${menos.length > 1 ? "n" : ""} menos que proporcionalmente, lo que favorece por habitante a los municipios pequeños.` : ""}` },
    { h: "La brecha PDET es de escala, no de condición", p: `Sin controles, un habitante de un municipio PDET recibe ${f2(B.LEP.razon_PDET_noPDET)} veces lo que recibe uno de otro municipio por la LEP, y ${f2(B.SGR.razon_PDET_noPDET)} veces por regalías. ${f3}` },
  ];
  $("findings").innerHTML = F.map(x => `<li><h3>${x.h}</h3><p>${x.p}</p></li>`).join("");

  // ---------- Selector de fuente ----------
  $("seg").innerHTML = SRC.map(s => `<button role="radio" aria-checked="${s.k === state.src}" data-k="${s.k}"><span class="sw" style="background:${COL[s.k]}"></span>${s.short}</button>`).join("");
  $("seg").addEventListener("click", e => { const b = e.target.closest("button"); if (!b) return; state.src = b.dataset.k; update(); });
  $("map-mode").addEventListener("click", e => { const b = e.target.closest("button"); if (!b) return; state.mode = b.dataset.mode; update(); });
  $("pdet-toggle").addEventListener("change", e => { state.pdet = e.target.checked; drawPdet(); });

  // ---------- Mapa ----------
  const W = 800, H = 1000;
  const svg = d3.select("#map").attr("viewBox", `0 0 ${W} ${H}`).attr("preserveAspectRatio", "xMidYMid meet");
  const isl = f => f.properties.dv.startsWith("88");
  const main = { type: "FeatureCollection", features: G.features.filter(f => !isl(f)) };
  const islas = { type: "FeatureCollection", features: G.features.filter(isl) };
  const proj = d3.geoMercator().fitExtent([[20, 20], [W - 20, H - 20]], main), path = d3.geoPath(proj);
  const gZoom = svg.append("g"), gM = gZoom.append("g"), gP = gZoom.append("g");
  const inset = svg.append("g").attr("transform", "translate(24,24)");
  inset.append("rect").attr("width", 110).attr("height", 130).attr("rx", 8).attr("fill", "#fff").attr("stroke", "#ddd");
  inset.append("text").attr("x", 8).attr("y", 122).attr("class", "lbl").style("font-size", "10px").text("San Andrés y Prov.");
  const projI = d3.geoMercator().fitExtent([[10, 10], [100, 105]], islas), pathI = d3.geoPath(projI);
  const pMain = gM.selectAll("path").data(main.features).join("path").attr("class", "m").attr("d", path);
  const pIsl = inset.append("g").selectAll("path").data(islas.features).join("path").attr("class", "m").attr("d", pathI);
  const allPaths = d3.selectAll([...pMain.nodes(), ...pIsl.nodes()]);
  const zoom = d3.zoom().scaleExtent([1, 12]).translateExtent([[0, 0], [W, H]]).on("zoom", e => gZoom.attr("transform", e.transform));
  svg.call(zoom);
  $("zoom-in").onclick = () => svg.transition().call(zoom.scaleBy, 1.6);
  $("zoom-out").onclick = () => svg.transition().call(zoom.scaleBy, 1 / 1.6);
  $("zoom-reset").onclick = () => svg.transition().call(zoom.transform, d3.zoomIdentity);
  function drawPdet() {
    gP.selectAll("path").data(state.pdet ? main.features.filter(f => MU[f.properties.dv] && MU[f.properties.dv].pdet === 1) : [])
      .join("path").attr("class", "pdet").attr("d", path)
      .attr("fill", "none").attr("stroke", "#111").attr("stroke-width", 0.7).attr("stroke-opacity", 0.6)
      .attr("vector-effect", "non-scaling-stroke").attr("pointer-events", "none");
  }
  drawPdet();
  const tip = $("tooltip"), wrap = $("map-wrap");
  allPaths.on("mousemove", (e, f) => {
    const m = MU[f.properties.dv]; const r = wrap.getBoundingClientRect();
    tip.hidden = false;
    tip.innerHTML = m ? `<b>${m.municipio}</b>, ${m.departamento}${m.pdet ? " · PDET" : ""}<br>${S[state.src].short}: ${money(m["valor_" + state.src])}<br>${m["pc_" + state.src] > 0 ? "$" + f0(m["pc_" + state.src]) + " por habitante" : "sin recursos registrados"}${state.mode === "lisa" ? `<br>Agrupamiento: ${LISA_TXT[m["lisa_" + state.src]] || "sin dato"}` : ""}` : `<b>Sin datos</b> (código ${f.properties.dv})`;
    let x = e.clientX - r.left + 14, y = e.clientY - r.top + 14;
    if (x > r.width - 240) x -= 260; tip.style.left = x + "px"; tip.style.top = y + "px";
  }).on("mouseleave", () => tip.hidden = true).on("click", (e, f) => { if (MU[f.properties.dv]) select(f.properties.dv); });

  function colorFor(src) {
    const vals = IDS.map(i => MU[i]["pc_" + src]).filter(v => v > 0).sort(d3.ascending);
    const q = [1, 2, 3, 4, 5, 6].map(i => d3.quantileSorted(vals, i / 7));
    const cols = d3.range(7).map(i => d3.interpolateRgb("#f5ede2", COL[src])(0.12 + i * 0.88 / 6));
    return { sc: d3.scaleThreshold().domain(q).range(cols), q, cols };
  }
  function paint() {
    const src = state.src;
    if (state.mode === "pc") {
      const { sc, q, cols } = colorFor(src);
      allPaths.attr("fill", f => { const m = MU[f.properties.dv]; if (!m) return "url(#hatch)"; const v = m["pc_" + src]; return v > 0 ? sc(v) : "#e9e4dc"; });
      const lab = [0, ...q].map((v, i) => i === 0 ? "" : "$" + L.format(",.0f")(v));
      $("legend").innerHTML = `<span>Pesos por habitante</span><span class="ramp">${cols.map((c, i) => `<span title="${i === 0 ? "≤ $" + f0(q[0]) : i === 6 ? "> $" + f0(q[5]) : "$" + f0(q[i - 1]) + "–" + f0(q[i])}" style="background:${c}"></span>`).join("")}</span><span class="muted">$${f0(q[0])} → $${f0(q[5])}+ (septiles)</span><span class="item"><i style="background:#e9e4dc"></i>Sin recursos</span><span class="item"><i style="background:#fff;border:1px solid #111"></i>Contorno: PDET</span>`;
    } else {
      allPaths.attr("fill", f => { const m = MU[f.properties.dv]; return m ? LISA[m["lisa_" + src]] || "#e7e2da" : "url(#hatch)"; });
      const cnt = d3.rollup(IDS, v => v.length, i => MU[i]["lisa_" + src]);
      $("legend").innerHTML = Object.keys(LISA).map(k => `<span class="item"><i style="background:${LISA[k]}"></i>${k} (${f0(cnt.get(k) || 0)})</span>`).join("") + `<span class="muted">I de Moran = ${f2(E[src].moran_I)} (p ${E[src].p_perm < 0.001 ? "< 0,001" : "= " + L.format(",.3f")(E[src].p_perm)}, 9.999 permutaciones) · FDR 5 %</span>`;
    }
    allPaths.classed("sel", f => f.properties.dv === state.sel);
    const nz = B[src].municipios_con_recursos;
    $("map-title").textContent = state.mode === "pc" ? `${S[src].name}: pesos por habitante` : `${S[src].name}: agrupamientos espaciales`;
    $("map-lede").textContent = state.mode === "pc"
      ? `${f0(nz)} de ${f0(N)} municipios reciben recursos de esta fuente. Los colores dividen a los municipios con recursos en siete grupos del mismo tamaño (septiles); en gris, los municipios sin recursos registrados.`
      : `LISA identifica municipios cuyo valor por habitante se parece significativamente al de sus vecinos (Alto-Alto, Bajo-Bajo) o se diferencia de ellos (Alto-Bajo, Bajo-Alto). Se consideran 8 vecinos y se controla la tasa de falsos descubrimientos al 5 %.`;
    $("map-caption").textContent = `Valores acumulados del dataset de MinCulturas, asignados al municipio donde se ejecuta el proyecto; población DANE ${R.anio_poblacion}. Arrastra para desplazarte y usa los botones o la rueda para acercar.`;
  }
  svg.append("defs").html(`<pattern id="hatch" width="6" height="6" patternUnits="userSpaceOnUse" patternTransform="rotate(45)"><rect width="6" height="6" fill="#f2efe9"/><line x1="0" y1="0" x2="0" y2="6" stroke="#c9c2b6" stroke-width="2"/></pattern>`);

  // ---------- Ficha municipal ----------
  const ranks = {};
  SRC.forEach(s => { const o = IDS.slice().sort((a, b) => MU[b]["pc_" + s.k] - MU[a]["pc_" + s.k]); ranks[s.k] = Object.fromEntries(o.map((id, i) => [id, i + 1])); });
  const opts = IDS.map(id => ({ id, label: `${MU[id].municipio}, ${MU[id].departamento}` })).sort((a, b) => a.label.localeCompare(b.label, "es"));
  $("muni-list").innerHTML = opts.map(o => `<option value="${o.label}"></option>`).join("");
  const byLabel = Object.fromEntries(opts.map(o => [o.label.toLowerCase(), o.id]));
  $("muni-search").addEventListener("change", e => { const id = byLabel[e.target.value.toLowerCase()]; if (id) select(id); });
  function select(id) {
    state.sel = id; const m = MU[id];
    const rows = SRC.map(s => {
      const pc = m["pc_" + s.k], v = m["valor_" + s.k], rk = ranks[s.k][id], has = v > 0;
      const nPos = IDS.filter(i => MU[i]["valor_" + s.k] > 0).length;
      return `<div class="mrow"><div class="mrow__top"><span class="lab"><i style="background:${COL[s.k]}"></i>${s.short}</span><span class="val">${has ? "$" + f0(pc) + " por hab." : "—"}</span></div>
        <div class="bar"><span style="width:${has ? (100 * (1 - (rk - 1) / N)).toFixed(1) : 0}%;background:${COL[s.k]}"></span></div>
        <div class="ctx">${has ? `${money(v)} · puesto ${f0(rk)} de ${f0(N)} por habitante` : `sin recursos registrados (como ${f0(N - nPos)} municipios)`}</div></div>`;
    }).join("");
    $("muni-detail").innerHTML = `<h3>${m.municipio}${m.pdet ? `<span class="tag">PDET</span>` : ""}</h3><p class="sub">${m.departamento}${m.subregion_pdet ? " · subregión " + m.subregion_pdet.toLowerCase().replace(/(^|\s)\S/g, t => t.toUpperCase()) : ""}<br>${f0(m.pob)} habitantes (DANE ${R.anio_poblacion}) · ${f1(m.pct_rural)} % rural</p>${rows}
      <p class="note">Grupo de capacidad DNP: ${m.grupo_capacidad || "sin dato"} · MDM: ${m.mdm != null ? f2(m.mdm) : "sin dato"} · víctimas por lugar de ocurrencia: ${m.victimas_x1000 != null ? f1(m.victimas_x1000) + " por mil hab." : "sin dato"} · organizaciones culturales registradas: ${f0(m.orgs_cultura)}</p>`;
    allPaths.classed("sel", f => f.properties.dv === id);
  }

  // ---------- Gráficos ----------
  function frame(sel, w, h, m) { const s = d3.select(sel).attr("viewBox", `0 0 ${w} ${h}`); s.selectAll("*").remove(); return s.append("g").attr("transform", `translate(${m.l},${m.t})`); }
  function scatter() {
    const src = state.src, w = 560, h = 380, m = { l: 84, r: 16, t: 10, b: 56 }, iw = w - m.l - m.r, ih = h - m.t - m.b;
    const g = frame("#scatter", w, h, m);
    const pts = IDS.map(id => ({ id, ...MU[id], v: MU[id]["valor_" + src] }));
    const pos = pts.filter(d => d.v > 0), zero = pts.filter(d => !(d.v > 0));
    const x = d3.scaleLog().domain(d3.extent(pts, d => d.pob)).nice().range([0, iw]);
    const y = d3.scaleLog().domain(d3.extent(pos, d => d.v)).nice().range([ih - 34, 0]);
    g.append("g").attr("class", "axis").attr("transform", `translate(0,${ih})`).call(d3.axisBottom(x).ticks(5, "~s").tickFormat(v => [1e3, 1e4, 1e5, 1e6, 1e7].includes(v) ? L.format(",.0f")(v) : ""));
    g.append("g").attr("class", "axis").call(d3.axisLeft(y).ticks(5).tickFormat(v => { const e = Math.log10(v); return Number.isInteger(e) ? (e >= 9 ? f0(v / 1e9) + " mil M" : f0(v / 1e6) + " M") : ""; }));
    g.append("text").attr("class", "lbl").attr("x", iw / 2).attr("y", ih + 40).attr("text-anchor", "middle").text("Población (escala log)");
    g.append("text").attr("class", "lbl").attr("transform", `rotate(-90)`).attr("x", -(ih - 34) / 2).attr("y", -70).attr("text-anchor", "middle").text("Valor recibido, COP (escala log)");
    g.append("line").attr("x1", 0).attr("x2", iw).attr("y1", ih - 16).attr("y2", ih - 16).attr("stroke", "#eee");
    g.append("text").attr("class", "lbl").attr("x", 4).attr("y", ih - 22).style("font-size", "10px").text(`Sin recursos: ${f0(zero.length)} municipios`);
    const rnd = d3.randomUniform.source(d3.randomLcg(7))(-6, 6);
    g.append("g").selectAll("circle").data(zero).join("circle").attr("cx", d => x(d.pob)).attr("cy", () => ih - 8 + rnd()).attr("r", 1.6).attr("fill", "#c9c2b6");
    g.append("g").selectAll("circle").data(pos.sort((a, b) => a.pdet - b.pdet)).join("circle").attr("cx", d => x(d.pob)).attr("cy", d => y(d.v)).attr("r", 3)
      .attr("fill", d => d.pdet ? "#111" : COL[src]).attr("fill-opacity", d => d.pdet ? .85 : .5).attr("stroke", "#fff").attr("stroke-width", .4)
      .append("title").text(d => `${d.municipio}, ${d.departamento}${d.pdet ? " (PDET)" : ""}: ${money(d.v)}; ${f0(d.pob)} hab.`);
    const lg = g.append("g").attr("transform", `translate(8,6)`);
    [[COL[src], "Otros municipios"], ["#111", "Municipios PDET"]].forEach(([c, t], i) => { lg.append("circle").attr("cx", 0).attr("cy", i * 16).attr("r", 4).attr("fill", c); lg.append("text").attr("class", "lbl").attr("x", 9).attr("y", i * 16 + 4).text(t); });
    const e = MAIN(src);
    $("scale-src").textContent = "· " + S[src].short;
    $("scatter-note").textContent = `Cada punto es un municipio. Elasticidad estimada para ${S[src].short}: ${f2(e.elasticidad_pob)} (IC 95 % ${f2(e.elast_IC95_lo)}–${f2(e.elast_IC95_hi)}), con controles y efectos fijos de departamento; N = ${f0(e.N)}. Pasa el cursor sobre un punto para ver el municipio.`;
    $("scale-lede").textContent = `Si el valor creciera en proporción a la población, la elasticidad sería 1. ${elastClass(e) === "mas" ? `En ${S[src].short} es ${f2(e.elasticidad_pob)}, significativamente mayor que 1: los recursos se concentran en los municipios grandes.` : elastClass(e) === "menos" ? `En ${S[src].short} es ${f2(e.elasticidad_pob)}, significativamente menor que 1: por habitante, los municipios pequeños reciben más.` : `En ${S[src].short} es ${f2(e.elasticidad_pob)}, estadísticamente indistinguible de 1.`}`;
  }
  function dotCI(sel, rows, opt) {
    const w = 560, h = 40 + rows.length * 46, m = { l: opt.ml || 170, r: 56, t: 10, b: 36 }, iw = w - m.l - m.r, ih = h - m.t - m.b;
    const g = frame(sel, w, h, m);
    const x = (opt.log ? d3.scaleLog() : d3.scaleLinear()).domain(opt.domain).range([0, iw]);
    const yb = d3.scaleBand().domain(rows.map(r => r.k)).range([0, ih]).padding(.4);
    g.append("g").attr("class", "axis").attr("transform", `translate(0,${ih})`).call(d3.axisBottom(x).tickValues(opt.ticks).tickFormat(opt.tf));
    g.append("line").attr("x1", x(opt.ref)).attr("x2", x(opt.ref)).attr("y1", 0).attr("y2", ih).attr("stroke", "#999").attr("stroke-dasharray", "3 3");
    if (opt.xlabel) g.append("text").attr("class", "lbl").attr("x", iw / 2).attr("y", ih + 32).attr("text-anchor", "middle").text(opt.xlabel);
    const lo = opt.domain[0];
    rows.forEach(r => {
      const yy = yb(r.k) + yb.bandwidth() / 2, a = r.sel ? 1 : .35;
      g.append("text").attr("class", "lbl").attr("x", -10).attr("y", yy + 4).attr("text-anchor", "end").style("font-weight", r.sel ? 650 : 400).text(r.label);
      g.append("line").attr("x1", x(Math.max(r.lo, lo))).attr("x2", x(r.hi)).attr("y1", yy).attr("y2", yy).attr("stroke", r.c).attr("stroke-width", 2.5).attr("opacity", a);
      if (r.lo < lo) g.append("path").attr("d", `M${x(lo)},${yy}l7,-4v8z`).attr("fill", r.c).attr("opacity", a);
      g.append("circle").attr("cx", x(r.v)).attr("cy", yy).attr("r", 5.5).attr("fill", r.hollow ? "#fff" : r.c).attr("stroke", r.c).attr("stroke-width", 2).attr("opacity", a);
      g.append("text").attr("class", "val-lbl").attr("x", x(Math.min(r.hi, opt.domain[1])) + 8).attr("y", yy + 4).attr("opacity", a).text(r.txt);
    });
  }
  function elast() {
    const rows = SRC.map(s => { const e = MAIN(s.k); return { k: s.k, label: s.short, v: e.elasticidad_pob, lo: e.elast_IC95_lo, hi: e.elast_IC95_hi, c: COL[s.k], sel: s.k === state.src, txt: f2(e.elasticidad_pob) }; });
    const mx = Math.max(2.5, d3.max(rows, r => r.hi) + .2);
    dotCI("#elast", rows, { domain: [0, mx], ticks: d3.range(0, mx + .01, .5), tf: v => f1(v).replace(",0", ""), ref: 1, ml: 90, xlabel: "Elasticidad (1 = proporcional)" });
  }
  function ratio() {
    const rows = SRC.map(s => { const b = B[s.k]; return { k: s.k, label: s.short, v: b.razon_PDET_noPDET, lo: b.IC95_lo, hi: b.IC95_hi, c: COL[s.k], sel: s.k === state.src, txt: f2(b.razon_PDET_noPDET) }; });
    dotCI("#ratio", rows, { log: true, domain: [0.03, 8], ticks: [0.05, 0.1, 0.25, 0.5, 1, 2, 4, 8], tf: v => L.format(",")(v), ref: 1, ml: 90, xlabel: "Razón PDET / no PDET (1 = igualdad)" });
    const b = B.LEP, s = B.SGR, t = B.total;
    $("pdet-lede").textContent = `Los ${f0(R.totales.municipios_pdet)} municipios PDET concentran el ${pct(R.totales.pct_pob_pdet)} de la población. Por habitante reciben ${f2(b.razon_PDET_noPDET)} veces lo que reciben los demás por la LEP, ${f2(s.razon_PDET_noPDET)} veces por regalías y ${f2(t.razon_PDET_noPDET)} veces en el total (IC 95 % ${f2(t.IC95_lo)}–${f2(t.IC95_hi)}). La pregunta es si esas diferencias se deben a la condición PDET o a otras características de estos municipios.`;
  }
  function steps() {
    const src = state.src;
    const lab = { "1_": "Sin controles", "2_": "+ tamaño (población)", "3_": "+ ruralidad, MDM y capacidad", "4_": "+ efectos fijos de departamento", "R1": "Sin las 13 ciudades principales" };
    const rows = Object.keys(lab).map(k => { const d = P(src, k); const ef = Math.exp(d.coef); return { k, label: lab[k], v: ef, lo: Math.exp(d.coef - 1.96 * d.ee_cluster), hi: Math.exp(d.coef + 1.96 * d.ee_cluster), c: COL[src], sel: true, hollow: !sig(d), txt: `${d.efecto_pct > 0 ? "+" : ""}${f0(d.efecto_pct)} %${sig(d) ? " *" : ""}` }; });
    const tf = v => { const p = (v - 1) * 100; return (p > 0 ? "+" : "") + f0(p) + " %"; };
    dotCI("#steps", rows, { log: true, domain: [0.01, 12], ticks: [0.02, 0.1, 1, 10], tf, ref: 1, ml: 200, xlabel: "Efecto PDET, escala log (relleno: p < 0,05)" });
    $("step-src").textContent = "· " + S[src].short;
  }
  function lorenz() {
    const w = 560, h = 380, m = { l: 50, r: 16, t: 10, b: 44 }, iw = w - m.l - m.r, ih = h - m.t - m.b;
    const g = frame("#lorenz", w, h, m), x = d3.scaleLinear().range([0, iw]), y = d3.scaleLinear().range([ih, 0]);
    g.append("g").attr("class", "axis").attr("transform", `translate(0,${ih})`).call(d3.axisBottom(x).ticks(5).tickFormat(v => f0(v * 100) + " %"));
    g.append("g").attr("class", "axis").call(d3.axisLeft(y).ticks(5).tickFormat(v => f0(v * 100) + " %"));
    g.append("line").attr("x1", 0).attr("y1", ih).attr("x2", iw).attr("y2", 0).attr("stroke", "#bbb").attr("stroke-dasharray", "3 3");
    g.append("text").attr("class", "lbl").attr("x", iw / 2).attr("y", ih + 36).attr("text-anchor", "middle").text("Población acumulada (de menor a mayor valor por habitante)");
    g.append("text").attr("class", "lbl").attr("transform", "rotate(-90)").attr("x", -ih / 2).attr("y", -38).attr("text-anchor", "middle").text("Valor acumulado");
    const ln = d3.line().x((d, i, a) => x(d[0])).y(d => y(d[1]));
    SRC.forEach(s => { const z = LZ[s.k]; const pts = z.x.map((v, i) => [v, z.y[i]]); g.append("path").attr("d", ln(pts)).attr("fill", "none").attr("stroke", COL[s.k]).attr("stroke-width", s.k === state.src ? 3 : 1.3).attr("opacity", s.k === state.src ? 1 : .45); });
    const lg = g.append("g").attr("transform", "translate(10,10)");
    SRC.forEach((s, i) => { lg.append("line").attr("x1", 0).attr("x2", 16).attr("y1", i * 17).attr("y2", i * 17).attr("stroke", COL[s.k]).attr("stroke-width", s.k === state.src ? 3 : 1.5); lg.append("text").attr("class", "lbl").attr("x", 22).attr("y", i * 17 + 4).style("font-weight", s.k === state.src ? 650 : 400).text(`${s.short} · Gini ${f2(D[s.k].gini_pc_ponderado_pob)}`); });
    $("lorenz-note").textContent = `Cuanto más se aleja la curva de la diagonal, más concentrados están los recursos. La diferencia entre municipios PDET y no PDET explica solo el ${pct(D[state.src].pct_entre)} de la desigualdad de ${S[state.src].short} (descomposición del índice de Theil); el resto ocurre dentro de cada grupo.`;
  }
  function top5() {
    const src = state.src, tot = d3.sum(IDS, i => MU[i]["valor_" + src]);
    const t = IDS.slice().sort((a, b) => MU[b]["valor_" + src] - MU[a]["valor_" + src]).slice(0, 5);
    $("top5").innerHTML = t.map((id, i) => { const m = MU[id], sh = 100 * m["valor_" + src] / tot; return `<div class="row"><div class="row__top"><span class="row__n">${i + 1}</span><span class="row__name">${m.municipio}<span class="muted">, ${m.departamento}</span>${m.pdet ? `<span class="tag">PDET</span>` : ""}</span><b>${pct(sh)}</b></div><div class="bar"><span style="width:${sh}%;background:${COL[src]}"></span></div></div>`; }).join("") + `<p class="note">Porcentaje del valor municipal de ${S[src].short} que recibe cada municipio. Total: ${money(tot)}.</p>`;
    $("top-src").textContent = "· " + S[src].short;
  }
  function topics() {
    const fu = SRC.filter(s => s.fuente);
    const T = R.topicos.slice().sort((a, b) => b.proyectos - a.proyectos);
    $("topics").innerHTML = T.map(t => {
      const vals = fu.map(s => ({ s, v: t[s.fuente] || 0 })), tot = d3.sum(vals, d => d.v);
      const terms = t.terminos_principales.split(", ").slice(0, 7);
      return `<div class="topic"><p class="terms">${terms.map((w, i) => i < 3 ? `<b>${w}</b>` : w).join(" · ")}</p>
        <div class="stack" title="Distribución del valor por fuente">${vals.map(d => `<span style="width:${tot ? 100 * d.v / tot : 0}%;background:${COL[d.s.k]}" title="${d.s.short}: ${f1(d.v)} mil M"></span>`).join("")}</div>
        <div class="meta"><span>${f0(t.proyectos)} proyectos · ${pct(t.pct_proyectos_en_PDET)} en municipios PDET</span><span>${vals.map(d => `<span style="color:${COL[d.s.k]}">●</span> ${d.s.short} ${f0(tot ? 100 * d.v / tot : 0)} %`).join("  ")}</span></div></div>`;
    }).join("");
  }
  function tables() {
    $("prov-table").querySelector("tbody").innerHTML = R.procedencia.map(p => `<tr><td><code>${p.archivo}</code></td><td>${p.entidad_publicadora || p.fuente || ""}</td><td>${p.dataset_id ? `<a href="https://www.datos.gov.co/d/${p.dataset_id}">${p.dataset_id}</a>` : `<a href="${p.url}">${p.url.split("/").pop()}</a>`}</td><td class="num">${p.filas != null ? f0(p.filas) : "—"}</td><td class="num">${p.descargado_utc.replace("T", " ").replace("+00:00", "")}</td><td><code title="${p.sha256}">${p.sha256.slice(0, 12)}…</code></td></tr>`).join("")
      + (R.procedencia_geo ? `<tr><td><code>municipios.geojson</code></td><td>DANE (MGN 2018)</td><td><a href="${R.procedencia_geo.url}">SHP_MGN2018_INTGRD_MPIO.zip</a></td><td class="num">${f0(R.procedencia_geo.poligonos)}</td><td class="num">${R.procedencia_geo.generado_utc.replace("T", " ").replace("+00:00", "")}</td><td><code title="${R.procedencia_geo.sha256_zip}">${R.procedencia_geo.sha256_zip.slice(0, 12)}…</code></td></tr>` : "");
    $("desc-oficial").innerHTML = `Descripción oficial del dataset de financiación (MinCulturas): “${R.descripcion_oficial_financiacion}”. <strong>Fuentes efectivamente presentes en los datos publicados:</strong> ${SRC.filter(s => s.fuente).map(s => s.fuente).join(", ")}.`;
    $("dec-table").querySelector("tbody").innerHTML = R.decisiones.map(d => `<tr><td><code>${d.regla}</code></td><td>${d.detalle}</td><td class="num">${d.filas_afectadas != null ? f0(d.filas_afectadas) : ""}</td><td class="num">${d.valor_afectado_COP != null ? f1(d.valor_afectado_COP / 1e9) : ""}</td></tr>`).join("");
    const lab = { "1_solo_PDET": "Sin controles", "2_+log_pob": "+ población", "3_+controles": "+ controles", "4_+EF_depto (principal)": "+ EF departamento (principal)", "R1_sin_Ciudades": "Sin ciudades", "R2_victimas_en_vez_PDET": "Víctimas en lugar de PDET" };
    $("ppml-table").querySelector("tbody").innerHTML = R.ppml.map(d => `<tr><td>${S[d.fuente].short}</td><td>${lab[d.modelo] || d.modelo}</td><td class="num">${f0(d.N)}</td><td class="num">${d.efecto_pct > 0 ? "+" : ""}${f1(d.efecto_pct)} %</td><td class="num">${f0(d.IC95_pct_lo)} a ${f0(d.IC95_pct_hi)} %</td><td class="num">${d.p < 0.001 ? "<0,001" : f2(d.p)}</td><td class="num">${d.elasticidad_pob != null ? f2(d.elasticidad_pob) : "—"}</td></tr>`).join("");
    const dep = R.decisiones.find(d => d.regla === "excluir_departamental"), tr = R.decisiones.find(d => d.regla === "excluir_fila_totales");
    const lim = [
      `El dataset oficial describe cinco fuentes (SGR, SGP, LEP, INC, Estampilla Procultura), pero solo publica ${SRC.filter(s => s.fuente).length}. El SGP y la Estampilla Procultura no se pueden analizar.`,
      `No se informa el año de cada proyecto, y "valor" mezcla montos aprobados y ejecutados. Los resultados describen el acumulado publicado a la fecha de corte, no flujos anuales.`,
      dep ? `Se excluyen ${money(dep.valor_afectado_COP)} de proyectos de nivel departamental (${f0(dep.filas_afectadas)} proyectos), que no se pueden asignar a un municipio. Esto puede subestimar la redistribución del SGR.` : null,
      tr && tr.filas_afectadas ? `El dataset contiene una fila de totales incrustada (${money(tr.valor_afectado_COP)}), que se excluye para no contar el INC dos veces.` : null,
      `La población de referencia es la proyección DANE de ${R.anio_poblacion}. Las víctimas son un acumulado histórico por lugar de ocurrencia (RUV).`,
      `El estudio es observacional: describe asociaciones, no efectos causales. El NMF es exploratorio.`,
      `El mapa usa los límites del MGN 2018 del DANE. Nuevo Belén de Bajirá, creado después, no tiene polígono (sí está en los cálculos).`,
    ].filter(Boolean);
    $("limits").innerHTML = lim.map(x => `<li>${x}</li>`).join("");
  }
  function update() {
    document.querySelectorAll("#seg button").forEach(b => b.setAttribute("aria-checked", b.dataset.k === state.src));
    document.querySelectorAll("#map-mode button").forEach(b => b.setAttribute("aria-checked", b.dataset.mode === state.mode));
    document.documentElement.style.setProperty("--accent", COL[state.src]);
    paint(); scatter(); elast(); ratio(); steps(); lorenz(); top5();
    if (state.sel) select(state.sel);
  }
  topics(); tables(); update();
})();
