import React from "react";
import { useQuery } from "@tanstack/react-query";
import { Sparkles, Scale, Target, Shield, PiggyBank, Receipt, FileText, CreditCard, Copy } from "lucide-react";
import { planApi } from "@/lib/planning";
import api from "@/lib/api";
import { toast } from "sonner";
import { Card, StatBand, Badge, Progress, Button } from "@/components/ui-kit";
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
  const firstIncomplete = sections.find((s) => !s.done);
  const nudge = firstIncomplete ? `Next up: add your ${firstIncomplete.label}.` : "Your plan is complete — nicely done.";
  const copyHealth = async () => {
    try {
      await navigator.clipboard.writeText(`Compass Plan Health Score: ${completeness}/100 · Net worth ${money(o.netWorth)} · ${firstIncomplete ? `Next: add your ${firstIncomplete.label}` : "Plan complete"}`);
      toast.success("Plan health summary copied");
    } catch { toast.error("Could not copy"); }
  };

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

          <div className="grid grid-cols-1 lg:grid-cols-3 gap-6">
          <Card className="p-6 lg:col-span-2">
            <div className="flex flex-col sm:flex-row sm:items-center gap-5 mb-5">
              <div className="relative h-28 w-28 shrink-0 rounded-full" style={{ background: `conic-gradient(#00DF89 ${completeness * 3.6}deg, #E2E8F0 0deg)` }} data-testid="plan-health-score">
                <div className="absolute inset-[9px] rounded-full bg-white flex flex-col items-center justify-center">
                  <div className="font-heading text-3xl font-extrabold text-compass-navy">{completeness}</div>
                  <div className="text-[10px] uppercase tracking-wide text-compass-muted">Score</div>
                </div>
              </div>
              <div className="flex-1 min-w-0">
                <div className="flex items-center gap-2"><Sparkles size={18} className="text-compass-blue" /><h3 className="font-heading font-bold text-compass-navy">Plan Health Score</h3></div>
                <p className="text-sm text-compass-muted mt-1" data-testid="plan-health-nudge">{nudge}</p>
                <Button size="sm" variant="outline" className="mt-3" onClick={copyHealth} data-testid="copy-plan-health"><Copy size={14} /> Copy summary</Button>
              </div>
            </div>
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
