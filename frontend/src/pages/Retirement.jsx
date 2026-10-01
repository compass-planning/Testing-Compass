import React, { useState, useMemo } from "react";
import { useQuery, useMutation, useQueryClient } from "@tanstack/react-query";
import { toast } from "sonner";
import { PiggyBank, Plus, Trash2, Calculator, Dice5 } from "lucide-react";
import { planApi } from "@/lib/planning";
import { Card, Button, Input, Field, Select, Badge, Empty } from "@/components/ui-kit";
import { PageHeader } from "@/components/PageHeader";
import { money } from "@/lib/format";
import { monteCarlo } from "@/lib/finance";

const PENSION_TYPES = ["None", "DBPP", "DCPP", "Group RRSP"];

export default function Retirement() {
  const qc = useQueryClient();
  const [inp, setInp] = useState({
    current: 114700, annual: 14500, years: 25, rate: 5.5, volatility: 10, inflation: 2.1,
    retire_age: 65, monthly_income_goal: 4500,
    pension_type: "None", pension_income: 0, pension_indexing: 0, other_income: 0,
  });
  const num = (k) => (e) => setInp({ ...inp, [k]: Number(e.target.value || 0) });
  const str = (k) => (e) => setInp({ ...inp, [k]: e.target.value });

  const { data = [] } = useQuery({ queryKey: ["plan", "retirement"], queryFn: () => planApi.list("retirement") });
  const save = useMutation({
    mutationFn: (body) => planApi.create("retirement", body),
    onSuccess: () => { toast.success("Projection saved"); qc.invalidateQueries({ queryKey: ["plan", "retirement"] }); qc.invalidateQueries({ queryKey: ["plan", "overview"] }); },
  });
  const del = useMutation({
    mutationFn: (id) => planApi.remove("retirement", id),
    onSuccess: () => { toast.success("Deleted"); qc.invalidateQueries({ queryKey: ["plan", "retirement"] }); },
  });

  const isDB = inp.pension_type === "DBPP";

  const mc = useMemo(() => monteCarlo({
    current: inp.current, annualContribution: inp.annual, yearsToRetire: inp.years, retireAge: inp.retire_age,
    meanReturn: inp.rate, volatility: inp.volatility, inflation: inp.inflation, monthlyGoal: inp.monthly_income_goal,
    pensionIncome: isDB ? inp.pension_income : 0, pensionIndexing: isDB ? inp.pension_indexing : 0,
    otherIncome: inp.other_income, trials: 1000,
  }), [inp, isDB]);

  const sustainableMonthly = (mc.nestEgg * 0.04) / 12;
  const band = mc.successProb >= 80 ? { label: "High confidence", color: "#00DF89", bg: "rgba(0,223,137,0.12)" }
    : mc.successProb >= 60 ? { label: "Moderate", color: "#FFB800", bg: "rgba(255,184,0,0.14)" }
    : { label: "At risk", color: "#EE5D50", bg: "rgba(238,93,80,0.12)" };

  return (
    <div>
      <PageHeader title="Retirement" subtitle="Model pension income and run a Monte Carlo simulation to age 95." />
      <div className="grid lg:grid-cols-3 gap-6">
        <Card className="p-6 lg:col-span-2">
          <h3 className="font-heading font-bold text-compass-navy mb-4 flex items-center gap-2"><Calculator size={18} className="text-compass-blue" /> Projection inputs</h3>
          <div className="grid sm:grid-cols-3 gap-4">
            <Field label="Current savings"><Input type="number" value={inp.current} onChange={num("current")} data-testid="ret-current" /></Field>
            <Field label="Annual contribution"><Input type="number" value={inp.annual} onChange={num("annual")} data-testid="ret-annual" /></Field>
            <Field label="Years to retirement"><Input type="number" value={inp.years} onChange={num("years")} data-testid="ret-years" /></Field>
            <Field label="Expected return (%)"><Input type="number" step="0.1" value={inp.rate} onChange={num("rate")} data-testid="ret-rate" /></Field>
            <Field label="Volatility (%)"><Input type="number" step="0.1" value={inp.volatility} onChange={num("volatility")} data-testid="ret-volatility" /></Field>
            <Field label="Inflation (%)"><Input type="number" step="0.1" value={inp.inflation} onChange={num("inflation")} data-testid="ret-inflation" /></Field>
            <Field label="Retirement age"><Input type="number" value={inp.retire_age} onChange={num("retire_age")} data-testid="ret-age" /></Field>
            <Field label="Monthly income goal"><Input type="number" value={inp.monthly_income_goal} onChange={num("monthly_income_goal")} data-testid="ret-goal" /></Field>
            <Field label="Other guaranteed income ($/yr)"><Input type="number" value={inp.other_income} onChange={num("other_income")} data-testid="ret-other" /></Field>
          </div>

          <div className="border-t border-compass-border mt-5 pt-5">
            <h4 className="font-heading font-bold text-compass-navy mb-3">Pension plan</h4>
            <div className="grid sm:grid-cols-3 gap-4">
              <Field label="Plan type"><Select value={inp.pension_type} onChange={str("pension_type")} data-testid="ret-pension-type">{PENSION_TYPES.map((p) => <option key={p}>{p}</option>)}</Select></Field>
              {isDB ? (
                <>
                  <Field label="Annual pension at retirement"><Input type="number" value={inp.pension_income} onChange={num("pension_income")} data-testid="ret-pension-income" /></Field>
                  <Field label="Indexing (%/yr)"><Input type="number" step="0.1" value={inp.pension_indexing} onChange={num("pension_indexing")} data-testid="ret-pension-indexing" /></Field>
                </>
              ) : inp.pension_type !== "None" ? (
                <div className="sm:col-span-2 flex items-end">
                  <p className="text-sm text-compass-muted pb-2.5">{inp.pension_type} is a capital-accumulation plan — include its balance in <b>Current savings</b> and employer + employee contributions in <b>Annual contribution</b> above.</p>
                </div>
              ) : null}
            </div>
          </div>

          <Button className="mt-5" data-testid="ret-save" disabled={save.isPending}
            onClick={() => save.mutate({
              name: `${inp.pension_type} @ ${inp.rate}%`, retire_age: inp.retire_age,
              monthly_income_goal: inp.monthly_income_goal, pension_type: inp.pension_type,
              result: mc.successProb >= 80 ? "On track" : mc.successProb >= 60 ? "Moderate" : "Shortfall",
              success_prob: mc.successProb, nest_egg: Math.round(mc.nestEgg),
              note: `${mc.successProb}% success · MC ${mc.trials} trials to age 95`,
            })}>
            <Plus size={16} /> Save projection
          </Button>
        </Card>

        <Card className="p-6" data-testid="mc-result">
          <div className="flex items-center gap-2 mb-1"><Dice5 size={16} className="text-compass-blue" /><div className="muted-label">Monte Carlo (to age 95)</div></div>
          <div className="font-heading text-5xl font-extrabold gradient-text mt-2" data-testid="mc-success">{mc.successProb}%</div>
          <div className="text-sm text-compass-muted mb-3">success across {mc.trials} trials</div>
          <Badge color={band.color} bg={band.bg} data-testid="mc-band">{band.label}</Badge>

          <div className="mt-5 space-y-2 text-sm">
            <Row label="Projected nest egg" value={money(mc.nestEgg)} />
            <Row label="Sustainable income" value={`${money(sustainableMonthly)}/mo`} />
            <Row label="Income goal" value={`${money(inp.monthly_income_goal)}/mo`} />
          </div>
          <div className="mt-4 border-t border-compass-border pt-3 space-y-2 text-sm">
            <div className="muted-label mb-1">Ending balance at age 95</div>
            <Row label="Pessimistic (10th)" value={money(mc.p10)} />
            <Row label="Median (50th)" value={money(mc.p50)} />
            <Row label="Optimistic (90th)" value={money(mc.p90)} />
          </div>
          <p className="text-xs text-compass-muted mt-3">Randomised annual returns (mean {inp.rate}%, volatility {inp.volatility}%), goal inflated at {inp.inflation}%. Illustrative only.</p>
        </Card>
      </div>

      <h3 className="font-heading font-bold text-compass-navy mt-8 mb-3">Saved projections</h3>
      {data.length === 0 ? (
        <Empty icon={PiggyBank} title="No saved projections">Run the simulation and save a scenario.</Empty>
      ) : (
        <div className="grid md:grid-cols-2 gap-4">
          {data.map((p) => (
            <Card key={p.id} className="p-5 flex items-center justify-between" data-testid={`retirement-row-${p.id}`}>
              <div>
                <div className="font-heading font-bold text-compass-navy">{p.name}</div>
                <div className="text-xs text-compass-muted mt-0.5">
                  Retire at {p.retire_age} · goal {money(p.monthly_income_goal)}/mo
                  {p.success_prob != null ? ` · ${p.success_prob}% success` : ""}
                  {p.nest_egg ? ` · ${money(p.nest_egg)}` : ""}
                </div>
              </div>
              <div className="flex items-center gap-2">
                <Badge color={p.result === "On track" ? "#00DF89" : p.result === "Moderate" ? "#FFB800" : "#EE5D50"}
                  bg={p.result === "On track" ? "rgba(0,223,137,0.12)" : p.result === "Moderate" ? "rgba(255,184,0,0.14)" : "rgba(238,93,80,0.12)"}>{p.result}</Badge>
                <button onClick={() => del.mutate(p.id)} className="text-compass-red hover:bg-compass-red/10 rounded-lg p-1.5"><Trash2 size={15} /></button>
              </div>
            </Card>
          ))}
        </div>
      )}
    </div>
  );
}

function Row({ label, value }) {
  return <div className="flex justify-between"><span className="text-compass-muted">{label}</span><span className="font-semibold text-compass-navy">{value}</span></div>;
}
