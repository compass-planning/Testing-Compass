import React from "react";
import { useQuery } from "@tanstack/react-query";
import { Brain, AlertTriangle, CheckCircle2, TrendingUp } from "lucide-react";
import { planApi } from "@/lib/planning";
import api from "@/lib/api";
import { Card, Badge } from "@/components/ui-kit";
import { PageHeader } from "@/components/PageHeader";
import { money } from "@/lib/format";

export default function AIInsights() {
  const ov = useQuery({ queryKey: ["plan", "overview"], queryFn: planApi.overview });
  const goals = useQuery({ queryKey: ["goals"], queryFn: async () => (await api.get("/goals")).data });
  const insurance = useQuery({ queryKey: ["plan", "insurance"], queryFn: () => planApi.list("insurance") });
  const expenses = useQuery({ queryKey: ["plan", "expenses"], queryFn: () => planApi.list("expenses") });

  const o = ov.data;
  const insights = [];
  if (o) {
    if (o.retirementProjections === 0) insights.push({ t: "warn", title: "No retirement projection", body: "Create a projection to see if you're on track for your retirement income goal." });
    if (o.insuranceAnalyses === 0) insights.push({ t: "danger", title: "Protection gap", body: "No insurance coverage on file — your household may be exposed to income loss." });
    if (o.netWorth < 0) insights.push({ t: "danger", title: "Negative net worth", body: "Liabilities exceed assets. Prioritise high-interest debt reduction." });
    if (o.netWorth > 0) insights.push({ t: "good", title: "Positive net worth", body: `Your household net worth is ${money(o.netWorth)}. Keep building.` });
    const monthly = o.monthlyExpenses || 0;
    if (monthly > 0) insights.push({ t: "info", title: "Cash flow", body: `You track ${money(monthly)}/month in expenses (${money(monthly * 12)}/yr). Ensure 3–6 months as an emergency fund.` });
  }
  const atRisk = (goals.data || []).filter((g) => g.status === "at_risk" || g.status === "behind");
  atRisk.forEach((g) => insights.push({ t: "warn", title: `Goal at risk: ${g.title}`, body: `${money(g.current_amount)} of ${money(g.target_amount)} by ${g.target_year}. Consider increasing contributions.` }));
  const highPremium = (insurance.data || []).reduce((s, p) => s + Number(p.premium || 0), 0);
  if (highPremium > 0) insights.push({ t: "info", title: "Insurance cost", body: `Total premiums ${money(highPremium)}/mo across ${insurance.data.length} policies.` });

  const META = {
    warn: { c: "#FFB800", bg: "rgba(255,184,0,0.12)", Icon: AlertTriangle },
    danger: { c: "#EE5D50", bg: "rgba(238,93,80,0.12)", Icon: AlertTriangle },
    good: { c: "#00DF89", bg: "rgba(0,223,137,0.12)", Icon: CheckCircle2 },
    info: { c: "#0052FF", bg: "rgba(0,82,255,0.08)", Icon: TrendingUp },
  };

  return (
    <div>
      <PageHeader title="AI Insights" subtitle="Rule-based planning insights derived from your household data.">
        <Badge color="#A3AED0" bg="rgba(163,174,208,0.15)">Rule-based (mock)</Badge>
      </PageHeader>
      {insights.length === 0 ? (
        <Card className="p-10 text-center"><Brain className="mx-auto mb-3 text-compass-muted" size={40} /><div className="font-heading font-bold text-compass-navy">All clear</div><div className="text-sm text-compass-muted">No issues detected across your plan.</div></Card>
      ) : (
        <div className="grid md:grid-cols-2 gap-4">
          {insights.map((ins, i) => {
            const m = META[ins.t];
            return (
              <Card key={i} className="p-5 flex items-start gap-3" data-testid={`insight-${i}`}>
                <div className="h-9 w-9 rounded-xl flex items-center justify-center shrink-0" style={{ background: m.bg, color: m.c }}><m.Icon size={18} /></div>
                <div>
                  <div className="font-heading font-bold text-compass-navy">{ins.title}</div>
                  <div className="text-sm text-compass-muted mt-0.5">{ins.body}</div>
                </div>
              </Card>
            );
          })}
        </div>
      )}
    </div>
  );
}
