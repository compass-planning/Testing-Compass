import React, { useState } from "react";
import { useQuery, useMutation, useQueryClient } from "@tanstack/react-query";
import { toast } from "sonner";
import { Scale, Plus, Pencil, Trash2, Home, Landmark, GraduationCap, Car } from "lucide-react";
import api, { formatApiError } from "@/lib/api";
import { planApi } from "@/lib/planning";
import { useAuth } from "@/context/AuthContext";
import { Card, Button, Input, Field, Select, Badge, Modal, Stat, Empty } from "@/components/ui-kit";
import { PageHeader } from "@/components/PageHeader";
import { money } from "@/lib/format";

const ASSET_CATEGORIES = [
  "Principal Residence", "Real Estate (other)", "RRSP", "TFSA", "Non-Registered",
  "Cash / Bank", "Vehicle", "Business", "Employer Stock Options", "Other Asset",
];
const LIABILITY_CATEGORIES = ["Mortgage", "Loan", "Credit Card", "Line of Credit", "Student Loan", "Other Liability"];
const EDUCATION_CATEGORIES = ["RESP", "Education Savings", "Other Education"];
const REAL_ESTATE = ["Principal Residence", "Real Estate (other)"];
const INVESTMENT = ["RRSP", "TFSA", "Non-Registered"];
const FREQUENCIES = ["Monthly", "Bi-weekly", "Weekly", "Annual"];
const HOLDING_TYPES = ["GIC", "Segregated Fund", "Mutual Fund", "Stock", "Cash", "Bond", "ETF", "Other"];

const groupOf = (cat) =>
  REAL_ESTATE.includes(cat) ? "real_estate" : INVESTMENT.includes(cat) ? "investment" : cat === "Vehicle" ? "vehicle" : "basic";

const TABS = [
  { key: "assets", label: "Assets", icon: Landmark },
  { key: "liabilities", label: "Liabilities", icon: Scale },
  { key: "education", label: "Education", icon: GraduationCap },
];

const sectionOf = (r) => {
  if (EDUCATION_CATEGORIES.includes(r.category)) return "education";
  return r.kind === "liability" ? "liabilities" : "assets";
};
const encumbrance = (r) => Number(r.mortgage || r.loan_amount || 0);

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
              {tab === "assets" && <th className="muted-label px-5 py-3.5 text-right">Mortgage / Loan</th>}
              <th className="muted-label px-5 py-3.5 text-right">{tab === "liabilities" ? "Balance" : "Market value"}</th>
              {!readOnly && <th className="px-5 py-3.5" />}
            </tr></thead>
            <tbody>
              {visible.map((r) => (
                <tr key={r.id} className="border-b border-compass-border last:border-0 hover:bg-compass-bg/40" data-testid={`networth-row-${r.id}`}>
                  <td className="px-5 py-3.5 font-semibold text-compass-navy flex items-center gap-2">
                    {REAL_ESTATE.includes(r.category) && <Home size={14} className="text-compass-blue" />}
                    {r.category === "Vehicle" && <Car size={14} className="text-compass-blue" />}
                    {r.name || "—"}
                  </td>
                  <td className="px-5 py-3.5 text-compass-muted">{r.owner || "—"}</td>
                  <td className="px-5 py-3.5"><Badge color="#0052FF" bg="rgba(0,82,255,0.08)">{r.category}</Badge></td>
                  {tab === "assets" && <td className="px-5 py-3.5 text-right text-compass-muted">{encumbrance(r) ? money(encumbrance(r)) : "—"}</td>}
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
const num = (v) => Number(v || 0);

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
      value: initial?.value ?? "",
      // real estate
      mortgage: initial?.mortgage ?? "", mortgage_payment: initial?.mortgage_payment ?? "",
      payment_frequency: initial?.payment_frequency ?? "Monthly", property_taxes: initial?.property_taxes ?? "",
      interest_rate: initial?.interest_rate ?? "", is_rental: initial?.is_rental ? "yes" : "no",
      rental_income: initial?.rental_income ?? "", in_holding_company: initial?.in_holding_company ? "yes" : "no",
      // investment
      contribution: initial?.contribution ?? "", contribution_frequency: initial?.contribution_frequency ?? "Monthly",
      holding_type: initial?.holding_type ?? HOLDING_TYPES[0],
      // vehicle
      purchase_price: initial?.purchase_price ?? "", loan_amount: initial?.loan_amount ?? "",
      payment: initial?.payment ?? "", purchase_date: initial?.purchase_date ?? "",
      loan_length_years: initial?.loan_length_years ?? "",
    });
  }, [open, initial]); // eslint-disable-line
  const set = (k) => (e) => setF({ ...f, [k]: e.target.value });
  const group = groupOf(f.category);
  const isRental = f.is_rental === "yes";
  const ownerOpts = [...owners.map((o) => o.full_name), "Joint"];

  const submit = () => {
    const base = {
      id: f.id, kind: f.kind, owner: f.owner, category: f.category, name: f.name,
      value: num(f.value),
    };
    if (group === "real_estate") Object.assign(base, {
      mortgage: num(f.mortgage), mortgage_payment: num(f.mortgage_payment),
      payment_frequency: f.payment_frequency, property_taxes: num(f.property_taxes),
      interest_rate: num(f.interest_rate), is_rental: isRental,
      rental_income: isRental ? num(f.rental_income) : 0,
      in_holding_company: isRental ? f.in_holding_company === "yes" : false,
    });
    if (group === "investment") Object.assign(base, {
      contribution: num(f.contribution), contribution_frequency: f.contribution_frequency,
      holding_type: f.holding_type,
    });
    if (group === "vehicle") Object.assign(base, {
      purchase_price: num(f.purchase_price), loan_amount: num(f.loan_amount),
      interest_rate: num(f.interest_rate), payment: num(f.payment),
      payment_frequency: f.payment_frequency, purchase_date: f.purchase_date,
      loan_length_years: num(f.loan_length_years),
    });
    onSubmit(base);
  };

  return (
    <Modal open={open} onClose={onClose} title={`${f.id ? "Edit" : "Add"} ${isLiab ? "liability" : "asset"}`} testid="networth-modal">
      <div className="space-y-4">
        <div className="grid grid-cols-2 gap-3">
          <Field label="Owner"><Select value={f.owner || ""} onChange={set("owner")} data-testid="field-owner">{ownerOpts.map((o) => <option key={o}>{o}</option>)}</Select></Field>
          <Field label="Category"><Select value={f.category || ""} onChange={set("category")} data-testid="field-category">{cats.map((c) => <option key={c}>{c}</option>)}</Select></Field>
        </div>
        <Field label="Name / notes"><Input value={f.name || ""} onChange={set("name")} data-testid="field-name" /></Field>
        <Field label={isLiab ? "Balance (CAD)" : group === "real_estate" ? "Total value (CAD)" : group === "vehicle" ? "Current value (CAD)" : group === "investment" ? "Balance (CAD)" : "Market value (CAD)"}>
          <Input type="number" value={f.value ?? ""} onChange={set("value")} data-testid="field-value" />
        </Field>

        {group === "real_estate" && (
          <div className="space-y-4 rounded-xl bg-compass-bg/50 p-4" data-testid="re-fields">
            <div className="grid grid-cols-2 gap-3">
              <Field label="Mortgage amount ($)"><Input type="number" value={f.mortgage ?? ""} onChange={set("mortgage")} data-testid="field-mortgage" /></Field>
              <Field label="Interest rate (%)"><Input type="number" step="0.01" value={f.interest_rate ?? ""} onChange={set("interest_rate")} data-testid="field-interest-rate" /></Field>
            </div>
            <div className="grid grid-cols-2 gap-3">
              <Field label="Mortgage payment ($)"><Input type="number" value={f.mortgage_payment ?? ""} onChange={set("mortgage_payment")} data-testid="field-mortgage-payment" /></Field>
              <Field label="Payment frequency"><Select value={f.payment_frequency || "Monthly"} onChange={set("payment_frequency")} data-testid="field-payment-frequency">{FREQUENCIES.map((x) => <option key={x}>{x}</option>)}</Select></Field>
            </div>
            <div className="grid grid-cols-2 gap-3">
              <Field label="Property taxes ($/yr)"><Input type="number" value={f.property_taxes ?? ""} onChange={set("property_taxes")} data-testid="field-property-taxes" /></Field>
              <Field label="Rental property?"><Select value={f.is_rental || "no"} onChange={set("is_rental")} data-testid="field-is-rental"><option value="no">No</option><option value="yes">Yes</option></Select></Field>
            </div>
            {isRental && (
              <div className="grid grid-cols-2 gap-3">
                <Field label="Monthly rental income ($)"><Input type="number" value={f.rental_income ?? ""} onChange={set("rental_income")} data-testid="field-rental-income" /></Field>
                <Field label="Held in a holding company?"><Select value={f.in_holding_company || "no"} onChange={set("in_holding_company")} data-testid="field-in-holding-company"><option value="no">No</option><option value="yes">Yes</option></Select></Field>
              </div>
            )}
            {isRental && f.in_holding_company === "yes" && (
              <p className="text-xs text-compass-muted" data-testid="holdco-note">Income held in a holding company is excluded from household cash flow.</p>
            )}
          </div>
        )}

        {group === "investment" && (
          <div className="space-y-4 rounded-xl bg-compass-bg/50 p-4" data-testid="inv-fields">
            <Field label="Holding type"><Select value={f.holding_type || HOLDING_TYPES[0]} onChange={set("holding_type")} data-testid="field-holding-type">{HOLDING_TYPES.map((x) => <option key={x}>{x}</option>)}</Select></Field>
            <div className="grid grid-cols-2 gap-3">
              <Field label="Contribution amount ($)"><Input type="number" value={f.contribution ?? ""} onChange={set("contribution")} data-testid="field-contribution" /></Field>
              <Field label="Contribution frequency"><Select value={f.contribution_frequency || "Monthly"} onChange={set("contribution_frequency")} data-testid="field-contribution-frequency">{FREQUENCIES.map((x) => <option key={x}>{x}</option>)}</Select></Field>
            </div>
          </div>
        )}

        {group === "vehicle" && (
          <div className="space-y-4 rounded-xl bg-compass-bg/50 p-4" data-testid="veh-fields">
            <div className="grid grid-cols-2 gap-3">
              <Field label="Purchase price ($)"><Input type="number" value={f.purchase_price ?? ""} onChange={set("purchase_price")} data-testid="field-purchase-price" /></Field>
              <Field label="Loan amount ($)"><Input type="number" value={f.loan_amount ?? ""} onChange={set("loan_amount")} data-testid="field-loan-amount" /></Field>
            </div>
            <div className="grid grid-cols-2 gap-3">
              <Field label="Interest rate (%)"><Input type="number" step="0.01" value={f.interest_rate ?? ""} onChange={set("interest_rate")} data-testid="field-veh-interest-rate" /></Field>
              <Field label="Payment ($)"><Input type="number" value={f.payment ?? ""} onChange={set("payment")} data-testid="field-payment" /></Field>
            </div>
            <div className="grid grid-cols-2 gap-3">
              <Field label="Payment frequency"><Select value={f.payment_frequency || "Monthly"} onChange={set("payment_frequency")} data-testid="field-veh-payment-frequency">{FREQUENCIES.map((x) => <option key={x}>{x}</option>)}</Select></Field>
              <Field label="Loan length (years)"><Input type="number" value={f.loan_length_years ?? ""} onChange={set("loan_length_years")} data-testid="field-loan-length" /></Field>
            </div>
            <Field label="Purchase date"><Input type="date" value={f.purchase_date ?? ""} onChange={set("purchase_date")} data-testid="field-purchase-date" /></Field>
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
