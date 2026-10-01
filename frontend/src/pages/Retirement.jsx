import React, { useState } from "react";
import { useQuery, useMutation, useQueryClient } from "@tanstack/react-query";
import { toast } from "sonner";
import { PiggyBank, Plus, Trash2, Calculator } from "lucide-react";
import { planApi } from "@/lib/planning";
import { Card, Button, Input, Field, Badge, Empty } from "@/components/ui-kit";
import { PageHeader } from "@/components/PageHeader";
import { money } from "@/lib/format";

export default function Retirement() {
  const qc = useQueryClient();
  const [inp, setInp] = useState({ current: 114700, annual: 14500, years: 25, rate: 5, retire_age: 65, monthly_income_goal: 4500 });
  const set = (k) => (e) => setInp({ ...inp, [k]: Number(e.target.value || 0) });

  const { data = [] } = useQuery({ queryKey: ["plan", "retirement"], queryFn: () => planApi.list("retirement") });
  const save = useMutation({
    mutationFn: (body) => planApi.create("retirement", body),
    onSuccess: () => { toast.success("Projection saved"); qc.invalidateQueries({ queryKey: ["plan", "retirement"] }); qc.invalidateQueries({ queryKey: ["plan", "overview"] }); },
  });
  const del = useMutation({
    mutationFn: (id) => planApi.remove("retirement", id),
    onSuccess: () => { toast.success("Deleted"); qc.invalidateQueries({ queryKey: ["plan", "retirement"] }); },
  });

  // future value of current + annuity of contributions
  const r = inp.rate / 100;
  const fvCurrent = inp.current * Math.pow(1 + r, inp.years);
  const fvContrib = r > 0 ? inp.annual * ((Math.pow(1 + r, inp.years) - 1) / r) : inp.annual * inp.years;
  const nestEgg = fvCurrent + fvContrib;
  const sustainableMonthly = (nestEgg * 0.04) / 12; // 4% rule
  const onTrack = sustainableMonthly >= inp.monthly_income_goal;

  return (
    <div>
      <PageHeader title="Retirement" subtitle="Project your nest egg and test it against your retirement income goal." />
      <div className="grid lg:grid-cols-3 gap-6">
        <Card className="p-6 lg:col-span-2">
          <h3 className="font-heading font-bold text-compass-navy mb-4 flex items-center gap-2"><Calculator size={18} className="text-compass-blue" /> Projection inputs</h3>
          <div className="grid sm:grid-cols-3 gap-4">
            <Field label="Current savings"><Input type="number" value={inp.current} onChange={set("current")} data-testid="ret-current" /></Field>
            <Field label="Annual contribution"><Input type="number" value={inp.annual} onChange={set("annual")} data-testid="ret-annual" /></Field>
            <Field label="Years to retirement"><Input type="number" value={inp.years} onChange={set("years")} /></Field>
            <Field label="Expected return (%)"><Input type="number" value={inp.rate} onChange={set("rate")} /></Field>
            <Field label="Retirement age"><Input type="number" value={inp.retire_age} onChange={set("retire_age")} /></Field>
            <Field label="Monthly income goal"><Input type="number" value={inp.monthly_income_goal} onChange={set("monthly_income_goal")} /></Field>
          </div>
          <Button className="mt-5" onClick={() => save.mutate({ name: `Projection @ ${inp.rate}%`, retire_age: inp.retire_age, monthly_income_goal: inp.monthly_income_goal, result: onTrack ? "On track" : "Shortfall", nest_egg: Math.round(nestEgg), note: `${inp.years}y @ ${inp.rate}%` })} disabled={save.isPending} data-testid="ret-save">
            <Plus size={16} /> Save projection
          </Button>
        </Card>

        <Card className="p-6">
          <div className="muted-label">Projected nest egg</div>
          <div className="font-heading text-3xl font-extrabold gradient-text mt-2">{money(nestEgg)}</div>
          <div className="mt-4 space-y-2 text-sm">
            <Row label="Sustainable income" value={`${money(sustainableMonthly)}/mo`} />
            <Row label="Your goal" value={`${money(inp.monthly_income_goal)}/mo`} />
          </div>
          <div className="mt-4">
            {onTrack
              ? <Badge color="#00DF89" bg="rgba(0,223,137,0.12)">On track</Badge>
              : <Badge color="#EE5D50" bg="rgba(238,93,80,0.12)">Projected shortfall</Badge>}
          </div>
          <p className="text-xs text-compass-muted mt-3">Uses the 4% safe-withdrawal rule. Projections are illustrative (mock).</p>
        </Card>
      </div>

      <h3 className="font-heading font-bold text-compass-navy mt-8 mb-3">Saved projections</h3>
      {data.length === 0 ? (
        <Empty icon={PiggyBank} title="No saved projections">Run the calculator and save a scenario.</Empty>
      ) : (
        <div className="grid md:grid-cols-2 gap-4">
          {data.map((p) => (
            <Card key={p.id} className="p-5 flex items-center justify-between" data-testid={`retirement-row-${p.id}`}>
              <div>
                <div className="font-heading font-bold text-compass-navy">{p.name}</div>
                <div className="text-xs text-compass-muted mt-0.5">Retire at {p.retire_age} · goal {money(p.monthly_income_goal)}/mo {p.nest_egg ? `· ${money(p.nest_egg)}` : ""}</div>
              </div>
              <div className="flex items-center gap-2">
                <Badge color={p.result === "On track" ? "#00DF89" : "#EE5D50"} bg={p.result === "On track" ? "rgba(0,223,137,0.12)" : "rgba(238,93,80,0.12)"}>{p.result}</Badge>
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
