// rates.js
// Eversource CT rate case calculator engine, Rate 1 residential
//
// SOURCE OF TRUTH (all constants below):
//   PURA Docket No. 26-05-10, Application of The Connecticut Light and Power
//   Company d/b/a Eversource Energy to Amend its Rate Schedules, filed July 14, 2026.
//   Exhibit CLP-RATES-2, sub-exhibit CLP-RATES-2.5, "Typical Bills by Rate
//   Schedule — Standard Service" (Schedule E-2.3), Page 1 of 23
//   (Exhibit CLP-RATES-2 pagination: page 121 of 209).
//
// VERIFICATION CLAIM: this calculator applies Eversource's proposed Rate 1
// fixed and per-kWh changes and reproduces the company's filed typical-bill
// examples to the penny. It does not replicate every billing rule, rounding
// convention, or eligibility condition in the tariff.
//
// SCOPE: the delivery-rate increase modeled here applies to Rate 1 customers
// regardless of supplier (standard service or third party), because this
// docket changes delivery charges only and supply is held constant.
//
// SCENARIO: the as-filed request, as a single scenario. The filed table's
// bill impact at the 700 kWh benchmark is +18.05%.
//
// LAST UPDATED: July 18, 2026. As-filed request only. PURA has approved
// nothing. Proposed rates would take effect July 1, 2027 at the earliest.
//
// LOADING: this file is a classic script, not an ES module, on purpose.
// index.html and embed.html load it with a plain <script src> tag so the
// pages work when opened directly from disk (file:// blocks module imports
// in Chromium). Everything public lives on globalThis.EversourceRates,
// declared at the bottom. tests.mjs and build.mjs import this file for its
// side effect and read the same namespace. Do not convert back to exports
// without re-testing a double-clicked index.html.

const META = {
  docket: "26-05-10",
  filedDate: "2026-07-14",
  source: "Exhibit CLP-RATES-2.5, Schedule E-2.3, p.1 of 23 (Rate 1)",
  // Direct link to the filed exhibit PDF on the PURA e-docket; null until
  // added. The docket reference is sufficient for verification meanwhile.
  sourceUrl: null,
  sourceDocumentFiledDate: "2026-07-14",
  methodologyVersion: "1.1.0",
  scenario: "As filed, single scenario. See scenario note above.",
  effectiveNoEarlierThan: "2027-07-01",
  lastUpdated: "2026-07-18",
};

// Deployment lock. Production builds call assertPublishable() and fail
// while publishable is false.
const RELEASE = {
  publishable: false,
  blocker:
    "Confirm storm-cost treatment of the proposed rates in Exhibit CLP-RATES-1 " +
    "(rate design testimony) before launch, and set the scenario label accordingly.",
};

function assertPublishable() {
  if (!RELEASE.publishable) {
    throw new Error("RELEASE BLOCKED: " + RELEASE.blocker);
  }
}

// Context only, never used in calculation. Standard service supply resets
// every Jan 1 and Jul 1; this block expires and must be refreshed or removed.
// Source: OCC July 2026 consumer advisory (portal.ct.gov/occ).
const standardServiceContext = {
  centsPerKwh: 11.58,
  validFrom: "2026-07-01",
  validThrough: "2026-12-31",
  usedInCalculation: false,
};

// Shown verbatim in the "See the math" section. Dividing the displayed
// rounded dollars can differ from the filed percent by a cent (the filed
// 600 kWh row shows 18.15% unrounded, 18.14% from rounded dollars), so the
// note states which calculation the percentages use:
const PERCENT_NOTE =
  "Percentages are calculated using the unrounded rate calculation. " +
  "Displayed dollar amounts are rounded to the nearest cent.";

// -------------------------------------------------------------------------
// Rate 1 component rates, current vs. proposed, as filed.
// Per Schedule E-2.3, Rate 1 (Exhibit CLP-RATES-2, p.121 of 209).
// The proposed design folds the ESI and RDM riders (which go to zero) into
// the base distribution charge. That consolidation is why the distribution
// line alone appears to jump 109% while the net delivery increase is
// $0.0431/kWh.
// -------------------------------------------------------------------------
const RATE_1 = {
  customerCharge: { current: 9.62, proposed: 12.36 }, // $/month
  perKwh: {
    distribution:   { current: 0.05844,  proposed: 0.12196 },
    esi:            { current: 0.02031,  proposed: 0.0 },      // folded into distribution
    rdm:            { current: 0.00011,  proposed: 0.0 },      // folded into distribution
    transmission:   { current: 0.0505,   proposed: 0.0505 },   // unchanged in this docket
    sbc:            { current: -0.00196, proposed: -0.00196 },
    cta:            { current: 0.00496,  proposed: 0.00496 },
    gscEac:         { current: 0.12791,  proposed: 0.12791 },  // supply as assumed in E-2.3
    cam:            { current: 0.006,    proposed: 0.006 },
    renewable:      { current: 0.001,    proposed: 0.001 },
    fmccDelivery:   { current: -0.01911, proposed: -0.01911 },
    fmccGeneration: { current: -0.0015,  proposed: -0.0015 },
  },
};

// Net deltas, derived from the stack above; tests.js verifies them against
// every row of the filed table.
const DELTAS = {
  fixedPerMonth: 2.74, // $12.36 - $9.62
  perKwh: 0.0431,      // net delivery increase per kWh (distribution + ESI + RDM consolidation)
};

// -------------------------------------------------------------------------
// The filed typical bill table (Schedule E-2.3, Rate 1), verbatim.
// Kept for display, the benchmark path, and tests. Total monthly bill
// includes supply at the filing's assumed rate.
// -------------------------------------------------------------------------
const TYPICAL_BILLS_RATE_1 = [
  // [kWh, current $, proposed $, difference $, percent]
  [100, 34.29, 41.34, 7.05, 20.56],
  [200, 58.95, 70.31, 11.36, 19.27],
  [300, 83.62, 99.29, 15.67, 18.74],
  [400, 108.28, 128.26, 19.98, 18.45],
  [500, 132.95, 157.24, 24.29, 18.27],
  [600, 157.62, 186.22, 28.6, 18.15],
  [700, 182.28, 215.19, 32.91, 18.05], // company's own benchmark customer
  [800, 206.95, 244.17, 37.22, 17.99],
  [900, 231.61, 273.14, 41.53, 17.93],
  [1000, 256.28, 302.12, 45.84, 17.89],
  [1200, 305.61, 360.07, 54.46, 17.82],
  [1500, 379.61, 447.0, 67.39, 17.75],
  [1800, 453.61, 533.93, 80.32, 17.71],
  [2000, 502.94, 591.88, 88.94, 17.68],
  [2500, 626.27, 736.76, 110.49, 17.64],
  [3000, 749.6, 881.64, 132.04, 17.61],
];

// Example usage levels for people who cannot find their kWh. These are
// examples, not household classifications.
const USAGE_BANDS = [
  { id: "small",     label: "Lower usage example, 400 kWh per month", monthlyKwh: 400 },
  { id: "benchmark", label: "Eversource's filed benchmark, 700 kWh per month", monthlyKwh: 700 },
  { id: "high",      label: "Higher usage example, 1,200 kWh per month", monthlyKwh: 1200 },
];

// -------------------------------------------------------------------------
// Engine
// -------------------------------------------------------------------------

function assertUsable(n, name) {
  if (typeof n !== "number" || !Number.isFinite(n) || n < 0) {
    throw new RangeError(`${name} must be a non-negative finite number`);
  }
}

// PRIMARY MODE: 12-month usage. Ask for annual kWh or a true 12-month
// average, both available in the Eversource account usage history. This is
// the only path that yields a sound annual figure; a single month
// annualized inherits that month's seasonality.
function increaseFromAnnualKwh(annualKwh) {
  assertUsable(annualKwh, "annualKwh");
  const annual = DELTAS.fixedPerMonth * 12 + annualKwh * DELTAS.perKwh;
  return { annual, averageMonthly: annual / 12 };
}

// SECONDARY MODE: a single month's kWh. The monthly delivery-rate impact for
// that usage level is exact under the filed design; the annualized figure is
// an estimate that assumes the entered month is typical. Label it that way.
function increaseFromMonthlyKwh(monthlyKwh) {
  assertUsable(monthlyKwh, "monthlyKwh");
  const monthly = DELTAS.fixedPerMonth + monthlyKwh * DELTAS.perKwh;
  return {
    monthly,
    annualIfTypical: monthly * 12,
    isSingleMonthEstimate: true,
  };
}

// BENCHMARK PATH: no inputs, no assumptions beyond the company's own filing.
function benchmark() {
  const row = TYPICAL_BILLS_RATE_1.find(([kwh]) => kwh === 700);
  return {
    monthlyKwh: 700,
    monthlyIncrease: row[3],   // 32.91, as filed
    annualIncrease: row[3] * 12, // 394.92
    percentOfFiledBenchmarkBill: row[4], // 18.05
  };
}

// SOLAR GATE: calculate() requires the solar answer before it returns
// anything. Solar homes get the unsupported fallback, with the filed
// benchmark included for context only.

// -------------------------------------------------------------------------
// Official rounding. The UI must never round on its own; use these.
// -------------------------------------------------------------------------
function toCents(dollars) {
  return Math.round((dollars + Number.EPSILON) * 100);
}
function roundMoney(dollars) {
  return toCents(dollars) / 100;
}

// -------------------------------------------------------------------------
// Single public entry point. The UI calls this and nothing else, so the
// solar gate and rate-schedule scope are enforced in code, not in comments.
// -------------------------------------------------------------------------
function calculate({ rateSchedule = "rate1", hasSolar, annualKwh = null, averageMonthlyKwh = null, monthlyKwh = null, usageBandId = null } = {}) {
  if (typeof hasSolar !== "boolean") {
    throw new TypeError("hasSolar must be answered (true or false) before calculating");
  }
  // Exactly one usage input mode. Silent precedence between conflicting
  // inputs would produce a wrong answer without an error, so it is a
  // contract violation instead.
  const inputsProvided = [annualKwh, averageMonthlyKwh, monthlyKwh, usageBandId]
    .filter((value) => value != null).length;
  if (inputsProvided > 1) {
    throw new TypeError(
      "Provide exactly one usage input mode: annualKwh, averageMonthlyKwh, monthlyKwh, or usageBandId."
    );
  }
  const unsupported = (reason) => ({
    supported: false,
    reason,
    fallback: { ...benchmark(), note: "Eversource's own filed 700 kWh benchmark, shown for context." },
    meta: META,
  });
  if (rateSchedule !== "rate1") {
    return unsupported("This calculator models residential Rate 1 only.");
  }
  if (hasSolar) {
    return unsupported(
      "Solar billing arrangements vary and this calculator may not accurately estimate your increase."
    );
  }

  // A true 12-month average is annual-quality input; the kWh unit conversion
  // happens here so the UI never multiplies anything.
  if (annualKwh == null && averageMonthlyKwh != null) {
    assertUsable(averageMonthlyKwh, "averageMonthlyKwh");
    annualKwh = averageMonthlyKwh * 12;
  }

  let result;
  if (annualKwh != null) {
    const r = increaseFromAnnualKwh(annualKwh);
    result = { mode: "annual", annualCents: toCents(r.annual), averageMonthlyCents: toCents(r.averageMonthly) };
  } else if (monthlyKwh != null) {
    const r = increaseFromMonthlyKwh(monthlyKwh);
    result = { mode: "singleMonthEstimate", monthlyCents: toCents(r.monthly), annualIfTypicalCents: toCents(r.annualIfTypical) };
  } else if (usageBandId != null) {
    const band = USAGE_BANDS.find((b) => b.id === usageBandId);
    if (!band) throw new RangeError("Unknown usage band: " + usageBandId);
    const r = increaseFromMonthlyKwh(band.monthlyKwh);
    result = { mode: "band", band: band.label, monthlyCents: toCents(r.monthly), annualIfTypicalCents: toCents(r.annualIfTypical) };
  } else {
    result = { mode: "benchmark", ...benchmark() };
  }

  return { supported: true, ...result, percentNote: PERCENT_NOTE, meta: META, release: RELEASE };
}

// -------------------------------------------------------------------------
// Public namespace. See the LOADING note at the top of this file.
// -------------------------------------------------------------------------
globalThis.EversourceRates = {
  META,
  RELEASE,
  assertPublishable,
  standardServiceContext,
  PERCENT_NOTE,
  RATE_1,
  DELTAS,
  TYPICAL_BILLS_RATE_1,
  USAGE_BANDS,
  increaseFromAnnualKwh,
  increaseFromMonthlyKwh,
  benchmark,
  toCents,
  roundMoney,
  calculate,
};
