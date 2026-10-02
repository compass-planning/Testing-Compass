import React, { useMemo, useState, useEffect } from "react";
import { useQuery, useMutation, useQueryClient } from "@tanstack/react-query";
import { jsPDF } from "jspdf";
import { toast } from "sonner";
import { FileBarChart, Download, Upload, Mail, Palette, History, Scale, FileText } from "lucide-react";
import api, { formatApiError } from "@/lib/api";
import { planApi, docsApi, crossBorderApi, educationApi } from "@/lib/planning";
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
  const [brand, setBrand] = useState({ firm_name: "Compass Planning", cover_note: "", logo: "", logo_url: "" });
  const [recipient, setRecipient] = useState("");
  const [attached, setAttached] = useState([]);
  const [sections, setSections] = useState({ retirement: true, protection: true, estate: true, crossborder: true, education: true, goals: true, documents: true });
  const toggleSection = (k) => setSections((s) => ({ ...s, [k]: !s[k] }));
  const activeSections = () => Object.keys(sections).filter((k) => sections[k]);
  const [historyModal, setHistoryModal] = useState(null);
  const [historyVisible, setHistoryVisible] = useState(5);

  const brandingQ = useQuery({ queryKey: ["branding"], queryFn: async () => (await api.get("/advisor/branding")).data });
  useEffect(() => {
    if (brandingQ.data && Object.keys(brandingQ.data).length) setBrand((b) => ({ ...b, ...brandingQ.data }));
    else { try { const s = JSON.parse(localStorage.getItem(brandKey) || "{}"); if (s && Object.keys(s).length) setBrand((b) => ({ ...b, ...s })); } catch { /* ignore */ } }
  }, [brandingQ.data, brandKey]);

  const saveBrand = useMutation({ mutationFn: (b) => api.put("/advisor/branding", b) });
  const saveTimer = React.useRef();
  const persist = (next) => {
    setBrand(next);
    localStorage.setItem(brandKey, JSON.stringify(next));
    clearTimeout(saveTimer.current);
    saveTimer.current = setTimeout(() => saveBrand.mutate(next), 600);
  };

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
  const vault = useQuery({ queryKey: ["doc-files"], queryFn: docsApi.list });
  const crossborder = useQuery({ queryKey: ["crossborder-saved"], queryFn: crossBorderApi.saved });
  const education = useQuery({ queryKey: ["education-saved"], queryFn: educationApi.saved });
  const protection = useQuery({ queryKey: ["plan", "protection"], queryFn: () => planApi.list("protection") });

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
    const protection = o.protection_score != null ? o.protection_score : Math.round(0.5 * pct(cover(LIFE), 10 * income + totalDebt + 100000 * dependants) + 0.3 * pct(cover(DI), (0.65 * income) / 12) + 0.2 * pct(cover(LTC), 300000));
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
    reader.onload = async () => {
      const next = { ...brand, logo: reader.result };
      persist(next); // data URI drives the on-screen preview + in-browser PDF
      try {
        const fd = new FormData();
        fd.append("file", file);
        const { data } = await api.post("/advisor/branding/logo", fd, { headers: { "Content-Type": "multipart/form-data" } });
        if (data?.logo_path) persist({ ...next, logo_url: `${process.env.REACT_APP_BACKEND_URL}/api/public/logo/${user.id}` }); // hosted URL used in emails
      } catch (err) { toast.error(formatApiError(err.response?.data?.detail)); }
    };
    reader.readAsDataURL(file);
  };

  const emailMut = useMutation({
    mutationFn: () => api.post("/report/email", { recipient, net_worth: data.netWorth, protection_score: data.protection, retirement_success: data.success, document_ids: attached, sections: activeSections() }),
    onSuccess: () => { toast.success(`Summary emailed to ${recipient}`); setAttached([]); qc.invalidateQueries({ queryKey: ["report-history"] }); },
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

    if (sections.goals) {
      section("Top goals");
      if (data.goals.length === 0) line("No goals on file.", "");
      data.goals.forEach((g) => { const p = g.target_amount ? Math.round((g.current_amount / g.target_amount) * 100) : 0; line(g.title, `${money(g.current_amount)} / ${money(g.target_amount)} · ${p}%`); });
    }

    if (sections.estate) {
    section(`Estate (${data.province})`);
    line("Estimated probate fees", money(data.estEstimate.probate));
    line("Deemed-disposition tax", money(data.estEstimate.deemedTax));
    line("Estimated settlement cost", money(data.estEstimate.total));
    data.beneficiaries.slice(0, 4).forEach((b) => line(`Beneficiary · ${b.asset || "Asset"}`, `${b.beneficiary || "—"}${b.allocation ? ` (${b.allocation}%)` : ""}`));
    data.documents.slice(0, 4).forEach((d) => line(`${d.doc_type || "Document"} · ${d.asset || d.name || ""}`, d.status || ""));
    if (data.beneficiaries.length === 0 && data.documents.length === 0) line("No estate register entries.", "");
    }

    const cb = crossborder.data?.result;
    if (sections.crossborder && cb) {
      section("US / cross-border");
      line("Jurisdiction", cb.jurisdiction?.label || "—");
      if (cb.us_tax) { line("US federal tax", money(cb.us_tax.federal_tax)); line(`US state tax (${cb.us_tax.state})`, money(cb.us_tax.state_tax)); line("Total US tax", money(cb.us_tax.total_us_tax)); }
      if (cb.social_security) line("Social Security at 67", `${money(cb.social_security.fra_monthly)}/mo`);
    }

    const ed = education.data;
    if (sections.education && ed && ed.per_child?.length) {
      section("Education funding (RESP)");
      ed.per_child.forEach((c) => line(c.name, `${money(c.projectedValue)} · ${c.coveragePct}% covered`));
      line("Combined projected", money(ed.combined?.projectedValue));
    }

    const attachedList = (sections.documents ? (vault.data || []).filter((f) => attached.includes(f.id)) : []);
    if (attachedList.length) { section("Attached documents"); attachedList.forEach((f) => line(f.name, f.category)); }

    doc.setDrawColor(226, 232, 240); doc.line(14, 284, W - 14, 284);
    doc.setFontSize(8); doc.setTextColor(150, 160, 185);
    doc.text(`Prepared by ${brand.firm_name || "Compass Planning"}. Illustrative summary — not financial, tax or legal advice.`, 14, 289);
    doc.save(`${data.household.replace(/\s+/g, "-")}-summary.pdf`);
    toast.success("Report downloaded");
  };

  const downloadFullPlan = async () => {
    try {
      const res = await api.get(`/report/pdf?sections=${activeSections().join(",")}`, { responseType: "blob" });
      const url = window.URL.createObjectURL(new Blob([res.data], { type: "application/pdf" }));
      const a = document.createElement("a");
      a.href = url;
      a.download = `${data.household.replace(/\s+/g, "-")}-full-plan.pdf`;
      document.body.appendChild(a); a.click(); a.remove();
      window.URL.revokeObjectURL(url);
      toast.success("Full plan PDF downloaded");
    } catch (e) {
      toast.error(formatApiError(e.response?.data?.detail) || "Could not generate PDF");
    }
  };

  const latestRet = (retirement.data || []).slice(-1)[0];
  const cb = crossborder.data?.result;
  const ed = education.data;
  const protRows = protection.data || [];
  const gap = (kind) => protRows.find((p) => p.kind === kind) || {};

  return (
    <div>
      <PageHeader title="Client Report" subtitle="A branded one-page household summary you can download and share.">
        <Button variant="outline" onClick={downloadFullPlan} data-testid="download-full-plan"><FileText size={16} /> Full plan PDF</Button>
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

          {brand.cover_note && <p className="text-sm text-compass-navy bg-compass-bg rounded-xl p-4 mb-4" data-testid="cover-note-preview">{brand.cover_note}</p>}

          <div className="text-xs text-compass-muted mb-5 flex items-center gap-1.5" data-testid="preview-caption"><FileBarChart size={13} /> Live preview — reflects your selected sections ({activeSections().length} on)</div>

          <div className="grid grid-cols-3 gap-4 mb-6">
            <Stat label="Net worth" value={money(data.netWorth)} accent />
            <Stat label="Protection score" value={`${data.protection}/100`} />
            <Stat label="Retirement success" value={data.success != null ? `${data.success}%` : "Not run"} />
          </div>

          <div className="mb-6">
            <div className="muted-label mb-2">Balance sheet</div>
            <Row label="Total assets" value={money(data.assets)} />
            <Row label="Total liabilities" value={money(data.liabilities)} />
            <Row label="Monthly expenses" value={money(data.monthlyExpenses)} />
          </div>

          {sections.retirement && (
            <div className="mb-6" data-testid="report-retirement-section">
              <div className="muted-label mb-2">Retirement</div>
              {latestRet ? (
                <>
                  <Row label="Scenario" value={latestRet.name || "Latest"} />
                  <Row label="Projected portfolio at retirement" value={money(latestRet.nest_egg)} />
                  <Row label="Target monthly income" value={latestRet.monthly_income_goal ? `${money(latestRet.monthly_income_goal)}/mo` : "—"} />
                  <Row label="Retirement age" value={latestRet.retire_age || "—"} />
                  <Row label="Success probability" value={latestRet.success_prob != null ? `${latestRet.success_prob}%` : "Not run"} />
                </>
              ) : <div className="text-sm text-compass-muted">No retirement scenario saved yet.</div>}
            </div>
          )}

          {sections.protection && (
            <div className="mb-6" data-testid="report-protection-section">
              <div className="muted-label mb-2">Protection gaps</div>
              <Row label="Protection score" value={<Badge color="#0052FF" bg="rgba(0,82,255,0.08)">{data.protection}/100</Badge>} />
              {protRows.length ? (
                <>
                  <Row label="Life insurance gap" value={money(gap("life").life_gap || 0)} />
                  <Row label="Disability monthly gap" value={`${money(gap("di").di_monthly_gap || 0)}/mo`} />
                  <Row label="Long-term care gap" value={`${money(gap("ltc").ltc_gap || 0)}/day`} />
                </>
              ) : <div className="text-sm text-compass-muted">No protection analyses saved yet.</div>}
            </div>
          )}

          {sections.goals && (
            <div className="mb-6" data-testid="report-goals-section">
              <div className="muted-label mb-2">Top goals</div>
              {data.goals.length === 0 ? <div className="text-sm text-compass-muted">No goals on file.</div> :
                data.goals.map((g) => { const p = g.target_amount ? Math.round((g.current_amount / g.target_amount) * 100) : 0; return <Row key={g.id} label={g.title} value={<Badge color="#0052FF" bg="rgba(0,82,255,0.08)">{p}%</Badge>} />; })}
            </div>
          )}

          {sections.estate && (
          <div className="mb-6" data-testid="report-estate-section">
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
          )}

          {sections.crossborder && cb && (
            <div className="mb-6" data-testid="report-crossborder-section">
              <div className="muted-label mb-2">US / cross-border</div>
              <Row label="Jurisdiction" value={cb.jurisdiction?.label || "—"} />
              {cb.us_tax && <>
                <Row label="US federal tax" value={money(cb.us_tax.federal_tax)} />
                <Row label={`US state tax (${cb.us_tax.state || "—"})`} value={money(cb.us_tax.state_tax)} />
                <Row label="Total US tax" value={money(cb.us_tax.total_us_tax)} />
              </>}
              {cb.social_security && <Row label="Social Security at 67" value={`${money(cb.social_security.fra_monthly)}/mo`} />}
            </div>
          )}

          {sections.education && ed && ed.per_child?.length > 0 && (
            <div className="mb-6" data-testid="report-education-section">
              <div className="muted-label mb-2">Education funding (RESP)</div>
              {ed.per_child.map((c, i) => <Row key={i} label={c.name} value={`${money(c.projectedValue)} · ${c.coveragePct}% covered`} />)}
              <Row label="Combined projected value" value={money(ed.combined?.projectedValue)} />
            </div>
          )}

          {sections.documents && attached.length > 0 && (
            <div className="mb-6" data-testid="report-attached-docs">
              <div className="muted-label mb-2 flex items-center gap-1.5"><FileText size={13} /> Attached documents</div>
              {(vault.data || []).filter((f) => attached.includes(f.id)).map((f) => (
                <Row key={f.id} label={f.name} value={<Badge color="#0052FF" bg="rgba(0,82,255,0.08)">{f.category}</Badge>} />
              ))}
            </div>
          )}
        </Card>

        <div className="space-y-6">
          <Card className="p-6" data-testid="sections-panel">
            <h3 className="font-heading font-bold text-compass-navy mb-4 flex items-center gap-2"><FileText size={18} className="text-compass-blue" /> Report sections</h3>
            <p className="text-xs text-compass-muted mb-3">Choose which sections appear in the downloaded PDF and emailed report. Net worth is always included.</p>
            <div className="space-y-2">
              {[["retirement", "Retirement"], ["protection", "Protection"], ["estate", "Estate"], ["crossborder", "US / Cross-border"], ["education", "Education (RESP)"], ["goals", "Goals"], ["documents", "Attached documents"]].map(([k, label]) => (
                <label key={k} className="flex items-center gap-2.5 text-sm cursor-pointer" data-testid={`section-toggle-${k}`}>
                  <input type="checkbox" checked={sections[k]} onChange={() => toggleSection(k)} className="h-4 w-4 accent-compass-blue" />
                  <span className="text-compass-navy">{label}</span>
                </label>
              ))}
            </div>
          </Card>

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
                {brand.logo && <button className="ml-3 text-xs text-compass-red font-semibold" onClick={async () => { try { await api.delete("/advisor/branding/logo"); } catch (e) { /* ignore */ } persist({ ...brand, logo: "", logo_url: "" }); }} data-testid="brand-logo-remove">Remove</button>}
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
            {crossborder.data?.result && <p className="text-xs text-compass-muted mt-3" data-testid="report-crossborder-note">A saved US / cross-border summary will be included in the report and email.</p>}
          </Card>

          <Card className="p-6" data-testid="attach-docs-panel">
            <h3 className="font-heading font-bold text-compass-navy mb-4 flex items-center gap-2"><FileText size={18} className="text-compass-blue" /> Attach documents</h3>
            {(vault.data || []).length === 0 ? (
              <p className="text-sm text-compass-muted">No vault documents yet. Upload files in Documents to attach them here.</p>
            ) : (
              <div className="space-y-2 max-h-56 overflow-y-auto">
                {(vault.data || []).map((f) => (
                  <label key={f.id} className="flex items-center gap-2.5 text-sm cursor-pointer" data-testid={`attach-doc-${f.id}`}>
                    <input type="checkbox" checked={attached.includes(f.id)} onChange={(e) => setAttached((a) => e.target.checked ? [...a, f.id] : a.filter((x) => x !== f.id))} className="h-4 w-4 accent-compass-blue" />
                    <span className="truncate text-compass-navy flex-1">{f.name}</span>
                    <Badge color="#0052FF" bg="rgba(0,82,255,0.08)">{f.category}</Badge>
                  </label>
                ))}
              </div>
            )}
            {attached.length > 0 && <p className="text-xs text-compass-muted mt-3" data-testid="attach-count">{attached.length} document(s) will be listed in the emailed report.</p>}
          </Card>

          <Card className="p-6" data-testid="report-history">
            <h3 className="font-heading font-bold text-compass-navy mb-4 flex items-center gap-2"><History size={18} className="text-compass-blue" /> Sent history</h3>
            {(history.data || []).length === 0 ? (
              <Empty icon={History} title="Nothing sent yet">Emailed summaries will be logged here.</Empty>
            ) : (
              <div className="space-y-2.5">
                {history.data.slice(0, historyVisible).map((h, i) => (
                  <button key={i} onClick={() => setHistoryModal(h)} className="w-full flex items-center justify-between text-sm hover:bg-compass-bg rounded-lg px-2 py-1.5 -mx-2 transition-colors" data-testid={`history-row-${i}`}>
                    <span className="text-compass-navy truncate">{h.recipient}</span>
                    <span className="text-xs text-compass-muted shrink-0 ml-2">{new Date(h.sent_at).toLocaleDateString("en-CA", { month: "short", day: "numeric", year: "numeric" })}</span>
                  </button>
                ))}
                {history.data.length > historyVisible && (
                  <button onClick={() => setHistoryVisible((v) => v + 5)} className="w-full text-xs font-semibold text-compass-blue hover:underline pt-1" data-testid="history-load-more">
                    Load more ({history.data.length - historyVisible} older)
                  </button>
                )}
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
