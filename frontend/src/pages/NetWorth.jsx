import React, { useState } from "react";
import { useQuery, useMutation, useQueryClient } from "@tanstack/react-query";
import { toast } from "sonner";
import { Scale, Plus, Pencil, Trash2, Home, Landmark, GraduationCap, Car } from "lucide-react";
import api, { formatApiError } from "@/lib/api";
import { AreaChart, Area, XAxis, YAxis, Tooltip, ResponsiveContainer } from "recharts";
import { planApi } from "@/lib/planning";
import { useAuth } from "@/context/AuthContext";
import { Card, Button, Input, Field, Select, Badge, Modal, Stat, Empty, RailCard, Donut } from "@/components/ui-kit";
import { PageHeader } from "@/components/PageHeader";
import { useLang, useTr } from "@/lib/i18n";
import { money } from "@/lib/format";
import { derivedLiabilitiesFromAssets } from "@/lib/finance";

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
  const readOnly = user.tier === "enterprise" && !user.enterprise_write;
  const [tab, setTab] = useState("assets");
  const tr = useTr();
  const { lang } = useLang();
  const [modal, setModal] = useState(null); // {} or row

  const nw = useQuery({ queryKey: ["plan", "networth"], queryFn: () => planApi.list("networth") });
  const owners = useQuery({ queryKey: ["owners"], queryFn: async () => (await api.get("/owners")).data });

  const rows = nw.data || [];
  const assets = rows.filter((r) => sectionOf(r) === "assets");
  const liabilities = rows.filter((r) => sectionOf(r) === "liabilities");
  const linkedLiabs = derivedLiabilitiesFromAssets(rows);
  const totalAssets = assets.reduce((s, r) => s + Number(r.value || 0), 0) + rows.filter((r) => sectionOf(r) === "education").reduce((s, r) => s + Number(r.value || 0), 0);
  const totalLiab = liabilities.reduce((s, r) => s + Number(r.value || 0), 0) + linkedLiabs.reduce((s, r) => s + Number(r.value || 0), 0);
  const visible = tab === "liabilities" ? [...liabilities, ...linkedLiabs] : rows.filter((r) => sectionOf(r) === tab);
  const PALETTE = ["#0052FF", "#00DF89", "#FFB800", "#7B61FF", "#06B6D4", "#EE5D50", "#1B2559", "#A3AED0"];
  const allocMap = {};
  [...assets, ...rows.filter((r) => sectionOf(r) === "education")].forEach((r) => { allocMap[r.category] = (allocMap[r.category] || 0) + Number(r.value || 0); });
  const alloc = Object.entries(allocMap).filter(([, v]) => v > 0).map(([name, value], i) => ({ name, value, color: PALETTE[i % PALETTE.length] }));

  const netWorthValue = totalAssets - totalLiab;
  const history = useQuery({
    queryKey: ["nw-history", Math.round(netWorthValue)],
    enabled: !nw.isLoading,
    queryFn: async () => {
      try { await api.post("/plan/networth/snapshot", { value: netWorthValue }); } catch (e) { /* noop */ }
      return (await api.get("/plan/networth/history")).data;
    },
  });
  const MONTHS_EN = ["Jan", "Feb", "Mar", "Apr", "May", "Jun", "Jul", "Aug", "Sep", "Oct", "Nov", "Dec"];
  const MONTHS_FR = ["janv.", "févr.", "mars", "avr.", "mai", "juin", "juil.", "août", "sept.", "oct.", "nov.", "déc."];
  const fmtYm = (ym) => { const [, m] = ym.split("-"); return (lang === "fr" ? MONTHS_FR : MONTHS_EN)[Number(m) - 1]; };
  const trendData = (history.data?.points || []).map((p) => ({ ...p, label: fmtYm(p.ym) }));

  const invalidate = () => { qc.invalidateQueries({ queryKey: ["plan", "networth"] }); qc.invalidateQueries({ queryKey: ["plan", "overview"] }); qc.invalidateQueries({ queryKey: ["nw-history"] }); };
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
      <PageHeader title="Net Worth" icon={Scale} subtitle="Household balance sheet — assets, liabilities and education savings.">
        {readOnly ? <Badge color="#A3AED0" bg="rgba(163,174,208,0.15)">CRM-managed</Badge>
          : <Button onClick={() => quickAdd(quickBtns[0], tab === "liabilities" ? "liability" : "asset")} data-testid="add-networth-button"><Plus size={16} /> {tr("Add entry")}</Button>}
      </PageHeader>

      <div className="grid grid-cols-1 sm:grid-cols-3 gap-4 mb-6">
        <Stat label={tr("Net worth")} value={money(totalAssets - totalLiab)} accent />
        <Stat label={tr("Total assets")} value={money(totalAssets)} />
        <Stat label={tr("Total liabilities")} value={money(totalLiab)} />
      </div>

      <div className="grid lg:grid-cols-3 gap-6">
        <div className="lg:col-span-2">
          <div className="flex gap-1 mb-4 border-b border-compass-border">
            {TABS.map((t) => (
              <button key={t.key} onClick={() => setTab(t.key)} data-testid={`nw-tab-${t.key}`}
                className={`flex items-center gap-2 px-4 py-2.5 text-sm font-semibold border-b-2 -mb-px transition-colors ${tab === t.key ? "border-compass-blue text-compass-blue" : "border-transparent text-compass-muted hover:text-compass-navy"}`}>
                <t.icon size={16} /> {tr(t.label)}
              </button>
            ))}
          </div>

          {!readOnly && (
            <div className="flex flex-wrap gap-2 mb-5">
              <span className="muted-label self-center mr-1">{tr("Quick add:")}</span>
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
                  <th className="muted-label px-5 py-3.5">{tr("Name")}</th>
                  <th className="muted-label px-5 py-3.5">{tr("Owner")}</th>
                  <th className="muted-label px-5 py-3.5">{tr("Category")}</th>
                  {tab === "assets" && <th className="muted-label px-5 py-3.5 text-right">{tr("Mortgage / Loan")}</th>}
                  {tab === "assets" && <th className="muted-label px-5 py-3.5 text-right">{tr("Equity")}</th>}
                  <th className="muted-label px-5 py-3.5 text-right">{tab === "liabilities" ? tr("Balance") : tr("Market value")}</th>
                  {!readOnly && <th className="px-5 py-3.5" />}
                </tr></thead>
                <tbody>
                  {visible.map((r) => (
                    <tr key={r.id} className="border-b border-compass-border last:border-0 hover:bg-compass-bg/40" data-testid={`networth-row-${r.id}`}>
                      <td className="px-5 py-3.5 font-semibold text-compass-navy flex items-center gap-2">
                        {REAL_ESTATE.includes(r.category) && <Home size={14} className="text-compass-blue" />}
                        {r.category === "Vehicle" && <Car size={14} className="text-compass-blue" />}
                        {r.name || "—"}
                        {r.linked && <Badge color="#7B61FF" bg="rgba(123,97,255,0.12)" className="ml-1">{tr("Linked")}</Badge>}
                      </td>
                      <td className="px-5 py-3.5 text-compass-muted">{r.owner || "—"}</td>
                      <td className="px-5 py-3.5"><Badge color="#0052FF" bg="rgba(0,82,255,0.08)">{r.category}</Badge></td>
                      {tab === "assets" && <td className="px-5 py-3.5 text-right text-compass-muted">{encumbrance(r) ? money(encumbrance(r)) : "—"}</td>}
                      {tab === "assets" && <td className="px-5 py-3.5 text-right">{encumbrance(r) > 0 ? <span className="font-semibold text-compass-green">{money(Number(r.value || 0) - encumbrance(r))}</span> : <span className="text-compass-muted">—</span>}</td>}
                      <td className="px-5 py-3.5 text-right font-heading font-bold text-compass-navy">{money(r.value)}</td>
                      {!readOnly && (
                        <td className="px-5 py-3.5 text-right whitespace-nowrap">
                          {r.linked ? (
                            <span className="text-xs text-compass-muted">{tr("from")} {tr(r.source)}</span>
                          ) : (
                            <>
                              <button onClick={() => setModal(r)} className="text-compass-blue hover:bg-compass-blue/10 rounded-lg p-1.5"><Pencil size={15} /></button>
                              <button onClick={() => del.mutate(r.id)} className="text-compass-red hover:bg-compass-red/10 rounded-lg p-1.5 ml-1" data-testid={`delete-${r.id}`}><Trash2 size={15} /></button>
                            </>
                          )}
                        </td>
                      )}
                    </tr>
                  ))}
                </tbody>
              </table>
            </Card>
          )}
        </div>

        <div className="space-y-5">
          <RailCard title="Asset allocation">
            {alloc.length ? (
              <>
                <Donut data={alloc} centerValue={money(totalAssets)} centerLabel={tr("Assets")} />
                <div className="mt-4 space-y-2">
                  {alloc.map((a) => (
                    <div key={a.name} className="flex items-center justify-between text-sm">
                      <span className="flex items-center gap-2 text-compass-navy"><span className="h-2.5 w-2.5 rounded-full shrink-0" style={{ background: a.color }} />{a.name}</span>
                      <span className="font-semibold text-compass-navy">{money(a.value)}</span>
                    </div>
                  ))}
                </div>
              </>
            ) : <p className="text-sm text-compass-muted">{tr("Add assets to see allocation.")}</p>}
          </RailCard>
          <RailCard title="Summary">
            <div className="space-y-2.5">
              <div className="flex justify-between text-sm"><span className="text-compass-muted">{tr("Total assets")}</span><span className="font-semibold text-compass-green">{money(totalAssets)}</span></div>
              <div className="flex justify-between text-sm"><span className="text-compass-muted">{tr("Total liabilities")}</span><span className="font-semibold text-compass-red">{money(totalLiab)}</span></div>
              <div className="flex justify-between text-sm pt-2.5 border-t border-compass-border"><span className="font-bold text-compass-navy">{tr("Net worth")}</span><span className="font-heading font-extrabold text-compass-navy">{money(totalAssets - totalLiab)}</span></div>
            </div>
          </RailCard>
          <RailCard title="Net worth trend">
            {trendData.length >= 2 ? (
              <>
                <ResponsiveContainer width="100%" height={160}>
                  <AreaChart data={trendData} margin={{ left: 0, right: 4, top: 6, bottom: 0 }}>
                    <defs><linearGradient id="nwfill" x1="0" y1="0" x2="0" y2="1"><stop offset="0%" stopColor="#0052FF" stopOpacity={0.3} /><stop offset="100%" stopColor="#0052FF" stopOpacity={0.02} /></linearGradient></defs>
                    <XAxis dataKey="label" tick={{ fill: "#A3AED0", fontSize: 10 }} axisLine={false} tickLine={false} interval="preserveStartEnd" />
                    <YAxis tickFormatter={(v) => `$${Math.round(v / 1000)}k`} tick={{ fill: "#A3AED0", fontSize: 10 }} axisLine={false} tickLine={false} width={40} />
                    <Tooltip formatter={(v) => money(v)} contentStyle={{ borderRadius: 12, border: "1px solid #E2E8F0", fontSize: 12 }} />
                    <Area type="monotone" dataKey="value" stroke="#0052FF" fill="url(#nwfill)" strokeWidth={2} />
                  </AreaChart>
                </ResponsiveContainer>
                {!history.data?.has_real && <p className="text-[11px] text-compass-muted mt-2">{tr("Illustrative until monthly history builds.")}</p>}
              </>
            ) : <p className="text-sm text-compass-muted">{tr("Trend will appear as net worth is tracked over time.")}</p>}
          </RailCard>
        </div>
      </div>

      <EntryModal open={modal !== null} initial={modal} owners={owners.data || []} tab={tab}
        onClose={() => setModal(null)} onSubmit={(b) => save.mutate(b)} loading={save.isPending} />
    </div>
  );
}

const ownerName = (owners, i) => (owners && owners[i] ? owners[i].full_name : "Joint");
const clean = (b) => { const { id, store, scope, household_id, created_at, ...rest } = b; return rest; };
const num = (v) => Number(v || 0);

function EntryModal({ open, initial, owners, tab, onClose, onSubmit, loading }) {
  const tr = useTr();
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
      payment: initial?.payment ?? "", rate: initial?.rate ?? "",
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
    if (isLiab) Object.assign(base, { payment: num(f.payment), rate: num(f.rate) });
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
          <Field label={tr("Owner")}><Select value={f.owner || ""} onChange={set("owner")} data-testid="field-owner">{ownerOpts.map((o) => <option key={o}>{o}</option>)}</Select></Field>
          <Field label={tr("Category")}><Select value={f.category || ""} onChange={set("category")} data-testid="field-category">{cats.map((c) => <option key={c}>{c}</option>)}</Select></Field>
        </div>
        <Field label={tr("Name / notes")}><Input value={f.name || ""} onChange={set("name")} data-testid="field-name" /></Field>
        <Field label={isLiab ? "Balance (CAD)" : group === "real_estate" ? "Total value (CAD)" : group === "vehicle" ? "Current value (CAD)" : group === "investment" ? "Balance (CAD)" : "Market value (CAD)"}>
          <Input type="number" value={f.value ?? ""} onChange={set("value")} data-testid="field-value" />
        </Field>

        {isLiab && (
          <div className="space-y-2 rounded-xl bg-compass-bg/50 p-4" data-testid="liab-fields">
            <div className="grid grid-cols-2 gap-3">
              <Field label="Monthly payment ($)"><Input type="number" value={f.payment ?? ""} onChange={set("payment")} data-testid="field-liab-payment" /></Field>
              <Field label="Interest rate (%)"><Input type="number" step="0.01" value={f.rate ?? ""} onChange={set("rate")} data-testid="field-liab-rate" /></Field>
            </div>
            <p className="text-xs text-compass-muted">{tr("Liabilities with a monthly payment also appear on the Debt page.")}</p>
          </div>
        )}

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
          <Button variant="ghost" onClick={onClose}>{tr("Cancel")}</Button>
          <Button onClick={submit} disabled={loading} data-testid="networth-save">{tr("Save")}</Button>
        </div>
      </div>
    </Modal>
  );
}
