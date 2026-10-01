// Illustrative Canadian tax engine (2025 brackets/limits). Not tax advice.

const FED = [
  [57375, 0.15], [114750, 0.205], [177882, 0.26], [253414, 0.29], [Infinity, 0.33],
];

const PROV = {
  ON: { brackets: [[52886, 0.0505], [105775, 0.0915], [150000, 0.1116], [220000, 0.1216], [Infinity, 0.1316]], bpa: 12747 },
  BC: { brackets: [[49279, 0.0506], [98560, 0.077], [113158, 0.105], [137407, 0.1229], [186306, 0.147], [259829, 0.168], [Infinity, 0.205]], bpa: 12932 },
  AB: { brackets: [[60000, 0.08], [148269, 0.10], [177922, 0.12], [237230, 0.13], [355845, 0.14], [Infinity, 0.15]], bpa: 22323 },
  QC: { brackets: [[53255, 0.14], [106495, 0.19], [129590, 0.24], [Infinity, 0.2575]], bpa: 18571 },
};
const FED_BPA = 16129;

export const TAX_PROVINCES = Object.keys(PROV);
export const RRSP_MAX = 32490;        // 2025 contribution limit
export const RRSP_RATE = 0.18;
export const TFSA_2025_LIMIT = 7000;
export const CAP_GAINS_INCLUSION = 0.5;

const TFSA_ANNUAL = {
  2009: 5000, 2010: 5000, 2011: 5000, 2012: 5000, 2013: 5500, 2014: 5500, 2015: 10000,
  2016: 5500, 2017: 5500, 2018: 5500, 2019: 6000, 2020: 6000, 2021: 6000, 2022: 6000,
  2023: 6500, 2024: 7000, 2025: 7000,
};

function bracketTax(income, brackets) {
  let tax = 0, lower = 0;
  for (const [upTo, rate] of brackets) {
    if (income > upTo) { tax += (upTo - lower) * rate; lower = upTo; }
    else { tax += (income - lower) * rate; return tax; }
  }
  return tax;
}

function firstRate(brackets) { return brackets[0][1]; }

// Total tax (federal + provincial) after basic personal amount credits.
export function calcTax(income, province = "ON") {
  const prov = PROV[province] || PROV.ON;
  const fed = Math.max(0, bracketTax(income, FED) - FED_BPA * firstRate(FED));
  const provTax = Math.max(0, bracketTax(income, prov.brackets) - prov.bpa * firstRate(prov.brackets));
  const total = fed + provTax;
  return {
    federal: fed, provincial: provTax, total,
    afterTax: income - total,
    averageRate: income > 0 ? (total / income) * 100 : 0,
    marginalRate: marginalRate(income, province),
  };
}

export function marginalRate(income, province = "ON") {
  const prov = PROV[province] || PROV.ON;
  const fm = FED.find(([u]) => income <= u)?.[1] ?? 0.33;
  const pm = prov.brackets.find(([u]) => income <= u)?.[1] ?? prov.brackets[prov.brackets.length - 1][1];
  return (fm + pm) * 100;
}

export function rrspRoom(earnedIncome, priorContributions = 0, carryforward = 0) {
  const thisYear = Math.min(RRSP_RATE * earnedIncome, RRSP_MAX);
  const room = thisYear + carryforward - priorContributions;
  return { annualEntitlement: thisYear, room: Math.max(0, room), overContributed: room < 0 ? -room : 0 };
}

export function tfsaCumulative(eligibleSince = 2009) {
  let total = 0;
  for (let y = Math.max(2009, eligibleSince); y <= 2025; y++) total += TFSA_ANNUAL[y] || 0;
  return total;
}

export function tfsaRoom(eligibleSince, contributionsToDate = 0) {
  const cumulative = tfsaCumulative(eligibleSince);
  return { cumulative, room: Math.max(0, cumulative - contributionsToDate) };
}

export function capitalGainsTax(gain, income, province = "ON") {
  const taxable = gain * CAP_GAINS_INCLUSION;
  const mr = marginalRate(income + taxable, province) / 100;
  return { taxablePortion: taxable, estimatedTax: taxable * mr, marginalRate: mr * 100 };
}

// Income splitting: tax two incomes separately vs. split evenly.
export function incomeSplitting(incomeA, incomeB, province = "ON") {
  const separate = calcTax(incomeA, province).total + calcTax(incomeB, province).total;
  const avg = (incomeA + incomeB) / 2;
  const split = calcTax(avg, province).total * 2;
  return { separate, split, savings: Math.max(0, separate - split) };
}
