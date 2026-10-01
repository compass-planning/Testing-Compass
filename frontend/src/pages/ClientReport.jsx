import React, { useMemo } from "react";
import { useQuery } from "@tanstack/react-query";
import { jsPDF } from "jspdf";
import { toast } from "sonner";
import { FileBarChart, Download } from "lucide-react";
import api from "@/lib/api";
import { planApi } from "@/lib/planning";
import { Card, Button, Stat, Badge } from "@/components/ui-kit";
import { PageHeader } from "@/components/PageHeader";
import { money } from "@/lib/format";

const LIFE = ["Term Life", "Whole Life"];
const DI = ["Disability"];
const LTC = ["Critical Illness", "Long-Term Care", "Health"];

export default function ClientReport() {
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
    const lifeA = pct(cover(LIFE), 10 * income + totalDebt + 100000 * dependants);
    const diA = pct(cover(DI), (0.65 * income) / 12);
    const ltcA = pct(cover(LTC), 300000);
    const protection = Math.round(0.5 * lifeA + 0.3 * diA + 0.2 * ltcA);
    const latestRet = (retirement.data || []).slice(-1)[0];
    const success = latestRet?.success_prob ?? null;
    return {
      household, netWorth: o.netWorth || 0, assets: o.totalAssets || 0, liabilities: o.totalLiabilities || 0,
      monthlyExpenses: o.monthlyExpenses || 0, protection, success,
      members: owns.map((x) => x.full_name), goals: (goals.data || []).slice(0, 5),
    };
  }, [overview.data, owners.data, insurance.data, debts.data, retirement.data, goals.data]);

  const download = () => {
    const doc = new jsPDF();
    const W = 210;
    // Branded header band
    doc.setFillColor(0, 82, 255); doc.rect(0, 0, W, 30, "F");
    doc.setTextColor(255, 255, 255); doc.setFont("helvetica", "bold"); doc.setFontSize(20);
    doc.text("Compass Planning", 14, 15);
    doc.setFont("helvetica", "normal"); doc.setFontSize(10);
    doc.text("Canadian Retirement Intelligence", 14, 22);
    doc.setFontSize(9); doc.text(new Date().toLocaleDateString("en-CA", { dateStyle: "long" }), W - 14, 20, { align: "right" });

    let y = 44;
    doc.setTextColor(11, 20, 55); doc.setFont("helvetica", "bold"); doc.setFontSize(16);
    doc.text(data.household, 14, y);
    doc.setFont("helvetica", "normal"); doc.setFontSize(10); doc.setTextColor(120, 130, 160);
    doc.text(data.members.join(" · ") || "", 14, y + 6);

    y += 18;
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
    doc.text("Illustrative summary prepared with Compass Planning. Not financial, tax or legal advice.", 14, 286);
    doc.save(`${data.household.replace(/\s+/g, "-")}-summary.pdf`);
    toast.success("Report downloaded");
  };

  return (
    <div>
      <PageHeader title="Client Report" subtitle="A branded one-page household summary you can download and share.">
        <Button onClick={download} data-testid="download-report"><Download size={16} /> Download PDF</Button>
      </PageHeader>

      <Card className="p-8 max-w-3xl" data-testid="report-preview">
        <div className="flex items-center gap-3 mb-6">
          <div className="h-11 w-11 rounded-xl gradient-bg flex items-center justify-center text-white"><FileBarChart size={22} /></div>
          <div>
            <div className="font-heading text-xl font-extrabold text-compass-navy">{data.household}</div>
            <div className="text-sm text-compass-muted">{data.members.join(" · ")}</div>
          </div>
        </div>

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
    </div>
  );
}

function Row({ label, value }) {
  return <div className="flex justify-between items-center text-sm py-1.5 border-b border-compass-border last:border-0"><span className="text-compass-muted">{label}</span><span className="font-semibold text-compass-navy">{value}</span></div>;
}
