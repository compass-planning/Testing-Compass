import React, { useState } from "react";
import { useQuery, useMutation, useQueryClient } from "@tanstack/react-query";
import { toast } from "sonner";
import { Trash2 } from "lucide-react";
import api, { formatApiError } from "@/lib/api";
import { PageHeader } from "@/components/PageHeader";
import { Card, Input, Select, Button, Badge, Toggle } from "@/components/ui-kit";

export default function AdminAnnouncements() {
  const qc = useQueryClient();
  const [form, setForm] = useState({ title: "", body: "", audience: "all", active: true });
  const { data } = useQuery({ queryKey: ["admin-anns"], queryFn: () => api.get("/admin/announcements").then((r) => r.data) });
  const items = data?.announcements || [];
  const inval = () => qc.invalidateQueries({ queryKey: ["admin-anns"] });

  const create = useMutation({
    mutationFn: (b) => api.post("/admin/announcements", b).then((r) => r.data),
    onSuccess: () => { inval(); setForm({ title: "", body: "", audience: "all", active: true }); toast.success("Announcement posted"); },
    onError: (e) => toast.error(formatApiError(e.response?.data?.detail)),
  });
  const toggle = useMutation({
    mutationFn: (a) => api.put(`/admin/announcements/${a.id}`, { ...a, active: !a.active }).then((r) => r.data),
    onSuccess: inval,
  });
  const remove = useMutation({
    mutationFn: (id) => api.delete(`/admin/announcements/${id}`).then((r) => r.data),
    onSuccess: () => { inval(); toast.success("Deleted"); },
  });

  return (
    <div className="space-y-6" data-testid="admin-announcements">
      <PageHeader title="Announcements" subtitle="Push a banner to users — all tiers or a specific one." />
      <Card className="p-6 space-y-4">
        <Input placeholder="Title" value={form.title} onChange={(e) => setForm({ ...form, title: e.target.value })} data-testid="ann-title" />
        <Input placeholder="Message" value={form.body} onChange={(e) => setForm({ ...form, body: e.target.value })} data-testid="ann-body" />
        <div className="flex items-center gap-4 flex-wrap">
          <Select value={form.audience} onChange={(e) => setForm({ ...form, audience: e.target.value })} className="max-w-[200px]" data-testid="ann-audience">
            <option value="all">All users</option><option value="enterprise">Enterprise</option><option value="advisor">Advisor</option><option value="solo">Solo</option>
          </Select>
          <label className="flex items-center gap-2 text-sm text-compass-navy">Active <Toggle checked={form.active} onChange={(v) => setForm({ ...form, active: v })} testid="ann-active" /></label>
          <Button onClick={() => form.title && create.mutate(form)} disabled={!form.title || create.isPending} data-testid="ann-create">Post announcement</Button>
        </div>
        <p className="text-xs text-compass-muted">Only <span className="font-semibold">active</span> announcements are shown to users.</p>
      </Card>
      <div className="space-y-3">
        {items.map((a) => (
          <Card key={a.id} className="p-4 flex items-start justify-between gap-4" data-testid={`ann-${a.id}`}>
            <div>
              <div className="flex items-center gap-2">
                <span className="font-bold text-compass-navy">{a.title}</span>
                <Badge color="#0052FF" bg="rgba(0,82,255,0.08)">{a.audience}</Badge>
                {a.active ? <Badge color="#00DF89" bg="rgba(0,223,137,0.12)">active</Badge> : <Badge color="#A3AED0" bg="rgba(0,0,0,0.04)">hidden</Badge>}
              </div>
              {a.body && <div className="text-sm text-compass-muted mt-1">{a.body}</div>}
            </div>
            <div className="flex items-center gap-2 shrink-0">
              <Button size="sm" variant="outline" onClick={() => toggle.mutate(a)} data-testid={`ann-toggle-${a.id}`}>{a.active ? "Hide" : "Show"}</Button>
              <Button size="sm" variant="ghost" onClick={() => remove.mutate(a.id)} data-testid={`ann-del-${a.id}`}><Trash2 size={15} /></Button>
            </div>
          </Card>
        ))}
        {!items.length && <div className="text-sm text-compass-muted">No announcements yet.</div>}
      </div>
    </div>
  );
}
