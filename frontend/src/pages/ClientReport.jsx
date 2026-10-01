import React, { useMemo, useState, useEffect } from "react";
import { useQuery, useMutation } from "@tanstack/react-query";
import { jsPDF } from "jspdf";
import { toast } from "sonner";
import { FileBarChart, Download, Upload, Mail, Palette } from "lucide-react";
import api, { formatApiError } from "@/lib/api";
import { planApi } from "@/lib/planning";
import { useAuth } from "@/context/AuthContext";
import { Card, Button, Stat, Badge, Field, Input } from "@/components/ui-kit";
import { PageHeader } from "@/components/PageHeader";
import { money } from "@/lib/format";

const LIFE = ["Term Life", "Whole Life"];
const DI = ["Disability"];
const LTC = ["Critical Illness", "Long-Term Care", "Health"];

export default function ClientReport() {
  const { user } = useAuth();
  const brandKey = `compass_brand_${user.id}`;
  const [brand, setBrand] = useState({ firmName: "Compass Planning", coverNote: "", logo: "" });
  const [recipient, setRecipient] = useState("");

  useEffect(() => {
    try { const s = JSON.parse(localStorage.getItem(brandKey) || "{}"); if (s && (s.firmName || s.logo || s.coverNote)) setBrand((b) => ({ ...b, ...s })); } catch { /* ignore */ }
  }, [brandKey]);
  const persist = (next) => { setBrand(next); localStorage.setItem(brandKey, JSON.stringify(next)); };

  const overview = useQuery({ queryKey: ["plan", "overview"], queryFn: planApi.overview });
  const owners = useQuery({ queryKey: ["owners"], queryFn: async () => (await api.get("/owners")).data });
  const insurance = useQuery({ queryKey: ["plan", "insurance"], queryFn: () => planApi.list("insurance") });
  const debts = useQuery({ queryKey: ["plan", "debts"], queryFn: () => planApi.list("debts") });
  const retirement = useQuery({ queryKey: ["plan", "retirement"], queryFn: () => planApi.list("retirement") });
  const goals = useQuery({ queryKey: ["goals"], queryFn: async () => (await api.get("/goals")).data });

  const data = useMemo(() => {
    const o = overview.data || {};
    const owns = owners.data || [];
    const primary = owns.find((x) => x.relationship === "self") || owns[0];
    const household = primary ? `The ${primary.full_name.split(" ").slice(-1)[0]} Household` : "Household";
    const income = owns.reduce((s, x) => s + Number(x.annual_income || 0), 0);
    const dependants = owns.filter((x) => ["dependent", "child"].includes(x.relationship)).length;
    const totalDebt = (debts.data || []).reduce((s, d) => s + Number(d.balance || 0), 0);
    const pol = insurance.data || [];
    const cover = (t) => pol.filter((p) => t.includes(p.policy_type)).reduce((s, p) => s + Number(p.coverage || 0), 0);
    const pct = (have, rec) => (rec > 0 ? Math.min(100, Math.round((have / rec) * 100)) : have > 0 ? 100 : 0);
    const protection = Math.round(0.5 * pct(cover(LIFE), 10 * income + totalDebt + 100000 * dependants) + 0.3 * pct(cover(DI), (0.65 * income) / 12) + 0.2 * pct(cover(LTC), 300000));
    const success = (retirement.data || []).slice(-1)[0]?.success_prob ?? null;
    return {
      household, netWorth: o.netWorth || 0, assets: o.totalAssets || 0, liabilities: o.totalLiabilities || 0,
      monthlyExpenses: o.monthlyExpenses || 0, protection, success,
      members: owns.map((x) => x.full_name), goals: (goals.data || []).slice(0, 5),
    };
  }, [overview.data, owners.data, insurance.data, debts.data, retirement.data, goals.data]);

  const onLogo = (e) => {
    const file = e.target.files?.[0]; if (!file) return;
    if (file.size > 400000) { toast.error("Logo too large (max 400KB)"); return; }
    const reader = new FileReader();
    reader.onload = () => persist({ ...brand, logo: reader.result });
    reader.readAsDataURL(file);
  };

  const emailMut = useMutation({
    mutationFn: () => api.post("/report/email", { recipient, net_worth: data.netWorth, protection_score: data.protection, retirement_success: data.success }),
    onSuccess: () => toast.success(`Summary emailed to ${recipient}`),
    onError: (e) => toast.error(formatApiError(e.response?.data?.detail)),
  });

  const download = () => {
    const doc = new jsPDF();
    const W = 210;
    doc.setFillColor(0, 82, 255); doc.rect(0, 0, W, 30, "F");
    doc.setTextColor(255, 255, 255); doc.setFont("helvetica", "bold"); doc.setFontSize(20);
    doc.text(brand.firmName || "Compass Planning", 14, 15);
    doc.setFont("helvetica", "normal"); doc.setFontSize(10);
    doc.text("Household Financial Summary", 14, 22);
    if (brand.logo) { try { doc.addImage(brand.logo, brand.logo.includes("image/png") ? "PNG" : "JPEG", W - 34, 6, 20, 18); } catch { /* ignore */ } }
    doc.setFontSize(9); doc.text(new Date().toLocaleDateString("en-CA", { dateStyle: "long" }), W - 14, 28, { align: "right" });

    let y = 42;
    doc.setTextColor(11, 20, 55); doc.setFont("helvetica", "bold"); doc.setFontSize(16);
    doc.text(data.household, 14, y);
    doc.setFont("helvetica", "normal"); doc.setFontSize(10); doc.setTextColor(120, 130, 160);
    doc.text(data.members.join(" · ") || "", 14, y + 6);

    if (brand.coverNote) {
      y += 14; doc.setTextColor(60, 70, 100); doc.setFontSize(10);
      doc.text(doc.splitTextToSize(brand.coverNote, W - 28), 14, y);
      y += Math.min(30, doc.splitTextToSize(brand.coverNote, W - 28).length * 5);
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

    y += 36;
    doc.setTextColor(11, 20, 55); doc.setFont("helvetica", "bold"); doc.setFontSize(12);
    doc.text("Balance sheet", 14, y); y += 7;
    doc.setFont("helvetica", "normal"); doc.setFontSize(10); doc.setTextColor(60, 70, 100);
    const line = (label, value) => { doc.text(label, 16, y); doc.text(value, W - 14, y, { align: "right" }); y += 7; };
    line("Total assets", money(data.assets));
    line("Total liabilities", money(data.liabilities));
    line("Monthly expenses", money(data.monthlyExpenses));

    y += 6;
    doc.setTextColor(11, 20, 55); doc.setFont("helvetica", "bold"); doc.setFontSize(12);
    doc.text("Top goals", 14, y); y += 7;
    doc.setFont("helvetica", "normal"); doc.setFontSize(10); doc.setTextColor(60, 70, 100);
    if (data.goals.length === 0) { doc.text("No goals on file.", 16, y); y += 7; }
    data.goals.forEach((g) => {
      const p = g.target_amount ? Math.round((g.current_amount / g.target_amount) * 100) : 0;
      line(g.title, `${money(g.current_amount)} / ${money(g.target_amount)} · ${p}%`);
    });

    doc.setDrawColor(226, 232, 240); doc.line(14, 280, W - 14, 280);
    doc.setFontSize(8); doc.setTextColor(150, 160, 185);
    doc.text(`Prepared by ${brand.firmName || "Compass Planning"}. Illustrative summary — not financial, tax or legal advice.`, 14, 286);
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
              <div className="font-heading text-xl font-extrabold text-compass-navy">{brand.firmName || "Compass Planning"}</div>
              <div className="text-sm text-compass-muted">{data.household} · {data.members.join(" · ")}</div>
            </div>
          </div>

          {brand.coverNote && <p className="text-sm text-compass-navy bg-compass-bg rounded-xl p-4 mb-6" data-testid="cover-note-preview">{brand.coverNote}</p>}

          <div className="grid grid-cols-3 gap-4 mb-6">
            <Stat label="Net worth" value={money(data.netWorth)} accent />
            <Stat label="Protection score" value={`${data.protection}/100`} />
            <Stat label="Retirement success" value={data.success != null ? `${data.success}%` : "Not run"} />
          </div>

          <div className="grid md:grid-cols-2 gap-6">
            <div>
              <div className="muted-label mb-2">Balance sheet</div>
              <Row label="Total assets" value={money(data.assets)} />
              <Row label="Total liabilities" value={money(data.liabilities)} />
              <Row label="Monthly expenses" value={money(data.monthlyExpenses)} />
            </div>
            <div>
              <div className="muted-label mb-2">Top goals</div>
              {data.goals.length === 0 ? <div className="text-sm text-compass-muted">No goals on file.</div> :
                data.goals.map((g) => {
                  const p = g.target_amount ? Math.round((g.current_amount / g.target_amount) * 100) : 0;
                  return <Row key={g.id} label={g.title} value={<Badge color="#0052FF" bg="rgba(0,82,255,0.08)">{p}%</Badge>} />;
                })}
            </div>
          </div>
        </Card>

        <div className="space-y-6">
          <Card className="p-6" data-testid="branding-panel">
            <h3 className="font-heading font-bold text-compass-navy mb-4 flex items-center gap-2"><Palette size={18} className="text-compass-blue" /> Branding</h3>
            <div className="space-y-4">
              <Field label="Firm name"><Input value={brand.firmName} onChange={(e) => persist({ ...brand, firmName: e.target.value })} data-testid="brand-firm-name" /></Field>
              <Field label="Cover note">
                <textarea value={brand.coverNote} onChange={(e) => persist({ ...brand, coverNote: e.target.value })} rows={3}
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
            </div>
          </Card>

          <Card className="p-6" data-testid="email-panel">
            <h3 className="font-heading font-bold text-compass-navy mb-4 flex items-center gap-2"><Mail size={18} className="text-compass-blue" /> Email to client</h3>
            <Field label="Recipient email"><Input type="email" value={recipient} onChange={(e) => setRecipient(e.target.value)} placeholder="client@email.com" data-testid="email-recipient" /></Field>
            <Button className="w-full mt-4" disabled={!recipient || emailMut.isPending} onClick={() => emailMut.mutate()} data-testid="send-email-button">
              <Mail size={16} /> {emailMut.isPending ? "Sending…" : "Send summary"}
            </Button>
            <p className="text-xs text-compass-muted mt-3">Sends a branded HTML summary (net worth, protection score, retirement success, top goals). The full PDF stays a download above.</p>
          </Card>
        </div>
      </div>
    </div>
  );
}

function Row({ label, value }) {
  return <div className="flex justify-between items-center text-sm py-1.5 border-b border-compass-border last:border-0"><span className="text-compass-muted">{label}</span><span className="font-semibold text-compass-navy">{value}</span></div>;
}
