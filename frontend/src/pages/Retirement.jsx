import React, { useState, useMemo } from "react";
import { useQuery, useMutation, useQueryClient } from "@tanstack/react-query";
import { toast } from "sonner";
import {
  PiggyBank, Calculator, Dice5, ShieldCheck, Clock, Scale, Layers,
  Play, Save, Trash2, TrendingUp, SlidersHorizontal,
} from "lucide-react";
import {
  AreaChart, Area, LineChart, Line, XAxis, YAxis, Tooltip, ResponsiveContainer,
  CartesianGrid, Legend, ReferenceLine,
} from "recharts";
import api, { formatApiError } from "@/lib/api";
import { retirementApi, planApi, assumptionsApi } from "@/lib/planning";
import { useAuth } from "@/context/AuthContext";
import { useHousehold } from "@/context/HouseholdContext";
import { Card, Button, Input, Field, Select, Badge, Stat, Empty } from "@/components/ui-kit";
import { PageHeader } from "@/components/PageHeader";
import { useTr } from "@/lib/i18n";
import { money } from "@/lib/format";
import { TAX_PROVINCES } from "@/lib/tax";

const TABS = [
  { key: "projection", label: "Projection", icon: Calculator },
  { key: "montecarlo", label: "Monte Carlo", icon: Dice5 },
  { key: "guardrails", label: "Guardrails", icon: ShieldCheck },
  { key: "timing", label: "CPP / OAS Timing", icon: Clock },
  { key: "decisions", label: "Decisions", icon: Scale },
  { key: "scenarios", label: "Scenarios", icon: Layers },
];

const NONREG_TYPES = [
  { v: "mixed", l: "Mixed (60% interest / 40% cap gains)" },
  { v: "capital_gains", l: "Capital gains (stocks/ETFs)" },
  { v: "interest", l: "Interest (GICs/bonds)" },
  { v: "mutual_fund", l: "Mutual fund" },
  { v: "insurance_annuity", l: "Prescribed annuity" },
];

const DEFAULTS = {
  current_age: 45, retirement_age: 65, life_expectancy: 95, province: "ON",
  rrsp_balance: 300000, tfsa_balance: 80000, non_reg_balance: 50000,
  non_reg_tax_type: "mixed", non_reg_acb: 40000,
  annual_rrsp_contrib: 12000, annual_tfsa_contrib: 7000,
  desired_retirement_income: 60000, pension_annual: 0, pension_start_age: 65,
  pension_indexed: false, bridge_benefit_annual: 0, bridge_benefit_end_age: 65,
  cpp_monthly: 1100, cpp_start_age: 65, oas_monthly: 713, oas_start_age: 65,
  expected_return_pct: 5.5, inflation_pct: 2.1,
};

function Row({ label, value, strong }) {
  return (
    <div className="flex justify-between text-sm">
      <span className="text-compass-muted">{label}</span>
      <span className={strong ? "font-bold text-compass-navy" : "font-semibold text-compass-navy"}>{value}</span>
    </div>
  );
}

function band(prob) {
  const p = prob * 100;
  if (p >= 85) return { label: "High confidence", color: "#00DF89", bg: "rgba(0,223,137,0.12)" };
  if (p >= 70) return { label: "On track", color: "#0052FF", bg: "rgba(0,82,255,0.08)" };
  if (p >= 50) return { label: "Moderate", color: "#FFB800", bg: "rgba(255,184,0,0.14)" };
  return { label: "At risk", color: "#EE5D50", bg: "rgba(238,93,80,0.12)" };
}

export default function Retirement() {
  const { user } = useAuth();
  const { active } = useHousehold() || {};
  const [tab, setTab] = useState("projection");
  const tr = useTr();
  const [inp, setInp] = useState(DEFAULTS);
  const owners = useQuery({ queryKey: ["owners"], queryFn: async () => (await api.get("/owners")).data });
  const assumptions = useQuery({ queryKey: ["assumptions", active], queryFn: assumptionsApi.get });
  const seeded = React.useRef(null);
  React.useEffect(() => {
    if (assumptions.data && seeded.current !== active) {
      seeded.current = active;
      setInp((s) => ({
        ...s,
        expected_return_pct: assumptions.data.expected_return_pct,
        inflation_pct: assumptions.data.inflation_pct,
        life_expectancy: assumptions.data.life_expectancy,
        retirement_age: assumptions.data.retirement_age,
      }));
    }
  }, [assumptions.data, active]);

  const num = (k) => (e) => setInp((s) => ({ ...s, [k]: Number(e.target.value || 0) }));
  const str = (k) => (e) => setInp((s) => ({ ...s, [k]: e.target.value }));

  const prefill = () => {
    const list = owners.data || [];
    const p = list.find((o) => o.relationship === "self") || list[0];
    if (!p) { toast.info("No household profile to prefill from"); return; }
    setInp((s) => ({
      ...s,
      retirement_age: Number(p.retirement_age || s.retirement_age),
      desired_retirement_income: Number(p.desired_income ? p.desired_income * 12 : s.desired_retirement_income),
      province: TAX_PROVINCES.includes(p.province) ? p.province : s.province,
    }));
    toast.success("Prefilled from household profile");
  };

  return (
    <div data-testid="retirement-page">
      <PageHeader title="Retirement" subtitle="Canadian projection, Monte Carlo stress-testing and drawdown strategy.">
        <Button variant="outline" size="sm" onClick={prefill} data-testid="retirement-prefill">{tr("Prefill from profile")}</Button>
      </PageHeader>

      <AssumptionsCard inp={inp} setInp={setInp} readOnly={user.tier === "enterprise" && !user.enterprise_write} />

      <div className="flex gap-1 mb-6 border-b border-compass-border overflow-x-auto">
        {TABS.map((t) => (
          <button key={t.key} onClick={() => setTab(t.key)} data-testid={`retirement-tab-${t.key}`}
            className={`flex items-center gap-2 px-4 py-2.5 text-sm font-semibold border-b-2 -mb-px whitespace-nowrap transition-colors ${tab === t.key ? "border-compass-blue text-compass-blue" : "border-transparent text-compass-muted hover:text-compass-navy"}`}>
            <t.icon size={16} /> {tr(t.label)}
          </button>
        ))}
      </div>

      {tab === "projection" && <ProjectionTab inp={inp} num={num} str={str} setInp={setInp} />}
      {tab === "montecarlo" && <MonteCarloTab inp={inp} num={num} />}
      {tab === "guardrails" && <GuardrailsTab inp={inp} num={num} />}
      {tab === "timing" && <TimingTab inp={inp} num={num} />}
      {tab === "decisions" && <DecisionsTab inp={inp} owners={owners.data || []} />}
      {tab === "scenarios" && <ScenariosTab inp={inp} readOnly={user.tier === "enterprise" && !user.enterprise_write} />}
    </div>
  );
}

function AssumptionsCard({ inp, setInp, readOnly }) {
  const qc = useQueryClient();
  const save = useMutation({
    mutationFn: () => assumptionsApi.save({
      expected_return_pct: inp.expected_return_pct, inflation_pct: inp.inflation_pct,
      life_expectancy: inp.life_expectancy, retirement_age: inp.retirement_age,
    }),
    onSuccess: () => { qc.invalidateQueries({ queryKey: ["assumptions"] }); toast.success("Assumptions saved — reused across every projection"); },
    onError: (e) => toast.error(formatApiError(e.response?.data?.detail) || "Could not save assumptions"),
  });
  const n = (k) => (e) => setInp((s) => ({ ...s, [k]: Number(e.target.value || 0) }));
  return (
    <Card className="p-5 mb-6" data-testid="assumptions-editor">
      <div className="flex items-center justify-between mb-2">
        <h3 className="font-heading font-bold text-compass-navy flex items-center gap-2"><SlidersHorizontal size={18} className="text-compass-blue" /> Planning assumptions</h3>
        {!readOnly && <Button size="sm" onClick={() => save.mutate()} disabled={save.isPending} data-testid="assumptions-save"><Save size={14} /> Save &amp; reuse</Button>}
      </div>
      <p className="text-xs text-compass-muted mb-4">Set these once — they seed every projection, Monte Carlo and guardrail run for this household.</p>
      <div className="grid sm:grid-cols-4 gap-4">
        <Field label="Expected return (%)"><Input type="number" step="0.1" value={inp.expected_return_pct} onChange={n("expected_return_pct")} data-testid="assume-return" /></Field>
        <Field label="Inflation (%)"><Input type="number" step="0.1" value={inp.inflation_pct} onChange={n("inflation_pct")} data-testid="assume-inflation" /></Field>
        <Field label="Life expectancy"><Input type="number" value={inp.life_expectancy} onChange={n("life_expectancy")} data-testid="assume-life" /></Field>
        <Field label="Retirement age"><Input type="number" value={inp.retirement_age} onChange={n("retirement_age")} data-testid="assume-retire" /></Field>
      </div>
    </Card>
  );
}

function InputGrid({ inp, num, str, setInp }) {
  return (
    <div className="grid sm:grid-cols-3 gap-4">
      <Field label="Current age"><Input type="number" value={inp.current_age} onChange={num("current_age")} data-testid="ret-current-age" /></Field>
      <Field label="Retirement age"><Input type="number" value={inp.retirement_age} onChange={num("retirement_age")} data-testid="ret-retirement-age" /></Field>
      <Field label="Plan to age"><Input type="number" value={inp.life_expectancy} onChange={num("life_expectancy")} data-testid="ret-life-expectancy" /></Field>
      <Field label="Province"><Select value={inp.province} onChange={str("province")} data-testid="ret-province">{TAX_PROVINCES.map((p) => <option key={p}>{p}</option>)}</Select></Field>
      <Field label="Desired income ($/yr, after-tax)"><Input type="number" value={inp.desired_retirement_income} onChange={num("desired_retirement_income")} data-testid="ret-desired-income" /></Field>
      <Field label="Expected return (%)"><Input type="number" step="0.1" value={inp.expected_return_pct} onChange={num("expected_return_pct")} data-testid="ret-return" /></Field>
      <Field label="Inflation (%)"><Input type="number" step="0.1" value={inp.inflation_pct} onChange={num("inflation_pct")} data-testid="ret-inflation" /></Field>
      <Field label="RRSP balance"><Input type="number" value={inp.rrsp_balance} onChange={num("rrsp_balance")} data-testid="ret-rrsp" /></Field>
      <Field label="TFSA balance"><Input type="number" value={inp.tfsa_balance} onChange={num("tfsa_balance")} data-testid="ret-tfsa" /></Field>
      <Field label="Non-registered balance"><Input type="number" value={inp.non_reg_balance} onChange={num("non_reg_balance")} data-testid="ret-nonreg" /></Field>
      <Field label="Non-reg tax treatment"><Select value={inp.non_reg_tax_type} onChange={str("non_reg_tax_type")} data-testid="ret-nonreg-type">{NONREG_TYPES.map((t) => <option key={t.v} value={t.v}>{t.l}</option>)}</Select></Field>
      <Field label="Non-reg ACB"><Input type="number" value={inp.non_reg_acb} onChange={num("non_reg_acb")} data-testid="ret-acb" /></Field>
      <Field label="Annual RRSP contribution"><Input type="number" value={inp.annual_rrsp_contrib} onChange={num("annual_rrsp_contrib")} data-testid="ret-rrsp-contrib" /></Field>
      <Field label="Annual TFSA contribution"><Input type="number" value={inp.annual_tfsa_contrib} onChange={num("annual_tfsa_contrib")} data-testid="ret-tfsa-contrib" /></Field>
      <Field label="DB pension ($/yr)"><Input type="number" value={inp.pension_annual} onChange={num("pension_annual")} data-testid="ret-pension" /></Field>
      <Field label="CPP (monthly, today's $)"><Input type="number" value={inp.cpp_monthly} onChange={num("cpp_monthly")} data-testid="ret-cpp" /></Field>
      <Field label="CPP start age"><Input type="number" value={inp.cpp_start_age} onChange={num("cpp_start_age")} data-testid="ret-cpp-age" /></Field>
      <Field label="OAS (monthly, today's $)"><Input type="number" value={inp.oas_monthly} onChange={num("oas_monthly")} data-testid="ret-oas" /></Field>
      <Field label="OAS start age"><Input type="number" value={inp.oas_start_age} onChange={num("oas_start_age")} data-testid="ret-oas-age" /></Field>
    </div>
  );
}

function ProjectionTab({ inp, num, str, setInp }) {
  const [res, setRes] = useState(null);
  const run = useMutation({
    mutationFn: () => retirementApi.projection(inp),
    onSuccess: (d) => setRes(d),
    onError: (e) => toast.error(formatApiError(e.response?.data?.detail) || "Projection failed"),
  });
  const chartData = useMemo(() => (res?.yearByYear || []).map((y) => ({
    age: y.age, Portfolio: y.totalPortfolio, Spending: y.desiredSpendingNominal, Income: y.netAfterTaxIncome,
  })), [res]);
  const s = res?.summary;

  return (
    <div className="grid lg:grid-cols-3 gap-6">
      <Card className="p-6 lg:col-span-2">
        <h3 className="font-heading font-bold text-compass-navy mb-4">Projection inputs</h3>
        <InputGrid inp={inp} num={num} str={str} setInp={setInp} />
        <Button className="mt-5" onClick={() => run.mutate()} disabled={run.isPending} data-testid="ret-run-projection">
          <Play size={16} /> {run.isPending ? "Projecting…" : "Run projection"}
        </Button>
      </Card>

      <Card className="p-6" data-testid="projection-summary">
        <div className="muted-label">Portfolio at retirement</div>
        <div className="font-heading text-4xl font-extrabold gradient-text mt-1" data-testid="projection-portfolio">{s ? money(s.portfolioAtRetirement) : "—"}</div>
        {s && (
          <div className="mt-5 space-y-2">
            <Row label="RRSP / TFSA / Non-reg" value={`${money(s.rrspAtRetirement)} · ${money(s.tfsaAtRetirement)} · ${money(s.nonRegAtRetirement)}`} />
            <Row label="Guaranteed income (CPP+OAS+pension)" value={`${money(s.guaranteedIncomeAtRet)}/yr`} />
            <Row label="RRIF min (first year @71)" value={money(s.rrifMinYear1)} />
            <Row label="Lifetime tax paid" value={money(s.lifetimeTaxPaid)} />
            <Row label="Avg tax in retirement" value={`${money(s.avgAnnualTaxInRetirement)}/yr`} />
            <Row label="Estate value at plan end" value={money(s.estateValueAtDeath)} strong />
          </div>
        )}
        {!s && <p className="text-sm text-compass-muted mt-4">Run the projection to see your year-by-year Canadian retirement outlook.</p>}
      </Card>

      {res && (
        <>
          <Card className="p-6 lg:col-span-3" data-testid="projection-chart">
            <h3 className="font-heading font-bold text-compass-navy mb-4">Portfolio & income by age</h3>
            <ResponsiveContainer width="100%" height={300}>
              <AreaChart data={chartData} margin={{ left: 8, right: 8, top: 8 }}>
                <defs>
                  <linearGradient id="pfill" x1="0" y1="0" x2="0" y2="1"><stop offset="0%" stopColor="#0052FF" stopOpacity={0.35} /><stop offset="100%" stopColor="#0052FF" stopOpacity={0.02} /></linearGradient>
                </defs>
                <CartesianGrid strokeDasharray="3 3" stroke="#EDF1F7" vertical={false} />
                <XAxis dataKey="age" tick={{ fill: "#A3AED0", fontSize: 11 }} axisLine={false} tickLine={false} interval={4} />
                <YAxis tickFormatter={(v) => `$${Math.round(v / 1000)}k`} tick={{ fill: "#A3AED0", fontSize: 11 }} axisLine={false} tickLine={false} width={48} />
                <Tooltip formatter={(v) => money(v)} contentStyle={{ borderRadius: 12, border: "1px solid #E2E8F0" }} />
                <Legend wrapperStyle={{ fontSize: 12 }} />
                <ReferenceLine x={inp.retirement_age} stroke="#FFB800" strokeDasharray="4 4" label={{ value: "Retire", fill: "#FFB800", fontSize: 11 }} />
                <Area type="monotone" dataKey="Portfolio" stroke="#0052FF" fill="url(#pfill)" strokeWidth={2} />
                <Line type="monotone" dataKey="Income" stroke="#00DF89" strokeWidth={2} dot={false} />
                <Line type="monotone" dataKey="Spending" stroke="#EE5D50" strokeWidth={2} dot={false} strokeDasharray="5 4" />
              </AreaChart>
            </ResponsiveContainer>
          </Card>

          <Card className="p-0 lg:col-span-3 overflow-hidden" data-testid="projection-table">
            <div className="px-6 py-4 border-b border-compass-border font-heading font-bold text-compass-navy">Year-by-year detail</div>
            <div className="overflow-x-auto max-h-[420px]">
              <table className="w-full text-sm">
                <thead className="bg-compass-bg/60 sticky top-0">
                  <tr className="text-left text-[11px] uppercase tracking-wide text-compass-muted">
                    {["Age", "Phase", "Portfolio", "CPP", "OAS", "Pension", "RRIF", "Taxable", "Tax", "Net", "Funding"].map((h) => <th key={h} className="px-3 py-2 font-semibold">{h}</th>)}
                  </tr>
                </thead>
                <tbody>
                  {res.yearByYear.map((y) => (
                    <tr key={y.age} className="border-t border-compass-border/60" data-testid={`projection-year-${y.age}`}>
                      <td className="px-3 py-1.5 font-semibold text-compass-navy">{y.age}</td>
                      <td className="px-3 py-1.5"><span className="text-xs text-compass-muted">{y.phase.replace("_", " ")}</span></td>
                      <td className="px-3 py-1.5">{money(y.totalPortfolio)}</td>
                      <td className="px-3 py-1.5">{money(y.cppIncome)}</td>
                      <td className="px-3 py-1.5">{money(y.oasIncome)}</td>
                      <td className="px-3 py-1.5">{money(y.pensionIncome)}</td>
                      <td className="px-3 py-1.5">{money(y.rrifWithdrawal + y.rrifExtra)}</td>
                      <td className="px-3 py-1.5">{money(y.taxableIncome)}</td>
                      <td className="px-3 py-1.5 text-compass-red">{money(y.totalTax)}</td>
                      <td className="px-3 py-1.5 font-semibold">{money(y.netAfterTaxIncome)}</td>
                      <td className="px-3 py-1.5">{y.fundingPct ? `${y.fundingPct}%` : "—"}</td>
                    </tr>
                  ))}
                </tbody>
              </table>
            </div>
          </Card>
        </>
      )}
    </div>
  );
}

function MonteCarloTab({ inp, num }) {
  const [res, setRes] = useState(null);
  const [alloc, setAlloc] = useState("BALANCED");
  const [paths, setPaths] = useState(1000);
  const run = useMutation({
    mutationFn: () => retirementApi.montecarlo({
      initialBalance: inp.rrsp_balance + inp.tfsa_balance + inp.non_reg_balance,
      allocation: alloc, annualContribution: inp.annual_rrsp_contrib + inp.annual_tfsa_contrib,
      yearsToSimulate: Math.max(1, inp.life_expectancy - inp.current_age), numberOfPaths: paths,
    }),
    onSuccess: (d) => setRes(d),
    onError: () => toast.error("Simulation failed"),
  });
  const chartData = useMemo(() => {
    if (!res) return [];
    return res.percentiles.p50.map((_, i) => ({
      year: inp.current_age + i, p10: res.percentiles.p10[i], p50: res.percentiles.p50[i], p90: res.percentiles.p90[i],
    }));
  }, [res, inp.current_age]);
  const b = res ? band(res.probabilityOfSuccess) : null;

  return (
    <div className="grid lg:grid-cols-3 gap-6">
      <Card className="p-6">
        <h3 className="font-heading font-bold text-compass-navy mb-4 flex items-center gap-2"><Dice5 size={18} className="text-compass-blue" /> Simulation settings</h3>
        <div className="space-y-4">
          <Field label="Portfolio allocation"><Select value={alloc} onChange={(e) => setAlloc(e.target.value)} data-testid="mc-allocation">{["AGGRESSIVE", "BALANCED", "MODERATE", "CONSERVATIVE"].map((a) => <option key={a} value={a}>{a[0] + a.slice(1).toLowerCase()}</option>)}</Select></Field>
          <Field label="Number of paths"><Select value={String(paths)} onChange={(e) => setPaths(Number(e.target.value))} data-testid="mc-paths">{[500, 1000, 2000, 5000].map((p) => <option key={p} value={p}>{p.toLocaleString()}</option>)}</Select></Field>
          <p className="text-xs text-compass-muted">Correlated 5-asset returns via Cholesky decomposition over {Math.max(1, inp.life_expectancy - inp.current_age)} years. Starting balance {money(inp.rrsp_balance + inp.tfsa_balance + inp.non_reg_balance)}, contributing {money(inp.annual_rrsp_contrib + inp.annual_tfsa_contrib)}/yr.</p>
          <Button onClick={() => run.mutate()} disabled={run.isPending} data-testid="mc-run"><Play size={16} /> {run.isPending ? "Simulating…" : "Run simulation"}</Button>
        </div>
      </Card>

      <Card className="p-6" data-testid="mc-result">
        <div className="muted-label">Probability of success</div>
        <div className="font-heading text-5xl font-extrabold gradient-text mt-1" data-testid="mc-success">{res ? `${Math.round(res.probabilityOfSuccess * 100)}%` : "—"}</div>
        {b && <div className="mt-2"><Badge color={b.color} bg={b.bg} data-testid="mc-band">{b.label}</Badge></div>}
        {res && (
          <div className="mt-5 space-y-2">
            <Row label="Median ending balance" value={money(res.percentiles.p50[res.percentiles.p50.length - 1])} />
            <Row label="Pessimistic (10th)" value={money(res.percentiles.p10[res.percentiles.p10.length - 1])} />
            <Row label="Optimistic (90th)" value={money(res.percentiles.p90[res.percentiles.p90.length - 1])} />
          </div>
        )}
      </Card>

      {res && (
        <Card className="p-6 lg:col-span-3" data-testid="mc-chart">
          <h3 className="font-heading font-bold text-compass-navy mb-4">Percentile outcomes (10th – 90th)</h3>
          <ResponsiveContainer width="100%" height={300}>
            <AreaChart data={chartData} margin={{ left: 8, right: 8, top: 8 }}>
              <defs><linearGradient id="fan" x1="0" y1="0" x2="0" y2="1"><stop offset="0%" stopColor="#0052FF" stopOpacity={0.25} /><stop offset="100%" stopColor="#0052FF" stopOpacity={0.02} /></linearGradient></defs>
              <CartesianGrid strokeDasharray="3 3" stroke="#EDF1F7" vertical={false} />
              <XAxis dataKey="year" tick={{ fill: "#A3AED0", fontSize: 11 }} axisLine={false} tickLine={false} interval={4} />
              <YAxis tickFormatter={(v) => `$${Math.round(v / 1000)}k`} tick={{ fill: "#A3AED0", fontSize: 11 }} axisLine={false} tickLine={false} width={48} />
              <Tooltip formatter={(v) => money(v)} contentStyle={{ borderRadius: 12, border: "1px solid #E2E8F0" }} />
              <Legend wrapperStyle={{ fontSize: 12 }} />
              <Area type="monotone" dataKey="p90" stroke="#00DF89" fill="url(#fan)" strokeWidth={1.5} name="90th" />
              <Area type="monotone" dataKey="p50" stroke="#0052FF" fill="url(#fan)" strokeWidth={2} name="Median" />
              <Area type="monotone" dataKey="p10" stroke="#EE5D50" fill="none" strokeWidth={1.5} name="10th" />
            </AreaChart>
          </ResponsiveContainer>
        </Card>
      )}
    </div>
  );
}

function GuardrailsTab({ inp, num }) {
  const [res, setRes] = useState(null);
  const run = useMutation({
    mutationFn: () => retirementApi.guardrails({
      currentAge: inp.current_age, retirementAge: inp.retirement_age, lifeExpectancy: inp.life_expectancy,
      rrspBalance: inp.rrsp_balance, tfsaBalance: inp.tfsa_balance, nonRegBalance: inp.non_reg_balance,
      annualIncome: Math.max(1, inp.desired_retirement_income * 1.4),
      rrspContribution: inp.annual_rrsp_contrib, tfsaContribution: inp.annual_tfsa_contrib,
      desiredRetirementIncome: inp.desired_retirement_income, pensionIncome: inp.pension_annual,
      cppAmount: inp.cpp_monthly * 12, oasAmount: inp.oas_monthly * 12,
    }),
    onSuccess: (d) => setRes(d),
    onError: () => toast.error("Guardrail check failed"),
  });
  const HEALTH = {
    excellent: { c: "#00DF89", bg: "rgba(0,223,137,0.12)" }, good: { c: "#0052FF", bg: "rgba(0,82,255,0.08)" },
    warning: { c: "#FFB800", bg: "rgba(255,184,0,0.14)" }, critical: { c: "#EE5D50", bg: "rgba(238,93,80,0.12)" },
  };
  const h = res ? HEALTH[res.health] : null;

  return (
    <div className="grid lg:grid-cols-3 gap-6">
      <Card className="p-6">
        <h3 className="font-heading font-bold text-compass-navy mb-3 flex items-center gap-2"><ShieldCheck size={18} className="text-compass-blue" /> Guyton-Klinger guardrails</h3>
        <p className="text-sm text-compass-muted mb-4">Stress-tests your plan and models dynamic spending (cut when the portfolio drops below the floor, raise when above the ceiling).</p>
        <Button onClick={() => run.mutate()} disabled={run.isPending} data-testid="guardrails-run"><Play size={16} /> {run.isPending ? "Checking…" : "Run guardrail check"}</Button>
      </Card>

      <Card className="p-6" data-testid="guardrails-result">
        <div className="muted-label">Plan health</div>
        {res ? (
          <>
            <div className="mt-2"><Badge color={h.c} bg={h.bg} data-testid="guardrails-health">{res.health.toUpperCase()}</Badge></div>
            <div className="mt-4 space-y-2">
              <Row label="Base success" value={`${Math.round(res.flexibility.baseSuccessRate * 100)}%`} />
              <Row label="With spending flexibility" value={`${Math.round(res.flexibility.adjustedSuccessRate * 100)}%`} strong />
              <Row label="Improvement" value={`+${Math.round(res.flexibility.successRateGain * 100)} pts`} />
              <Row label="Required withdrawal" value={`${money(res.requiredWithdrawal)}/yr`} />
            </div>
          </>
        ) : <p className="text-sm text-compass-muted mt-3">Run the check to see your plan health and spending-flexibility uplift.</p>}
      </Card>

      {res && (
        <>
          <Card className="p-6 lg:col-span-3" data-testid="guardrails-recommendation">
            <div className="muted-label mb-1">Recommendation</div>
            <p className="text-sm text-compass-navy leading-relaxed">{res.flexibility.recommendation}</p>
            {res.recommendations?.length > 0 && (
              <ul className="mt-3 space-y-1.5">
                {res.recommendations.map((r, i) => <li key={i} className="flex items-start gap-2 text-sm text-compass-muted"><TrendingUp size={14} className="text-compass-blue mt-0.5 shrink-0" />{r}</li>)}
              </ul>
            )}
          </Card>

          <Card className="p-0 lg:col-span-3 overflow-hidden" data-testid="guardrails-triggers">
            <div className="px-6 py-4 border-b border-compass-border font-heading font-bold text-compass-navy">Spending guardrail triggers</div>
            <div className="overflow-x-auto max-h-[360px]">
              <table className="w-full text-sm">
                <thead className="bg-compass-bg/60 sticky top-0">
                  <tr className="text-left text-[11px] uppercase tracking-wide text-compass-muted">
                    {["Age", "Target balance", "Floor", "Ceiling", "Base spend", "Reduced", "Increased"].map((x) => <th key={x} className="px-3 py-2 font-semibold">{x}</th>)}
                  </tr>
                </thead>
                <tbody>
                  {res.flexibility.triggerTable.map((t) => (
                    <tr key={t.age} className="border-t border-compass-border/60">
                      <td className="px-3 py-1.5 font-semibold text-compass-navy">{t.age}</td>
                      <td className="px-3 py-1.5">{money(t.targetPathBalance)}</td>
                      <td className="px-3 py-1.5 text-compass-red">{money(t.floorBalance)}</td>
                      <td className="px-3 py-1.5 text-compass-green">{money(t.ceilingBalance)}</td>
                      <td className="px-3 py-1.5">{money(t.baseSpending)}</td>
                      <td className="px-3 py-1.5 text-compass-red">{money(t.reducedSpending)}</td>
                      <td className="px-3 py-1.5 text-compass-green">{money(t.increasedSpending)}</td>
                    </tr>
                  ))}
                </tbody>
              </table>
            </div>
          </Card>
        </>
      )}
    </div>
  );
}

function TimingTab({ inp }) {
  const q = useQuery({
    queryKey: ["cpp-timing", inp.desired_retirement_income],
    queryFn: () => retirementApi.cppTiming({ totalIncome: inp.desired_retirement_income, yearsInCanada: 40 }),
  });
  const d = q.data;
  const cppData = d ? [
    { age: "60", CPP: d.cpp.at60.annualBenefit }, { age: "65", CPP: d.cpp.at65.annualBenefit }, { age: "70", CPP: d.cpp.at70.annualBenefit },
  ] : [];
  return (
    <div className="grid lg:grid-cols-2 gap-6">
      <Card className="p-6" data-testid="timing-cpp">
        <h3 className="font-heading font-bold text-compass-navy mb-4 flex items-center gap-2"><Clock size={18} className="text-compass-blue" /> CPP start-age comparison</h3>
        {d ? (
          <>
            <ResponsiveContainer width="100%" height={200}>
              <LineChart data={cppData} margin={{ left: 8, right: 8, top: 8 }}>
                <CartesianGrid strokeDasharray="3 3" stroke="#EDF1F7" vertical={false} />
                <XAxis dataKey="age" tick={{ fill: "#A3AED0", fontSize: 11 }} axisLine={false} tickLine={false} />
                <YAxis tickFormatter={(v) => `$${Math.round(v / 1000)}k`} tick={{ fill: "#A3AED0", fontSize: 11 }} axisLine={false} tickLine={false} width={44} />
                <Tooltip formatter={(v) => `${money(v)}/yr`} contentStyle={{ borderRadius: 12, border: "1px solid #E2E8F0" }} />
                <Line type="monotone" dataKey="CPP" stroke="#0052FF" strokeWidth={2.5} />
              </LineChart>
            </ResponsiveContainer>
            <div className="mt-4 space-y-2">
              <Row label="At 60" value={`${money(d.cpp.at60.annualBenefit)}/yr · ${d.cpp.at60.adjustmentLabel}`} />
              <Row label="At 65" value={`${money(d.cpp.at65.annualBenefit)}/yr`} />
              <Row label="At 70" value={`${money(d.cpp.at70.annualBenefit)}/yr · ${d.cpp.at70.adjustmentLabel}`} />
              <Row label="Break-even 65 vs 70" value={`age ${d.cpp.breakEven65vs70}`} strong />
            </div>
          </>
        ) : <p className="text-sm text-compass-muted">Loading…</p>}
      </Card>
      <Card className="p-6" data-testid="timing-oas">
        <h3 className="font-heading font-bold text-compass-navy mb-4">OAS deferral (65 → 70)</h3>
        {d ? (
          <div className="space-y-2">
            {Object.keys(d.oas).map((age) => (
              <Row key={age} label={`Start at ${age}`} value={`${money(d.oas[age].netAnnualBenefit)}/yr net${d.oas[age].clawbackAmount ? ` (clawback ${money(d.oas[age].clawbackAmount)})` : ""}`} />
            ))}
            <p className="text-xs text-compass-muted mt-3">Deferring OAS adds 0.6%/month (up to +36% at 70). Clawback applies above {money(90997)} net income.</p>
          </div>
        ) : <p className="text-sm text-compass-muted">Loading…</p>}
      </Card>
    </div>
  );
}

function DecisionsTab({ inp, owners }) {
  const spouse = owners.find((o) => o.relationship === "spouse");
  const [rt, setRt] = useState({ current: 90000, retire: inp.desired_retirement_income });
  const [ps, setPs] = useState({ self: 90000, pension: 30000, spouse: Number(spouse?.annual_income || 40000) });
  const rrspQ = useMutation({ mutationFn: () => retirementApi.rrspVsTfsa({ currentIncome: rt.current, expectedRetirementIncome: rt.retire, province: inp.province }) });
  const splitQ = useMutation({ mutationFn: () => retirementApi.pensionSplit({ selfIncome: ps.self, eligiblePensionIncome: ps.pension, spouseIncome: ps.spouse, province: inp.province }) });
  const REC = { rrsp: { c: "#0052FF", bg: "rgba(0,82,255,0.08)" }, tfsa: { c: "#00DF89", bg: "rgba(0,223,137,0.12)" }, balanced: { c: "#FFB800", bg: "rgba(255,184,0,0.14)" } };
  const r = rrspQ.data;
  const sp = splitQ.data;

  return (
    <div className="grid lg:grid-cols-2 gap-6">
      <Card className="p-6" data-testid="decision-rrsp-tfsa">
        <h3 className="font-heading font-bold text-compass-navy mb-4">RRSP vs TFSA</h3>
        <div className="grid grid-cols-2 gap-4">
          <Field label="Current income"><Input type="number" value={rt.current} onChange={(e) => setRt({ ...rt, current: Number(e.target.value || 0) })} data-testid="rrsp-current" /></Field>
          <Field label="Expected retirement income"><Input type="number" value={rt.retire} onChange={(e) => setRt({ ...rt, retire: Number(e.target.value || 0) })} data-testid="rrsp-retire" /></Field>
        </div>
        <Button className="mt-4" size="sm" onClick={() => rrspQ.mutate()} disabled={rrspQ.isPending} data-testid="rrsp-run">Compare</Button>
        {r && (
          <div className="mt-4" data-testid="rrsp-result">
            <Badge color={REC[r.recommendation].c} bg={REC[r.recommendation].bg}>Favour {r.recommendation.toUpperCase()}</Badge>
            <p className="text-sm text-compass-muted mt-3">{r.rationale}</p>
          </div>
        )}
      </Card>

      <Card className="p-6" data-testid="decision-pension-split">
        <h3 className="font-heading font-bold text-compass-navy mb-4">Pension income splitting</h3>
        <div className="grid grid-cols-3 gap-3">
          <Field label="Your income"><Input type="number" value={ps.self} onChange={(e) => setPs({ ...ps, self: Number(e.target.value || 0) })} data-testid="split-self" /></Field>
          <Field label="Eligible pension"><Input type="number" value={ps.pension} onChange={(e) => setPs({ ...ps, pension: Number(e.target.value || 0) })} data-testid="split-pension" /></Field>
          <Field label="Spouse income"><Input type="number" value={ps.spouse} onChange={(e) => setPs({ ...ps, spouse: Number(e.target.value || 0) })} data-testid="split-spouse" /></Field>
        </div>
        <Button className="mt-4" size="sm" onClick={() => splitQ.mutate()} disabled={splitQ.isPending} data-testid="split-run">Optimize</Button>
        {sp && (
          <div className="mt-4 space-y-2" data-testid="split-result">
            <div className="font-heading text-3xl font-extrabold gradient-text">{money(sp.taxSavings)}</div>
            <div className="text-sm text-compass-muted">potential annual tax savings</div>
            <Row label="Optimal split to spouse" value={`${Math.round(sp.bestSplitPct * 100)}%`} />
            <Row label="Combined tax after split" value={money(sp.combinedTax)} />
          </div>
        )}
      </Card>
    </div>
  );
}

function ScenariosTab({ inp, readOnly }) {
  const qc = useQueryClient();
  const [name, setName] = useState("");
  const list = useQuery({ queryKey: ["ret-scenarios"], queryFn: retirementApi.scenarios });
  const save = useMutation({
    mutationFn: async () => {
      const proj = await retirementApi.projection(inp);
      const summary = {
        portfolioAtRetirement: proj.summary.portfolioAtRetirement,
        estateValueAtDeath: proj.summary.estateValueAtDeath,
        lifetimeTaxPaid: proj.summary.lifetimeTaxPaid,
        guaranteedIncomeAtRet: proj.summary.guaranteedIncomeAtRet,
      };
      await retirementApi.saveScenario({ name: name.trim(), inputs: inp, summary });
      await planApi.create("retirement", {
        name: name.trim(), retire_age: inp.retirement_age, monthly_income_goal: Math.round(inp.desired_retirement_income / 12),
        result: "Saved", nest_egg: proj.summary.portfolioAtRetirement, note: "From retirement hub",
      }).catch(() => {});
    },
    onSuccess: () => { setName(""); qc.invalidateQueries({ queryKey: ["ret-scenarios"] }); qc.invalidateQueries({ queryKey: ["plan", "overview"] }); toast.success("Scenario saved"); },
    onError: (e) => toast.error(formatApiError(e.response?.data?.detail) || "Could not save scenario"),
  });
  const del = useMutation({
    mutationFn: (id) => retirementApi.removeScenario(id),
    onSuccess: () => { qc.invalidateQueries({ queryKey: ["ret-scenarios"] }); toast.success("Scenario removed"); },
  });
  const rows = list.data || [];
  const [pinned, setPinned] = useState([]);
  const togglePin = (id) => setPinned((p) => p.includes(id) ? p.filter((x) => x !== id) : (p.length >= 2 ? [p[1], id] : [...p, id]));
  const pinnedRows = pinned.map((id) => rows.find((r) => r.id === id)).filter(Boolean);
  const CMP = [
    ["Portfolio @ retirement", (s) => money(s.summary?.portfolioAtRetirement || 0)],
    ["Estate at plan end", (s) => money(s.summary?.estateValueAtDeath || 0)],
    ["Guaranteed income", (s) => `${money(s.summary?.guaranteedIncomeAtRet || 0)}/yr`],
    ["Lifetime tax", (s) => money(s.summary?.lifetimeTaxPaid || 0)],
    ["Retirement age", (s) => s.inputs?.retirement_age],
    ["Province", (s) => s.inputs?.province],
    ["Expected return", (s) => `${s.inputs?.expected_return_pct}%`],
    ["Desired income", (s) => `${money(s.inputs?.desired_retirement_income || 0)}/yr`],
  ];

  return (
    <div>
      {!readOnly && (
        <Card className="p-5 mb-6 flex flex-wrap items-end gap-3" data-testid="scenario-save">
          <Field label="Scenario name" className="flex-1 min-w-[220px]">
            <Input value={name} onChange={(e) => setName(e.target.value)} placeholder="e.g. Retire at 62, aggressive" data-testid="scenario-name" />
          </Field>
          <Button onClick={() => name.trim() && save.mutate()} disabled={!name.trim() || save.isPending} data-testid="scenario-save-btn"><Save size={16} /> Save current inputs</Button>
        </Card>
      )}

      {pinnedRows.length === 2 && (
        <Card className="p-0 mb-6 overflow-hidden" data-testid="scenario-compare">
          <div className="px-6 py-4 border-b border-compass-border font-heading font-bold text-compass-navy">Comparing: {pinnedRows[0].name} vs {pinnedRows[1].name}</div>
          <table className="w-full text-sm">
            <tbody>
              {CMP.map(([label, fn]) => (
                <tr key={label} className="border-t border-compass-border/60">
                  <td className="px-4 py-2 text-compass-muted">{label}</td>
                  <td className="px-4 py-2 font-semibold text-compass-navy">{fn(pinnedRows[0])}</td>
                  <td className="px-4 py-2 font-semibold text-compass-navy">{fn(pinnedRows[1])}</td>
                </tr>
              ))}
            </tbody>
          </table>
        </Card>
      )}

      {rows.length === 0 ? (
        <Empty icon={Layers} title="No saved scenarios">Save a projection to compare retirement strategies side by side.</Empty>
      ) : (
        <div className="grid md:grid-cols-2 lg:grid-cols-3 gap-4" data-testid="scenario-list">
          {rows.map((s) => (
            <Card key={s.id} className={`p-5 ${pinned.includes(s.id) ? "ring-2 ring-compass-blue" : ""}`} data-testid={`scenario-${s.id}`}>
              <div className="flex items-start justify-between">
                <div className="font-heading font-bold text-compass-navy">{s.name}</div>
                <div className="flex items-center gap-1">
                  <button onClick={() => togglePin(s.id)} className={`text-xs font-semibold rounded-lg px-2 py-1 ${pinned.includes(s.id) ? "bg-compass-blue text-white" : "text-compass-blue hover:bg-compass-blue/10"}`} data-testid={`scenario-pin-${s.id}`}>{pinned.includes(s.id) ? "Pinned" : "Compare"}</button>
                  {!readOnly && <button onClick={() => del.mutate(s.id)} className="text-compass-red hover:bg-compass-red/10 rounded-lg p-1.5" data-testid={`scenario-del-${s.id}`}><Trash2 size={15} /></button>}
                </div>
              </div>
              <div className="text-xs text-compass-muted mb-3">Retire @ {s.inputs?.retirement_age} · {s.inputs?.province} · {s.inputs?.expected_return_pct}% return</div>
              <div className="space-y-1.5">
                <Row label="Portfolio @ retirement" value={money(s.summary?.portfolioAtRetirement || 0)} />
                <Row label="Estate at plan end" value={money(s.summary?.estateValueAtDeath || 0)} />
                <Row label="Guaranteed income" value={`${money(s.summary?.guaranteedIncomeAtRet || 0)}/yr`} />
                <Row label="Lifetime tax" value={money(s.summary?.lifetimeTaxPaid || 0)} />
              </div>
            </Card>
          ))}
        </div>
      )}
    </div>
  );
}
