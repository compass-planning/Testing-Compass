import React, { useState } from "react";
import { useQuery, useMutation, useQueryClient } from "@tanstack/react-query";
import { toast } from "sonner";
import { Activity } from "lucide-react";
import api, { formatApiError } from "@/lib/api";
import { PageHeader } from "@/components/PageHeader";
import { Card, Input, Select, Button, Badge, Stat } from "@/components/ui-kit";

const SEV = { operational: "#00DF89", degraded: "#FFB800", outage: "#EE5D50", maintenance: "#0052FF" };
const fmtUptime = (s) => {
  if (s == null) return "—";
  const d = Math.floor(s / 86400), h = Math.floor((s % 86400) / 3600), m = Math.floor((s % 3600) / 60);
  return d > 0 ? `${d}d ${h}h` : h > 0 ? `${h}h ${m}m` : `${m}m`;
};

export default function AdminStatus() {
  const qc = useQueryClient();
  const [form, setForm] = useState({ title: "", body: "", severity: "maintenance" });
  const { data } = useQuery({ queryKey: ["admin-status"], queryFn: () => api.get("/admin/status").then((r) => r.data) });
  const ov = useQuery({ queryKey: ["admin-overview"], queryFn: () => api.get("/admin/overview").then((r) => r.data) });
  const posts = data?.status_posts || [];
  const inval = () => qc.invalidateQueries({ queryKey: ["admin-status"] });

  const create = useMutation({
    mutationFn: (b) => api.post("/admin/status", b).then((r) => r.data),
    onSuccess: () => { inval(); setForm({ title: "", body: "", severity: "maintenance" }); toast.success("Status posted"); },
    onError: (e) => toast.error(formatApiError(e.response?.data?.detail)),
  });
  const resolve = useMutation({
    mutationFn: (id) => api.patch(`/admin/status/${id}/resolve`).then((r) => r.data),
    onSuccess: () => { inval(); toast.success("Marked resolved"); },
  });

  return (
    <div className="space-y-6" data-testid="admin-status">
      <PageHeader title="Status & Health" subtitle="System health and public status posts." />
      <div className="grid grid-cols-2 lg:grid-cols-4 gap-4">
        <Stat label="Uptime" value={fmtUptime(ov.data?.uptime_seconds)} accent />
        <Stat label="Server errors (5xx)" value={ov.data?.errors ?? "—"} />
        <Stat label="Active subscriptions" value={ov.data?.subscriptions_active ?? "—"} />
        <Stat label="Open tickets" value={ov.data?.tickets_open ?? "—"} />
      </div>

      <Card className="p-6 space-y-4">
        <div className="flex items-center gap-2"><Activity size={18} className="text-compass-blue" /><h3 className="font-heading font-bold text-compass-navy">Post a status update</h3></div>
        <Input placeholder="Title" value={form.title} onChange={(e) => setForm({ ...form, title: e.target.value })} data-testid="status-title" />
        <Input placeholder="Details" value={form.body} onChange={(e) => setForm({ ...form, body: e.target.value })} data-testid="status-body" />
        <div className="flex items-center gap-3 flex-wrap">
          <Select value={form.severity} onChange={(e) => setForm({ ...form, severity: e.target.value })} className="max-w-[200px]" data-testid="status-severity">
            <option value="operational">Operational</option><option value="maintenance">Maintenance</option><option value="degraded">Degraded</option><option value="outage">Outage</option>
          </Select>
          <Button onClick={() => form.title && create.mutate(form)} disabled={!form.title || create.isPending} data-testid="status-create">Post update</Button>
        </div>
      </Card>

      <div className="space-y-3">
        {posts.map((s) => (
          <Card key={s.id} className="p-4 flex items-start justify-between gap-4" data-testid={`status-${s.id}`}>
            <div>
              <div className="flex items-center gap-2">
                <Badge color={SEV[s.severity] || "#A3AED0"} bg="rgba(0,0,0,0.04)">{s.severity}</Badge>
                <span className="font-bold text-compass-navy">{s.title}</span>
                {s.resolved_at && <Badge color="#00DF89" bg="rgba(0,223,137,0.12)">resolved</Badge>}
              </div>
              {s.body && <div className="text-sm text-compass-muted mt-1">{s.body}</div>}
            </div>
            {!s.resolved_at && s.severity !== "operational" && (
              <Button size="sm" variant="outline" onClick={() => resolve.mutate(s.id)} data-testid={`status-resolve-${s.id}`}>Resolve</Button>
            )}
          </Card>
        ))}
        {!posts.length && <div className="text-sm text-compass-muted">No status posts.</div>}
      </div>
    </div>
  );
}
