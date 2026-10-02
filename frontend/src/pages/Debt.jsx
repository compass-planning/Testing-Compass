import React, { useState, useMemo } from "react";
import { useQuery, useMutation, useQueryClient } from "@tanstack/react-query";
import { toast } from "sonner";
import { CreditCard, Plus, Pencil, Trash2, TrendingDown, Snowflake, Mountain } from "lucide-react";
import api, { formatApiError } from "@/lib/api";
import { planApi } from "@/lib/planning";
import { useAuth } from "@/context/AuthContext";
import { Card, Button, Input, Field, Select, Badge, Modal, Stat, Empty } from "@/components/ui-kit";
import { PageHeader } from "@/components/PageHeader";
import { useTr } from "@/lib/i18n";
import { money } from "@/lib/format";
import { weightedAvgRate, singlePayoff, baseline, strategy, monthsLabel } from "@/lib/finance";
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
  const invalidate = () => { qc.invalidateQueries({ queryKey: ["plan", "debts"] }); qc.invalidateQueries({ queryKey: ["plan", "overview"] }); };

  const save = useMutation({
    mutationFn: (b) => (b.id ? planApi.update("debts", b.id, strip(b)) : planApi.create("debts", strip(b))),
    onSuccess: () => { toast.success("Saved"); setModal(null); invalidate(); },
    onError: (e) => toast.error(formatApiError(e.response?.data?.detail)),
  });
  const del = useMutation({ mutationFn: (id) => planApi.remove("debts", id), onSuccess: () => { toast.success("Deleted"); invalidate(); } });

  const rows = data.filter((d) => matchPerson(d.owner, view));
  const totalBalance = rows.reduce((s, d) => s + Number(d.balance || 0), 0);
  const totalPayment = rows.reduce((s, d) => s + Number(d.payment || 0), 0);
  const avgRate = weightedAvgRate(rows);

  const analysis = useMemo(() => {
    if (rows.length === 0) return null;
    return { base: baseline(rows), ava: strategy(rows, extra, "avalanche"), snow: strategy(rows, extra, "snowball") };
  }, [rows, extra]);
  const tr = useTr();

  return (
    <div>
      <PageHeader title="Debt" subtitle="Balances, rates and payoff strategy for the household.">
        <div className="flex items-center gap-3">
          <PersonToggle owners={owners.data || []} value={view} onChange={setView} testid="debt-person" />
          {readOnly ? <Badge color="#A3AED0" bg="rgba(163,174,208,0.15)">CRM-managed</Badge>
            : <Button onClick={() => setModal({})} data-testid="add-debts-button"><Plus size={16} /> {tr("Add debt")}</Button>}
        </div>
      </PageHeader>

      <div className="grid grid-cols-2 lg:grid-cols-4 gap-4 mb-6">
        <Stat label={tr("Total debt")} value={money(totalBalance)} accent />
        <Stat label={tr("Monthly payments")} value={money(totalPayment)} />
        <Stat label={tr("Weighted avg rate")} value={`${avgRate.toFixed(2)}%`} />
        <Stat label={tr("Lifetime interest")} value={analysis ? (analysis.base.neverPaysOff ? "—" : money(analysis.base.interest)) : "$0"} />
      </div>

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
                      <td className="px-5 py-3.5 font-semibold text-compass-navy">{d.name || "—"}</td>
                      <td className="px-5 py-3.5 text-compass-muted">{d.owner || "Joint"}</td>
                      <td className="px-5 py-3.5 text-compass-muted">{d.lender || "—"}</td>
                      <td className="px-5 py-3.5 text-right">{Number(d.rate || 0).toFixed(2)}%</td>
                      <td className="px-5 py-3.5 text-right">{money(d.payment)}</td>
                      <td className="px-5 py-3.5 text-right font-heading font-bold text-compass-navy">{money(d.balance)}</td>
                      <td className="px-5 py-3.5 text-right text-compass-muted">{p.neverPaysOff ? <span className="text-compass-red font-semibold">Never</span> : monthsLabel(p.months)}</td>
                      <td className="px-5 py-3.5 text-right text-compass-muted">{p.neverPaysOff ? "—" : money(p.interest)}</td>
                      {!readOnly && (
                        <td className="px-5 py-3.5 text-right whitespace-nowrap">
                          <button onClick={() => setModal(d)} className="text-compass-blue hover:bg-compass-blue/10 rounded-lg p-1.5"><Pencil size={15} /></button>
                          <button onClick={() => del.mutate(d.id)} className="text-compass-red hover:bg-compass-red/10 rounded-lg p-1.5 ml-1" data-testid={`delete-${d.id}`}><Trash2 size={15} /></button>
                        </td>
                      )}
                    </tr>
                  );
                })}
              </tbody>
            </table>
          </Card>

          <h3 className="font-heading font-bold text-compass-navy mb-3 flex items-center gap-2"><TrendingDown size={18} className="text-compass-blue" /> Payoff strategy</h3>
          <Card className="p-6 mb-6">
            <div className="flex flex-wrap items-end gap-4">
              <Field label="Extra monthly payment (CAD)">
                <Input type="number" value={extra} onChange={(e) => setExtra(Number(e.target.value || 0))} data-testid="debt-extra" className="w-48" />
              </Field>
              <p className="text-sm text-compass-muted pb-2.5">Applied on top of minimum payments and rolled forward as each debt clears.</p>
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
  const saved = (!result.neverPaysOff && !base.neverPaysOff) ? base.interest - result.interest : null;
  return (
    <Card className="p-6" data-testid={testid}>
      <div className="flex items-center justify-between mb-4">
        <div className="flex items-center gap-2"><Icon size={18} className="text-compass-blue" /><h4 className="font-heading font-bold text-compass-navy">{title}</h4></div>
        <Badge color="#0052FF" bg="rgba(0,82,255,0.08)">{tag}</Badge>
      </div>
      <div className="grid grid-cols-2 gap-4 mb-4">
        <div><div className="muted-label">Debt-free in</div><div className="font-heading text-2xl font-extrabold gradient-text mt-1" data-testid={`${testid}-months`}>{result.neverPaysOff ? "Never" : monthsLabel(result.months)}</div></div>
        <div><div className="muted-label">Total interest</div><div className="font-heading text-2xl font-extrabold text-compass-navy mt-1">{result.neverPaysOff ? "—" : money(result.interest)}</div></div>
      </div>
      {saved != null && saved > 0 && (
        <div className="rounded-xl bg-compass-green/10 text-compass-green px-4 py-2.5 text-sm font-semibold mb-4" data-testid={`${testid}-saved`}>
          Saves {money(saved)} vs. minimum payments
        </div>
      )}
      <div className="muted-label mb-2">Payoff order</div>
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
