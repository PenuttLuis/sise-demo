const state = {
  map: null,
  geoLayer: null,
  featureIndex: new Map(),
  selectedCode: null,
  socioIndex: new Map(),
  socioNational: null,
  initialView: null,
  top50Rows: [],
  summary: null
};

const fmt = (n) => Number(n).toFixed(1);

function normalizeCode(value) {
  return String(value ?? '').trim().padStart(4, '0');
}

function parseNumber(value) {
  if (value === null || value === undefined) return null;
  const cleaned = String(value).replace(/,/g, '').trim();
  const num = Number(cleaned);
  return Number.isFinite(num) ? num : null;
}

function formatInteger(value) {
  const num = parseNumber(value);
  if (num === null) return '—';
  return new Intl.NumberFormat('es-GT').format(Math.round(num));
}

function formatPercent(value) {
  const num = parseNumber(value);
  if (num === null) return '—';
  return `${num.toFixed(1)}%`;
}

function csvToObjects(text) {
  const lines = text.trim().split(/\r?\n/);
  if (!lines.length) return [];

  const headers = lines[0].split(',').map(h => h.trim());

  return lines.slice(1).map(line => {
    const values = line.split(',').map(v => v.trim());
    return headers.reduce((acc, header, i) => {
      acc[header] = values[i] ?? '';
      return acc;
    }, {});
  });
}

function buildSocioData(rows) {
  const validRows = rows
    .map(row => ({
      codigo: normalizeCode(row.codigo_municipio),
      departamento: row.departamento,
      municipio: row.municipio,
      poblacion: parseNumber(row.poblacion),
      pct_hogar_rural: parseNumber(row.pct_hogar_rural),
      pct_hogar_indigena: parseNumber(row.pct_hogar_indigena),
      nbi: parseNumber(row.NBI)
    }))
    .filter(row => row.codigo && row.municipio);

  validRows.forEach(row => {
    state.socioIndex.set(row.codigo, row);
  });

  const totalPoblacion = validRows.reduce((sum, row) => sum + (row.poblacion ?? 0), 0);

  const weightedRural = totalPoblacion
    ? validRows.reduce((sum, row) => sum + ((row.poblacion ?? 0) * (row.pct_hogar_rural ?? 0)), 0) / totalPoblacion
    : null;

  const weightedIndigena = totalPoblacion
    ? validRows.reduce((sum, row) => sum + ((row.poblacion ?? 0) * (row.pct_hogar_indigena ?? 0)), 0) / totalPoblacion
    : null;

  const weightedNbi = totalPoblacion
    ? validRows.reduce((sum, row) => sum + ((row.poblacion ?? 0) * (row.nbi ?? 0)), 0) / totalPoblacion
    : null;

  state.socioNational = {
    label: 'Guatemala',
    scope: 'Referencia nacional',
    poblacion: totalPoblacion,
    pct_hogar_rural: weightedRural,
    pct_hogar_indigena: weightedIndigena,
    nbi: weightedNbi
  };
}

function updateSocioPanelByCode(code) {
  const titleEl = document.getElementById('perfilTitle');
  const scopeEl = document.getElementById('perfilScope');
  const poblacionEl = document.getElementById('perfilPoblacion');
  const ruralEl = document.getElementById('perfilRural');
  const indigenaEl = document.getElementById('perfilIndigena');
  const nbiEl = document.getElementById('perfilNbi');

  const normalizedCode = normalizeCode(code);
  const socio = state.socioIndex.get(normalizedCode);

  const data = socio
    ? {
        label: `${socio.municipio}, ${socio.departamento}`,
        scope: 'Municipio seleccionado',
        poblacion: socio.poblacion,
        pct_hogar_rural: socio.pct_hogar_rural,
        pct_hogar_indigena: socio.pct_hogar_indigena,
        nbi: socio.nbi
      }
    : state.socioNational;

  titleEl.textContent = data?.label ?? 'Guatemala';
  scopeEl.textContent = data?.scope ?? 'Referencia nacional';
  poblacionEl.textContent = formatInteger(data?.poblacion);
  ruralEl.textContent = formatPercent(data?.pct_hogar_rural);
  indigenaEl.textContent = formatPercent(data?.pct_hogar_indigena);
  nbiEl.textContent = formatPercent(data?.nbi);
}

function buildTable(rows) {
  const top50Body = document.getElementById('top50Body');
  top50Body.innerHTML = rows.map((row) => `
    <tr data-code="${row.codigo_municipio_shape}">
      <td class="muni-col">${row.municipio}</td>
      <td class="dept-col">${row.departamento}</td>
      <td class="num-col"><span class="rank-pill" style="background:${colorByRank(row.ranking)}">#${row.ranking}</span></td>
      <td class="num-col"><span class="ponderacion-pill">${Math.round(row.ponderacion)}</span></td>
      <td class="divider-cell"></td>
      <td class="num-col">${fmt(row.riesgos)}</td>
      <td class="num-col">${fmt(row.pobreza)}</td>
      <td class="num-col">${fmt(row.indice_san)}</td>
      <td class="num-col">${fmt(row.politicas)}</td>
    </tr>`).join('');

  document.querySelectorAll('#top50Body tr').forEach((tr) => {
    tr.addEventListener('click', () => focusMunicipio(tr.dataset.code));
  });

  const wrap = document.querySelector('.table-wrap');
  if (wrap) wrap.scrollTop = 0;
}

function colorByRank(rank) {
  if (rank <= 10) return '#16324a';
  if (rank <= 20) return '#1f5f94';
  if (rank <= 35) return '#4a88b9';
  return '#7aaece';
}

function getSelectedMunicipio() {
  if (!state.selectedCode) return null;
  const layer = state.featureIndex.get(state.selectedCode);
  return layer ? layer.feature.properties : null;
}

function updateAIContext() {
  const contextEl = document.getElementById('aiContext');
  const p = getSelectedMunicipio();

  if (!contextEl) return;

  contextEl.textContent = p
    ? `Municipio activo: ${p.municipio}, ${p.departamento}`
    : 'Municipio activo: ninguno seleccionado';
}

function renderAIAnswer(questionLabel, text, evidence = []) {
  const answerEl = document.getElementById('aiAnswer');
  if (!answerEl) return;

  answerEl.innerHTML = `
    <p class="ai-answer__label">Consulta</p>
    <p class="ai-answer__text"><strong>${questionLabel}</strong>\n${text}</p>
    <div class="ai-answer__evidence">
      <strong>Basado en:</strong> ${evidence.join(' | ')}
    </div>
    <div class="ai-answer__actions">
      <button class="ai-link" id="aiCopyBtn">Copiar resumen</button>
    </div>
  `;

  const copyBtn = document.getElementById('aiCopyBtn');
  if (copyBtn) {
    copyBtn.addEventListener('click', async () => {
      try {
        await navigator.clipboard.writeText(text);
      } catch (err) {
        console.error(err);
      }
    });
  }
}

function setAIStatus(message = '') {
  const statusEl = document.getElementById('aiStatus');
  if (statusEl) statusEl.textContent = message;
}

function explainMunicipio(p) {
  function getLevel(score) {
    const n = Number(score) || 0;
    if (n <= 8) return 'Bajo';
    if (n <= 16) return 'Medio';
    return 'Alto';
  }

  const riesgos = Number(p.riesgos) || 0;
  const pobreza = Number(p.pobreza) || 0;
  const san = Number(p.indice_san) || 0;
  const politicas = Number(p.politicas) || 0;

  const factors = [
    { key: 'Riesgos', value: riesgos },
    { key: 'Pobreza', value: pobreza },
    { key: 'Índice SAN', value: san },
    { key: 'Políticas', value: politicas }
  ].sort((a, b) => b.value - a.value);

  let summary = 'El municipio se prioriza por la combinación de múltiples factores de vulnerabilidad y referencia institucional.';

  if (factors[0].value > factors[1].value) {
    if (factors[0].key === 'Riesgos') {
      summary = 'El municipio se prioriza principalmente por su mayor vulnerabilidad territorial y de respuesta.';
    } else if (factors[0].key === 'Pobreza') {
      summary = 'El municipio se prioriza principalmente por sus mayores carencias socioeconómicas estructurales.';
    } else if (factors[0].key === 'Índice SAN') {
      summary = 'El municipio se prioriza principalmente por su mayor vulnerabilidad en seguridad alimentaria y nutricional.';
    } else if (factors[0].key === 'Políticas') {
      summary = 'El municipio se prioriza por la combinación de vulnerabilidades y una alta coincidencia con referencias institucionales.';
    }
  }

  return `${p.municipio} ocupa la posición ${p.ranking} con una ponderación de ${fmt(p.ponderacion)}. ${summary}
Riesgos (${getLevel(riesgos)}, ${fmt(riesgos)}): refleja la vulnerabilidad territorial del municipio frente a amenazas y limitaciones de respuesta.
Pobreza (${getLevel(pobreza)}, ${fmt(pobreza)}): refleja carencias estructurales asociadas a pobreza y necesidades básicas insatisfechas.
Índice SAN (${getLevel(san)}, ${fmt(san)}): refleja condiciones relacionadas con la seguridad alimentaria y nutricional.
Políticas (${getLevel(politicas)}, ${fmt(politicas)}): refleja la presencia del municipio en programas, estrategias o instrumentos de priorización pública, no una condición de vulnerabilidad.
La posición final resulta de la suma de estos cuatro componentes.`;
}

function compareWithDepartment(p) {
  const municipio = Math.round(Number(p.ponderacion) || 0);
  const depto = Math.round(Number(p.ponderacion_prom_depto) || 0);
  const diff = municipio - depto;

  let conclusion = 'se encuentra en línea con el promedio departamental';
  if (diff > 5) conclusion = 'se sitúa claramente por encima del promedio departamental';
  if (diff < -5) conclusion = 'se ubica por debajo del promedio departamental';

  return `En términos de ponderación, ${p.municipio} ${conclusion}.
El municipio registra ${municipio}, frente a ${depto} del promedio de ${p.departamento}.
Esto indica que su nivel de prioridad es ${diff > 0 ? 'más alto' : diff < 0 ? 'más bajo' : 'similar'} que el comportamiento medio observado en el departamento.`;
}

function summarizeMunicipio(p) {
  const drivers = [
    { key: 'Riesgos', value: Number(p.riesgos) || 0 },
    { key: 'Pobreza', value: Number(p.pobreza) || 0 },
    { key: 'Índice SAN', value: Number(p.indice_san) || 0 },
    { key: 'Políticas', value: Number(p.politicas) || 0 }
  ].sort((a, b) => b.value - a.value);

  return `${p.municipio} ocupa el ranking #${p.ranking} dentro de los municipios priorizados del observatorio.
Su perfil está impulsado principalmente por ${drivers[0].key.toLowerCase()} y ${drivers[1].key.toLowerCase()}, con una ponderación total de ${Math.round(p.ponderacion)}.
Esto sugiere una situación territorial que requiere seguimiento dentro de los procesos de priorización institucional.`;
}

function analyzeTop10Patterns() {
  const top10 = [...state.top50Rows]
    .sort((a, b) => (Number(a.ranking) || 999) - (Number(b.ranking) || 999))
    .slice(0, 10);

  if (!top10.length) {
    return 'No hay información suficiente para analizar el top 10.';
  }

  const avg = (key) =>
    top10.reduce((sum, row) => sum + (Number(row[key]) || 0), 0) / top10.length;

  const components = [
    { label: 'Riesgos', value: avg('riesgos') },
    { label: 'Pobreza', value: avg('pobreza') },
    { label: 'Índice SAN', value: avg('indice_san') },
    { label: 'Políticas', value: avg('politicas') }
  ].sort((a, b) => b.value - a.value);

  const departmentCount = top10.reduce((acc, row) => {
    acc[row.departamento] = (acc[row.departamento] || 0) + 1;
    return acc;
  }, {});

  const topDepartments = Object.entries(departmentCount)
    .sort((a, b) => b[1] - a[1])
    .slice(0, 2)
    .map(([name, count]) => `${name} (${count})`)
    .join(', ');

  const names = top10.slice(0, 5).map(row => row.municipio).join(', ');

  return `En el top 10 se observa una combinación de ${components[0].label.toLowerCase()} y ${components[1].label.toLowerCase()} como componentes más altos en promedio.
Los municipios mejor posicionados incluyen ${names}.
También se aprecia una concentración relativa en ${topDepartments}.`;
}

function highPovertyHighRisk() {
  const rows = [...state.top50Rows]
    .filter(row => (Number(row.pobreza) || 0) >= 15 && (Number(row.riesgos) || 0) >= 10)
    .sort((a, b) => ((Number(b.pobreza) || 0) + (Number(b.riesgos) || 0)) - ((Number(a.pobreza) || 0) + (Number(a.riesgos) || 0)))
    .slice(0, 5);

  if (!rows.length) {
    const fallback = [...state.top50Rows]
      .sort((a, b) => ((Number(b.pobreza) || 0) + (Number(b.riesgos) || 0)) - ((Number(a.pobreza) || 0) + (Number(a.riesgos) || 0)))
      .slice(0, 5);

    return `Bajo el criterio actual no se identificaron casos extremos simultáneos. Sin embargo, los municipios con mayor combinación relativa de pobreza y riesgos son: ${fallback.map(row => `${row.municipio} (${row.departamento})`).join(', ')}.`;
  }

  return `Los municipios que muestran una combinación alta de pobreza y riesgos son: ${rows.map(row => `${row.municipio} (${row.departamento})`).join(', ')}.
Este grupo refleja coincidencia de carencias socioeconómicas y vulnerabilidad territorial.`;
}

function clearAIAnswer() {
  const answerEl = document.getElementById('aiAnswer');
  const titleEl = document.getElementById('aiTitle');
  const metaEl = document.getElementById('aiMeta');
  const statusEl = document.getElementById('aiStatus');

  if (titleEl) titleEl.textContent = 'Consulta';
  if (answerEl) answerEl.innerHTML = 'Seleccione una consulta para generar un análisis.';
  if (metaEl) metaEl.textContent = 'Basado en: —';
  if (statusEl) statusEl.textContent = 'Municipio activo listo para consulta.';
}

function runAIQuery(type) {
  setAIStatus('Analizando indicadores...');

  const p = getSelectedMunicipio();

  setTimeout(() => {
    if (type === 'why') {
      if (!p) {
        renderAIAnswer(
          '¿Por qué está priorizado?',
          'Primero seleccione un municipio en el mapa o en la tabla para generar una explicación específica.',
          ['Riesgos', 'Pobreza', 'Índice SAN', 'Políticas']
        );
      } else {
        renderAIAnswer(
          `¿Por qué ${p.municipio} está priorizado?`,
          explainMunicipio(p),
          ['Riesgos', 'Pobreza', 'Índice SAN', 'Políticas', 'Ponderación']
        );
      }
    }

    if (type === 'dept') {
      if (!p) {
        renderAIAnswer(
          'Comparar con promedio departamental',
          'Primero seleccione un municipio en el mapa o en la tabla para realizar la comparación.',
          ['Ponderación', 'Promedio departamental']
        );
      } else {
        renderAIAnswer(
          `Comparación de ${p.municipio} con el promedio departamental`,
          compareWithDepartment(p),
          ['Ponderación', 'Promedio departamental', 'Departamento']
        );
      }
    }

    if (type === 'summary') {
      if (!p) {
        renderAIAnswer(
          'Resumen en 3 líneas',
          'Primero seleccione un municipio en el mapa o en la tabla para generar el resumen.',
          ['Riesgos', 'Pobreza', 'Índice SAN', 'Políticas', 'Ponderación']
        );
      } else {
        renderAIAnswer(
          `Resumen de ${p.municipio} en 3 líneas`,
          summarizeMunicipio(p),
          ['Riesgos', 'Pobreza', 'Índice SAN', 'Políticas', 'Ponderación']
        );
      }
    }

    if (type === 'top10') {
      renderAIAnswer(
        'Patrones del top 10',
        analyzeTop10Patterns(),
        ['Ranking', 'Riesgos', 'Pobreza', 'Índice SAN', 'Políticas']
      );
    }

    if (type === 'povertyrisk') {
      renderAIAnswer(
        'Municipios con alta pobreza y alto riesgo',
        highPovertyHighRisk(),
        ['Pobreza', 'Riesgos']
      );
    }

    setAIStatus('');
  }, 250);
}

function interpretFreeTextQuery(text) {
  const q = text.toLowerCase();

  if (q.includes('por qué') || q.includes('priorizado')) return 'why';
  if (q.includes('departamental') || q.includes('departamento')) return 'dept';
  if (q.includes('resumen') || q.includes('3 líneas') || q.includes('tres líneas')) return 'summary';
  if (q.includes('top 10') || q.includes('patrones')) return 'top10';
  if ((q.includes('pobreza') && q.includes('riesgo')) || (q.includes('alto riesgo') && q.includes('alta pobreza'))) return 'povertyrisk';

  return null;
}

function initAssistant() {
  updateAIContext();

  document.querySelectorAll('.ai-chip').forEach((chip) => {
    chip.addEventListener('click', () => {
      runAIQuery(chip.dataset.query);
    });
  });

  const askBtn = document.getElementById('aiAskBtn');
  const input = document.getElementById('aiInput');

  if (askBtn && input) {
    askBtn.addEventListener('click', () => {
      const queryType = interpretFreeTextQuery(input.value.trim());

      if (!queryType) {
        renderAIAnswer(
          'Consulta fuera de alcance',
          'Esta versión del asistente responde consultas sobre priorización municipal, comparaciones territoriales, resúmenes breves y patrones del top 10.',
          ['Indicadores SISE']
        );
        return;
      }

      runAIQuery(queryType);
    });

    input.addEventListener('keydown', (event) => {
      if (event.key === 'Enter') {
        askBtn.click();
      }
    });
  }
}

function initMap(geojson) {
  state.map = L.map('map', { zoomControl: true, scrollWheelZoom: true });

  L.tileLayer('https://{s}.tile.openstreetmap.org/{z}/{x}/{y}.png', {
    attribution: '&copy; OpenStreetMap contributors'
  }).addTo(state.map);

  state.geoLayer = L.geoJSON(geojson, {
    style: feature => ({
      color: '#ffffff',
      weight: 1.2,
      fillColor: colorByRank(feature.properties.ranking),
      fillOpacity: 0.85
    }),
    onEachFeature: (feature, layer) => {
      const p = feature.properties;
      const code = normalizeCode(p.codigo_municipio_shape);

      state.featureIndex.set(code, layer);
      layer.on('click', () => focusMunicipio(code));
      layer.bindTooltip(
        `<strong>#${p.ranking} ${p.municipio}</strong><br>${p.departamento}<br>Ponderación: ${Math.round(p.ponderacion)}`
      );
    }
  }).addTo(state.map);

  state.map.fitBounds(state.geoLayer.getBounds(), { padding: [5, 5], maxZoom: 8 });

  state.initialView = {
    center: state.map.getCenter(),
    zoom: state.map.getZoom()
  };
}

function focusMunicipio(code) {
  const normalizedCode = normalizeCode(code);
  const layer = state.featureIndex.get(normalizedCode);
  if (!layer) return;

  state.selectedCode = normalizedCode;

  state.featureIndex.forEach((itemLayer) => {
    const p = itemLayer.feature.properties;
    itemLayer.setStyle({
      color: '#ffffff',
      weight: 1.2,
      fillColor: colorByRank(p.ranking),
      fillOpacity: 0.85
    });
  });

  const p = layer.feature.properties;
  layer.setStyle({
    color: '#2f5d7e',
    weight: 2.5,
    fillColor: '#a8cbe3',
    fillOpacity: 1
  });

  state.map.fitBounds(layer.getBounds(), { padding: [28, 28], maxZoom: 10 });
  updatePanel(p);
  updateSocioPanelByCode(normalizedCode);
  layer.openTooltip();

  document.querySelectorAll('#top50Body tr').forEach((tr) => {
    tr.classList.toggle('is-active', normalizeCode(tr.dataset.code) === normalizedCode);
  });

  updateAIContext();
  clearAIAnswer();
}

function updatePanel(p) {
  const el = document.getElementById('infoPanel');
  el.innerHTML = `
    <p class="eyebrow">Ficha municipal</p>
    <div class="ficha-header">
      <div class="rank-badge" style="background:${colorByRank(p.ranking)}">#${p.ranking}</div>
      <div>
        <h3>${p.municipio}</h3>
        <p class="section-text"><strong>${p.departamento}</strong> · Código ${normalizeCode(p.codigo_municipio_shape)}</p>
      </div>
    </div>
    <div class="ficha-values">
      <div><span>Riesgos</span><strong>${fmt(p.riesgos)}</strong></div>
      <div><span>Pobreza</span><strong>${fmt(p.pobreza)}</strong></div>
      <div><span>Índice SAN</span><strong>${fmt(p.indice_san)}</strong></div>
      <div><span>Políticas</span><strong>${fmt(p.politicas)}</strong></div>
      <div class="total-row"><span>Ponderación</span><strong>${Math.round(p.ponderacion)}</strong></div>
    </div>
    <div class="compare-box">
      <p class="compare-title">Comparación de ponderación</p>
      <div class="compare-row"><span>Promedio departamental</span><strong>${Math.round(p.ponderacion_prom_depto)}</strong></div>
      <div class="compare-row"><span>Promedio nacional</span><strong>${Math.round(p.ponderacion_prom_nacional)}</strong></div>
    </div>`;
}

function resetMunicipioView() {
  state.selectedCode = null;

  if (state.geoLayer) {
    state.geoLayer.eachLayer((layer) => {
      const p = layer.feature.properties;
      layer.setStyle({
        color: '#ffffff',
        weight: 1.2,
        fillColor: colorByRank(p.ranking),
        fillOpacity: 0.85
      });
      layer.closeTooltip();
    });
  }

  if (state.map && state.initialView) {
    state.map.setView(state.initialView.center, state.initialView.zoom);
  }

  document.querySelectorAll('#top50Body tr').forEach((tr) => {
    tr.classList.remove('is-active');
  });

  const el = document.getElementById('infoPanel');
  el.innerHTML = `
    <p class="eyebrow">Ficha municipal</p>
    <h3>Seleccione un municipio</h3>
    <p class="section-text">Use el mapa o la tabla para explorar resultados.</p>
    <div class="ficha-values empty-state">
      <div><span>Riesgos</span><strong>—</strong></div>
      <div><span>Pobreza</span><strong>—</strong></div>
      <div><span>Índice SAN</span><strong>—</strong></div>
      <div><span>Políticas</span><strong>—</strong></div>
      <div><span>Ponderación</span><strong>—</strong></div>
    </div>
    <div class="compare-box empty-state">
      <p class="compare-title">Comparación de ponderación</p>
      <div class="compare-row"><span>Departamento</span><strong>—</strong></div>
      <div class="compare-row"><span>Nacional</span><strong>—</strong></div>
    </div>
  `;

 updateSocioPanelByCode(null);
state.selectedMunicipio = null;

clearAIAnswer();
updateAIContext();
}

async function loadData() {
  const [top50Res, summaryRes, socioRes] = await Promise.all([
    fetch('assets/munis_top50.geojson'),
    fetch('assets/summary.json'),
    fetch('assets/Perfil_sociodemografico.csv')
  ]);

  const top50Geo = await top50Res.json();
  const summary = await summaryRes.json();
  const socioText = await socioRes.text();

  buildSocioData(csvToObjects(socioText));

  document.getElementById('totalMuni').textContent = 340;
  document.getElementById('totalDept').textContent = Object.keys(summary.departments_in_top50).length;

  const rows = top50Geo.features
    .map(f => f.properties)
    .sort((a, b) => a.ranking - b.ranking);
    state.top50Rows = rows;

  buildTable(rows);
  initMap(top50Geo);
  updateSocioPanelByCode(null);
  initAssistant();

  const resetBtn = document.getElementById('resetMapBtn');
  if (resetBtn) {
    resetBtn.addEventListener('click', resetMunicipioView);
  }
}

loadData().catch(err => {
  console.error(err);
  document.getElementById('infoPanel').innerHTML = '<p>No se pudieron cargar los datos del demo.</p>';
});