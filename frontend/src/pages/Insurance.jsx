import React, { useState } from "react";
import { useMutation, useQuery } from "@tanstack/react-query";
import { toast } from "sonner";
import { Shield, HeartPulse, Home, Play, Umbrella } from "lucide-react";
import api, { formatApiError } from "@/lib/api";
import { protectionApi, planApi } from "@/lib/planning";
import { Card, Button, Input, Field, Select, Badge, Stat } from "@/components/ui-kit";
import { PageHeader } from "@/components/PageHeader";
import { useTr } from "@/lib/i18n";
import { money } from "@/lib/format";
import { TAX_PROVINCES } from "@/lib/tax";

const TABS = [
  { key: "life", label: "Life Needs", icon: Shield },
  { key: "di", label: "Disability", icon: HeartPulse },
  { key: "ltc", label: "Long-Term Care", icon: Home },
];

function Row({ label, value, strong }) {
  return <div className="flex justify-between text-sm"><span className="text-compass-muted">{label}</span><span className={strong ? "font-bold text-compass-navy" : "font-semibold text-compass-navy"}>{value}</span></div>;
}

function SaveBtn({ name, summary }) {
  const tr = useTr();
  const save = useMutation({ mutationFn: () => planApi.create("protection", { name, ...summary }), onSuccess: () => toast.success("Saved to household plan"), onError: (e) => toast.error(formatApiError(e.response?.data?.detail) || "Open a household first") });
  return <Button variant="outline" size="sm" className="mt-3" onClick={() => save.mutate()} disabled={save.isPending} data-testid={`save-${summary.kind}`}>{tr("Save to household")}</Button>;
}

export default function Insurance() {
  const [tab, setTab] = useState("life");
  const tr = useTr();
  return (
    <div data-testid="insurance-page">
      <PageHeader title="Insurance & Protection" subtitle="Life-insurance needs analysis, disability and long-term-care planning.">
        <Badge color="#A3AED0" bg="rgba(163,174,208,0.15)">Illustrative</Badge>
      </PageHeader>
      <div className="flex gap-1 mb-6 border-b border-compass-border overflow-x-auto">
        {TABS.map((t) => (
          <button key={t.key} onClick={() => setTab(t.key)} data-testid={`insurance-tab-${t.key}`}
            className={`flex items-center gap-2 px-4 py-2.5 text-sm font-semibold border-b-2 -mb-px whitespace-nowrap transition-colors ${tab === t.key ? "border-compass-blue text-compass-blue" : "border-transparent text-compass-muted hover:text-compass-navy"}`}>
            <t.icon size={16} /> {tr(t.label)}
          </button>
        ))}
      </div>
      {tab === "life" && <LifeTab />}
      {tab === "di" && <DiTab />}
      {tab === "ltc" && <LtcTab />}
    </div>
  );
}

function LifeTab() {
  const [f, setF] = useState({ annualIncome: 100000, personalConsumptionRate: 0.30, workingYearsRemaining: 20,
    mortgageBalance: 300000, totalDebts: 40000, educationFundTarget: 100000, finalExpenses: 25000,
    existingLifeCoverage: 250000, existingAssets: 150000, discountRate: 0.04, withdrawalRate: 0.04,
    diReplacementRate: 0.70, cppDisabilityBenefit: 0, existingDisabilityCoverage: 0,
    existingCriticalIllnessCoverage: 0, uncoveredTreatmentCosts: 50000, preferredMethod: "dime" });
  const n = (k) => (e) => setF({ ...f, [k]: Number(e.target.value || 0) });
  const run = useMutation({ mutationFn: () => protectionApi.life(f), onError: (e) => toast.error(formatApiError(e.response?.data?.detail) || "Analysis failed") });
  const r = run.data;
  const METHODS = [{ v: "dime", l: "DIME" }, { v: "humanLifeValue", l: "Human Life Value" }, { v: "capitalRetention", l: "Capital Retention" }];
  return (
    <div className="grid lg:grid-cols-3 gap-6">
      <Card className="p-6 lg:col-span-2">
        <h3 className="font-heading font-bold text-compass-navy mb-4 flex items-center gap-2"><Umbrella size={18} className="text-compass-blue" /> Household & coverage</h3>
        <div className="grid sm:grid-cols-3 gap-4">
          <Field label="Annual income"><Input type="number" value={f.annualIncome} onChange={n("annualIncome")} data-testid="life-income" /></Field>
          <Field label="Working years remaining"><Input type="number" value={f.workingYearsRemaining} onChange={n("workingYearsRemaining")} data-testid="life-years" /></Field>
          <Field label="Personal consumption rate"><Input type="number" step="0.05" value={f.personalConsumptionRate} onChange={n("personalConsumptionRate")} data-testid="life-consumption" /></Field>
          <Field label="Mortgage balance"><Input type="number" value={f.mortgageBalance} onChange={n("mortgageBalance")} data-testid="life-mortgage" /></Field>
          <Field label="Other debts"><Input type="number" value={f.totalDebts} onChange={n("totalDebts")} data-testid="life-debts" /></Field>
          <Field label="Education fund target"><Input type="number" value={f.educationFundTarget} onChange={n("educationFundTarget")} data-testid="life-education" /></Field>
          <Field label="Final expenses"><Input type="number" value={f.finalExpenses} onChange={n("finalExpenses")} data-testid="life-final" /></Field>
          <Field label="Existing life coverage"><Input type="number" value={f.existingLifeCoverage} onChange={n("existingLifeCoverage")} data-testid="life-existing" /></Field>
          <Field label="Liquid assets"><Input type="number" value={f.existingAssets} onChange={n("existingAssets")} data-testid="life-assets" /></Field>
          <Field label="Discount rate (HLV)"><Input type="number" step="0.005" value={f.discountRate} onChange={n("discountRate")} data-testid="life-discount" /></Field>
          <Field label="Withdrawal rate (Cap. Retention)"><Input type="number" step="0.005" value={f.withdrawalRate} onChange={n("withdrawalRate")} data-testid="life-withdrawal" /></Field>
          <Field label="Preferred method"><Select value={f.preferredMethod} onChange={(e) => setF({ ...f, preferredMethod: e.target.value })} data-testid="life-method">{METHODS.map((m) => <option key={m.v} value={m.v}>{m.l}</option>)}</Select></Field>
        </div>
        <Button className="mt-5" onClick={() => run.mutate()} disabled={run.isPending} data-testid="life-run"><Play size={16} /> {run.isPending ? "Analyzing…" : "Analyze needs"}</Button>
      </Card>
      <Card className="p-6" data-testid="life-result">
        <div className="muted-label">Recommended life coverage</div>
        <div className="font-heading text-4xl font-extrabold gradient-text mt-1" data-testid="life-recommended">{r ? money(r.recommendedLifeCoverage) : "—"}</div>
        {r && (
          <div className="mt-5 space-y-2">
            <Row label="Coverage gap" value={money(r.lifeCoverageGap)} strong />
            <div className="border-t border-compass-border my-2 pt-2 muted-label">By method</div>
            <Row label="DIME" value={money(r.dime.totalNeed)} />
            <Row label="Human Life Value" value={money(r.humanLifeValue.totalNeed)} />
            <Row label="Capital Retention" value={money(r.capitalRetention.totalNeed)} />
            <div className="border-t border-compass-border my-2 pt-2 muted-label">Other gaps</div>
            <Row label="Disability monthly gap" value={`${money(r.diGap.monthlyGap)}/mo`} />
            <Row label="Critical illness gap" value={money(r.ciGap.gap)} />
            <SaveBtn name="Life insurance needs" summary={{ kind: "life", recommended_coverage: r.recommendedLifeCoverage, life_gap: r.lifeCoverageGap, method: r.selectedMethod }} />
          </div>
        )}
        {!r && <p className="text-sm text-compass-muted mt-3">Enter the household profile and analyze to compare DIME, Human Life Value and Capital Retention.</p>}
      </Card>
    </div>
  );
}

function DiTab() {
  const [f, setF] = useState({ currentAge: 40, province: "ON", grossMonthlyIncome: 8000, occupationClass: "3A",
    definition: "own_occ", waitingPeriodDays: 90, benefitPeriod: "age65", groupDiMonthly: 4000,
    groupDiEmployerPaid: true, individualDiMonthly: 0, cppDisabilityMonthly: 0, partialDisabilityPct: 0.5, colaPct: 0.02 });
  const n = (k) => (e) => setF({ ...f, [k]: Number(e.target.value || 0) });
  const s = (k) => (e) => setF({ ...f, [k]: e.target.value });
  const run = useMutation({ mutationFn: () => protectionApi.di(f), onError: () => toast.error("Analysis failed") });
  const r = run.data;
  return (
    <div className="grid lg:grid-cols-3 gap-6">
      <Card className="p-6 lg:col-span-2">
        <h3 className="font-heading font-bold text-compass-navy mb-4">Disability income inputs</h3>
        <div className="grid sm:grid-cols-3 gap-4">
          <Field label="Current age"><Input type="number" value={f.currentAge} onChange={n("currentAge")} data-testid="di-age" /></Field>
          <Field label="Province"><Select value={f.province} onChange={s("province")} data-testid="di-province">{TAX_PROVINCES.map((p) => <option key={p}>{p}</option>)}</Select></Field>
          <Field label="Gross monthly income"><Input type="number" value={f.grossMonthlyIncome} onChange={n("grossMonthlyIncome")} data-testid="di-income" /></Field>
          <Field label="Occupation class"><Select value={f.occupationClass} onChange={s("occupationClass")} data-testid="di-occ">{["4A", "3A", "2A", "A", "B"].map((o) => <option key={o}>{o}</option>)}</Select></Field>
          <Field label="Definition"><Select value={f.definition} onChange={s("definition")} data-testid="di-def"><option value="own_occ">Own occupation</option><option value="any_occ">Any occupation</option></Select></Field>
          <Field label="Benefit period"><Select value={f.benefitPeriod} onChange={s("benefitPeriod")} data-testid="di-period">{["2yr", "5yr", "10yr", "age65", "age70"].map((b) => <option key={b}>{b}</option>)}</Select></Field>
          <Field label="Group DI ($/mo)"><Input type="number" value={f.groupDiMonthly} onChange={n("groupDiMonthly")} data-testid="di-group" /></Field>
          <Field label="Group employer-paid?"><Select value={f.groupDiEmployerPaid ? "yes" : "no"} onChange={(e) => setF({ ...f, groupDiEmployerPaid: e.target.value === "yes" })} data-testid="di-employer"><option value="yes">Yes (taxable)</option><option value="no">No (tax-free)</option></Select></Field>
          <Field label="Individual DI ($/mo)"><Input type="number" value={f.individualDiMonthly} onChange={n("individualDiMonthly")} data-testid="di-individual" /></Field>
        </div>
        <Button className="mt-5" onClick={() => run.mutate()} disabled={run.isPending} data-testid="di-run"><Play size={16} /> {run.isPending ? "Analyzing…" : "Analyze DI gap"}</Button>
      </Card>
      <Card className="p-6" data-testid="di-result">
        <div className="muted-label">Monthly coverage gap</div>
        <div className="font-heading text-4xl font-extrabold gradient-text mt-1" data-testid="di-gap">{r ? `${money(r.coverageGap)}/mo` : "—"}</div>
        {r && (
          <div className="mt-2">
            <Badge color={r.isAdequate ? "#00DF89" : "#EE5D50"} bg={r.isAdequate ? "rgba(0,223,137,0.12)" : "rgba(238,93,80,0.12)"}>{r.replacementRatio}% replacement</Badge>
            <div className="mt-4 space-y-2">
              <Row label="Target (70%)" value={`${money(r.targetMonthlyBenefit)}/mo`} />
              <Row label="Existing after-tax" value={`${money(r.existing.totalAfterTax)}/mo`} />
              <Row label="Group after tax" value={`${money(r.existing.groupAfterTax)}/mo`} />
              <Row label="Own-occ claim prob" value={`${Math.round(r.claimProbability.ownOcc * 100)}%`} />
              <p className="text-xs text-compass-muted mt-2">{r.taxTreatment.recommendation}</p>
              <SaveBtn name="Disability income" summary={{ kind: "di", di_monthly_gap: r.coverageGap, replacement_ratio: r.replacementRatio }} />
            </div>
          </div>
        )}
        {!r && <p className="text-sm text-compass-muted mt-3">Analyze to see your income-replacement gap and the tax treatment of group vs individual DI.</p>}
      </Card>
    </div>
  );
}

function LtcTab() {
  const [f, setF] = useState({ currentAge: 55, province: "ON", dailyBenefit: 200, poolYears: 5,
    eliminationDays: 90, inflationProtection: "3pct", estAnnualPremium: 0, careCostInflation: 0.04,
    estClaimAge: 82, careLevel: "semi_private" });
  const n = (k) => (e) => setF({ ...f, [k]: Number(e.target.value || 0) });
  const s = (k) => (e) => setF({ ...f, [k]: e.target.value });
  const run = useMutation({ mutationFn: () => protectionApi.ltc(f), onError: () => toast.error("Analysis failed") });
  const r = run.data;
  return (
    <div className="grid lg:grid-cols-3 gap-6">
      <Card className="p-6 lg:col-span-2">
        <h3 className="font-heading font-bold text-compass-navy mb-4">Long-term care inputs</h3>
        <div className="grid sm:grid-cols-3 gap-4">
          <Field label="Current age"><Input type="number" value={f.currentAge} onChange={n("currentAge")} data-testid="ltc-age" /></Field>
          <Field label="Province"><Select value={f.province} onChange={s("province")} data-testid="ltc-province">{TAX_PROVINCES.map((p) => <option key={p}>{p}</option>)}</Select></Field>
          <Field label="Care level"><Select value={f.careLevel} onChange={s("careLevel")} data-testid="ltc-level"><option value="basic">Basic</option><option value="semi_private">Semi-private</option><option value="private">Private</option></Select></Field>
          <Field label="Daily benefit ($)"><Input type="number" value={f.dailyBenefit} onChange={n("dailyBenefit")} data-testid="ltc-daily" /></Field>
          <Field label="Benefit pool (years)"><Select value={String(f.poolYears)} onChange={(e) => setF({ ...f, poolYears: Number(e.target.value) })} data-testid="ltc-pool">{[3, 5, 10].map((p) => <option key={p} value={p}>{p}</option>)}</Select></Field>
          <Field label="Elimination (days)"><Select value={String(f.eliminationDays)} onChange={(e) => setF({ ...f, eliminationDays: Number(e.target.value) })} data-testid="ltc-elim">{[0, 30, 60, 90, 180, 365].map((d) => <option key={d} value={d}>{d}</option>)}</Select></Field>
          <Field label="Inflation protection"><Select value={f.inflationProtection} onChange={s("inflationProtection")} data-testid="ltc-inflation"><option value="none">None</option><option value="3pct">3%</option><option value="5pct">5%</option><option value="cpi">CPI</option></Select></Field>
          <Field label="Est. claim age"><Input type="number" value={f.estClaimAge} onChange={n("estClaimAge")} data-testid="ltc-claim-age" /></Field>
          <Field label="Est. annual premium (0=auto)"><Input type="number" value={f.estAnnualPremium} onChange={n("estAnnualPremium")} data-testid="ltc-premium" /></Field>
        </div>
        <Button className="mt-5" onClick={() => run.mutate()} disabled={run.isPending} data-testid="ltc-run"><Play size={16} /> {run.isPending ? "Analyzing…" : "Analyze LTC plan"}</Button>
      </Card>
      <Card className="p-6" data-testid="ltc-result">
        <div className="muted-label">Total benefit pool</div>
        <div className="font-heading text-4xl font-extrabold gradient-text mt-1" data-testid="ltc-pool-value">{r ? money(r.totalPoolDollars) : "—"}</div>
        {r && (
          <div className="mt-5 space-y-2">
            <Row label="Daily benefit at claim" value={`${money(r.dailyBenefitAtClaim)}/day`} />
            <Row label="Pool lasts (80% util)" value={`${r.poolDuration.at80pctRate} yrs`} />
            <Row label="Elimination out-of-pocket" value={money(r.eliminationCost)} />
            <Row label="Est. annual premium" value={money(r.estAnnualPremium)} />
            <Row label="Premiums to claim age" value={money(r.totalPremiumsToClaimAge)} />
            <Row label="Break-even age" value={r.breakEvenAge < 999 ? r.breakEvenAge : "—"} strong />
            {r.adequacyGap > 0 && <Row label="Adequacy gap (vs provincial)" value={`${money(r.adequacyGap)}/day`} />}
            <SaveBtn name="Long-term care" summary={{ kind: "ltc", ltc_gap: r.adequacyGap, pool_dollars: r.totalPoolDollars, break_even_age: r.breakEvenAge }} />
          </div>
        )}
        {!r && <p className="text-sm text-compass-muted mt-3">Model the benefit pool, elimination-period cost and self-insure break-even for long-term care.</p>}
      </Card>
    </div>
  );
}
