import React from "react";
import { useQuery } from "@tanstack/react-query";
import { Activity } from "lucide-react";
import api from "@/lib/api";
import { PageHeader } from "@/components/PageHeader";
import { Card, Stat, Badge } from "@/components/ui-kit";

const fmtUptime = (s) => {
  if (!s && s !== 0) return "—";
  const d = Math.floor(s / 86400), h = Math.floor((s % 86400) / 3600), m = Math.floor((s % 3600) / 60);
  return d > 0 ? `${d}d ${h}h` : h > 0 ? `${h}h ${m}m` : `${m}m`;
};

const SEV = { operational: "#00DF89", degraded: "#FFB800", outage: "#EE5D50", maintenance: "#0052FF" };

export default function AdminOverview() {
  const { data } = useQuery({ queryKey: ["admin-overview"], queryFn: () => api.get("/admin/overview").then((r) => r.data) });
  const o = data || {};
  const bt = o.users_by_tier || {};
  return (
    <div className="space-y-6" data-testid="admin-overview">
      <PageHeader title="Overview" subtitle="Platform health, billing and support at a glance." />
      <div className="grid grid-cols-2 lg:grid-cols-4 gap-4">
        <Stat label="Total accounts" value={o.users_total ?? "—"} sub={`${bt.enterprise || 0} ent · ${bt.advisor || 0} adv · ${bt.solo || 0} solo`} accent />
        <Stat label="Active subscriptions" value={o.subscriptions_active ?? "—"} />
        <Stat label="MRR" value={o.mrr != null ? `$${o.mrr.toLocaleString()}` : "—"} sub={o.currency || "CAD"} />
        <Stat label="Open tickets" value={o.tickets_open ?? "—"} />
        <Stat label="Suspended" value={o.suspended ?? "—"} />
        <Stat label="Uptime" value={fmtUptime(o.uptime_seconds)} />
        <Stat label="Server errors (5xx)" value={o.errors ?? "—"} />
      </div>
      <Card className="p-6">
        <div className="flex items-center gap-2 mb-2"><Activity size={18} className="text-compass-blue" /><h3 className="font-heading font-bold text-compass-navy">Current status</h3></div>
        {o.current_status && o.current_status.severity !== "operational" ? (
          <div className="flex items-center gap-3">
            <Badge color={SEV[o.current_status.severity] || "#A3AED0"} bg="rgba(0,0,0,0.04)">{o.current_status.severity}</Badge>
            <div className="text-sm text-compass-navy font-semibold">{o.current_status.title}</div>
          </div>
        ) : (
          <div className="flex items-center gap-3">
            <Badge color="#00DF89" bg="rgba(0,223,137,0.12)">operational</Badge>
            <div className="text-sm text-compass-navy font-semibold">All systems operational</div>
          </div>
        )}
      </Card>
    </div>
  );
}
