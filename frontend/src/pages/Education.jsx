import React, { useState } from "react";
import { useMutation } from "@tanstack/react-query";
import { toast } from "sonner";
import { GraduationCap, Play, Gift, PiggyBank, Target, Plus, Trash2, Users } from "lucide-react";
import { AreaChart, Area, XAxis, YAxis, Tooltip, ResponsiveContainer, CartesianGrid } from "recharts";
import api, { formatApiError } from "@/lib/api";
import { educationApi } from "@/lib/planning";
import { Card, Button, Input, Field, Badge, Stat, Progress } from "@/components/ui-kit";
import { PageHeader } from "@/components/PageHeader";
import { money } from "@/lib/format";

let CID = 0;
const newChild = (name) => ({ id: ++CID, name: name || "Child", child_age: 3, current_savings: 5000, monthly_contribution: 200, growth_pct: 5, tuition_goal: 80000 });

export default function Education() {
  const [familyIncome, setFamilyIncome] = useState(90000);
  const [children, setChildren] = useState([newChild("First child")]);
  const [results, setResults] = useState({}); // id -> resp result

  const setChild = (id, k, v) => setChildren((cs) => cs.map((c) => (c.id === id ? { ...c, [k]: v } : c)));
  const addChild = () => setChildren((cs) => [...cs, newChild(`Child ${cs.length + 1}`)]);
  const removeChild = (id) => { setChildren((cs) => cs.filter((c) => c.id !== id)); setResults((r) => { const n = { ...r }; delete n[id]; return n; }); };

  const run = useMutation({
    mutationFn: async () => {
      const out = {};
      for (const c of children) {
        out[c.id] = await educationApi.resp({
          child_age: c.child_age, current_savings: c.current_savings, monthly_contribution: c.monthly_contribution,
          growth_pct: c.growth_pct, family_income: familyIncome, tuition_goal: c.tuition_goal,
        });
      }
      return out;
    },
    onSuccess: (out) => setResults(out),
    onError: (e) => toast.error(formatApiError(e.response?.data?.detail) || "Projection failed"),
  });

  const saveGoals = useMutation({
    mutationFn: async () => {
      let n = 0;
      for (const c of children) {
        if (!results[c.id]) continue;
        await api.post("/goals", {
          title: `Education fund — ${c.name}`, category: "education",
          target_amount: Number(c.tuition_goal || 0), current_amount: Number(c.current_savings || 0),
          target_year: new Date().getFullYear() + Math.max(0, 18 - Number(c.child_age || 0)),
          monthly_contribution: Number(c.monthly_contribution || 0), growth_rate: Number(c.growth_pct || 0),
        });
        n++;
      }
      return n;
    },
    onSuccess: (n) => toast.success(`${n} education goal${n === 1 ? "" : "s"} saved — view them in Goals`),
    onError: (e) => toast.error(formatApiError(e.response?.data?.detail) || "Could not save goals"),
  });

  const resList = children.map((c) => results[c.id]).filter(Boolean);
  const combined = resList.length ? {
    projectedValue: resList.reduce((s, r) => s + r.summary.projectedValue, 0),
    totalGrants: resList.reduce((s, r) => s + r.summary.totalGrants, 0),
    totalContributions: resList.reduce((s, r) => s + r.summary.totalContributions, 0),
    tuitionGoal: resList.reduce((s, r) => s + r.summary.tuitionGoal, 0),
  } : null;
  const combinedCoverage = combined && combined.tuitionGoal ? Math.round(Math.min(100, combined.projectedValue / combined.tuitionGoal * 100)) : 0;

  // combined chart aligned on years-from-now (index into each child's yearByYear)
  const maxLen = Math.max(0, ...resList.map((r) => r.yearByYear.length));
  const chart = Array.from({ length: maxLen }, (_, i) => ({
    year: new Date().getFullYear() + i,
    Balance: resList.reduce((s, r) => s + (r.yearByYear[i]?.balance || r.yearByYear[r.yearByYear.length - 1]?.balance || 0), 0),
  }));

  return (
    <div data-testid="education-page">
      <PageHeader title="Education (RESP)" subtitle="Plan an RESP for each child with CESG and CLB grants, then save them as goals.">
        <Button variant="outline" onClick={addChild} data-testid="resp-add-child"><Plus size={16} /> Add child</Button>
      </PageHeader>

      <Card className="p-5 mb-6" data-testid="resp-family">
        <div className="grid sm:grid-cols-2 gap-4 items-end">
          <Field label="Family net income (for CLB eligibility)"><Input type="number" value={familyIncome} onChange={(e) => setFamilyIncome(Number(e.target.value || 0))} data-testid="resp-income" /></Field>
          <div className="flex gap-2">
            <Button className="flex-1" onClick={() => run.mutate()} disabled={run.isPending} data-testid="resp-run"><Play size={16} /> {run.isPending ? "Projecting…" : `Project ${children.length} child${children.length === 1 ? "" : "ren"}`}</Button>
            {resList.length > 0 && <Button variant="outline" onClick={() => saveGoals.mutate()} disabled={saveGoals.isPending} data-testid="resp-save-goals"><Target size={15} /> Save as goals</Button>}
          </div>
        </div>
        <p className="text-xs text-compass-muted mt-3">CESG matches 20% of contributions (max $500/yr, $7,200 lifetime per child). CLB adds up to $2,000 for eligible lower-income families. Illustrative — not financial advice.</p>
      </Card>

      {combined && (
        <div className="grid grid-cols-2 lg:grid-cols-4 gap-4 mb-6" data-testid="resp-combined">
          <Stat label="Combined projected value" value={money(combined.projectedValue)} accent sub={`${children.length} children`} />
          <Stat label="Total free grants" value={money(combined.totalGrants)} sub="CESG + CLB" />
          <Stat label="Your contributions" value={money(combined.totalContributions)} />
          <Stat label="Combined coverage" value={`${combinedCoverage}%`} />
        </div>
      )}

      <div className="grid lg:grid-cols-2 gap-6">
        {children.map((c) => {
          const s = results[c.id]?.summary;
          return (
            <Card key={c.id} className="p-6" data-testid={`resp-child-${c.id}`}>
              <div className="flex items-center justify-between mb-4">
                <div className="flex items-center gap-2 flex-1 min-w-0">
                  <GraduationCap size={18} className="text-compass-blue shrink-0" />
                  <Input value={c.name} onChange={(e) => setChild(c.id, "name", e.target.value)} className="font-semibold" data-testid={`resp-name-${c.id}`} />
                </div>
                {children.length > 1 && <button onClick={() => removeChild(c.id)} className="text-compass-red hover:bg-compass-red/10 rounded-lg p-1.5 ml-2" data-testid={`resp-remove-${c.id}`}><Trash2 size={15} /></button>}
              </div>
              <div className="grid grid-cols-2 gap-3">
                <Field label="Child's age"><Input type="number" value={c.child_age} onChange={(e) => setChild(c.id, "child_age", Number(e.target.value || 0))} data-testid={`resp-age-${c.id}`} /></Field>
                <Field label="Current savings"><Input type="number" value={c.current_savings} onChange={(e) => setChild(c.id, "current_savings", Number(e.target.value || 0))} data-testid={`resp-savings-${c.id}`} /></Field>
                <Field label="Monthly contribution"><Input type="number" value={c.monthly_contribution} onChange={(e) => setChild(c.id, "monthly_contribution", Number(e.target.value || 0))} data-testid={`resp-monthly-${c.id}`} /></Field>
                <Field label="Growth (%)"><Input type="number" step="0.1" value={c.growth_pct} onChange={(e) => setChild(c.id, "growth_pct", Number(e.target.value || 0))} /></Field>
                <Field label="Tuition goal (4 yrs)"><Input type="number" value={c.tuition_goal} onChange={(e) => setChild(c.id, "tuition_goal", Number(e.target.value || 0))} data-testid={`resp-tuition-${c.id}`} /></Field>
              </div>
              {s && (
                <div className="mt-4 pt-4 border-t border-compass-border">
                  <div className="flex items-end justify-between">
                    <div><div className="muted-label">Projected at 17</div><div className="font-heading text-2xl font-extrabold gradient-text" data-testid={`resp-projected-${c.id}`}>{money(s.projectedValue)}</div></div>
                    <Badge color={s.clbEligible ? "#00A36C" : "#A3AED0"} bg={s.clbEligible ? "rgba(0,163,108,0.12)" : "rgba(163,174,208,0.15)"} data-testid={`resp-clb-${c.id}`}>{s.clbEligible ? "CLB eligible" : "CLB not eligible"}</Badge>
                  </div>
                  <div className="grid grid-cols-3 gap-2 mt-3 text-center text-xs">
                    <div><div className="text-compass-muted">CESG</div><div className="font-semibold text-compass-blue">{money(s.totalCESG)}</div></div>
                    <div><div className="text-compass-muted">CLB</div><div className="font-semibold text-compass-green">{money(s.totalCLB)}</div></div>
                    <div><div className="text-compass-muted">Coverage</div><div className="font-semibold text-compass-navy" data-testid={`resp-coverage-${c.id}`}>{s.coveragePct}%</div></div>
                  </div>
                  <Progress className="mt-2" value={s.coveragePct} color={s.coveragePct >= 100 ? "#00DF89" : s.coveragePct >= 60 ? "#0052FF" : "#FFB800"} />
                </div>
              )}
            </Card>
          );
        })}
      </div>

      {chart.length > 0 && (
        <Card className="p-6 mt-6" data-testid="resp-chart">
          <h3 className="font-heading font-bold text-compass-navy mb-4 flex items-center gap-2"><Users size={18} className="text-compass-blue" /> Combined RESP growth</h3>
          <ResponsiveContainer width="100%" height={280}>
            <AreaChart data={chart} margin={{ left: 8, right: 8, top: 8 }}>
              <defs><linearGradient id="respfill" x1="0" y1="0" x2="0" y2="1"><stop offset="0%" stopColor="#0052FF" stopOpacity={0.35} /><stop offset="100%" stopColor="#0052FF" stopOpacity={0.02} /></linearGradient></defs>
              <CartesianGrid strokeDasharray="3 3" stroke="#EDF1F7" vertical={false} />
              <XAxis dataKey="year" tick={{ fill: "#A3AED0", fontSize: 11 }} axisLine={false} tickLine={false} />
              <YAxis tickFormatter={(v) => `$${Math.round(v / 1000)}k`} tick={{ fill: "#A3AED0", fontSize: 11 }} axisLine={false} tickLine={false} width={48} />
              <Tooltip formatter={(v) => money(v)} contentStyle={{ borderRadius: 12, border: "1px solid #E2E8F0" }} />
              <Area type="monotone" dataKey="Balance" stroke="#0052FF" fill="url(#respfill)" strokeWidth={2} name="Combined balance" />
            </AreaChart>
          </ResponsiveContainer>
          <p className="text-xs text-compass-muted mt-2 flex items-center gap-1.5"><Gift size={13} className="text-compass-blue" /> Combined across all children by calendar year.</p>
        </Card>
      )}
    </div>
  );
}
