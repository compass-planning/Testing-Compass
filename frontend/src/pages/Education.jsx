import React, { useState } from "react";
import { useMutation } from "@tanstack/react-query";
import { toast } from "sonner";
import { GraduationCap, Play, Gift, PiggyBank } from "lucide-react";
import { AreaChart, Area, XAxis, YAxis, Tooltip, ResponsiveContainer, CartesianGrid, Legend } from "recharts";
import { formatApiError } from "@/lib/api";
import { educationApi } from "@/lib/planning";
import { Card, Button, Input, Field, Badge, Stat, Progress } from "@/components/ui-kit";
import { PageHeader } from "@/components/PageHeader";
import { money } from "@/lib/format";

const DEFAULTS = {
  child_age: 3, current_savings: 5000, monthly_contribution: 200,
  growth_pct: 5, family_income: 90000, tuition_goal: 80000,
};

function Row({ label, value, strong }) {
  return (
    <div className="flex justify-between text-sm">
      <span className="text-compass-muted">{label}</span>
      <span className={strong ? "font-bold text-compass-navy" : "font-semibold text-compass-navy"}>{value}</span>
    </div>
  );
}

export default function Education() {
  const [inp, setInp] = useState(DEFAULTS);
  const [res, setRes] = useState(null);
  const num = (k) => (e) => setInp((s) => ({ ...s, [k]: Number(e.target.value || 0) }));
  const run = useMutation({
    mutationFn: () => educationApi.resp(inp),
    onSuccess: (d) => setRes(d),
    onError: (e) => toast.error(formatApiError(e.response?.data?.detail) || "Projection failed"),
  });
  const s = res?.summary;
  const chart = (res?.yearByYear || []).map((y) => ({ age: y.age, Balance: y.balance }));

  return (
    <div data-testid="education-page">
      <PageHeader title="Education (RESP)" subtitle="Project an RESP with CESG and CLB grants to fund post-secondary education." />

      <div className="grid lg:grid-cols-3 gap-6">
        <Card className="p-6 lg:col-span-2" data-testid="resp-inputs">
          <h3 className="font-heading font-bold text-compass-navy mb-4 flex items-center gap-2"><GraduationCap size={18} className="text-compass-blue" /> RESP inputs</h3>
          <div className="grid sm:grid-cols-3 gap-4">
            <Field label="Child's age"><Input type="number" value={inp.child_age} onChange={num("child_age")} data-testid="resp-child-age" /></Field>
            <Field label="Current RESP savings"><Input type="number" value={inp.current_savings} onChange={num("current_savings")} data-testid="resp-savings" /></Field>
            <Field label="Monthly contribution"><Input type="number" value={inp.monthly_contribution} onChange={num("monthly_contribution")} data-testid="resp-monthly" /></Field>
            <Field label="Expected growth (%)"><Input type="number" step="0.1" value={inp.growth_pct} onChange={num("growth_pct")} data-testid="resp-growth" /></Field>
            <Field label="Family net income"><Input type="number" value={inp.family_income} onChange={num("family_income")} data-testid="resp-income" /></Field>
            <Field label="Tuition goal (4 yrs)"><Input type="number" value={inp.tuition_goal} onChange={num("tuition_goal")} data-testid="resp-tuition" /></Field>
          </div>
          <Button className="mt-5" onClick={() => run.mutate()} disabled={run.isPending} data-testid="resp-run">
            <Play size={16} /> {run.isPending ? "Projecting…" : "Project RESP"}
          </Button>
          <p className="text-xs text-compass-muted mt-3">CESG matches 20% of contributions (max $500/yr, $7,200 lifetime). CLB adds up to $2,000 for eligible lower-income families with no contribution required. Illustrative — not financial advice.</p>
        </Card>

        <Card className="p-6" data-testid="resp-summary">
          <div className="muted-label">Projected at age 17</div>
          <div className="font-heading text-4xl font-extrabold gradient-text mt-1" data-testid="resp-projected">{s ? money(s.projectedValue) : "—"}</div>
          {s && (
            <>
              <div className="mt-4"><Badge color={s.clbEligible ? "#00A36C" : "#A3AED0"} bg={s.clbEligible ? "rgba(0,163,108,0.12)" : "rgba(163,174,208,0.15)"} data-testid="resp-clb-badge">{s.clbEligible ? "CLB eligible" : "CLB income-tested: not eligible"}</Badge></div>
              <div className="mt-4 space-y-2">
                <Row label="Your contributions" value={money(s.totalContributions)} />
                <Row label="CESG grants" value={money(s.totalCESG)} />
                <Row label="CLB grants" value={money(s.totalCLB)} />
                <Row label="Total free grants" value={money(s.totalGrants)} strong />
              </div>
              <div className="mt-4">
                <div className="flex justify-between text-xs text-compass-muted mb-1"><span>Tuition coverage</span><span data-testid="resp-coverage">{s.coveragePct}%</span></div>
                <Progress value={s.coveragePct} color={s.coveragePct >= 100 ? "#00DF89" : s.coveragePct >= 60 ? "#0052FF" : "#FFB800"} />
                {s.shortfall > 0 && <div className="text-xs text-compass-muted mt-1">Projected shortfall {money(s.shortfall)}</div>}
              </div>
            </>
          )}
          {!s && <p className="text-sm text-compass-muted mt-4">Enter the child's details and project the plan to see grants and growth.</p>}
        </Card>

        {res && (
          <>
            <div className="grid grid-cols-2 lg:grid-cols-4 gap-4 lg:col-span-3">
              <Stat label="Projected value" value={money(s.projectedValue)} accent />
              <Stat label="Free grants" value={money(s.totalGrants)} sub="CESG + CLB" />
              <Stat label="Years to maturity" value={s.yearsToMaturity} />
              <Stat label="Coverage" value={`${s.coveragePct}%`} />
            </div>

            <Card className="p-6 lg:col-span-3" data-testid="resp-chart">
              <h3 className="font-heading font-bold text-compass-navy mb-4 flex items-center gap-2"><PiggyBank size={18} className="text-compass-blue" /> RESP growth to age 17</h3>
              <ResponsiveContainer width="100%" height={280}>
                <AreaChart data={chart} margin={{ left: 8, right: 8, top: 8 }}>
                  <defs><linearGradient id="respfill" x1="0" y1="0" x2="0" y2="1"><stop offset="0%" stopColor="#0052FF" stopOpacity={0.35} /><stop offset="100%" stopColor="#0052FF" stopOpacity={0.02} /></linearGradient></defs>
                  <CartesianGrid strokeDasharray="3 3" stroke="#EDF1F7" vertical={false} />
                  <XAxis dataKey="age" tick={{ fill: "#A3AED0", fontSize: 11 }} axisLine={false} tickLine={false} />
                  <YAxis tickFormatter={(v) => `$${Math.round(v / 1000)}k`} tick={{ fill: "#A3AED0", fontSize: 11 }} axisLine={false} tickLine={false} width={48} />
                  <Tooltip formatter={(v) => money(v)} contentStyle={{ borderRadius: 12, border: "1px solid #E2E8F0" }} />
                  <Legend wrapperStyle={{ fontSize: 12 }} />
                  <Area type="monotone" dataKey="Balance" stroke="#0052FF" fill="url(#respfill)" strokeWidth={2} />
                </AreaChart>
              </ResponsiveContainer>
            </Card>

            <Card className="p-0 lg:col-span-3 overflow-hidden" data-testid="resp-table">
              <div className="px-6 py-4 border-b border-compass-border font-heading font-bold text-compass-navy flex items-center gap-2"><Gift size={16} className="text-compass-blue" /> Year-by-year grants</div>
              <div className="overflow-x-auto max-h-[360px]">
                <table className="w-full text-sm">
                  <thead className="bg-compass-bg/60 sticky top-0">
                    <tr className="text-left text-[11px] uppercase tracking-wide text-compass-muted">
                      {["Age", "Contribution", "CESG", "CLB", "Balance"].map((h) => <th key={h} className="px-4 py-2 font-semibold">{h}</th>)}
                    </tr>
                  </thead>
                  <tbody>
                    {res.yearByYear.map((y) => (
                      <tr key={y.age} className="border-t border-compass-border/60">
                        <td className="px-4 py-1.5 font-semibold text-compass-navy">{y.age}</td>
                        <td className="px-4 py-1.5">{money(y.contribution)}</td>
                        <td className="px-4 py-1.5 text-compass-blue">{money(y.cesg)}</td>
                        <td className="px-4 py-1.5 text-compass-green">{money(y.clb)}</td>
                        <td className="px-4 py-1.5 font-semibold">{money(y.balance)}</td>
                      </tr>
                    ))}
                  </tbody>
                </table>
              </div>
            </Card>
          </>
        )}
      </div>
    </div>
  );
}
