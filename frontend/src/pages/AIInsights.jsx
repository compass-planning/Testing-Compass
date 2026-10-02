import React from "react";
import { useQuery, useMutation, useQueryClient } from "@tanstack/react-query";
import { toast } from "sonner";
import { Brain, AlertTriangle, CheckCircle2, TrendingUp, Sparkles, RefreshCw } from "lucide-react";
import api, { formatApiError } from "@/lib/api";
import { Card, Badge, Button } from "@/components/ui-kit";
import { PageHeader } from "@/components/PageHeader";

const META = {
  warn: { c: "#FFB800", bg: "rgba(255,184,0,0.12)", Icon: AlertTriangle },
  danger: { c: "#EE5D50", bg: "rgba(238,93,80,0.12)", Icon: AlertTriangle },
  good: { c: "#00DF89", bg: "rgba(0,223,137,0.12)", Icon: CheckCircle2 },
  info: { c: "#0052FF", bg: "rgba(0,82,255,0.08)", Icon: TrendingUp },
};

export default function AIInsights() {
  const qc = useQueryClient();
  const existing = useQuery({ queryKey: ["ai-insights"], queryFn: async () => (await api.get("/plan/insights")).data });
  const generate = useMutation({
    mutationFn: async () => (await api.post("/plan/insights/generate")).data,
    onSuccess: (d) => { qc.setQueryData(["ai-insights"], d); toast.success(d.generated_by === "ai" ? "Fresh AI insights ready" : "Insights ready (offline summary)"); },
    onError: (e) => toast.error(formatApiError(e.response?.data?.detail) || "Could not generate insights"),
  });

  const data = generate.data || existing.data;
  const insights = data?.insights || [];
  const isAI = data?.generated_by === "ai";

  return (
    <div data-testid="ai-insights-page">
      <PageHeader title="AI Insights" subtitle="Plain-language, plan-aware guidance generated from your household data.">
        <Button onClick={() => generate.mutate()} disabled={generate.isPending} data-testid="generate-insights">
          {generate.isPending ? <RefreshCw size={16} className="animate-spin" /> : <Sparkles size={16} />}
          {generate.isPending ? "Thinking…" : data ? "Regenerate" : "Generate insights"}
        </Button>
      </PageHeader>

      {data && (
        <div className="flex items-center gap-2 mb-4" data-testid="insights-source">
          <Badge color={isAI ? "#0052FF" : "#A3AED0"} bg={isAI ? "rgba(0,82,255,0.08)" : "rgba(163,174,208,0.15)"}>
            {isAI ? "AI-generated (Claude)" : "Offline summary"}
          </Badge>
          {data.generated_at && <span className="text-xs text-compass-muted">Updated {new Date(data.generated_at).toLocaleString("en-CA", { month: "short", day: "numeric", hour: "numeric", minute: "2-digit" })}</span>}
        </div>
      )}

      {!data ? (
        <Card className="p-10 text-center" data-testid="insights-empty">
          <Brain className="mx-auto mb-3 text-compass-muted" size={40} />
          <div className="font-heading font-bold text-compass-navy">No insights yet</div>
          <div className="text-sm text-compass-muted mt-1">Generate narrative, plan-aware advice from your net worth, goals, retirement and protection data.</div>
        </Card>
      ) : insights.length === 0 ? (
        <Card className="p-10 text-center"><CheckCircle2 className="mx-auto mb-3 text-compass-green" size={40} /><div className="font-heading font-bold text-compass-navy">All clear</div><div className="text-sm text-compass-muted">No issues detected across your plan.</div></Card>
      ) : (
        <div className="grid md:grid-cols-2 gap-4" data-testid="insights-list">
          {insights.map((ins, i) => {
            const m = META[ins.severity] || META.info;
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
      <p className="text-xs text-compass-muted mt-6">Illustrative guidance generated from your plan data — not financial, tax or legal advice.</p>
    </div>
  );
}
