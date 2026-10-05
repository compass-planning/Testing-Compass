// Shared financial math for the planning suite (client-side, illustrative).

const MAX_MONTHS = 1200;

// Weighted-average interest rate across debts, weighted by balance.
export function weightedAvgRate(debts) {
  const total = debts.reduce((s, d) => s + Number(d.balance || 0), 0);
  if (total <= 0) return 0;
  return debts.reduce((s, d) => s + Number(d.balance || 0) * Number(d.rate || 0), 0) / total;
}

// Amortise a single debt at its own minimum payment (no rolling / no extra).
export function singlePayoff(balance, ratePct, payment) {
  let bal = Number(balance || 0);
  const r = Number(ratePct || 0) / 100 / 12;
  const pay = Number(payment || 0);
  let months = 0, interest = 0;
  if (bal <= 0) return { months: 0, interest: 0, neverPaysOff: false };
  // Negative amortisation guard: payment must exceed first month's interest.
  if (pay <= bal * r + 0.0001) return { months: Infinity, interest: Infinity, neverPaysOff: true };
  while (bal > 0.01 && months < MAX_MONTHS) {
    months++;
    const i = bal * r;
    interest += i;
    bal = bal + i - Math.min(pay, bal + i);
  }
  return { months, interest, neverPaysOff: false };
}

// Baseline: every debt paid at its own minimum, independently.
export function baseline(debts) {
  let interest = 0, months = 0, anyNever = false;
  debts.forEach((d) => {
    const p = singlePayoff(d.balance, d.rate, d.payment);
    if (p.neverPaysOff) { anyNever = true; return; }
    interest += p.interest;
    months = Math.max(months, p.months);
  });
  return { interest, months, neverPaysOff: anyNever };
}

// Avalanche (highest rate first) or Snowball (lowest balance first) with a
// rolling budget: freed-up minimums + any extra are funnelled to the target debt.
export function strategy(debts, extraMonthly, mode) {
  let items = debts.map((d, i) => ({
    key: d.id || String(i), name: d.name || "Debt",
    bal: Number(d.balance || 0), r: Number(d.rate || 0) / 100 / 12, min: Number(d.payment || 0),
  })).filter((d) => d.bal > 0);
  if (items.length === 0) return { months: 0, interest: 0, order: [], payoffMonth: {}, neverPaysOff: false };

  const order = [...items].sort((a, b) => (mode === "avalanche" ? b.r - a.r : a.bal - b.bal));
  const budget = items.reduce((s, d) => s + d.min, 0) + Number(extraMonthly || 0);
  let months = 0, interest = 0;
  const payoffMonth = {};

  while (items.some((d) => d.bal > 0.01) && months < MAX_MONTHS) {
    months++;
    items.forEach((d) => { if (d.bal > 0) { const i = d.bal * d.r; d.bal += i; interest += i; } });
    let avail = budget;
    items.forEach((d) => { if (d.bal > 0) { const pay = Math.min(d.min, d.bal, avail); d.bal -= pay; avail -= pay; } });
    for (const t of order) {
      if (avail <= 0.01) break;
      const live = items.find((d) => d.key === t.key);
      if (live && live.bal > 0) { const pay = Math.min(avail, live.bal); live.bal -= pay; avail -= pay; }
    }
    items.forEach((d) => { if (d.bal <= 0.01 && !payoffMonth[d.key]) payoffMonth[d.key] = months; });
  }
  const neverPaysOff = items.some((d) => d.bal > 0.01);
  return { months, interest, order: order.map((o) => ({ key: o.key, name: o.name })), payoffMonth, neverPaysOff };
}

export function monthsLabel(m) {
  if (!isFinite(m)) return "Never";
  const y = Math.floor(m / 12), mo = m % 12;
  return `${y ? `${y}y ` : ""}${mo}mo`;
}

// --- Linked liabilities/debts derived from Net Worth records ---

export const REAL_ESTATE_CATS = ["Principal Residence", "Real Estate (other)"];

// Synthetic debt rows derived from net-worth data: real-estate mortgages,
// vehicle loans, and any liability that carries a monthly payment.
export function derivedDebtsFromNetworth(nwRows = []) {
  const out = [];
  for (const r of nwRows) {
    if (r.kind === "asset") {
      const mort = Number(r.mortgage || 0);
      if (REAL_ESTATE_CATS.includes(r.category) && mort > 0)
        out.push({ id: `linked-${r.id}`, linked: true, source: "Property", parentId: r.id,
          name: r.name ? `${r.name} — mortgage` : "Mortgage", lender: r.lender || "",
          owner: r.owner || "Joint", balance: mort, rate: Number(r.interest_rate || 0), payment: Number(r.mortgage_payment || 0) });
      const loan = Number(r.loan_amount || 0);
      if (r.category === "Vehicle" && loan > 0)
        out.push({ id: `linked-${r.id}`, linked: true, source: "Vehicle", parentId: r.id,
          name: r.name ? `${r.name} — loan` : "Vehicle loan", lender: r.lender || "",
          owner: r.owner || "Joint", balance: loan, rate: Number(r.interest_rate || 0), payment: Number(r.payment || 0) });
    } else if (r.kind === "liability" && Number(r.payment || 0) > 0) {
      out.push({ id: `linked-${r.id}`, linked: true, source: "Liability", parentId: r.id,
        name: r.name || r.category || "Liability", lender: r.lender || "",
        owner: r.owner || "Joint", balance: Number(r.value || 0), rate: Number(r.rate || 0), payment: Number(r.payment || 0) });
    }
  }
  return out;
}

// Synthetic liability rows for the Net Worth Liabilities tab (mortgages + vehicle loans).
export function derivedLiabilitiesFromAssets(nwRows = []) {
  const out = [];
  for (const r of nwRows) {
    if (r.kind !== "asset") continue;
    const mort = Number(r.mortgage || 0);
    if (REAL_ESTATE_CATS.includes(r.category) && mort > 0)
      out.push({ id: `linked-${r.id}`, linked: true, source: "Property", parentId: r.id, owner: r.owner || "Joint",
        name: r.name ? `${r.name} — mortgage` : "Mortgage", category: "Mortgage", value: mort });
    const loan = Number(r.loan_amount || 0);
    if (r.category === "Vehicle" && loan > 0)
      out.push({ id: `linked-${r.id}`, linked: true, source: "Vehicle", parentId: r.id, owner: r.owner || "Joint",
        name: r.name ? `${r.name} — loan` : "Vehicle loan", category: "Loan", value: loan });
  }
  return out;
}


// --- Monte Carlo retirement simulation ---

function randNormal(mean, sd) {
  let u = 0, v = 0;
  while (u === 0) u = Math.random();
  while (v === 0) v = Math.random();
  return mean + sd * Math.sqrt(-2 * Math.log(u)) * Math.cos(2 * Math.PI * v);
}

// Returns { successProb, p10, p50, p90, deterministic } ending balances at age 95.
export function monteCarlo({
  current, annualContribution, yearsToRetire, retireAge,
  meanReturn, volatility, inflation, monthlyGoal,
  pensionIncome = 0, pensionIndexing = 0, otherIncome = 0, trials = 1000,
}) {
  const r = meanReturn / 100, sd = volatility / 100, infl = inflation / 100;
  const penIdx = pensionIndexing / 100;
  const goalAnnual = monthlyGoal * 12;
  const decumYears = Math.max(0, 95 - retireAge);
  const endings = [];
  let successes = 0;

  for (let t = 0; t < trials; t++) {
    let bal = current;
    for (let y = 0; y < yearsToRetire; y++) bal = bal * (1 + randNormal(r, sd)) + annualContribution;
    let survived = true;
    for (let y = 0; y < decumYears; y++) {
      const yearsElapsed = yearsToRetire + y;
      const goalInf = goalAnnual * Math.pow(1 + infl, yearsElapsed);
      const pen = pensionIncome * Math.pow(1 + penIdx, y);
      const oth = otherIncome * Math.pow(1 + infl, yearsElapsed);
      const withdraw = Math.max(0, goalInf - pen - oth);
      bal -= withdraw;
      if (bal < 0) { survived = false; bal = 0; break; }
      bal = bal * (1 + randNormal(r, sd));
    }
    if (survived) successes++;
    endings.push(bal);
  }
  endings.sort((a, b) => a - b);
  const pct = (p) => endings[Math.min(endings.length - 1, Math.floor((p / 100) * endings.length))];

  // Deterministic nest egg at retirement (mean return, no volatility).
  let det = current;
  for (let y = 0; y < yearsToRetire; y++) det = det * (1 + r) + annualContribution;

  return {
    successProb: Math.round((successes / trials) * 100),
    p10: pct(10), p50: pct(50), p90: pct(90),
    nestEgg: det, trials, decumYears, retireAge,
  };
}
