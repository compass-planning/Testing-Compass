import React, { useState, useMemo } from "react";
import { useQuery, useMutation, useQueryClient } from "@tanstack/react-query";
import { toast } from "sonner";
import { Building2, Calculator, PiggyBank, Wallet, TrendingUp, Users, Scale, Plus, Pencil, Trash2, FileText } from "lucide-react";
import api, { formatApiError } from "@/lib/api";
import { planApi } from "@/lib/planning";
import { useAuth } from "@/context/AuthContext";
import { Card, Button, Input, Field, Select, Badge, Stat, Modal, Empty } from "@/components/ui-kit";
import { PageHeader } from "@/components/PageHeader";
import { money } from "@/lib/format";
import { TAX_PROVINCES, RRSP_MAX, calcTax, rrspRoom, tfsaRoom, capitalGainsTax, incomeSplitting, estateEstimate } from "@/lib/tax";

const TABS = [
  { key: "projection", label: "Tax Projection", icon: Calculator },
  { key: "rrsp", label: "RRSP Room", icon: PiggyBank },
  { key: "tfsa", label: "TFSA Room", icon: Wallet },
  { key: "capgains", label: "Capital Gains", icon: TrendingUp },
  { key: "split", label: "Income Splitting", icon: Users },
  { key: "estate", label: "Estate", icon: Scale },
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
      <PageHeader title="Tax & Estate" subtitle="Canadian tax projection, registered-account room and estate planning (illustrative).">
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
      {tab === "estate" && <Estate province={defaultProvince} />}
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

const REGISTERED_ACCT = ["RRSP", "RRIF", "DC Pension", "DB Pension", "Group RRSP"];

function Estate({ province }) {
  const { user } = useAuth();
  const qc = useQueryClient();
  const readOnly = user.tier === "enterprise";
  const [prov, setProv] = useState(province);
  const [modal, setModal] = useState(null);

  const overview = useQuery({ queryKey: ["plan", "overview"], queryFn: planApi.overview });
  const networth = useQuery({ queryKey: ["plan", "networth"], queryFn: () => planApi.list("networth") });
  const accounts = useQuery({ queryKey: ["accounts"], queryFn: async () => (await api.get("/accounts")).data });
  const estate = useQuery({ queryKey: ["plan", "estate"], queryFn: () => planApi.list("estate") });

  const invalidate = () => qc.invalidateQueries({ queryKey: ["plan", "estate"] });
  const save = useMutation({
    mutationFn: (b) => (b.id ? planApi.update("estate", b.id, strip(b)) : planApi.create("estate", strip(b))),
    onSuccess: () => { toast.success("Saved"); setModal(null); invalidate(); },
    onError: (e) => toast.error(formatApiError(e.response?.data?.detail)),
  });
  const del = useMutation({ mutationFn: (id) => planApi.remove("estate", id), onSuccess: () => { toast.success("Deleted"); invalidate(); } });

  const estateValue = Number(overview.data?.netWorth || 0);
  const registeredValue = (networth.data || []).filter((r) => r.kind === "asset" && ["RRSP"].includes(r.category)).reduce((s, r) => s + Number(r.value || 0), 0)
    + (accounts.data || []).filter((a) => REGISTERED_ACCT.includes(a.account_type)).reduce((s, a) => s + Number(a.balance || 0), 0);
  const estQ = useQuery({ queryKey: ["estate-analysis", prov, estateValue, registeredValue], queryFn: async () => (await api.post("/plan/estate/analysis", { province: prov, grossEstateValue: estateValue, rrspRrifBalance: registeredValue })).data });
  const est = estQ.data
    ? { total: estQ.data.totalSettlementCost, probate: estQ.data.probate.probateFee, deemedTax: estQ.data.terminalTax.estimatedTax, net: estQ.data.netToHeirs }
    : { total: 0, probate: 0, deemedTax: 0, net: 0 };

  const rows = estate.data || [];
  const beneficiaries = rows.filter((r) => r.kind === "beneficiary");
  const documents = rows.filter((r) => r.kind === "document");

  return (
    <div>
      <div className="grid lg:grid-cols-3 gap-6 mb-8">
        <Card className="p-6 lg:col-span-2">
          <h3 className="font-heading font-bold text-compass-navy mb-4">Estate settlement estimate</h3>
          <div className="grid sm:grid-cols-3 gap-4">
            <Field label="Estate value (net worth)"><Input value={money(estateValue)} readOnly data-testid="estate-value" /></Field>
            <Field label="Registered assets (RRSP/RRIF)"><Input value={money(registeredValue)} readOnly data-testid="estate-registered" /></Field>
            <Field label="Province"><ProvinceSelect value={prov} onChange={setProv} /></Field>
          </div>
          <p className="text-xs text-compass-muted mt-4">Probate fees are provincial; registered assets are deemed disposed at death and fully taxable as income. Illustrative only — no Canadian estate/inheritance tax applies.</p>
        </Card>
        <Card className="p-6" data-testid="estate-result">
          <div className="muted-label">Estimated settlement cost</div>
          <div className="font-heading text-4xl font-extrabold gradient-text mt-1" data-testid="estate-total">{money(est.total)}</div>
          <div className="mt-4 space-y-2 text-sm">
            <Row label="Probate fees" value={money(est.probate)} />
            <Row label="Deemed-disposition tax" value={money(est.deemedTax)} />
            <Row label="Net to heirs" value={money(est.net)} />
          </div>
        </Card>
      </div>

      <div className="flex items-center justify-between mb-3">
        <h3 className="font-heading font-bold text-compass-navy">Beneficiary & document register</h3>
        {!readOnly && <Button onClick={() => setModal({})} data-testid="add-estate-button"><Plus size={16} /> Add entry</Button>}
      </div>

      <div className="grid lg:grid-cols-2 gap-6">
        <Card className="p-6" data-testid="beneficiary-register">
          <div className="muted-label mb-3">Beneficiary designations</div>
          {beneficiaries.length === 0 ? <Empty icon={Users} title="No beneficiaries">Record who inherits each asset or policy.</Empty> : (
            <div className="space-y-2.5">
              {beneficiaries.map((b) => (
                <div key={b.id} className="flex items-center justify-between text-sm group" data-testid={`estate-row-${b.id}`}>
                  <span className="text-compass-navy"><span className="font-semibold">{b.asset || "Asset"}</span> → {b.beneficiary || "—"} {b.allocation ? <Badge color="#0052FF" bg="rgba(0,82,255,0.08)">{b.allocation}%</Badge> : null}</span>
                  {!readOnly && <span className="opacity-0 group-hover:opacity-100 transition-opacity"><button onClick={() => setModal(b)} className="text-compass-blue p-1"><Pencil size={14} /></button><button onClick={() => del.mutate(b.id)} className="text-compass-red p-1 ml-1" data-testid={`delete-${b.id}`}><Trash2 size={14} /></button></span>}
                </div>
              ))}
            </div>
          )}
        </Card>
        <Card className="p-6" data-testid="document-register">
          <div className="muted-label mb-3">Will & Power of Attorney</div>
          {documents.length === 0 ? <Empty icon={FileText} title="No documents">Track the will, POA and mandate status.</Empty> : (
            <div className="space-y-2.5">
              {documents.map((d) => (
                <div key={d.id} className="flex items-center justify-between text-sm group" data-testid={`estate-row-${d.id}`}>
                  <span className="text-compass-navy flex items-center gap-2"><Badge color="#0052FF" bg="rgba(0,82,255,0.08)">{d.doc_type || "Will"}</Badge>{d.asset || d.name || "Document"}<span className="text-xs text-compass-muted">{d.status}</span></span>
                  {!readOnly && <span className="opacity-0 group-hover:opacity-100 transition-opacity"><button onClick={() => setModal(d)} className="text-compass-blue p-1"><Pencil size={14} /></button><button onClick={() => del.mutate(d.id)} className="text-compass-red p-1 ml-1" data-testid={`delete-${d.id}`}><Trash2 size={14} /></button></span>}
                </div>
              ))}
            </div>
          )}
        </Card>
      </div>

      <EstateModal open={modal !== null} initial={modal} onClose={() => setModal(null)} onSubmit={(b) => save.mutate(b)} loading={save.isPending} />
    </div>
  );
}

const DOC_TYPES = ["Will", "Power of Attorney", "Mandate", "Trust", "Other"];
const DOC_STATUS = ["On file", "In progress", "Needs update", "Missing"];

function EstateModal({ open, initial, onClose, onSubmit, loading }) {
  const [f, setF] = useState({});
  React.useEffect(() => {
    if (open) setF({ id: initial?.id, kind: initial?.kind || "beneficiary", asset: initial?.asset || "",
      beneficiary: initial?.beneficiary || "", allocation: initial?.allocation ?? "",
      doc_type: initial?.doc_type || "Will", status: initial?.status || "On file" });
  }, [open, initial]); // eslint-disable-line
  const set = (k) => (e) => setF({ ...f, [k]: e.target.value });
  const isBen = f.kind === "beneficiary";
  const submit = () => onSubmit({ ...f, allocation: isBen ? Number(f.allocation || 0) : undefined });
  return (
    <Modal open={open} onClose={onClose} title={`${f.id ? "Edit" : "Add"} estate entry`} testid="estate-modal">
      <div className="space-y-4">
        <Field label="Entry type"><Select value={f.kind || "beneficiary"} onChange={set("kind")} data-testid="field-kind"><option value="beneficiary">Beneficiary designation</option><option value="document">Will / POA document</option></Select></Field>
        {isBen ? (
          <>
            <Field label="Asset / policy"><Input value={f.asset || ""} onChange={set("asset")} data-testid="field-asset" /></Field>
            <div className="grid grid-cols-2 gap-3">
              <Field label="Beneficiary"><Input value={f.beneficiary || ""} onChange={set("beneficiary")} data-testid="field-beneficiary" /></Field>
              <Field label="Allocation (%)"><Input type="number" value={f.allocation ?? ""} onChange={set("allocation")} data-testid="field-allocation" /></Field>
            </div>
          </>
        ) : (
          <>
            <Field label="Document name"><Input value={f.asset || ""} onChange={set("asset")} data-testid="field-asset" /></Field>
            <div className="grid grid-cols-2 gap-3">
              <Field label="Type"><Select value={f.doc_type || "Will"} onChange={set("doc_type")} data-testid="field-doc_type">{DOC_TYPES.map((d) => <option key={d}>{d}</option>)}</Select></Field>
              <Field label="Status"><Select value={f.status || "On file"} onChange={set("status")} data-testid="field-status">{DOC_STATUS.map((s) => <option key={s}>{s}</option>)}</Select></Field>
            </div>
          </>
        )}
        <div className="flex gap-2 justify-end pt-2">
          <Button variant="ghost" onClick={onClose}>Cancel</Button>
          <Button onClick={submit} disabled={loading} data-testid="estate-save">Save</Button>
        </div>
      </div>
    </Modal>
  );
}

function strip(body) { const { id, store, scope, household_id, created_at, ...rest } = body; return rest; }

function Row({ label, value }) {
  return <div className="flex justify-between"><span className="text-compass-muted">{label}</span><span className="font-semibold text-compass-navy">{value}</span></div>;
}
