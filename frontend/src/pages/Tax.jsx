import React, { useState, useMemo } from "react";
import { useQuery } from "@tanstack/react-query";
import { Building2, Calculator, PiggyBank, Wallet, TrendingUp, Users } from "lucide-react";
import api from "@/lib/api";
import { Card, Input, Field, Select, Badge, Stat } from "@/components/ui-kit";
import { PageHeader } from "@/components/PageHeader";
import { money } from "@/lib/format";
import { TAX_PROVINCES, RRSP_MAX, calcTax, rrspRoom, tfsaRoom, capitalGainsTax, incomeSplitting } from "@/lib/tax";

const TABS = [
  { key: "projection", label: "Tax Projection", icon: Calculator },
  { key: "rrsp", label: "RRSP Room", icon: PiggyBank },
  { key: "tfsa", label: "TFSA Room", icon: Wallet },
  { key: "capgains", label: "Capital Gains", icon: TrendingUp },
  { key: "split", label: "Income Splitting", icon: Users },
];

export default function Tax() {
  const [tab, setTab] = useState("projection");
  const owners = useQuery({ queryKey: ["owners"], queryFn: async () => (await api.get("/owners")).data });
  const list = owners.data || [];
  const primary = list.find((o) => o.relationship === "self") || list[0];
  const spouse = list.find((o) => o.relationship === "spouse");
  const defaultIncome = Number(primary?.annual_income || 90000);
  const defaultProvince = primary?.province && TAX_PROVINCES.includes(primary.province) ? primary.province : "ON";

  return (
    <div>
      <PageHeader title="Tax & Estate" subtitle="Canadian tax projection, registered-account room and planning tools (illustrative).">
        <Badge color="#A3AED0" bg="rgba(163,174,208,0.15)">2025 rules</Badge>
      </PageHeader>

      <div className="flex gap-1 mb-6 border-b border-compass-border overflow-x-auto">
        {TABS.map((t) => (
          <button key={t.key} onClick={() => setTab(t.key)} data-testid={`tax-tab-${t.key}`}
            className={`flex items-center gap-2 px-4 py-2.5 text-sm font-semibold border-b-2 -mb-px whitespace-nowrap transition-colors ${tab === t.key ? "border-compass-blue text-compass-blue" : "border-transparent text-compass-muted hover:text-compass-navy"}`}>
            <t.icon size={16} /> {t.label}
          </button>
        ))}
      </div>

      {tab === "projection" && <Projection income={defaultIncome} province={defaultProvince} />}
      {tab === "rrsp" && <Rrsp income={defaultIncome} />}
      {tab === "tfsa" && <Tfsa />}
      {tab === "capgains" && <CapGains income={defaultIncome} province={defaultProvince} />}
      {tab === "split" && <Split a={defaultIncome} b={Number(spouse?.annual_income || 45000)} province={defaultProvince} />}
    </div>
  );
}

function ProvinceSelect({ value, onChange }) {
  return <Select value={value} onChange={(e) => onChange(e.target.value)} data-testid="tax-province">{TAX_PROVINCES.map((p) => <option key={p}>{p}</option>)}</Select>;
}

function Projection({ income, province }) {
  const [inc, setInc] = useState(income);
  const [prov, setProv] = useState(province);
  const t = useMemo(() => calcTax(Number(inc || 0), prov), [inc, prov]);
  return (
    <div className="grid lg:grid-cols-3 gap-6">
      <Card className="p-6 lg:col-span-2">
        <h3 className="font-heading font-bold text-compass-navy mb-4">Income & province</h3>
        <div className="grid sm:grid-cols-2 gap-4">
          <Field label="Taxable income (CAD)"><Input type="number" value={inc} onChange={(e) => setInc(Number(e.target.value || 0))} data-testid="tax-income" /></Field>
          <Field label="Province"><ProvinceSelect value={prov} onChange={setProv} /></Field>
        </div>
        <div className="grid grid-cols-2 gap-4 mt-5">
          <Stat label="Federal tax" value={money(t.federal)} />
          <Stat label="Provincial tax" value={money(t.provincial)} />
        </div>
      </Card>
      <Card className="p-6" data-testid="tax-result">
        <div className="muted-label">Total tax</div>
        <div className="font-heading text-4xl font-extrabold gradient-text mt-1" data-testid="tax-total">{money(t.total)}</div>
        <div className="mt-4 space-y-2 text-sm">
          <Row label="After-tax income" value={money(t.afterTax)} />
          <Row label="Average rate" value={`${t.averageRate.toFixed(1)}%`} />
          <Row label="Marginal rate" value={`${t.marginalRate.toFixed(1)}%`} />
        </div>
      </Card>
    </div>
  );
}

function Rrsp({ income }) {
  const [inc, setInc] = useState(income);
  const [contrib, setContrib] = useState(0);
  const [carry, setCarry] = useState(0);
  const r = useMemo(() => rrspRoom(Number(inc || 0), Number(contrib || 0), Number(carry || 0)), [inc, contrib, carry]);
  return (
    <div className="grid lg:grid-cols-3 gap-6">
      <Card className="p-6 lg:col-span-2">
        <h3 className="font-heading font-bold text-compass-navy mb-4">RRSP contribution room</h3>
        <div className="grid sm:grid-cols-3 gap-4">
          <Field label="Earned income"><Input type="number" value={inc} onChange={(e) => setInc(Number(e.target.value || 0))} data-testid="rrsp-income" /></Field>
          <Field label="Contributed this year"><Input type="number" value={contrib} onChange={(e) => setContrib(Number(e.target.value || 0))} data-testid="rrsp-contrib" /></Field>
          <Field label="Unused carry-forward"><Input type="number" value={carry} onChange={(e) => setCarry(Number(e.target.value || 0))} /></Field>
        </div>
        <p className="text-xs text-compass-muted mt-4">18% of earned income, capped at the {money(RRSP_MAX)} 2025 limit, plus carry-forward, less contributions.</p>
      </Card>
      <Card className="p-6" data-testid="rrsp-result">
        <div className="muted-label">Available room</div>
        <div className="font-heading text-4xl font-extrabold gradient-text mt-1" data-testid="rrsp-room">{money(r.room)}</div>
        <div className="mt-4 space-y-2 text-sm">
          <Row label="This year's entitlement" value={money(r.annualEntitlement)} />
          {r.overContributed > 0 && <Row label="Over-contributed" value={money(r.overContributed)} />}
        </div>
      </Card>
    </div>
  );
}

function Tfsa() {
  const [since, setSince] = useState(2009);
  const [contrib, setContrib] = useState(0);
  const r = useMemo(() => tfsaRoom(Number(since || 2009), Number(contrib || 0)), [since, contrib]);
  return (
    <div className="grid lg:grid-cols-3 gap-6">
      <Card className="p-6 lg:col-span-2">
        <h3 className="font-heading font-bold text-compass-navy mb-4">TFSA contribution room</h3>
        <div className="grid sm:grid-cols-2 gap-4">
          <Field label="Eligible since (year 18+ & resident)"><Input type="number" value={since} onChange={(e) => setSince(Number(e.target.value || 2009))} data-testid="tfsa-since" /></Field>
          <Field label="Total contributions to date"><Input type="number" value={contrib} onChange={(e) => setContrib(Number(e.target.value || 0))} data-testid="tfsa-contrib" /></Field>
        </div>
        <p className="text-xs text-compass-muted mt-4">Cumulative federal TFSA limits (2009–2025) from your eligibility year, less lifetime contributions.</p>
      </Card>
      <Card className="p-6" data-testid="tfsa-result">
        <div className="muted-label">Available room</div>
        <div className="font-heading text-4xl font-extrabold gradient-text mt-1" data-testid="tfsa-room">{money(r.room)}</div>
        <div className="mt-4 space-y-2 text-sm"><Row label="Cumulative limit" value={money(r.cumulative)} /></div>
      </Card>
    </div>
  );
}

function CapGains({ income, province }) {
  const [gain, setGain] = useState(50000);
  const [inc, setInc] = useState(income);
  const [prov, setProv] = useState(province);
  const r = useMemo(() => capitalGainsTax(Number(gain || 0), Number(inc || 0), prov), [gain, inc, prov]);
  return (
    <div className="grid lg:grid-cols-3 gap-6">
      <Card className="p-6 lg:col-span-2">
        <h3 className="font-heading font-bold text-compass-navy mb-4">Capital gains</h3>
        <div className="grid sm:grid-cols-3 gap-4">
          <Field label="Realized gain"><Input type="number" value={gain} onChange={(e) => setGain(Number(e.target.value || 0))} data-testid="capgains-gain" /></Field>
          <Field label="Other taxable income"><Input type="number" value={inc} onChange={(e) => setInc(Number(e.target.value || 0))} /></Field>
          <Field label="Province"><ProvinceSelect value={prov} onChange={setProv} /></Field>
        </div>
        <p className="text-xs text-compass-muted mt-4">50% inclusion rate (2025). Taxed at your marginal rate on the taxable portion.</p>
      </Card>
      <Card className="p-6" data-testid="capgains-result">
        <div className="muted-label">Estimated tax</div>
        <div className="font-heading text-4xl font-extrabold gradient-text mt-1" data-testid="capgains-tax">{money(r.estimatedTax)}</div>
        <div className="mt-4 space-y-2 text-sm">
          <Row label="Taxable portion (50%)" value={money(r.taxablePortion)} />
          <Row label="Marginal rate" value={`${r.marginalRate.toFixed(1)}%`} />
        </div>
      </Card>
    </div>
  );
}

function Split({ a, b, province }) {
  const [incA, setIncA] = useState(a);
  const [incB, setIncB] = useState(b);
  const [prov, setProv] = useState(province);
  const r = useMemo(() => incomeSplitting(Number(incA || 0), Number(incB || 0), prov), [incA, incB, prov]);
  return (
    <div className="grid lg:grid-cols-3 gap-6">
      <Card className="p-6 lg:col-span-2">
        <h3 className="font-heading font-bold text-compass-navy mb-4">Spousal income splitting</h3>
        <div className="grid sm:grid-cols-3 gap-4">
          <Field label="Primary income"><Input type="number" value={incA} onChange={(e) => setIncA(Number(e.target.value || 0))} data-testid="split-a" /></Field>
          <Field label="Spouse income"><Input type="number" value={incB} onChange={(e) => setIncB(Number(e.target.value || 0))} data-testid="split-b" /></Field>
          <Field label="Province"><ProvinceSelect value={prov} onChange={setProv} /></Field>
        </div>
        <p className="text-xs text-compass-muted mt-4">Illustrative comparison of taxing each income separately vs. an even split (e.g. pension income splitting).</p>
      </Card>
      <Card className="p-6" data-testid="split-result">
        <div className="muted-label">Potential annual savings</div>
        <div className="font-heading text-4xl font-extrabold gradient-text mt-1" data-testid="split-savings">{money(r.savings)}</div>
        <div className="mt-4 space-y-2 text-sm">
          <Row label="Tax — separate" value={money(r.separate)} />
          <Row label="Tax — split evenly" value={money(r.split)} />
        </div>
      </Card>
    </div>
  );
}

function Row({ label, value }) {
  return <div className="flex justify-between"><span className="text-compass-muted">{label}</span><span className="font-semibold text-compass-navy">{value}</span></div>;
}
