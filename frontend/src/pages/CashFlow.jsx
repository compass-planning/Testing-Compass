import React, { useState, useMemo } from "react";
import { useQuery, useMutation, useQueryClient } from "@tanstack/react-query";
import { toast } from "sonner";
import { Receipt, Plus, Pencil, Trash2, ArrowDownRight, ArrowUpRight, Building2 } from "lucide-react";
import api, { formatApiError } from "@/lib/api";
import { planApi } from "@/lib/planning";
import { useAuth } from "@/context/AuthContext";
import { Card, Button, Input, Field, Select, Badge, Modal, Stat, Empty } from "@/components/ui-kit";
import { PageHeader } from "@/components/PageHeader";
import { money } from "@/lib/format";
import { PersonToggle, matchPerson, OWNER_TAGS } from "@/components/PersonToggle";

const CATEGORIES = ["Housing", "Food", "Transport", "Insurance", "Lifestyle", "Childcare", "Debt", "Other"];
const REAL_ESTATE = ["Principal Residence", "Real Estate (other)"];

export default function CashFlow() {
  const { user } = useAuth();
  const qc = useQueryClient();
  const readOnly = user.tier === "enterprise" && !user.enterprise_write;
  const [modal, setModal] = useState(null);
  const [view, setView] = useState("combined");

  const expenses = useQuery({ queryKey: ["plan", "expenses"], queryFn: () => planApi.list("expenses") });
  const networth = useQuery({ queryKey: ["plan", "networth"], queryFn: () => planApi.list("networth") });
  const owners = useQuery({ queryKey: ["owners"], queryFn: async () => (await api.get("/owners")).data });

  const invalidate = () => { qc.invalidateQueries({ queryKey: ["plan", "expenses"] }); qc.invalidateQueries({ queryKey: ["plan", "overview"] }); };
  const save = useMutation({
    mutationFn: (b) => (b.id ? planApi.update("expenses", b.id, strip(b)) : planApi.create("expenses", strip(b))),
    onSuccess: () => { toast.success("Saved"); setModal(null); invalidate(); },
    onError: (e) => toast.error(formatApiError(e.response?.data?.detail)),
  });
  const del = useMutation({ mutationFn: (id) => planApi.remove("expenses", id), onSuccess: () => { toast.success("Deleted"); invalidate(); } });

  const income = useMemo(() => {
    const ownerTag = (rel) => (rel === "self" ? "Primary" : rel === "spouse" ? "Spouse" : "Joint");
    const employment = (owners.data || [])
      .filter((o) => Number(o.annual_income || 0) > 0)
      .map((o) => ({ label: `${o.full_name} — employment`, monthly: Number(o.annual_income) / 12, owner: ownerTag(o.relationship) }));
    const rentals = (networth.data || [])
      .filter((r) => REAL_ESTATE.includes(r.category) && r.is_rental && Number(r.rental_income || 0) > 0)
      .map((r) => ({ label: `${r.name || "Rental"} — rent`, monthly: Number(r.rental_income), holdco: !!r.in_holding_company, owner: "Joint" }));
    const all = [...employment, ...rentals].filter((l) => matchPerson(l.owner, view));
    const counted = all.filter((l) => !l.holdco);
    const excluded = all.filter((l) => l.holdco);
    return { lines: all, total: counted.reduce((s, l) => s + l.monthly, 0), excluded, excludedTotal: excluded.reduce((s, l) => s + l.monthly, 0) };
  }, [owners.data, networth.data, view]);

  const rows = (expenses.data || []).filter((r) => matchPerson(r.owner, view));
  const totalExpenses = rows.reduce((s, r) => s + Number(r.amount || 0), 0);
  const net = income.total - totalExpenses;

  return (
    <div>
      <PageHeader title="Cash Flow" subtitle="Monthly household income versus expenses.">
        <div className="flex items-center gap-3">
          <PersonToggle owners={owners.data || []} value={view} onChange={setView} testid="cashflow-person" />
          {readOnly ? <Badge color="#A3AED0" bg="rgba(163,174,208,0.15)">CRM-managed</Badge>
            : <Button onClick={() => setModal({})} data-testid="add-expenses-button"><Plus size={16} /> Add expense</Button>}
        </div>
      </PageHeader>

      <div className="grid grid-cols-3 gap-4 mb-6">
        <Stat label="Monthly income" value={money(income.total)} />
        <Stat label="Monthly expenses" value={money(totalExpenses)} />
        <Stat label={net >= 0 ? "Monthly surplus" : "Monthly shortfall"} value={money(Math.abs(net))} accent />
      </div>

      <div className="grid lg:grid-cols-2 gap-6">
        <Card className="p-6" data-testid="income-card">
          <h3 className="font-heading font-bold text-compass-navy mb-4 flex items-center gap-2"><ArrowUpRight size={18} className="text-compass-green" /> Income</h3>
          {income.lines.length === 0 ? (
            <p className="text-sm text-compass-muted">Add annual income on the Client Profile, or rental income on a Net Worth property, to populate household income.</p>
          ) : (
            <div className="space-y-2.5">
              {income.lines.map((l, i) => (
                <div key={i} className="flex items-center justify-between text-sm" data-testid={`income-line-${i}`}>
                  <span className="text-compass-navy flex items-center gap-2">
                    {l.label}
                    {l.holdco && <Badge color="#A3AED0" bg="rgba(163,174,208,0.15)"><Building2 size={11} /> Holding co — excluded</Badge>}
                  </span>
                  <span className={`font-semibold ${l.holdco ? "text-compass-muted line-through" : "text-compass-navy"}`}>{money(l.monthly)}/mo</span>
                </div>
              ))}
              <div className="flex items-center justify-between border-t border-compass-border pt-3 mt-2 font-heading font-bold text-compass-navy">
                <span>Counted income</span><span>{money(income.total)}/mo</span>
              </div>
              {income.excludedTotal > 0 && (
                <p className="text-xs text-compass-muted">{money(income.excludedTotal)}/mo of rental income is held in a holding company and excluded from household cash flow.</p>
              )}
            </div>
          )}
        </Card>

        <Card className="p-6" data-testid="expense-card">
          <h3 className="font-heading font-bold text-compass-navy mb-4 flex items-center gap-2"><ArrowDownRight size={18} className="text-compass-red" /> Expenses</h3>
          {rows.length === 0 ? (
            <Empty icon={Receipt} title="No expenses yet">Add your first monthly expense.</Empty>
          ) : (
            <div className="space-y-2.5">
              {rows.map((r) => (
                <div key={r.id} className="flex items-center justify-between text-sm group" data-testid={`expenses-row-${r.id}`}>
                  <span className="text-compass-navy flex items-center gap-2"><Badge color="#0052FF" bg="rgba(0,82,255,0.08)">{r.category}</Badge>{r.name}<span className="text-xs text-compass-muted">{r.owner && r.owner !== "Joint" ? r.owner : ""}</span></span>
                  <span className="flex items-center gap-2">
                    <span className="font-semibold text-compass-navy">{money(r.amount)}/mo</span>
                    {!readOnly && (
                      <span className="opacity-0 group-hover:opacity-100 transition-opacity">
                        <button onClick={() => setModal(r)} className="text-compass-blue hover:bg-compass-blue/10 rounded-lg p-1"><Pencil size={14} /></button>
                        <button onClick={() => del.mutate(r.id)} className="text-compass-red hover:bg-compass-red/10 rounded-lg p-1 ml-1" data-testid={`delete-${r.id}`}><Trash2 size={14} /></button>
                      </span>
                    )}
                  </span>
                </div>
              ))}
              <div className="flex items-center justify-between border-t border-compass-border pt-3 mt-2 font-heading font-bold text-compass-navy">
                <span>Total expenses</span><span>{money(totalExpenses)}/mo</span>
              </div>
            </div>
          )}
        </Card>
      </div>

      <ExpenseModal open={modal !== null} initial={modal} onClose={() => setModal(null)} onSubmit={(b) => save.mutate(b)} loading={save.isPending} />
    </div>
  );
}

function strip(body) { const { id, store, scope, household_id, created_at, ...rest } = body; return rest; }

function ExpenseModal({ open, initial, onClose, onSubmit, loading }) {
  const [f, setF] = useState({});
  React.useEffect(() => {
    if (open) setF({ id: initial?.id, category: initial?.category || CATEGORIES[0], name: initial?.name || "", owner: initial?.owner || "Joint", amount: initial?.amount ?? "" });
  }, [open, initial]); // eslint-disable-line
  const set = (k) => (e) => setF({ ...f, [k]: e.target.value });
  const submit = () => onSubmit({ ...f, amount: Number(f.amount || 0) });
  return (
    <Modal open={open} onClose={onClose} title={`${f.id ? "Edit" : "Add"} expense`} testid="expenses-modal">
      <div className="space-y-4">
        <div className="grid grid-cols-2 gap-3">
          <Field label="Category"><Select value={f.category || ""} onChange={set("category")} data-testid="field-category">{CATEGORIES.map((c) => <option key={c}>{c}</option>)}</Select></Field>
          <Field label="Owner"><Select value={f.owner || "Joint"} onChange={set("owner")} data-testid="field-owner">{OWNER_TAGS.map((t) => <option key={t}>{t}</option>)}</Select></Field>
        </div>
        <Field label="Description"><Input value={f.name || ""} onChange={set("name")} data-testid="field-name" /></Field>
        <Field label="Monthly amount (CAD)"><Input type="number" value={f.amount ?? ""} onChange={set("amount")} data-testid="field-amount" /></Field>
        <div className="flex gap-2 justify-end pt-2">
          <Button variant="ghost" onClick={onClose}>Cancel</Button>
          <Button onClick={submit} disabled={loading} data-testid="expenses-save">Save</Button>
        </div>
      </div>
    </Modal>
  );
}
