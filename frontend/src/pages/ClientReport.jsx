import React, { useMemo, useState, useEffect } from "react";
import { useQuery, useMutation, useQueryClient } from "@tanstack/react-query";
import { jsPDF } from "jspdf";
import { toast } from "sonner";
import { FileBarChart, Download, Upload, Mail, Palette, History, Scale } from "lucide-react";
import api, { formatApiError } from "@/lib/api";
import { planApi } from "@/lib/planning";
import { useAuth } from "@/context/AuthContext";
import { Card, Button, Stat, Badge, Field, Input, Empty, Modal } from "@/components/ui-kit";
import { PageHeader } from "@/components/PageHeader";
import { money } from "@/lib/format";
import { estateEstimate } from "@/lib/tax";

const LIFE = ["Term Life", "Whole Life"];
const DI = ["Disability"];
const LTC = ["Critical Illness", "Long-Term Care", "Health"];
const REGISTERED_ACCT = ["RRSP", "RRIF", "DC Pension", "DB Pension", "Group RRSP"];
const PROVINCES = ["ON", "BC", "AB", "QC"];

export default function ClientReport() {
  const { user } = useAuth();
  const qc = useQueryClient();
  const brandKey = `compass_brand_${user.id}`;
  const [brand, setBrand] = useState({ firm_name: "Compass Planning", cover_note: "", logo: "" });
  const [recipient, setRecipient] = useState("");
  const [historyModal, setHistoryModal] = useState(null);

  const brandingQ = useQuery({ queryKey: ["branding"], queryFn: async () => (await api.get("/advisor/branding")).data });
  useEffect(() => {
    if (brandingQ.data && Object.keys(brandingQ.data).length) setBrand((b) => ({ ...b, ...brandingQ.data }));
    else { try { const s = JSON.parse(localStorage.getItem(brandKey) || "{}"); if (s && Object.keys(s).length) setBrand((b) => ({ ...b, ...s })); } catch { /* ignore */ } }
  }, [brandingQ.data, brandKey]);

  const saveBrand = useMutation({ mutationFn: (b) => api.put("/advisor/branding", b) });
  const persist = (next) => { setBrand(next); localStorage.setItem(brandKey, JSON.stringify(next)); saveBrand.mutate(next); };

  const overview = useQuery({ queryKey: ["plan", "overview"], queryFn: planApi.overview });
  const owners = useQuery({ queryKey: ["owners"], queryFn: async () => (await api.get("/owners")).data });
  const insurance = useQuery({ queryKey: ["plan", "insurance"], queryFn: () => planApi.list("insurance") });
  const debts = useQuery({ queryKey: ["plan", "debts"], queryFn: () => planApi.list("debts") });
  const retirement = useQuery({ queryKey: ["plan", "retirement"], queryFn: () => planApi.list("retirement") });
  const goals = useQuery({ queryKey: ["goals"], queryFn: async () => (await api.get("/goals")).data });
  const estate = useQuery({ queryKey: ["plan", "estate"], queryFn: () => planApi.list("estate") });
  const networth = useQuery({ queryKey: ["plan", "networth"], queryFn: () => planApi.list("networth") });
  const accounts = useQuery({ queryKey: ["accounts"], queryFn: async () => (await api.get("/accounts")).data });
  const history = useQuery({ queryKey: ["report-history"], queryFn: async () => (await api.get("/report/history")).data });

  const data = useMemo(() => {
    const o = overview.data || {};
    const owns = owners.data || [];
    const primary = owns.find((x) => x.relationship === "self") || owns[0];
    const household = primary ? `The ${primary.full_name.split(" ").slice(-1)[0]} Household` : "Household";
    const province = PROVINCES.includes(primary?.province) ? primary.province : "ON";
    const income = owns.reduce((s, x) => s + Number(x.annual_income || 0), 0);
    const dependants = owns.filter((x) => ["dependent", "child"].includes(x.relationship)).length;
    const totalDebt = (debts.data || []).reduce((s, d) => s + Number(d.balance || 0), 0);
    const pol = insurance.data || [];
    const cover = (t) => pol.filter((p) => t.includes(p.policy_type)).reduce((s, p) => s + Number(p.coverage || 0), 0);
    const pct = (have, rec) => (rec > 0 ? Math.min(100, Math.round((have / rec) * 100)) : have > 0 ? 100 : 0);
    const protection = Math.round(0.5 * pct(cover(LIFE), 10 * income + totalDebt + 100000 * dependants) + 0.3 * pct(cover(DI), (0.65 * income) / 12) + 0.2 * pct(cover(LTC), 300000));
    const success = (retirement.data || []).slice(-1)[0]?.success_prob ?? null;
    const registeredValue = (networth.data || []).filter((r) => r.kind === "asset" && r.category === "RRSP").reduce((s, r) => s + Number(r.value || 0), 0)
      + (accounts.data || []).filter((a) => REGISTERED_ACCT.includes(a.account_type)).reduce((s, a) => s + Number(a.balance || 0), 0);
    const est = estateEstimate({ estateValue: o.netWorth || 0, registeredValue, province });
    const rows = estate.data || [];
    return {
      household, province, netWorth: o.netWorth || 0, assets: o.totalAssets || 0, liabilities: o.totalLiabilities || 0,
      monthlyExpenses: o.monthlyExpenses || 0, protection, success, members: owns.map((x) => x.full_name),
      goals: (goals.data || []).slice(0, 5),
      estEstimate: est, beneficiaries: rows.filter((r) => r.kind === "beneficiary"), documents: rows.filter((r) => r.kind === "document"),
    };
  }, [overview.data, owners.data, insurance.data, debts.data, retirement.data, goals.data, estate.data, networth.data, accounts.data]);

  const onLogo = (e) => {
    const file = e.target.files?.[0]; if (!file) return;
    if (file.size > 400000) { toast.error("Logo too large (max 400KB)"); return; }
    const reader = new FileReader();
    reader.onload = () => persist({ ...brand, logo: reader.result });
    reader.readAsDataURL(file);
  };

  const emailMut = useMutation({
    mutationFn: () => api.post("/report/email", { recipient, net_worth: data.netWorth, protection_score: data.protection, retirement_success: data.success }),
    onSuccess: () => { toast.success(`Summary emailed to ${recipient}`); qc.invalidateQueries({ queryKey: ["report-history"] }); },
    onError: (e) => toast.error(formatApiError(e.response?.data?.detail)),
  });

  const download = () => {
    const doc = new jsPDF();
    const W = 210;
    doc.setFillColor(0, 82, 255); doc.rect(0, 0, W, 30, "F");
    doc.setTextColor(255, 255, 255); doc.setFont("helvetica", "bold"); doc.setFontSize(20);
    doc.text(brand.firm_name || "Compass Planning", 14, 15);
    doc.setFont("helvetica", "normal"); doc.setFontSize(10);
    doc.text("Household Financial Summary", 14, 22);
    if (brand.logo) { try { doc.addImage(brand.logo, brand.logo.includes("image/png") ? "PNG" : "JPEG", W - 34, 6, 20, 18); } catch { /* ignore */ } }
    doc.setFontSize(9); doc.text(new Date().toLocaleDateString("en-CA", { dateStyle: "long" }), W - 14, 28, { align: "right" });

    let y = 42;
    doc.setTextColor(11, 20, 55); doc.setFont("helvetica", "bold"); doc.setFontSize(16);
    doc.text(data.household, 14, y);
    doc.setFont("helvetica", "normal"); doc.setFontSize(10); doc.setTextColor(120, 130, 160);
    doc.text(data.members.join(" · ") || "", 14, y + 6);

    if (brand.cover_note) {
      y += 14; doc.setTextColor(60, 70, 100); doc.setFontSize(10);
      const lines = doc.splitTextToSize(brand.cover_note, W - 28);
      doc.text(lines, 14, y); y += Math.min(30, lines.length * 5);
    }

    y += 16;
    const kpi = (label, value, x) => {
      doc.setDrawColor(226, 232, 240); doc.setFillColor(248, 250, 252);
      doc.roundedRect(x, y, 57, 24, 2, 2, "FD");
      doc.setTextColor(120, 130, 160); doc.setFontSize(8); doc.text(label, x + 4, y + 7);
      doc.setTextColor(11, 20, 55); doc.setFont("helvetica", "bold"); doc.setFontSize(13);
      doc.text(value, x + 4, y + 17); doc.setFont("helvetica", "normal");
    };
    kpi("NET WORTH", money(data.netWorth), 14);
    kpi("PROTECTION SCORE", `${data.protection}/100`, 76.5);
    kpi("RETIREMENT SUCCESS", data.success != null ? `${data.success}%` : "Not run", 139);

    const section = (title) => { y += 12; doc.setTextColor(11, 20, 55); doc.setFont("helvetica", "bold"); doc.setFontSize(12); doc.text(title, 14, y); y += 7; doc.setFont("helvetica", "normal"); doc.setFontSize(10); doc.setTextColor(60, 70, 100); };
    const line = (label, value) => { doc.text(String(label), 16, y); doc.text(String(value), W - 14, y, { align: "right" }); y += 6.5; };

    y += 24; section("Balance sheet");
    line("Total assets", money(data.assets));
    line("Total liabilities", money(data.liabilities));
    line("Monthly expenses", money(data.monthlyExpenses));

    section("Top goals");
    if (data.goals.length === 0) line("No goals on file.", "");
    data.goals.forEach((g) => { const p = g.target_amount ? Math.round((g.current_amount / g.target_amount) * 100) : 0; line(g.title, `${money(g.current_amount)} / ${money(g.target_amount)} · ${p}%`); });

    section(`Estate (${data.province})`);
    line("Estimated probate fees", money(data.estEstimate.probate));
    line("Deemed-disposition tax", money(data.estEstimate.deemedTax));
    line("Estimated settlement cost", money(data.estEstimate.total));
    data.beneficiaries.slice(0, 4).forEach((b) => line(`Beneficiary · ${b.asset || "Asset"}`, `${b.beneficiary || "—"}${b.allocation ? ` (${b.allocation}%)` : ""}`));
    data.documents.slice(0, 4).forEach((d) => line(`${d.doc_type || "Document"} · ${d.asset || d.name || ""}`, d.status || ""));
    if (data.beneficiaries.length === 0 && data.documents.length === 0) line("No estate register entries.", "");

    doc.setDrawColor(226, 232, 240); doc.line(14, 284, W - 14, 284);
    doc.setFontSize(8); doc.setTextColor(150, 160, 185);
    doc.text(`Prepared by ${brand.firm_name || "Compass Planning"}. Illustrative summary — not financial, tax or legal advice.`, 14, 289);
    doc.save(`${data.household.replace(/\s+/g, "-")}-summary.pdf`);
    toast.success("Report downloaded");
  };

  return (
    <div>
      <PageHeader title="Client Report" subtitle="A branded one-page household summary you can download and share.">
        <Button onClick={download} data-testid="download-report"><Download size={16} /> Download PDF</Button>
      </PageHeader>

      <div className="grid lg:grid-cols-3 gap-6">
        <Card className="p-6 lg:col-span-2" data-testid="report-preview">
          <div className="flex items-center gap-3 mb-6">
            {brand.logo
              ? <img src={brand.logo} alt="logo" className="h-11 w-11 rounded-xl object-contain bg-white border border-compass-border" data-testid="brand-logo-preview" />
              : <div className="h-11 w-11 rounded-xl gradient-bg flex items-center justify-center text-white"><FileBarChart size={22} /></div>}
            <div>
              <div className="font-heading text-xl font-extrabold text-compass-navy">{brand.firm_name || "Compass Planning"}</div>
              <div className="text-sm text-compass-muted">{data.household} · {data.members.join(" · ")}</div>
            </div>
          </div>

          {brand.cover_note && <p className="text-sm text-compass-navy bg-compass-bg rounded-xl p-4 mb-6" data-testid="cover-note-preview">{brand.cover_note}</p>}

          <div className="grid grid-cols-3 gap-4 mb-6">
            <Stat label="Net worth" value={money(data.netWorth)} accent />
            <Stat label="Protection score" value={`${data.protection}/100`} />
            <Stat label="Retirement success" value={data.success != null ? `${data.success}%` : "Not run"} />
          </div>

          <div className="grid md:grid-cols-2 gap-6 mb-6">
            <div>
              <div className="muted-label mb-2">Balance sheet</div>
              <Row label="Total assets" value={money(data.assets)} />
              <Row label="Total liabilities" value={money(data.liabilities)} />
              <Row label="Monthly expenses" value={money(data.monthlyExpenses)} />
            </div>
            <div>
              <div className="muted-label mb-2">Top goals</div>
              {data.goals.length === 0 ? <div className="text-sm text-compass-muted">No goals on file.</div> :
                data.goals.map((g) => { const p = g.target_amount ? Math.round((g.current_amount / g.target_amount) * 100) : 0; return <Row key={g.id} label={g.title} value={<Badge color="#0052FF" bg="rgba(0,82,255,0.08)">{p}%</Badge>} />; })}
            </div>
          </div>

          <div data-testid="report-estate-section">
            <div className="muted-label mb-2 flex items-center gap-1.5"><Scale size={13} /> Estate ({data.province})</div>
            <div className="grid grid-cols-3 gap-4 mb-3">
              <Row label="Probate fees" value={money(data.estEstimate.probate)} />
              <Row label="Deemed tax" value={money(data.estEstimate.deemedTax)} />
              <Row label="Settlement cost" value={money(data.estEstimate.total)} />
            </div>
            {(data.beneficiaries.length > 0 || data.documents.length > 0) ? (
              <div className="grid md:grid-cols-2 gap-6">
                <div>{data.beneficiaries.slice(0, 4).map((b) => <Row key={b.id} label={`${b.asset || "Asset"} → ${b.beneficiary || "—"}`} value={b.allocation ? `${b.allocation}%` : "—"} />)}</div>
                <div>{data.documents.slice(0, 4).map((d) => <Row key={d.id} label={`${d.doc_type || "Document"}`} value={<Badge color="#0052FF" bg="rgba(0,82,255,0.08)">{d.status}</Badge>} />)}</div>
              </div>
            ) : <div className="text-sm text-compass-muted">No estate register entries.</div>}
          </div>
        </Card>

        <div className="space-y-6">
          <Card className="p-6" data-testid="branding-panel">
            <h3 className="font-heading font-bold text-compass-navy mb-4 flex items-center gap-2"><Palette size={18} className="text-compass-blue" /> Branding</h3>
            <div className="space-y-4">
              <Field label="Firm name"><Input value={brand.firm_name} onChange={(e) => persist({ ...brand, firm_name: e.target.value })} data-testid="brand-firm-name" /></Field>
              <Field label="Cover note">
                <textarea value={brand.cover_note} onChange={(e) => persist({ ...brand, cover_note: e.target.value })} rows={3}
                  className="w-full rounded-xl border border-compass-border px-3.5 py-2.5 text-sm focus:outline-none focus:ring-2 focus:ring-compass-blue/30"
                  placeholder="A short note that appears under the header…" data-testid="brand-cover-note" />
              </Field>
              <div>
                <div className="muted-label mb-2">Logo</div>
                <label className="inline-flex items-center gap-2 rounded-xl border border-compass-border px-3.5 py-2.5 text-sm font-semibold text-compass-navy hover:border-compass-blue cursor-pointer" data-testid="brand-logo-upload">
                  <Upload size={15} /> {brand.logo ? "Replace logo" : "Upload logo"}
                  <input type="file" accept="image/png,image/jpeg" className="hidden" onChange={onLogo} />
                </label>
                {brand.logo && <button className="ml-3 text-xs text-compass-red font-semibold" onClick={() => persist({ ...brand, logo: "" })} data-testid="brand-logo-remove">Remove</button>}
              </div>
              <p className="text-xs text-compass-muted">Branding is saved to your advisor profile and follows you across devices.</p>
            </div>
          </Card>

          <Card className="p-6" data-testid="email-panel">
            <h3 className="font-heading font-bold text-compass-navy mb-4 flex items-center gap-2"><Mail size={18} className="text-compass-blue" /> Email to client</h3>
            <Field label="Recipient email"><Input type="email" value={recipient} onChange={(e) => setRecipient(e.target.value)} placeholder="client@email.com" data-testid="email-recipient" /></Field>
            <Button className="w-full mt-4" disabled={!recipient || emailMut.isPending} onClick={() => emailMut.mutate()} data-testid="send-email-button">
              <Mail size={16} /> {emailMut.isPending ? "Sending…" : "Send summary"}
            </Button>
          </Card>

          <Card className="p-6" data-testid="report-history">
            <h3 className="font-heading font-bold text-compass-navy mb-4 flex items-center gap-2"><History size={18} className="text-compass-blue" /> Sent history</h3>
            {(history.data || []).length === 0 ? (
              <Empty icon={History} title="Nothing sent yet">Emailed summaries will be logged here.</Empty>
            ) : (
              <div className="space-y-2.5">
                {history.data.map((h, i) => (
                  <button key={i} onClick={() => setHistoryModal(h)} className="w-full flex items-center justify-between text-sm hover:bg-compass-bg rounded-lg px-2 py-1.5 -mx-2 transition-colors" data-testid={`history-row-${i}`}>
                    <span className="text-compass-navy truncate">{h.recipient}</span>
                    <span className="text-xs text-compass-muted shrink-0 ml-2">{new Date(h.sent_at).toLocaleDateString("en-CA", { month: "short", day: "numeric", year: "numeric" })}</span>
                  </button>
                ))}
              </div>
            )}
          </Card>
        </div>
      </div>

      <Modal open={!!historyModal} onClose={() => setHistoryModal(null)} title="Sent summary" testid="history-modal">
        {historyModal && (
          <div className="space-y-2 text-sm">
            <Row label="Recipient" value={historyModal.recipient} />
            <Row label="Sent" value={historyModal.sent_at ? new Date(historyModal.sent_at).toLocaleString("en-CA") : "—"} />
            <Row label="Net worth" value={money(historyModal.net_worth)} />
            <Row label="Protection score" value={`${historyModal.protection_score}/100`} />
            <Row label="Retirement success" value={historyModal.retirement_success != null ? `${historyModal.retirement_success}%` : "Not run"} />
          </div>
        )}
      </Modal>
    </div>
  );
}

function Row({ label, value }) {
  return <div className="flex justify-between items-center text-sm py-1.5 border-b border-compass-border last:border-0"><span className="text-compass-muted truncate pr-2">{label}</span><span className="font-semibold text-compass-navy shrink-0">{value}</span></div>;
}
