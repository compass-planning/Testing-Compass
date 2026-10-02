import React from "react";
import { useQuery } from "@tanstack/react-query";
import { Building2, Users, Gauge, AlertTriangle } from "lucide-react";
import { enterpriseApi } from "@/lib/planning";
import { Card, Stat, Badge } from "@/components/ui-kit";
import { money } from "@/lib/format";

const STATUS_COLOR = { "On Track": "#00DF89", "Needs Review": "#FFB800", "At Risk": "#EE5D50", "Needs Setup": "#A3AED0" };

export default function EnterpriseOverview() {
  const q = useQuery({ queryKey: ["enterprise-overview"], queryFn: enterpriseApi.overview });
  const d = q.data;
  if (!d) return null;

  return (
    <div className="mt-6 space-y-6" data-testid="enterprise-overview">
      <div className="grid grid-cols-2 lg:grid-cols-4 gap-4">
        <Stat label="Households" value={d.households} accent sub="Across the corp book" />
        <Stat label="Book assets" value={money(d.book_assets)} />
        <Stat label="Avg. health score" value={d.avg_score ?? "—"} sub="Weighted by data on file" />
        <Stat label="Households / planner" value={d.households_per_planner ?? "—"} />
      </div>

      <div className="grid lg:grid-cols-2 gap-6">
        <Card className="p-6" data-testid="enterprise-planners">
          <h3 className="font-heading font-bold text-compass-navy mb-4 flex items-center gap-2"><Users size={18} className="text-compass-blue" /> Planner productivity</h3>
          {(d.planners || []).length === 0 ? (
            <div className="text-sm text-compass-muted">No planners in this corp.</div>
          ) : (
            <div className="rounded-xl border border-compass-border overflow-hidden">
              <div className="grid grid-cols-[1.6fr_0.8fr_0.8fr] bg-compass-bg/60 px-4 py-2 text-[11px] font-semibold uppercase tracking-wide text-compass-muted">
                <span>Planner</span><span className="text-right">Households</span><span className="text-right">Avg score</span>
              </div>
              {d.planners.map((p) => (
                <div key={p.email} className="grid grid-cols-[1.6fr_0.8fr_0.8fr] items-center px-4 py-3 border-t border-compass-border text-sm" data-testid={`planner-row-${p.email}`}>
                  <span className="min-w-0"><span className="font-semibold text-compass-navy block truncate">{p.name}</span><span className="text-xs text-compass-muted truncate">{p.email}</span></span>
                  <span className="text-right font-semibold text-compass-navy">{p.households}</span>
                  <span className="text-right"><Badge color={p.avg_score == null ? "#A3AED0" : p.avg_score >= 75 ? "#00A36C" : p.avg_score >= 50 ? "#FFB800" : "#EE5D50"} bg="rgba(0,82,255,0.06)">{p.avg_score ?? "—"}</Badge></span>
                </div>
              ))}
            </div>
          )}
          <p className="text-xs text-compass-muted mt-3">Illustrative even allocation of the corp book across planners.</p>
        </Card>

        <Card className="p-6" data-testid="enterprise-attention">
          <div className="flex items-center justify-between mb-4">
            <h3 className="font-heading font-bold text-compass-navy flex items-center gap-2"><AlertTriangle size={18} className="text-compass-amber" /> Needs attention</h3>
            <Badge color="#FFB800" bg="rgba(255,184,0,0.14)">{d.attention.length}</Badge>
          </div>
          <div className="flex flex-wrap gap-2 mb-4">
            {Object.entries(d.counts || {}).map(([k, v]) => (
              <span key={k} className="inline-flex items-center gap-1.5 rounded-full px-2.5 py-1 text-xs font-semibold" style={{ color: STATUS_COLOR[k], background: `${STATUS_COLOR[k]}22` }}>
                <Gauge size={12} /> {k}: {v}
              </span>
            ))}
          </div>
          {d.attention.length === 0 ? (
            <div className="text-sm text-compass-muted py-4 text-center">Every household is on track. 🎯</div>
          ) : (
            <div className="space-y-2">
              {d.attention.map((a, i) => (
                <div key={i} className="flex items-center gap-3 rounded-xl bg-compass-bg px-4 py-2.5" data-testid={`enterprise-attention-${i}`}>
                  <span className="h-7 w-7 rounded-lg flex items-center justify-center text-white text-xs font-bold shrink-0" style={{ background: STATUS_COLOR[a.status] }}>{a.score ?? "—"}</span>
                  <span className="text-sm font-semibold text-compass-navy truncate flex-1">{a.primary}</span>
                  <span className="text-xs font-semibold shrink-0" style={{ color: STATUS_COLOR[a.status] }}>{a.status}</span>
                </div>
              ))}
            </div>
          )}
        </Card>
      </div>
    </div>
  );
}
