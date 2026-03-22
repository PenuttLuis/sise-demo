const state = {
  map: null,
  geoLayer: null,
  featureIndex: new Map(),
  selectedCode: null,
  socioIndex: new Map(),
  socioNational: null
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

  const rows = top50Geo.features.map(f => f.properties).sort((a, b) => a.ranking - b.ranking);
  buildTable(rows);
  initMap(top50Geo);
  updateSocioPanelByCode(null);
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

function colorByRank(rank){
  if (rank <= 10) return '#16324a';
  if (rank <= 20) return '#1f5f94';
  if (rank <= 35) return '#4a88b9';
  return '#7aaece';
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

loadData().catch(err => {
  console.error(err);
  document.getElementById('infoPanel').innerHTML = '<p>No se pudieron cargar los datos del demo.</p>';
});