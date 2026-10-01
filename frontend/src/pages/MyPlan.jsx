import React from "react";
import { useQuery } from "@tanstack/react-query";
import { Wallet, Target, TrendingUp, Landmark } from "lucide-react";
import api from "@/lib/api";
import { Card, Progress, Empty } from "@/components/ui-kit";
import { PageHeader } from "@/components/PageHeader";
import { money } from "@/lib/format";
import { useAuth } from "@/context/AuthContext";

function Stat({ icon: Icon, label, value, tone = "navy" }) {
  const color = { navy: "#0B1437", green: "#00A36C", red: "#EE5D50" }[tone];
  return (
    <Card className="p-5" data-testid={`myplan-stat-${label.toLowerCase().replace(/\s+/g, "-")}`}>
      <div className="flex items-center gap-2 text-compass-muted text-sm mb-1"><Icon size={16} /> {label}</div>
      <div className="font-heading text-2xl font-extrabold" style={{ color }}>{value}</div>
    </Card>
  );
}

export default function MyPlan() {
  const { user } = useAuth();
  const overview = useQuery({ queryKey: ["plan-overview"], queryFn: async () => (await api.get("/plan/overview")).data });
  const goalsQ = useQuery({ queryKey: ["goals"], queryFn: async () => (await api.get("/goals")).data });
  const o = overview.data || {};
  const goals = goalsQ.data || [];

  return (
    <div data-testid="my-plan-page">
      <PageHeader title={`Welcome back, ${(user.name || "").split(" ")[0] || "there"}`} subtitle="Your plan at a glance. Your advisor keeps this up to date — reach out any time to make changes." />

      <div className="grid sm:grid-cols-3 gap-4 mb-6">
        <Stat icon={Wallet} label="Net Worth" value={money(o.netWorth || 0)} tone={(o.netWorth || 0) >= 0 ? "green" : "red"} />
        <Stat icon={Landmark} label="Total Assets" value={money(o.totalAssets || 0)} />
        <Stat icon={TrendingUp} label="Total Debt" value={money(o.totalLiabilities || 0)} tone="red" />
      </div>

      <Card className="p-6">
        <div className="flex items-center gap-2 mb-4"><Target size={18} className="text-compass-blue" /><h2 className="font-heading text-lg font-bold text-compass-navy">My Goals</h2></div>
        {goals.length === 0 ? (
          <Empty icon={Target} title="No goals yet">Your advisor will add goals to your plan.</Empty>
        ) : (
          <div className="space-y-4" data-testid="myplan-goals">
            {goals.map((g) => {
              const pct = g.target_amount > 0 ? Math.min(100, Math.round((g.current_amount / g.target_amount) * 100)) : 0;
              return (
                <div key={g.id} data-testid={`myplan-goal-${g.id}`}>
                  <div className="flex items-center justify-between text-sm mb-1.5">
                    <span className="font-semibold text-compass-navy">{g.title} <span className="text-compass-muted font-normal">· by {g.target_year}</span></span>
                    <span className="text-compass-muted">{money(g.current_amount || 0)} / {money(g.target_amount || 0)}</span>
                  </div>
                  <Progress value={pct} />
                </div>
              );
            })}
          </div>
        )}
      </Card>

      <p className="text-xs text-compass-muted mt-6">This is a read-only view maintained by your advisor. Contact them to update your goals or financial details.</p>
    </div>
  );
}
