import React, { useState, useMemo } from "react";
import { useQuery, useMutation, useQueryClient } from "@tanstack/react-query";
import { toast } from "sonner";
import { CreditCard, Plus, Pencil, Trash2, TrendingDown, Snowflake, Mountain, Target } from "lucide-react";
import api, { formatApiError } from "@/lib/api";
import { planApi } from "@/lib/planning";
import { useAuth } from "@/context/AuthContext";
import { Card, Button, Input, Field, Select, Badge, Modal, Stat, Empty, StatBand, Donut } from "@/components/ui-kit";
import { PageHeader } from "@/components/PageHeader";
import { useTr } from "@/lib/i18n";
import { money } from "@/lib/format";
import { weightedAvgRate, singlePayoff, baseline, strategy, monthsLabel, derivedDebtsFromNetworth } from "@/lib/finance";
import { PersonToggle, matchPerson, OWNER_TAGS } from "@/components/PersonToggle";

export default function Debt() {
  const { user } = useAuth();
  const qc = useQueryClient();
  const readOnly = user.tier === "enterprise" && !user.enterprise_write;
  const [modal, setModal] = useState(null);
  const [extra, setExtra] = useState(0);
  const [view, setView] = useState("combined");

  const { data = [], isLoading } = useQuery({ queryKey: ["plan", "debts"], queryFn: () => planApi.list("debts") });
  const owners = useQuery({ queryKey: ["owners"], queryFn: async () => (await api.get("/owners")).data });
  const nw = useQuery({ queryKey: ["plan", "networth"], queryFn: () => planApi.list("networth") });
  const invalidate = () => { qc.invalidateQueries({ queryKey: ["plan", "debts"] }); qc.invalidateQueries({ queryKey: ["plan", "overview"] }); };

  const save = useMutation({
    mutationFn: (b) => (b.id ? planApi.update("debts", b.id, strip(b)) : planApi.create("debts", strip(b))),
    onSuccess: () => { toast.success("Saved"); setModal(null); invalidate(); },
    onError: (e) => toast.error(formatApiError(e.response?.data?.detail)),
  });
  const del = useMutation({ mutationFn: (id) => planApi.remove("debts", id), onSuccess: () => { toast.success("Deleted"); invalidate(); } });

  const ownerTag = (name) => {
    const o = (owners.data || []).find((x) => x.full_name === name);
    return o ? (o.relationship === "spouse" ? "Spouse" : o.relationship === "self" ? "Primary" : "Joint") : (OWNER_TAGS.includes(name) ? name : "Joint");
  };
  const derived = derivedDebtsFromNetworth(nw.data || []).map((d) => ({ ...d, _tag: ownerTag(d.owner) }));
  const allDebts = [...data, ...derived];
  const rows = allDebts.filter((d) => matchPerson(d._tag || d.owner, view));
  const totalBalance = rows.reduce((s, d) => s + Number(d.balance || 0), 0);
  const totalPayment = rows.reduce((s, d) => s + Number(d.payment || 0), 0);
  const avgRate = weightedAvgRate(rows);
  const DEBT_PALETTE = ["#0052FF", "#00DF89", "#FFB800", "#7B61FF", "#06B6D4", "#EE5D50"];
  const debtComposition = rows.map((d, i) => ({ name: d.name || "Debt", value: Number(d.balance || 0), color: DEBT_PALETTE[i % DEBT_PALETTE.length] })).filter((d) => d.value > 0);

  const analysis = useMemo(() => {
    if (rows.length === 0) return null;
    return { base: baseline(rows), ava: strategy(rows, extra, "avalanche"), snow: strategy(rows, extra, "snowball") };
  }, [rows, extra]);
  const tr = useTr();

  const createGoal = useMutation({
    mutationFn: (body) => api.post("/goals", body).then((r) => r.data),
    onSuccess: () => { toast.success(tr("Payoff goal created")); qc.invalidateQueries({ queryKey: ["goals"] }); },
    onError: (e) => toast.error(formatApiError(e.response?.data?.detail)),
  });
  const makeGoal = (d) => {
    const p = singlePayoff(d.balance, d.rate, d.payment);
    if (p.neverPaysOff) { toast.error(tr("Payment too low to project a payoff date.")); return; }
    const year = new Date().getFullYear() + Math.ceil(p.months / 12);
    createGoal.mutate({
      title: `${tr("Pay off")} ${d.name || tr("Debt")}`, category: "debt",
      target_amount: Number(d.balance || 0), current_amount: 0, target_year: year,
      monthly_contribution: Number(d.payment || 0), growth_rate: 0, owner_id: null, linked_asset_ids: [],
    });
  };

  return (
    <div>
      <PageHeader title="Debt" icon={CreditCard} subtitle="Balances, rates and payoff strategy for the household.">
        <div className="flex items-center gap-3">
          <PersonToggle owners={owners.data || []} value={view} onChange={setView} testid="debt-person" />
          {readOnly ? <Badge color="#A3AED0" bg="rgba(163,174,208,0.15)">CRM-managed</Badge>
            : <Button onClick={() => setModal({})} data-testid="add-debts-button"><Plus size={16} /> {tr("Add debt")}</Button>}
        </div>
      </PageHeader>

      <StatBand testid="debt-statband" items={[
        { label: "Total liability", value: money(totalBalance), color: "#FF8A8A" },
        { label: "Monthly servicing", value: money(totalPayment), color: "#FFD36B", sub: "minimum payments" },
        { label: "Avg interest rate", value: `${avgRate.toFixed(2)}%`, color: "#7CFFC4", sub: "debt-weighted" },
        { label: "Lifetime interest", value: analysis ? (analysis.base.neverPaysOff ? "—" : money(analysis.base.interest)) : "$0", color: "#FF8A8A", sub: "at current payments" },
      ]}>
        {debtComposition.length > 0 && (
          <div className="flex flex-col sm:flex-row items-center gap-6">
            <div className="shrink-0">
              <div className="text-[11px] font-semibold uppercase tracking-wider text-white/55 mb-2 text-center sm:text-left">{tr("Debt composition")}</div>
              <Donut data={debtComposition} size={140} thickness={18} />
            </div>
            <div className="flex-1 w-full space-y-2">
              {debtComposition.map((d) => (
                <div key={d.name} className="flex items-center justify-between text-sm">
                  <span className="flex items-center gap-2 text-white/80"><span className="h-2.5 w-2.5 rounded-full shrink-0" style={{ background: d.color }} />{d.name}</span>
                  <span className="font-semibold text-white">{money(d.value)}</span>
                </div>
              ))}
            </div>
          </div>
        )}
      </StatBand>

      {isLoading ? <div className="text-compass-muted">Loading…</div> : rows.length === 0 ? (
        <Empty icon={CreditCard} title="No debts yet">Add a mortgage, loan or line of credit to see payoff analytics.</Empty>
      ) : (
        <>
          <Card className="overflow-x-auto mb-8">
            <table className="w-full text-sm">
              <thead><tr className="text-left border-b border-compass-border">
                <th className="muted-label px-5 py-3.5">{tr("Debt")}</th>
                <th className="muted-label px-5 py-3.5">{tr("Owner")}</th>
                <th className="muted-label px-5 py-3.5">{tr("Lender")}</th>
                <th className="muted-label px-5 py-3.5 text-right">{tr("Rate")}</th>
                <th className="muted-label px-5 py-3.5 text-right">{tr("Payment")}</th>
                <th className="muted-label px-5 py-3.5 text-right">{tr("Balance")}</th>
                <th className="muted-label px-5 py-3.5 text-right">{tr("Payoff")}</th>
                <th className="muted-label px-5 py-3.5 text-right">{tr("Interest")}</th>
                {!readOnly && <th className="px-5 py-3.5" />}
              </tr></thead>
              <tbody>
                {rows.map((d) => {
                  const p = singlePayoff(d.balance, d.rate, d.payment);
                  return (
                    <tr key={d.id} className="border-b border-compass-border last:border-0 hover:bg-compass-bg/40" data-testid={`debts-row-${d.id}`}>
                      <td className="px-5 py-3.5 font-semibold text-compass-navy">{d.name || "—"}{d.linked && <Badge color="#7B61FF" bg="rgba(123,97,255,0.12)" className="ml-1.5">{tr("Linked")}</Badge>}</td>
                      <td className="px-5 py-3.5 text-compass-muted">{d.owner || "Joint"}</td>
                      <td className="px-5 py-3.5 text-compass-muted">{d.lender || "—"}</td>
                      <td className="px-5 py-3.5 text-right">{Number(d.rate || 0).toFixed(2)}%</td>
                      <td className="px-5 py-3.5 text-right">{money(d.payment)}</td>
                      <td className="px-5 py-3.5 text-right font-heading font-bold text-compass-navy">{money(d.balance)}</td>
                      <td className="px-5 py-3.5 text-right text-compass-muted">{p.neverPaysOff ? <span className="text-compass-red font-semibold">Never</span> : monthsLabel(p.months)}</td>
                      <td className="px-5 py-3.5 text-right text-compass-muted">{p.neverPaysOff ? "—" : money(p.interest)}</td>
                      {!readOnly && (
                        <td className="px-5 py-3.5 text-right whitespace-nowrap">
                          <button onClick={() => makeGoal(d)} disabled={p.neverPaysOff} title={tr("Track payoff as goal")} className="text-compass-green hover:bg-compass-green/10 rounded-lg p-1.5 disabled:opacity-40" data-testid={`make-goal-${d.id}`}><Target size={15} /></button>
                          {d.linked ? (
                            <span className="text-xs text-compass-muted ml-1">{tr("from")} {tr("Net Worth")}</span>
                          ) : (
                            <>
                              <button onClick={() => setModal(d)} className="text-compass-blue hover:bg-compass-blue/10 rounded-lg p-1.5 ml-1"><Pencil size={15} /></button>
                              <button onClick={() => del.mutate(d.id)} className="text-compass-red hover:bg-compass-red/10 rounded-lg p-1.5 ml-1" data-testid={`delete-${d.id}`}><Trash2 size={15} /></button>
                            </>
                          )}
                        </td>
                      )}
                    </tr>
                  );
                })}
              </tbody>
            </table>
          </Card>

          <h3 className="font-heading font-bold text-compass-navy mb-3 flex items-center gap-2"><TrendingDown size={18} className="text-compass-blue" /> {tr("Payoff strategy")}</h3>
          <Card className="p-6 mb-6">
            <div className="flex flex-wrap items-end gap-4">
              <Field label="Extra monthly payment (CAD)">
                <Input type="number" value={extra} onChange={(e) => setExtra(Number(e.target.value || 0))} data-testid="debt-extra" className="w-48" />
              </Field>
              <p className="text-sm text-compass-muted pb-2.5">{tr("Applied on top of minimum payments and rolled forward as each debt clears.")}</p>
            </div>
          </Card>

          {analysis && (
            <div className="grid md:grid-cols-2 gap-5">
              <StrategyCard title="Avalanche" tag="Highest rate first" icon={Mountain} result={analysis.ava} base={analysis.base} testid="strategy-avalanche" />
              <StrategyCard title="Snowball" tag="Lowest balance first" icon={Snowflake} result={analysis.snow} base={analysis.base} testid="strategy-snowball" />
            </div>
          )}
        </>
      )}

      <DebtModal open={modal !== null} initial={modal} onClose={() => setModal(null)} onSubmit={(b) => save.mutate(b)} loading={save.isPending} />
    </div>
  );
}

function StrategyCard({ title, tag, icon: Icon, result, base, testid }) {
  const tr = useTr();
  const saved = (!result.neverPaysOff && !base.neverPaysOff) ? base.interest - result.interest : null;
  return (
    <Card className="p-6" data-testid={testid}>
      <div className="flex items-center justify-between mb-4">
        <div className="flex items-center gap-2"><Icon size={18} className="text-compass-blue" /><h4 className="font-heading font-bold text-compass-navy">{tr(title)}</h4></div>
        <Badge color="#0052FF" bg="rgba(0,82,255,0.08)">{tr(tag)}</Badge>
      </div>
      <div className="grid grid-cols-2 gap-4 mb-4">
        <div><div className="muted-label">{tr("Debt-free in")}</div><div className="font-heading text-2xl font-extrabold gradient-text mt-1" data-testid={`${testid}-months`}>{result.neverPaysOff ? tr("Never") : monthsLabel(result.months)}</div></div>
        <div><div className="muted-label">{tr("Total interest")}</div><div className="font-heading text-2xl font-extrabold text-compass-navy mt-1">{result.neverPaysOff ? "—" : money(result.interest)}</div></div>
      </div>
      {saved != null && saved > 0 && (
        <div className="rounded-xl bg-compass-green/10 text-compass-green px-4 py-2.5 text-sm font-semibold mb-4" data-testid={`${testid}-saved`}>
          {tr("Saves")} {money(saved)} {tr("vs. minimum payments")}
        </div>
      )}
      <div className="muted-label mb-2">{tr("Payoff order")}</div>
      <ol className="space-y-1.5">
        {result.order.map((o, i) => (
          <li key={o.key + i} className="flex items-center gap-2 text-sm text-compass-navy">
            <span className="h-5 w-5 rounded-full bg-compass-blue/10 text-compass-blue text-xs font-bold flex items-center justify-center">{i + 1}</span>
            {o.name}
          </li>
        ))}
      </ol>
    </Card>
  );
}

function strip(body) { const { id, store, scope, household_id, created_at, ...rest } = body; return rest; }

function DebtModal({ open, initial, onClose, onSubmit, loading }) {
  const tr = useTr();
  const [f, setF] = useState({});
  React.useEffect(() => {
    if (open) setF({ id: initial?.id, name: initial?.name || "", lender: initial?.lender || "", owner: initial?.owner || "Joint",
      balance: initial?.balance ?? "", rate: initial?.rate ?? "", payment: initial?.payment ?? "" });
  }, [open, initial]); // eslint-disable-line
  const set = (k) => (e) => setF({ ...f, [k]: e.target.value });
  const submit = () => onSubmit({ ...f, balance: Number(f.balance || 0), rate: Number(f.rate || 0), payment: Number(f.payment || 0) });
  return (
    <Modal open={open} onClose={onClose} title={`${f.id ? "Edit" : "Add"} debt`} testid="debts-modal">
      <div className="space-y-4">
        <div className="grid grid-cols-2 gap-3">
          <Field label={tr("Debt name")}><Input value={f.name || ""} onChange={set("name")} data-testid="field-name" /></Field>
          <Field label={tr("Owner")}><Select value={f.owner || "Joint"} onChange={set("owner")} data-testid="field-owner">{OWNER_TAGS.map((t) => <option key={t}>{t}</option>)}</Select></Field>
        </div>
        <Field label={tr("Lender")}><Input value={f.lender || ""} onChange={set("lender")} data-testid="field-lender" /></Field>
        <div className="grid grid-cols-3 gap-3">
          <Field label={tr("Balance ($)")}><Input type="number" value={f.balance ?? ""} onChange={set("balance")} data-testid="field-balance" /></Field>
          <Field label={tr("Rate (%)")}><Input type="number" step="0.01" value={f.rate ?? ""} onChange={set("rate")} data-testid="field-rate" /></Field>
          <Field label={tr("Monthly payment ($)")}><Input type="number" value={f.payment ?? ""} onChange={set("payment")} data-testid="field-payment" /></Field>
        </div>
        <div className="flex gap-2 justify-end pt-2">
          <Button variant="ghost" onClick={onClose}>{tr("Cancel")}</Button>
          <Button onClick={submit} disabled={loading} data-testid="debts-save">{tr("Save")}</Button>
        </div>
      </div>
    </Modal>
  );
}
