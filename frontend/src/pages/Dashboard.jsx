import React, { useEffect, useState } from "react";
import { useQuery } from "@tanstack/react-query";
import { PieChart, Pie, Cell, ResponsiveContainer, BarChart, Bar, XAxis, YAxis, Tooltip } from "recharts";
import { Wallet, Users, Target, Building2, RefreshCw, ShieldAlert, ArrowRight, TrendingUp, AlertTriangle } from "lucide-react";
import { Link, useNavigate } from "react-router-dom";
import api from "@/lib/api";
import { useAuth } from "@/context/AuthContext";
import { useHousehold } from "@/context/HouseholdContext";
import { Card, Stat, Badge, Button } from "@/components/ui-kit";
import { PageHeader } from "@/components/PageHeader";
import { money, compact, dateFmt, STATUS_META } from "@/lib/format";

const CHART_COLORS = ["#0052FF", "#00DF89", "#FFB800", "#A3AED0", "#1B2559"];

export default function Dashboard() {
  const { user } = useAuth();
  const { setActive } = useHousehold();
  const navigate = useNavigate();
  const { data, isLoading } = useQuery({ queryKey: ["dashboard"], queryFn: async () => (await api.get("/dashboard")).data });
  const clientsQ = useQuery({ queryKey: ["clients"], queryFn: async () => (await api.get("/advisor/clients")).data, enabled: user.tier === "advisor" });

  if (isLoading || !data) return <div className="text-compass-muted">Loading dashboard…</div>;

  const openHousehold = (c) => { setActive(c.client_id, c.primary || c.client_id); navigate("/profile"); };
  const feed = (clientsQ.data || [])
    .filter((c) => (c.alerts || []).length > 0)
    .sort((a, b) => (a.score || 0) - (b.score || 0))
    .flatMap((c) => (c.alerts || []).map((a) => ({ client_id: c.client_id, primary: c.primary || c.client_id, score: c.score, status: c.status, alert: a, next_action: c.next_action })));

  const statusData = Object.entries(data.goal_status || {}).map(([k, v]) => ({
    name: STATUS_META[k]?.label || k, value: v, color: STATUS_META[k]?.color || "#A3AED0",
  }));

  return (
    <div>
      <PageHeader
        title={`${greeting()}, ${data.name.split(" ")[0]}`}
        subtitle={subtitleFor(user.tier)}
      />

      <div className="grid grid-cols-2 lg:grid-cols-4 gap-4 mb-6">
        <Stat label="Assets under plan" value={money(data.total_assets)} accent sub="Across all accounts" />
        {user.tier === "advisor" ? (
          <Stat label="Client households" value={data.clients_count} sub="In your book" />
        ) : (
          <Stat label={user.tier === "enterprise" ? "Corp members" : "Household members"} value={data.owners_count} />
        )}
        <Stat label="Accounts" value={data.accounts_count} sub="RRSP · TFSA · Pension" />
        <Stat label="Active goals" value={data.goals_count} />
      </div>

      <div className="grid lg:grid-cols-3 gap-6">
        <Card className="p-6 lg:col-span-2">
          <div className="flex items-center justify-between mb-4">
            <h3 className="font-heading font-bold text-compass-navy flex items-center gap-2">
              <TrendingUp size={18} className="text-compass-blue" /> Assets by account type
            </h3>
            <Badge>{money(data.total_assets)}</Badge>
          </div>
          {data.assets_by_type.length ? (
            <ResponsiveContainer width="100%" height={260}>
              <BarChart data={data.assets_by_type} margin={{ left: 10, right: 10 }}>
                <XAxis dataKey="type" tick={{ fill: "#A3AED0", fontSize: 12 }} axisLine={false} tickLine={false} />
                <YAxis tickFormatter={compact} tick={{ fill: "#A3AED0", fontSize: 12 }} axisLine={false} tickLine={false} width={48} />
                <Tooltip formatter={(v) => money(v)} cursor={{ fill: "rgba(0,82,255,0.05)" }}
                  contentStyle={{ borderRadius: 12, border: "1px solid #E2E8F0" }} />
                <Bar dataKey="value" radius={[8, 8, 0, 0]}>
                  {data.assets_by_type.map((_, i) => <Cell key={i} fill={CHART_COLORS[i % CHART_COLORS.length]} />)}
                </Bar>
              </BarChart>
            </ResponsiveContainer>
          ) : (
            <div className="text-sm text-compass-muted py-10 text-center">No accounts yet.</div>
          )}
        </Card>

        <Card className="p-6">
          <h3 className="font-heading font-bold text-compass-navy mb-4">Goal health</h3>
          {statusData.length ? (
            <>
              <ResponsiveContainer width="100%" height={180}>
                <PieChart>
                  <Pie data={statusData} dataKey="value" innerRadius={50} outerRadius={80} paddingAngle={3}>
                    {statusData.map((s, i) => <Cell key={i} fill={s.color} />)}
                  </Pie>
                  <Tooltip contentStyle={{ borderRadius: 12, border: "1px solid #E2E8F0" }} />
                </PieChart>
              </ResponsiveContainer>
              <div className="space-y-2 mt-2">
                {statusData.map((s) => (
                  <div key={s.name} className="flex items-center justify-between text-sm">
                    <span className="flex items-center gap-2 text-compass-navy">
                      <span className="h-2.5 w-2.5 rounded-full" style={{ background: s.color }} /> {s.name}
                    </span>
                    <span className="font-semibold text-compass-navy">{s.value}</span>
                  </div>
                ))}
              </div>
            </>
          ) : (
            <div className="text-sm text-compass-muted py-10 text-center">No goals yet.</div>
          )}
        </Card>
      </div>

      {/* Tier-specific panels */}
      {user.tier === "enterprise" && data.crm && (
        <Card className="p-6 mt-6">
          <div className="flex flex-col sm:flex-row sm:items-center justify-between gap-4">
            <div className="flex items-center gap-3">
              <div className="h-11 w-11 rounded-xl gradient-bg flex items-center justify-center text-white"><Building2 size={22} /></div>
              <div>
                <h3 className="font-heading font-bold text-compass-navy">{data.crm.connector} — source of truth</h3>
                <p className="text-sm text-compass-muted">
                  Last synced {dateFmt(data.crm.last_synced_at)} · {data.crm.records_synced} records · deletes never propagate to CRM
                </p>
              </div>
            </div>
            <Link to="/crm"><Button variant="outline">Manage sync <ArrowRight size={16} /></Button></Link>
          </div>
        </Card>
      )}

      {user.tier === "advisor" && (
        <Card className="p-6 mt-6 flex flex-col sm:flex-row sm:items-center justify-between gap-4">
          <div className="flex items-center gap-3">
            <div className="h-11 w-11 rounded-xl gradient-bg flex items-center justify-center text-white"><Users size={22} /></div>
            <div>
              <h3 className="font-heading font-bold text-compass-navy">{data.clients_count} client households</h3>
              <p className="text-sm text-compass-muted">Drill into any household to manage owners, accounts and goals.</p>
            </div>
          </div>
          <Link to="/clients"><Button variant="outline">Open roster <ArrowRight size={16} /></Button></Link>
        </Card>
      )}

      {user.tier === "advisor" && (
        <Card className="p-6 mt-6" data-testid="advisor-alerts-feed">
          <div className="flex items-center justify-between mb-4">
            <h3 className="font-heading font-bold text-compass-navy flex items-center gap-2"><AlertTriangle size={18} className="text-compass-amber" /> Action feed</h3>
            <Badge color="#0052FF" bg="rgba(0,82,255,0.08)">{feed.length}</Badge>
          </div>
          {feed.length === 0 ? (
            <div className="text-sm text-compass-muted">No open items across your book. Nicely done.</div>
          ) : (
            <div className="space-y-2">
              {feed.slice(0, 12).map((f, i) => (
                <button key={i} onClick={() => openHousehold(f)} data-testid={`feed-item-${i}`}
                  className="w-full flex items-center gap-3 rounded-xl bg-compass-bg hover:bg-compass-blue/5 border border-transparent hover:border-compass-blue/20 px-4 py-3 text-left transition-colors">
                  <span className="h-7 w-7 rounded-lg flex items-center justify-center text-white text-xs font-bold shrink-0" style={{ background: (f.score >= 75 ? "#00DF89" : f.score >= 50 ? "#FFB800" : "#EE5D50") }}>{f.score}</span>
                  <div className="min-w-0 flex-1">
                    <div className="text-sm font-semibold text-compass-navy truncate">{f.primary} <span className="text-compass-muted font-normal">· {f.alert}</span></div>
                    <div className="text-xs text-compass-blue font-semibold">Next: {f.next_action}</div>
                  </div>
                  <ArrowRight size={15} className="text-compass-muted shrink-0" />
                </button>
              ))}
            </div>
          )}
        </Card>
      )}

      {user.tier === "solo" && data.retention && (
        <Card className="p-6 mt-6 flex items-start gap-3">
          <ShieldAlert size={22} className="text-compass-green shrink-0 mt-0.5" />
          <div>
            <h3 className="font-heading font-bold text-compass-navy">Your data, your control</h3>
            <p className="text-sm text-compass-muted mt-1">
              As a Solo user you are the data controller. If you opt out, your data is retained for
              <span className="font-semibold text-compass-navy"> 30 days</span> then permanently purged. Current status:{" "}
              <Badge color={STATUS_META.on_track.color} bg={STATUS_META.on_track.bg}>{data.retention.status}</Badge>
            </p>
          </div>
        </Card>
      )}
    </div>
  );
}

function greeting() {
  const h = new Date().getHours();
  return h < 12 ? "Good morning" : h < 18 ? "Good afternoon" : "Good evening";
}
function subtitleFor(tier) {
  return {
    enterprise: "Corp-scoped overview. CRM stays authoritative; Compass syncs from it.",
    advisor: "Your firm's book of business across all client households.",
    solo: "Your personal retirement snapshot.",
  }[tier];
}
