import React, { useState } from "react";
import { useQuery, useMutation, useQueryClient } from "@tanstack/react-query";
import { toast } from "sonner";
import { Scale, Plus, Pencil, Trash2, Home, Landmark, GraduationCap } from "lucide-react";
import api, { formatApiError } from "@/lib/api";
import { planApi } from "@/lib/planning";
import { useAuth } from "@/context/AuthContext";
import { Card, Button, Input, Field, Select, Badge, Modal, Stat, Empty } from "@/components/ui-kit";
import { PageHeader } from "@/components/PageHeader";
import { money } from "@/lib/format";

const ASSET_CATEGORIES = [
  "Principal Residence", "Real Estate (other)", "RRSP", "TFSA", "Non-Registered",
  "Cash / Bank", "Business", "Employer Stock Options", "Other Asset",
];
const LIABILITY_CATEGORIES = ["Mortgage", "Loan", "Credit Card", "Line of Credit", "Student Loan", "Other Liability"];
const EDUCATION_CATEGORIES = ["RESP", "Education Savings", "Other Education"];
const REAL_ESTATE = ["Principal Residence", "Real Estate (other)"];

const TABS = [
  { key: "assets", label: "Assets", icon: Landmark },
  { key: "liabilities", label: "Liabilities", icon: Scale },
  { key: "education", label: "Education", icon: GraduationCap },
];

const sectionOf = (r) => {
  if (EDUCATION_CATEGORIES.includes(r.category)) return "education";
  return r.kind === "liability" ? "liabilities" : "assets";
};

export default function NetWorth() {
  const { user } = useAuth();
  const qc = useQueryClient();
  const readOnly = user.tier === "enterprise";
  const [tab, setTab] = useState("assets");
  const [modal, setModal] = useState(null); // {} or row

  const nw = useQuery({ queryKey: ["plan", "networth"], queryFn: () => planApi.list("networth") });
  const owners = useQuery({ queryKey: ["owners"], queryFn: async () => (await api.get("/owners")).data });

  const rows = nw.data || [];
  const assets = rows.filter((r) => sectionOf(r) === "assets");
  const liabilities = rows.filter((r) => sectionOf(r) === "liabilities");
  const totalAssets = assets.reduce((s, r) => s + Number(r.value || 0), 0) + rows.filter((r) => sectionOf(r) === "education").reduce((s, r) => s + Number(r.value || 0), 0);
  const totalLiab = liabilities.reduce((s, r) => s + Number(r.value || 0), 0);
  const visible = rows.filter((r) => sectionOf(r) === tab);

  const invalidate = () => { qc.invalidateQueries({ queryKey: ["plan", "networth"] }); qc.invalidateQueries({ queryKey: ["plan", "overview"] }); };
  const save = useMutation({
    mutationFn: (b) => (b.id ? planApi.update("networth", b.id, clean(b)) : planApi.create("networth", clean(b))),
    onSuccess: () => { toast.success("Saved"); setModal(null); invalidate(); },
    onError: (e) => toast.error(formatApiError(e.response?.data?.detail)),
  });
  const del = useMutation({ mutationFn: (id) => planApi.remove("networth", id), onSuccess: () => { toast.success("Removed"); invalidate(); } });

  const quickAdd = (category, kind) => setModal({ category, kind, owner: ownerName(owners.data, 0) });

  const quickBtns = tab === "assets" ? ASSET_CATEGORIES : tab === "liabilities" ? LIABILITY_CATEGORIES : EDUCATION_CATEGORIES;

  return (
    <div>
      <PageHeader title="Net Worth" subtitle="Household balance sheet — assets, liabilities and education savings.">
        {readOnly ? <Badge color="#A3AED0" bg="rgba(163,174,208,0.15)">CRM-managed</Badge>
          : <Button onClick={() => quickAdd(quickBtns[0], tab === "liabilities" ? "liability" : "asset")} data-testid="add-networth-button"><Plus size={16} /> Add entry</Button>}
      </PageHeader>

      <div className="grid grid-cols-3 gap-4 mb-6">
        <Stat label="Net worth" value={money(totalAssets - totalLiab)} accent />
        <Stat label="Total assets" value={money(totalAssets)} />
        <Stat label="Total liabilities" value={money(totalLiab)} />
      </div>

      <div className="flex gap-1 mb-4 border-b border-compass-border">
        {TABS.map((t) => (
          <button key={t.key} onClick={() => setTab(t.key)} data-testid={`nw-tab-${t.key}`}
            className={`flex items-center gap-2 px-4 py-2.5 text-sm font-semibold border-b-2 -mb-px transition-colors ${tab === t.key ? "border-compass-blue text-compass-blue" : "border-transparent text-compass-muted hover:text-compass-navy"}`}>
            <t.icon size={16} /> {t.label}
          </button>
        ))}
      </div>

      {!readOnly && (
        <div className="flex flex-wrap gap-2 mb-5">
          <span className="muted-label self-center mr-1">Quick add:</span>
          {quickBtns.map((c) => (
            <button key={c} onClick={() => quickAdd(c, tab === "liabilities" ? "liability" : "asset")}
              className="rounded-full border border-compass-border px-3 py-1.5 text-xs font-semibold text-compass-navy hover:border-compass-blue hover:text-compass-blue transition-colors" data-testid={`quick-${c}`}>
              + {c}
            </button>
          ))}
        </div>
      )}

      {visible.length === 0 ? (
        <Empty icon={TABS.find((t) => t.key === tab).icon} title={`No ${tab} yet`}>Use Quick Add to record an entry.</Empty>
      ) : (
        <Card className="overflow-x-auto">
          <table className="w-full text-sm">
            <thead><tr className="text-left border-b border-compass-border">
              <th className="muted-label px-5 py-3.5">Name</th>
              <th className="muted-label px-5 py-3.5">Owner</th>
              <th className="muted-label px-5 py-3.5">Category</th>
              {tab === "assets" && <th className="muted-label px-5 py-3.5 text-right">Mortgage</th>}
              <th className="muted-label px-5 py-3.5 text-right">{tab === "liabilities" ? "Balance" : "Market value"}</th>
              {!readOnly && <th className="px-5 py-3.5" />}
            </tr></thead>
            <tbody>
              {visible.map((r) => (
                <tr key={r.id} className="border-b border-compass-border last:border-0 hover:bg-compass-bg/40" data-testid={`networth-row-${r.id}`}>
                  <td className="px-5 py-3.5 font-semibold text-compass-navy flex items-center gap-2">
                    {REAL_ESTATE.includes(r.category) && <Home size={14} className="text-compass-blue" />}{r.name || "—"}
                  </td>
                  <td className="px-5 py-3.5 text-compass-muted">{r.owner || "—"}</td>
                  <td className="px-5 py-3.5"><Badge color="#0052FF" bg="rgba(0,82,255,0.08)">{r.category}</Badge></td>
                  {tab === "assets" && <td className="px-5 py-3.5 text-right text-compass-muted">{r.mortgage ? money(r.mortgage) : "—"}</td>}
                  <td className="px-5 py-3.5 text-right font-heading font-bold text-compass-navy">{money(r.value)}</td>
                  {!readOnly && (
                    <td className="px-5 py-3.5 text-right whitespace-nowrap">
                      <button onClick={() => setModal(r)} className="text-compass-blue hover:bg-compass-blue/10 rounded-lg p-1.5"><Pencil size={15} /></button>
                      <button onClick={() => del.mutate(r.id)} className="text-compass-red hover:bg-compass-red/10 rounded-lg p-1.5 ml-1" data-testid={`delete-${r.id}`}><Trash2 size={15} /></button>
                    </td>
                  )}
                </tr>
              ))}
            </tbody>
          </table>
        </Card>
      )}

      <EntryModal open={modal !== null} initial={modal} owners={owners.data || []} tab={tab}
        onClose={() => setModal(null)} onSubmit={(b) => save.mutate(b)} loading={save.isPending} />
    </div>
  );
}

const ownerName = (owners, i) => (owners && owners[i] ? owners[i].full_name : "Joint");
const clean = (b) => { const { id, store, scope, household_id, created_at, ...rest } = b; return rest; };

function EntryModal({ open, initial, owners, tab, onClose, onSubmit, loading }) {
  const isLiab = (initial?.kind === "liability") || tab === "liabilities";
  const isEdu = tab === "education" && !initial?.kind;
  const cats = isLiab ? LIABILITY_CATEGORIES : isEdu ? EDUCATION_CATEGORIES : ASSET_CATEGORIES;
  const [f, setF] = useState({});
  React.useEffect(() => {
    if (open) setF({
      id: initial?.id, kind: initial?.kind || (isLiab ? "liability" : "asset"),
      owner: initial?.owner || (owners[0]?.full_name ?? "Joint"),
      category: initial?.category || cats[0], name: initial?.name || "",
      value: initial?.value ?? "", mortgage: initial?.mortgage ?? "", cash_flow: initial?.cash_flow ?? "",
    });
  }, [open, initial]); // eslint-disable-line
  const set = (k) => (e) => setF({ ...f, [k]: e.target.value });
  const showRE = REAL_ESTATE.includes(f.category);
  const ownerOpts = [...owners.map((o) => o.full_name), "Joint"];

  const submit = () => onSubmit({
    ...f, value: Number(f.value || 0),
    mortgage: showRE ? Number(f.mortgage || 0) : undefined,
    cash_flow: showRE ? Number(f.cash_flow || 0) : undefined,
  });

  return (
    <Modal open={open} onClose={onClose} title={`${f.id ? "Edit" : "Add"} ${isLiab ? "liability" : "asset"}`} testid="networth-modal">
      <div className="space-y-4">
        <div className="grid grid-cols-2 gap-3">
          <Field label="Owner"><Select value={f.owner || ""} onChange={set("owner")} data-testid="field-owner">{ownerOpts.map((o) => <option key={o}>{o}</option>)}</Select></Field>
          <Field label="Category"><Select value={f.category || ""} onChange={set("category")} data-testid="field-category">{cats.map((c) => <option key={c}>{c}</option>)}</Select></Field>
        </div>
        <Field label="Name / notes"><Input value={f.name || ""} onChange={set("name")} data-testid="field-name" /></Field>
        <Field label={isLiab ? "Balance (CAD)" : "Market value (CAD)"}><Input type="number" value={f.value ?? ""} onChange={set("value")} data-testid="field-value" /></Field>
        {showRE && (
          <div className="grid grid-cols-2 gap-3">
            <Field label="Mortgage ($)"><Input type="number" value={f.mortgage ?? ""} onChange={set("mortgage")} data-testid="field-mortgage" /></Field>
            <Field label="Cash flow ($/mo)"><Input type="number" value={f.cash_flow ?? ""} onChange={set("cash_flow")} /></Field>
          </div>
        )}
        <div className="flex gap-2 justify-end pt-2">
          <Button variant="ghost" onClick={onClose}>Cancel</Button>
          <Button onClick={submit} disabled={loading} data-testid="networth-save">Save</Button>
        </div>
      </div>
    </Modal>
  );
}
