import React from "react";
import { useQuery } from "@tanstack/react-query";
import { PieChart, Pie, Cell, ResponsiveContainer, Tooltip } from "recharts";
import { Link } from "react-router-dom";
import { TrendingUp, Scale, Shield, PiggyBank, ArrowRight, AlertTriangle } from "lucide-react";
import { planApi } from "@/lib/planning";
import api from "@/lib/api";
import { Card, Stat, Badge, Progress } from "@/components/ui-kit";
import { PageHeader } from "@/components/PageHeader";
import { money, STATUS_META } from "@/lib/format";

export default function InsightDashboard() {
  const ov = useQuery({ queryKey: ["plan", "overview"], queryFn: planApi.overview });
  const nw = useQuery({ queryKey: ["plan", "networth"], queryFn: () => planApi.list("networth") });
  const goals = useQuery({ queryKey: ["goals"], queryFn: async () => (await api.get("/goals")).data });
  const o = ov.data;

  const assetsLiab = o ? [
    { name: "Assets", value: o.totalAssets, color: "#00DF89" },
    { name: "Liabilities", value: o.totalLiabilities, color: "#EE5D50" },
  ] : [];

  const alerts = [];
  if (o) {
    if (o.retirementProjections === 0) alerts.push("No retirement projection on file");
    if (o.insuranceAnalyses === 0) alerts.push("No insurance analysis — protection gap unknown");
  }
  (goals.data || []).filter((g) => g.status === "behind" || g.status === "at_risk").forEach((g) => alerts.push(`Goal "${g.title}" needs attention`));

  return (
    <div>
      <PageHeader title="Insights" subtitle="An insight-led view of where your household stands today." />
      {o && (
        <>
          <div className="grid grid-cols-2 lg:grid-cols-4 gap-4 mb-6">
            <Stat label="Net worth" value={money(o.netWorth)} accent />
            <Stat label="Assets" value={money(o.totalAssets)} />
            <Stat label="Liabilities" value={money(o.totalLiabilities)} />
            <Stat label="Monthly expenses" value={money(o.monthlyExpenses)} />
          </div>

          <div className="grid lg:grid-cols-3 gap-6">
            <Card className="p-6">
              <h3 className="font-heading font-bold text-compass-navy mb-4 flex items-center gap-2"><Scale size={18} className="text-compass-blue" /> Balance sheet</h3>
              <ResponsiveContainer width="100%" height={180}>
                <PieChart>
                  <Pie data={assetsLiab} dataKey="value" innerRadius={48} outerRadius={78} paddingAngle={3}>
                    {assetsLiab.map((s, i) => <Cell key={i} fill={s.color} />)}
                  </Pie>
                  <Tooltip formatter={(v) => money(v)} contentStyle={{ borderRadius: 12, border: "1px solid #E2E8F0" }} />
                </PieChart>
              </ResponsiveContainer>
              <div className="space-y-2 mt-2">
                {assetsLiab.map((s) => (
                  <div key={s.name} className="flex items-center justify-between text-sm">
                    <span className="flex items-center gap-2 text-compass-navy"><span className="h-2.5 w-2.5 rounded-full" style={{ background: s.color }} /> {s.name}</span>
                    <span className="font-semibold text-compass-navy">{money(s.value)}</span>
                  </div>
                ))}
              </div>
            </Card>

            <Card className="p-6 lg:col-span-2">
              <div className="flex items-center justify-between mb-4">
                <h3 className="font-heading font-bold text-compass-navy flex items-center gap-2"><AlertTriangle size={18} className="text-compass-amber" /> Action items</h3>
                <Badge color="#0052FF" bg="rgba(0,82,255,0.08)">{alerts.length}</Badge>
              </div>
              {alerts.length === 0 ? (
                <div className="text-sm text-compass-muted">Nothing needs your attention right now.</div>
              ) : (
                <div className="space-y-2">
                  {alerts.map((a, i) => (
                    <div key={i} className="flex items-center gap-3 rounded-xl bg-compass-bg px-4 py-3 text-sm text-compass-navy">
                      <span className="text-compass-amber">⚠</span> {a}
                    </div>
                  ))}
                </div>
              )}
              <div className="flex gap-2 mt-5">
                <Link to="/retirement"><Badge color="#0052FF" bg="rgba(0,82,255,0.08)"><PiggyBank size={13} /> Retirement</Badge></Link>
                <Link to="/insurance"><Badge color="#00DF89" bg="rgba(0,223,137,0.12)"><Shield size={13} /> Insurance</Badge></Link>
                <Link to="/plan" className="ml-auto text-sm font-semibold text-compass-blue flex items-center gap-1">Full plan <ArrowRight size={14} /></Link>
              </div>
            </Card>
          </div>

          <Card className="p-6 mt-6">
            <h3 className="font-heading font-bold text-compass-navy mb-4 flex items-center gap-2"><TrendingUp size={18} className="text-compass-blue" /> Goals</h3>
            {(goals.data || []).length === 0 ? <div className="text-sm text-compass-muted">No goals yet.</div> : (
              <div className="grid md:grid-cols-2 gap-4">
                {goals.data.map((g) => {
                  const pct = g.target_amount ? Math.round((g.current_amount / g.target_amount) * 100) : 0;
                  const meta = STATUS_META[g.status] || STATUS_META.on_track;
                  return (
                    <div key={g.id}>
                      <div className="flex items-center justify-between mb-1.5"><span className="font-semibold text-compass-navy text-sm">{g.title}</span><Badge color={meta.color} bg={meta.bg}>{meta.label}</Badge></div>
                      <Progress value={pct} color={meta.color} />
                    </div>
                  );
                })}
              </div>
            )}
          </Card>
        </>
      )}
    </div>
  );
}
