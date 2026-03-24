// SISE assistant logic - ready to paste
// Includes: fixed definitions, top-2 driver summary, and level classification.

const FACTOR_META = {
  riesgos: {
    label: "Riesgos",
    type: "vulnerability",
    explanation:
      "refleja la vulnerabilidad territorial del municipio frente a amenazas y limitaciones de respuesta.",
  },
  pobreza: {
    label: "Pobreza",
    type: "vulnerability",
    explanation:
      "refleja carencias estructurales asociadas a pobreza y necesidades básicas insatisfechas.",
  },
  san: {
    label: "Índice SAN",
    type: "vulnerability",
    explanation:
      "refleja condiciones relacionadas con la seguridad alimentaria y nutricional.",
  },
  politicas: {
    label: "Políticas",
    type: "institutional",
    explanation:
      "refleja la presencia del municipio en programas, estrategias o instrumentos de priorización pública, no una condición de vulnerabilidad.",
  },
};

function getLevel(score) {
  if (score <= 8) return "Bajo";
  if (score <= 16) return "Medio";
  return "Alto";
}

function getLevelClass(score) {
  if (score <= 8) return "level-bajo";
  if (score <= 16) return "level-medio";
  return "level-alto";
}

function formatValue(value) {
  return Number(value).toFixed(1);
}

function buildTopDriversSummary(sortedFactors) {
  const top = sortedFactors[0];
  const second = sortedFactors[1];
  const tiedAtTop = sortedFactors.filter((f) => f.value === top.value);

  if (tiedAtTop.length >= 2) {
    return "El municipio se prioriza por la combinación de múltiples factores de vulnerabilidad y referencia institucional.";
  }

  if (top.key === "riesgos") {
    if (second && second.value >= 17 && second.key !== "politicas") {
      return "El municipio se prioriza principalmente por la combinación de vulnerabilidad territorial y carencias socioeconómicas o alimentarias.";
    }
    if (second && second.value >= 17 && second.key === "politicas") {
      return "El municipio se prioriza por su mayor vulnerabilidad territorial y una alta coincidencia con referencias institucionales.";
    }
    return "El municipio se prioriza principalmente por su mayor vulnerabilidad territorial y de respuesta.";
  }

  if (top.key === "pobreza") {
    if (second && second.value >= 17 && second.key !== "politicas") {
      return "El municipio se prioriza principalmente por la combinación de carencias socioeconómicas y otras vulnerabilidades relevantes.";
    }
    if (second && second.value >= 17 && second.key === "politicas") {
      return "El municipio se prioriza por sus carencias socioeconómicas y una alta coincidencia con referencias institucionales.";
    }
    return "El municipio se prioriza principalmente por sus mayores carencias socioeconómicas estructurales.";
  }

  if (top.key === "san") {
    if (second && second.value >= 17 && second.key !== "politicas") {
      return "El municipio se prioriza principalmente por la combinación de vulnerabilidad alimentaria y otras vulnerabilidades relevantes.";
    }
    if (second && second.value >= 17 && second.key === "politicas") {
      return "El municipio se prioriza por su vulnerabilidad en seguridad alimentaria y una alta coincidencia con referencias institucionales.";
    }
    return "El municipio se prioriza principalmente por su mayor vulnerabilidad en seguridad alimentaria y nutricional.";
  }

  // top = politicas
  if (second && second.key !== "politicas") {
    return "El municipio se prioriza por la combinación de vulnerabilidades y una alta coincidencia con referencias institucionales.";
  }

  return "El municipio se prioriza por la combinación de factores de vulnerabilidad y referencia institucional.";
}

function buildMunicipalityExplanation(data) {
  const factors = [
    { key: "riesgos", value: Number(data.riesgos) || 0 },
    { key: "pobreza", value: Number(data.pobreza) || 0 },
    { key: "san", value: Number(data.san) || 0 },
    { key: "politicas", value: Number(data.politicas) || 0 },
  ];

  const sortedFactors = [...factors].sort((a, b) => b.value - a.value);
  const summary = buildTopDriversSummary(sortedFactors);

  const factorLines = factors.map((factor) => {
    const meta = FACTOR_META[factor.key];
    const level = getLevel(factor.value);
    const levelClass = getLevelClass(factor.value);

    return `
      <div class="assistant-factor-line">
        <strong>${meta.label}</strong>
        <span class="factor-level ${levelClass}">(${level}, ${formatValue(factor.value)})</span>:
        <span>${meta.explanation}</span>
      </div>
    `;
  });

  return `
    <div class="assistant-response">
      <p><strong>${data.municipio}</strong> ocupa la posición <strong>${data.ranking}</strong> con una ponderación de <strong>${formatValue(data.ponderacion)}</strong>. ${summary}</p>
      ${factorLines.join("")}
      <p>La posición final resulta de la suma de estos cuatro componentes.</p>
    </div>
  `;
}

// Optional helper for factor-only questions
function explainFactor(factorName) {
  const normalized = factorName.toLowerCase().trim();
  const map = {
    riesgos: FACTOR_META.riesgos,
    pobreza: FACTOR_META.pobreza,
    "índice san": FACTOR_META.san,
    "indice san": FACTOR_META.san,
    san: FACTOR_META.san,
    politicas: FACTOR_META.politicas,
    políticas: FACTOR_META.politicas,
  };

  const factor = map[normalized];
  if (!factor) return "No se encontró el factor solicitado.";
  return `${factor.label} ${factor.explanation}`;
}
