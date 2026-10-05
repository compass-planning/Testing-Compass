import React from "react";
import { useQuery } from "@tanstack/react-query";
import { Sparkles, Scale, Target, Shield, PiggyBank, Receipt, FileText, CreditCard } from "lucide-react";
import { planApi } from "@/lib/planning";
import api from "@/lib/api";
import { Card, StatBand, Badge, Progress } from "@/components/ui-kit";
import { PageHeader } from "@/components/PageHeader";
import { money, STATUS_META } from "@/lib/format";

export default function FinancialPlan() {
  const ov = useQuery({ queryKey: ["plan", "overview"], queryFn: planApi.overview });
  const goals = useQuery({ queryKey: ["goals"], queryFn: async () => (await api.get("/goals")).data });
  const o = ov.data;

  const sections = o ? [
    { icon: Scale, label: "Net Worth", value: money(o.netWorth), done: true },
    { icon: PiggyBank, label: "Retirement", value: `${o.retirementProjections} projection(s)`, done: o.retirementProjections > 0 },
    { icon: Shield, label: "Insurance", value: `${o.insuranceAnalyses} policy(ies)`, done: o.insuranceAnalyses > 0 },
    { icon: Shield, label: "Protection analysis", value: `${o.protectionAnalyses || 0} saved`, done: (o.protectionAnalyses || 0) > 0 },
    { icon: Receipt, label: "Cash Flow", value: `${money(o.monthlyExpenses)}/mo`, done: o.monthlyExpenses > 0 },
    { icon: CreditCard, label: "Debt", value: `${o.debtCount} tracked`, done: true },
    { icon: FileText, label: "Documents", value: `${o.documents} on file`, done: o.documents > 0 },
  ] : [];
  const completeness = sections.length ? Math.round((sections.filter((s) => s.done).length / sections.length) * 100) : 0;

  return (
    <div>
      <PageHeader title="Financial Plan" icon={Sparkles} subtitle="A consolidated snapshot of your household plan across every module." />
      {o && (
        <>
          <StatBand testid="plan-statband" items={[
            { label: "Net worth", value: money(o.netWorth), color: "#7CFFC4" },
            { label: "Total assets", value: money(o.totalAssets), color: "#8FB3FF" },
            { label: "Total liabilities", value: money(o.totalLiabilities), color: "#FF8A8A" },
            { label: "Plan completeness", value: `${completeness}%`, color: "#FFD36B" },
          ]} />

          <div className="grid lg:grid-cols-3 gap-6">
          <Card className="p-6 lg:col-span-2">
            <div className="flex items-center gap-2 mb-4"><Sparkles size={18} className="text-compass-blue" /><h3 className="font-heading font-bold text-compass-navy">Plan completeness</h3></div>
            <Progress value={completeness} color="#0052FF" />
            <div className="grid sm:grid-cols-2 lg:grid-cols-3 gap-3 mt-5">
              {sections.map((s) => (
                <div key={s.label} className="flex items-center gap-3 rounded-xl border border-compass-border px-4 py-3">
                  <div className="h-9 w-9 rounded-xl bg-compass-bg flex items-center justify-center text-compass-blue"><s.icon size={16} /></div>
                  <div className="flex-1">
                    <div className="text-sm font-semibold text-compass-navy">{s.label}</div>
                    <div className="text-xs text-compass-muted">{s.value}</div>
                  </div>
                  <Badge color={s.done ? "#00DF89" : "#FFB800"} bg={s.done ? "rgba(0,223,137,0.12)" : "rgba(255,184,0,0.14)"}>{s.done ? "✓" : "To do"}</Badge>
                </div>
              ))}
            </div>
          </Card>

          <Card className="p-6">
            <div className="flex items-center gap-2 mb-4"><Target size={18} className="text-compass-blue" /><h3 className="font-heading font-bold text-compass-navy">Goals summary</h3></div>
            {(goals.data || []).length === 0 ? <div className="text-sm text-compass-muted">No goals yet.</div> : (
              <div className="space-y-4">
                {goals.data.map((g) => {
                  const pct = g.target_amount ? Math.round((g.current_amount / g.target_amount) * 100) : 0;
                  const meta = STATUS_META[g.status] || STATUS_META.on_track;
                  return (
                    <div key={g.id}>
                      <div className="flex items-center justify-between mb-1.5">
                        <span className="font-semibold text-compass-navy text-sm">{g.title}</span>
                        <Badge color={meta.color} bg={meta.bg}>{meta.label}</Badge>
                      </div>
                      <Progress value={pct} color={meta.color} />
                      <div className="text-xs text-compass-muted mt-1">{money(g.current_amount)} of {money(g.target_amount)} · {pct}%</div>
                    </div>
                  );
                })}
              </div>
            )}
          </Card>
          </div>
        </>
      )}
    </div>
  );
}
