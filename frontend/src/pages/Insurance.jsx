import React, { useState, useMemo } from "react";
import { useQuery, useMutation, useQueryClient } from "@tanstack/react-query";
import { toast } from "sonner";
import { Shield, Plus, Pencil, Trash2, Heart, Activity, HeartPulse } from "lucide-react";
import api, { formatApiError } from "@/lib/api";
import { planApi } from "@/lib/planning";
import { useAuth } from "@/context/AuthContext";
import { Card, Button, Input, Field, Select, Badge, Modal, Stat, Empty, Progress } from "@/components/ui-kit";
import { PageHeader } from "@/components/PageHeader";
import { money } from "@/lib/format";

const POLICY_TYPES = ["Term Life", "Whole Life", "Disability", "Critical Illness", "Long-Term Care", "Health", "Other"];
const LIFE = ["Term Life", "Whole Life"];
const DI = ["Disability"];
const LTC = ["Critical Illness", "Long-Term Care", "Health"];

const EDU_PER_DEPENDANT = 100000;
const LIFE_INCOME_MULT = 10;
const DI_REPLACEMENT = 0.65;
const LTC_BENCHMARK = 300000; // $100k/yr x 3 yrs

export default function Insurance() {
  const { user } = useAuth();
  const qc = useQueryClient();
  const readOnly = user.tier === "enterprise";
  const [tab, setTab] = useState("life");
  const [modal, setModal] = useState(null);

  const policies = useQuery({ queryKey: ["plan", "insurance"], queryFn: () => planApi.list("insurance") });
  const owners = useQuery({ queryKey: ["owners"], queryFn: async () => (await api.get("/owners")).data });
  const debts = useQuery({ queryKey: ["plan", "debts"], queryFn: () => planApi.list("debts") });

  const invalidate = () => { qc.invalidateQueries({ queryKey: ["plan", "insurance"] }); qc.invalidateQueries({ queryKey: ["plan", "overview"] }); };
  const save = useMutation({
    mutationFn: (b) => (b.id ? planApi.update("insurance", b.id, strip(b)) : planApi.create("insurance", strip(b))),
    onSuccess: () => { toast.success("Saved"); setModal(null); invalidate(); },
    onError: (e) => toast.error(formatApiError(e.response?.data?.detail)),
  });
  const del = useMutation({ mutationFn: (id) => planApi.remove("insurance", id), onSuccess: () => { toast.success("Deleted"); invalidate(); } });

  const analysis = useMemo(() => {
    const pol = policies.data || [];
    const owns = owners.data || [];
    const income = owns.reduce((s, o) => s + Number(o.annual_income || 0), 0);
    const dependants = owns.filter((o) => ["dependent", "child"].includes(o.relationship)).length;
    const totalDebt = (debts.data || []).reduce((s, d) => s + Number(d.balance || 0), 0);
    const cover = (types) => pol.filter((p) => types.includes(p.policy_type)).reduce((s, p) => s + Number(p.coverage || 0), 0);

    const lifeRec = LIFE_INCOME_MULT * income + totalDebt + EDU_PER_DEPENDANT * dependants;
    const lifeHave = cover(LIFE);
    const diRecMonthly = (DI_REPLACEMENT * income) / 12;
    const diHave = cover(DI); // treat coverage as monthly benefit
    const ltcRec = LTC_BENCHMARK;
    const ltcHave = cover(LTC);

    const pct = (have, rec) => (rec > 0 ? Math.min(100, Math.round((have / rec) * 100)) : (have > 0 ? 100 : 0));
    const life = { rec: lifeRec, have: lifeHave, gap: Math.max(0, lifeRec - lifeHave), adequacy: pct(lifeHave, lifeRec) };
    const di = { rec: diRecMonthly, have: diHave, gap: Math.max(0, diRecMonthly - diHave), adequacy: pct(diHave, diRecMonthly), monthly: true };
    const ltc = { rec: ltcRec, have: ltcHave, gap: Math.max(0, ltcRec - ltcHave), adequacy: pct(ltcHave, ltcRec) };
    const score = Math.round(0.5 * life.adequacy + 0.3 * di.adequacy + 0.2 * ltc.adequacy);
    return { income, dependants, totalDebt, life, di, ltc, score };
  }, [policies.data, owners.data, debts.data]);

  const band = analysis.score >= 80 ? { label: "Well protected", color: "#00DF89", bg: "rgba(0,223,137,0.12)" }
    : analysis.score >= 50 ? { label: "Partial gaps", color: "#FFB800", bg: "rgba(255,184,0,0.14)" }
    : { label: "Significant gaps", color: "#EE5D50", bg: "rgba(238,93,80,0.12)" };

  const TABS = [
    { key: "life", label: "Life", icon: Heart, data: analysis.life, types: LIFE },
    { key: "ltc", label: "Long-Term Care", icon: HeartPulse, data: analysis.ltc, types: LTC },
    { key: "di", label: "Disability", icon: Activity, data: analysis.di, types: DI },
  ];
  const active = TABS.find((t) => t.key === tab);
  const bucketPolicies = (policies.data || []).filter((p) => active.types.includes(p.policy_type));

  return (
    <div>
      <PageHeader title="Insurance" subtitle="Protection score and coverage-gap analysis across Life, LTC and Disability.">
        {readOnly ? <Badge color="#A3AED0" bg="rgba(163,174,208,0.15)">CRM-managed</Badge>
          : <Button onClick={() => setModal({})} data-testid="add-insurance-button"><Plus size={16} /> Add policy</Button>}
      </PageHeader>

      <div className="grid lg:grid-cols-4 gap-4 mb-6">
        <Card className="p-6 flex flex-col items-center justify-center" data-testid="protection-score">
          <div className="muted-label">Protection Score</div>
          <div className="font-heading text-5xl font-extrabold gradient-text mt-1" data-testid="protection-score-value">{analysis.score}</div>
          <div className="text-xs text-compass-muted mb-2">out of 100</div>
          <Badge color={band.color} bg={band.bg} data-testid="protection-band">{band.label}</Badge>
        </Card>
        <Stat label="Household income" value={money(analysis.income)} />
        <Stat label="Dependants" value={analysis.dependants} />
        <Stat label="Total debt" value={money(analysis.totalDebt)} />
      </div>

      <div className="flex gap-1 mb-5 border-b border-compass-border">
        {TABS.map((t) => (
          <button key={t.key} onClick={() => setTab(t.key)} data-testid={`ins-tab-${t.key}`}
            className={`flex items-center gap-2 px-4 py-2.5 text-sm font-semibold border-b-2 -mb-px transition-colors ${tab === t.key ? "border-compass-blue text-compass-blue" : "border-transparent text-compass-muted hover:text-compass-navy"}`}>
            <t.icon size={16} /> {t.label}
            <span className={`text-xs ${t.data.adequacy >= 80 ? "text-compass-green" : t.data.adequacy >= 50 ? "text-compass-amber" : "text-compass-red"}`}>{t.data.adequacy}%</span>
          </button>
        ))}
      </div>

      <Card className="p-6 mb-8" data-testid={`ins-analysis-${tab}`}>
        <div className="flex items-center justify-between mb-4">
          <h3 className="font-heading font-bold text-compass-navy flex items-center gap-2"><active.icon size={18} className="text-compass-blue" /> {active.label} coverage</h3>
          <Badge color="#0052FF" bg="rgba(0,82,255,0.08)">{active.data.adequacy}% adequate</Badge>
        </div>
        <Progress value={active.data.adequacy} color={active.data.adequacy >= 80 ? "#00DF89" : active.data.adequacy >= 50 ? "#FFB800" : "#EE5D50"} />
        <div className="grid grid-cols-3 gap-4 mt-5">
          <div><div className="muted-label">Recommended</div><div className="font-heading font-bold text-compass-navy mt-1">{money(active.data.rec)}{active.data.monthly ? "/mo" : ""}</div></div>
          <div><div className="muted-label">Current coverage</div><div className="font-heading font-bold text-compass-navy mt-1">{money(active.data.have)}{active.data.monthly ? "/mo" : ""}</div></div>
          <div><div className="muted-label">Gap</div><div className={`font-heading font-bold mt-1 ${active.data.gap > 0 ? "text-compass-red" : "text-compass-green"}`} data-testid={`${tab}-gap`}>{active.data.gap > 0 ? money(active.data.gap) + (active.data.monthly ? "/mo" : "") : "No gap"}</div></div>
        </div>
        <p className="text-xs text-compass-muted mt-4">
          {tab === "life" && `Recommended = ${LIFE_INCOME_MULT}× income + total debt + ${money(EDU_PER_DEPENDANT)}/dependant.`}
          {tab === "di" && `Recommended = ${Math.round(DI_REPLACEMENT * 100)}% of monthly income replaced.`}
          {tab === "ltc" && `Benchmark = ${money(LTC_BENCHMARK)} ($100k/yr × 3 yrs of care).`} Illustrative only.
        </p>
      </Card>

      <h3 className="font-heading font-bold text-compass-navy mb-3">{active.label} policies</h3>
      {bucketPolicies.length === 0 ? (
        <Empty icon={Shield} title={`No ${active.label.toLowerCase()} policies`}>Add a policy to improve the protection score.</Empty>
      ) : (
        <Card className="overflow-x-auto">
          <table className="w-full text-sm">
            <thead><tr className="text-left border-b border-compass-border">
              <th className="muted-label px-5 py-3.5">Policy</th>
              <th className="muted-label px-5 py-3.5">Carrier</th>
              <th className="muted-label px-5 py-3.5">Insured</th>
              <th className="muted-label px-5 py-3.5 text-right">Coverage</th>
              <th className="muted-label px-5 py-3.5 text-right">Premium</th>
              {!readOnly && <th className="px-5 py-3.5" />}
            </tr></thead>
            <tbody>
              {bucketPolicies.map((p) => (
                <tr key={p.id} className="border-b border-compass-border last:border-0 hover:bg-compass-bg/40" data-testid={`insurance-row-${p.id}`}>
                  <td className="px-5 py-3.5 font-semibold text-compass-navy">{p.policy_type}</td>
                  <td className="px-5 py-3.5 text-compass-muted">{p.carrier || "—"}</td>
                  <td className="px-5 py-3.5 text-compass-muted">{p.insured || "—"}</td>
                  <td className="px-5 py-3.5 text-right font-heading font-bold text-compass-navy">{money(p.coverage)}</td>
                  <td className="px-5 py-3.5 text-right text-compass-muted">{money(p.premium)}/mo</td>
                  {!readOnly && (
                    <td className="px-5 py-3.5 text-right whitespace-nowrap">
                      <button onClick={() => setModal(p)} className="text-compass-blue hover:bg-compass-blue/10 rounded-lg p-1.5"><Pencil size={15} /></button>
                      <button onClick={() => del.mutate(p.id)} className="text-compass-red hover:bg-compass-red/10 rounded-lg p-1.5 ml-1" data-testid={`delete-${p.id}`}><Trash2 size={15} /></button>
                    </td>
                  )}
                </tr>
              ))}
            </tbody>
          </table>
        </Card>
      )}

      <PolicyModal open={modal !== null} initial={modal} defaultType={active.types[0]} onClose={() => setModal(null)} onSubmit={(b) => save.mutate(b)} loading={save.isPending} />
    </div>
  );
}

function strip(body) { const { id, store, scope, household_id, created_at, ...rest } = body; return rest; }

function PolicyModal({ open, initial, defaultType, onClose, onSubmit, loading }) {
  const [f, setF] = useState({});
  React.useEffect(() => {
    if (open) setF({ id: initial?.id, policy_type: initial?.policy_type || defaultType, carrier: initial?.carrier || "",
      insured: initial?.insured || "", coverage: initial?.coverage ?? "", premium: initial?.premium ?? "" });
  }, [open, initial]); // eslint-disable-line
  const set = (k) => (e) => setF({ ...f, [k]: e.target.value });
  const submit = () => onSubmit({ ...f, coverage: Number(f.coverage || 0), premium: Number(f.premium || 0) });
  return (
    <Modal open={open} onClose={onClose} title={`${f.id ? "Edit" : "Add"} policy`} testid="insurance-modal">
      <div className="space-y-4">
        <Field label="Policy type"><Select value={f.policy_type || ""} onChange={set("policy_type")} data-testid="field-policy_type">{POLICY_TYPES.map((p) => <option key={p}>{p}</option>)}</Select></Field>
        <div className="grid grid-cols-2 gap-3">
          <Field label="Carrier"><Input value={f.carrier || ""} onChange={set("carrier")} data-testid="field-carrier" /></Field>
          <Field label="Insured"><Input value={f.insured || ""} onChange={set("insured")} data-testid="field-insured" /></Field>
        </div>
        <div className="grid grid-cols-2 gap-3">
          <Field label="Coverage (CAD)"><Input type="number" value={f.coverage ?? ""} onChange={set("coverage")} data-testid="field-coverage" /></Field>
          <Field label="Monthly premium"><Input type="number" value={f.premium ?? ""} onChange={set("premium")} data-testid="field-premium" /></Field>
        </div>
        <div className="flex gap-2 justify-end pt-2">
          <Button variant="ghost" onClick={onClose}>Cancel</Button>
          <Button onClick={submit} disabled={loading} data-testid="insurance-save">Save</Button>
        </div>
      </div>
    </Modal>
  );
}
