import React from "react";
import { useQuery, useMutation, useQueryClient } from "@tanstack/react-query";
import { toast } from "sonner";
import api, { formatApiError } from "@/lib/api";
import { PageHeader } from "@/components/PageHeader";
import { Card, Select, Badge } from "@/components/ui-kit";

const STATUS_COLOR = { new: "#0052FF", contacted: "#FFB800", closed: "#00DF89" };

export default function AdminLeads() {
  const qc = useQueryClient();
  const { data } = useQuery({ queryKey: ["admin-leads"], queryFn: () => api.get("/admin/leads").then((r) => r.data) });
  const leads = data?.leads || [];
  const counts = data?.counts || {};
  const bySource = data?.by_source || {};
  const patch = useMutation({
    mutationFn: ({ id, status }) => api.patch(`/admin/leads/${id}`, { status }).then((r) => r.data),
    onSuccess: () => qc.invalidateQueries({ queryKey: ["admin-leads"] }),
    onError: (e) => toast.error(formatApiError(e.response?.data?.detail)),
  });

  return (
    <div className="space-y-6" data-testid="admin-leads">
      <PageHeader title="Leads" subtitle="Enterprise enquiries submitted through the website Contact Sales form." />
      <div className="flex gap-3 flex-wrap">
        {["new", "contacted", "closed"].map((s) => (
          <Card key={s} className="px-5 py-3" data-testid={`lead-count-${s}`}>
            <div className="muted-label capitalize">{s}</div>
            <div className="font-heading text-2xl font-extrabold" style={{ color: STATUS_COLOR[s] }}>{counts[s] || 0}</div>
          </Card>
        ))}
      </div>
      {Object.keys(bySource).length > 0 && (
        <Card className="p-4" data-testid="leads-source-breakdown">
          <div className="muted-label mb-2">By source</div>
          <div className="flex flex-wrap gap-2">
            {Object.entries(bySource).map(([s, c]) => (
              <span key={s} className="inline-flex items-center gap-1.5 rounded-full bg-compass-bg px-3 py-1 text-xs font-semibold text-compass-navy" data-testid={`source-${s}`}>
                <span className="capitalize">{s}</span>
                <span className="rounded-full bg-compass-blue/10 px-1.5 text-compass-blue">{c}</span>
              </span>
            ))}
          </div>
        </Card>
      )}
      <div className="space-y-3">
        {leads.map((l) => (
          <Card key={l.id} className="p-4" data-testid={`lead-${l.id}`}>
            <div className="flex items-start justify-between gap-4">
              <div className="min-w-0">
                <div className="flex items-center gap-2 flex-wrap">
                  <span className="font-bold text-compass-navy">{l.company || l.name}</span>
                  <Badge color={STATUS_COLOR[l.status]} bg="rgba(0,0,0,0.04)">{l.status}</Badge>
                  {l.seats && <Badge color="#1B2559" bg="rgba(0,0,0,0.04)">{l.seats}</Badge>}
                  {l.source && <Badge color="#7B61FF" bg="rgba(123,97,255,0.1)">{l.source}</Badge>}
                  {l.locale === "fr" && <Badge color="#0052FF" bg="rgba(0,82,255,0.1)">FR</Badge>}
                </div>
                <div className="text-sm text-compass-navy mt-1">{l.name} · <a href={`mailto:${l.email}`} className="text-compass-blue hover:underline">{l.email}</a></div>
                {l.message && <div className="text-sm text-compass-muted mt-2 whitespace-pre-wrap">{l.message}</div>}
                <div className="text-xs text-compass-muted mt-2">{l.created_at ? new Date(l.created_at).toLocaleString() : ""}</div>
              </div>
              <Select value={l.status} onChange={(e) => patch.mutate({ id: l.id, status: e.target.value })} className="max-w-[150px] shrink-0" data-testid={`lead-status-${l.id}`}>
                <option value="new">New</option>
                <option value="contacted">Contacted</option>
                <option value="closed">Closed</option>
              </Select>
            </div>
          </Card>
        ))}
        {!leads.length && <div className="text-sm text-compass-muted">No leads yet.</div>}
      </div>
    </div>
  );
}
