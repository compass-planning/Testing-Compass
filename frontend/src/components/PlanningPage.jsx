import React, { useState } from "react";
import { useQuery, useMutation, useQueryClient } from "@tanstack/react-query";
import { toast } from "sonner";
import { Plus, Pencil, Trash2, Scale, CreditCard, Receipt, Shield, Building2, FileText } from "lucide-react";
import { planApi } from "@/lib/planning";
import { formatApiError } from "@/lib/api";
import { useAuth } from "@/context/AuthContext";
import { Card, Button, Input, Field, Select, Badge, Modal, Empty } from "@/components/ui-kit";
import { PageHeader } from "@/components/PageHeader";
import { money } from "@/lib/format";

// kind -> configuration (columns + form fields)
export const PLAN_CONFIGS = {
  networth: {
    title: "Net Worth", subtitle: "Assets and liabilities that make up your household balance sheet.", icon: Scale,
    fields: [
      { key: "kind", label: "Type", type: "select", options: ["asset", "liability"], default: "asset" },
      { key: "category", label: "Category", type: "text", default: "" },
      { key: "name", label: "Name", type: "text", default: "" },
      { key: "value", label: "Value (CAD)", type: "number", default: "" },
    ],
    columns: [
      { key: "name", label: "Name", bold: true },
      { key: "category", label: "Category", muted: true },
      { key: "kind", label: "Type", badge: true },
      { key: "value", label: "Value", money: true, right: true },
    ],
  },
  debts: {
    title: "Debt", subtitle: "Mortgages, loans and lines of credit with balances and rates.", icon: CreditCard,
    fields: [
      { key: "name", label: "Debt name", type: "text" },
      { key: "lender", label: "Lender", type: "text" },
      { key: "balance", label: "Balance (CAD)", type: "number" },
      { key: "rate", label: "Interest rate (%)", type: "number" },
      { key: "payment", label: "Monthly payment", type: "number" },
    ],
    columns: [
      { key: "name", label: "Debt", bold: true },
      { key: "lender", label: "Lender", muted: true },
      { key: "rate", label: "Rate", suffix: "%", right: true },
      { key: "payment", label: "Payment", money: true, right: true },
      { key: "balance", label: "Balance", money: true, right: true },
    ],
  },
  expenses: {
    title: "Cash Flow", subtitle: "Monthly living expenses by category.", icon: Receipt,
    fields: [
      { key: "category", label: "Category", type: "select", options: ["Housing", "Food", "Transport", "Insurance", "Lifestyle", "Childcare", "Other"] },
      { key: "name", label: "Description", type: "text" },
      { key: "amount", label: "Monthly amount (CAD)", type: "number" },
    ],
    columns: [
      { key: "name", label: "Expense", bold: true },
      { key: "category", label: "Category", badge: true },
      { key: "amount", label: "Monthly", money: true, right: true },
    ],
    footer: (rows) => `Total monthly: ${money(rows.reduce((s, r) => s + Number(r.amount || 0), 0))}`,
  },
  insurance: {
    title: "Insurance", subtitle: "Protection coverage and premiums across policies.", icon: Shield,
    fields: [
      { key: "policy_type", label: "Policy type", type: "select", options: ["Term Life", "Whole Life", "Critical Illness", "Disability", "Health", "Other"] },
      { key: "carrier", label: "Carrier", type: "text" },
      { key: "insured", label: "Insured", type: "text" },
      { key: "coverage", label: "Coverage (CAD)", type: "number" },
      { key: "premium", label: "Monthly premium", type: "number" },
    ],
    columns: [
      { key: "policy_type", label: "Policy", bold: true },
      { key: "carrier", label: "Carrier", muted: true },
      { key: "insured", label: "Insured", muted: true },
      { key: "coverage", label: "Coverage", money: true, right: true },
      { key: "premium", label: "Premium", money: true, right: true },
    ],
  },
  tax_notes: {
    title: "Tax & Estate", subtitle: "Tax planning notes and estate considerations.", icon: Building2,
    fields: [
      { key: "name", label: "Title", type: "text" },
      { key: "category", label: "Category", type: "select", options: ["Planning", "Tax", "Estate", "Trust", "Other"] },
      { key: "note", label: "Note", type: "textarea" },
    ],
    columns: [
      { key: "name", label: "Title", bold: true },
      { key: "category", label: "Category", badge: true },
      { key: "note", label: "Note", muted: true },
    ],
  },
  documents: {
    title: "Documents", subtitle: "Household document register (wills, statements, agreements).", icon: FileText,
    fields: [
      { key: "name", label: "Document name", type: "text" },
      { key: "doc_type", label: "Type", type: "select", options: ["Estate", "Tax", "Debt", "Insurance", "Identity", "Other"] },
      { key: "status", label: "Status", type: "select", options: ["On file", "Requested", "Missing"] },
    ],
    columns: [
      { key: "name", label: "Document", bold: true },
      { key: "doc_type", label: "Type", badge: true },
      { key: "status", label: "Status", muted: true },
    ],
  },
};

function cellValue(row, col) {
  const v = row[col.key];
  if (col.money) return money(v);
  if (v === undefined || v === null || v === "") return "—";
  if (col.suffix) return `${v}${col.suffix}`;
  return String(v);
}

export default function PlanningPage({ kind }) {
  const cfg = PLAN_CONFIGS[kind];
  const { user } = useAuth();
  const qc = useQueryClient();
  const readOnly = user.tier === "enterprise";
  const [modal, setModal] = useState(null); // null | {} | row

  const { data = [], isLoading } = useQuery({ queryKey: ["plan", kind], queryFn: () => planApi.list(kind) });
  const invalidate = () => { qc.invalidateQueries({ queryKey: ["plan", kind] }); qc.invalidateQueries({ queryKey: ["plan", "overview"] }); };

  const save = useMutation({
    mutationFn: (body) => (body.id ? planApi.update(kind, body.id, strip(body)) : planApi.create(kind, strip(body))),
    onSuccess: () => { toast.success("Saved"); setModal(null); invalidate(); },
    onError: (e) => toast.error(formatApiError(e.response?.data?.detail)),
  });
  const del = useMutation({
    mutationFn: (id) => planApi.remove(kind, id),
    onSuccess: () => { toast.success("Deleted"); invalidate(); },
    onError: (e) => toast.error(formatApiError(e.response?.data?.detail)),
  });

  return (
    <div>
      <PageHeader title={cfg.title} subtitle={cfg.subtitle}>
        {readOnly ? (
          <Badge color="#A3AED0" bg="rgba(163,174,208,0.15)">CRM-managed</Badge>
        ) : (
          <Button onClick={() => setModal({})} data-testid={`add-${kind}-button`}><Plus size={16} /> Add</Button>
        )}
      </PageHeader>

      {isLoading ? (
        <div className="text-compass-muted">Loading…</div>
      ) : data.length === 0 ? (
        <Empty icon={cfg.icon} title={`No ${cfg.title.toLowerCase()} yet`}>Add your first entry to populate this section.</Empty>
      ) : (
        <Card className="overflow-x-auto">
          <table className="w-full text-sm">
            <thead>
              <tr className="text-left border-b border-compass-border">
                {cfg.columns.map((c) => (
                  <th key={c.key} className={`muted-label px-5 py-3.5 ${c.right ? "text-right" : ""}`}>{c.label}</th>
                ))}
                {!readOnly && <th className="px-5 py-3.5"></th>}
              </tr>
            </thead>
            <tbody>
              {data.map((row) => (
                <tr key={row.id} className="border-b border-compass-border last:border-0 hover:bg-compass-bg/40" data-testid={`${kind}-row-${row.id}`}>
                  {cfg.columns.map((c) => (
                    <td key={c.key} className={`px-5 py-3.5 ${c.right ? "text-right font-heading font-bold text-compass-navy" : ""} ${c.muted ? "text-compass-muted" : "text-compass-navy"} ${c.bold ? "font-semibold" : ""}`}>
                      {c.badge ? <Badge color="#0052FF" bg="rgba(0,82,255,0.08)">{cellValue(row, c)}</Badge> : cellValue(row, c)}
                    </td>
                  ))}
                  {!readOnly && (
                    <td className="px-5 py-3.5 text-right whitespace-nowrap">
                      <button onClick={() => setModal(row)} className="text-compass-blue hover:bg-compass-blue/10 rounded-lg p-1.5" data-testid={`edit-${row.id}`}><Pencil size={15} /></button>
                      <button onClick={() => del.mutate(row.id)} className="text-compass-red hover:bg-compass-red/10 rounded-lg p-1.5 ml-1" data-testid={`delete-${row.id}`}><Trash2 size={15} /></button>
                    </td>
                  )}
                </tr>
              ))}
            </tbody>
          </table>
          {cfg.footer && <div className="px-5 py-3.5 text-right font-heading font-bold text-compass-navy border-t border-compass-border">{cfg.footer(data)}</div>}
        </Card>
      )}

      <ItemModal open={modal !== null} onClose={() => setModal(null)} cfg={cfg} kind={kind} initial={modal} onSubmit={(b) => save.mutate(b)} loading={save.isPending} />
    </div>
  );
}

function strip(body) {
  const { id, store, scope, household_id, created_at, ...rest } = body;
  return rest;
}

function ItemModal({ open, onClose, cfg, kind, initial, onSubmit, loading }) {
  const [f, setF] = useState({});
  React.useEffect(() => {
    if (open) {
      const base = {};
      cfg.fields.forEach((fl) => { base[fl.key] = initial?.[fl.key] ?? fl.default ?? ""; });
      if (initial?.id) base.id = initial.id;
      setF(base);
    }
  }, [open, initial, cfg]);

  const set = (k) => (e) => setF({ ...f, [k]: e.target.value });

  const submit = () => {
    const out = { ...f };
    cfg.fields.forEach((fl) => { if (fl.type === "number") out[fl.key] = Number(out[fl.key] || 0); });
    onSubmit(out);
  };

  return (
    <Modal open={open} onClose={onClose} title={`${f.id ? "Edit" : "Add"} · ${cfg.title}`} testid={`${kind}-modal`}>
      <div className="space-y-4">
        {cfg.fields.map((fl) => (
          <Field key={fl.key} label={fl.label}>
            {fl.type === "select" ? (
              <Select value={f[fl.key] ?? ""} onChange={set(fl.key)} data-testid={`field-${fl.key}`}>
                {fl.options.map((o) => <option key={o} value={o}>{o}</option>)}
              </Select>
            ) : fl.type === "textarea" ? (
              <textarea className="w-full rounded-xl border border-compass-border bg-white px-4 py-2.5 text-sm text-compass-navy outline-none focus:border-compass-blue focus:ring-2 focus:ring-compass-blue/20" rows={3} value={f[fl.key] ?? ""} onChange={set(fl.key)} data-testid={`field-${fl.key}`} />
            ) : (
              <Input type={fl.type} value={f[fl.key] ?? ""} onChange={set(fl.key)} data-testid={`field-${fl.key}`} />
            )}
          </Field>
        ))}
        <div className="flex gap-2 justify-end pt-2">
          <Button variant="ghost" onClick={onClose}>Cancel</Button>
          <Button onClick={submit} disabled={loading} data-testid={`${kind}-save`}>Save</Button>
        </div>
      </div>
    </Modal>
  );
}
