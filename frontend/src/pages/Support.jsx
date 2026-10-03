import React, { useState } from "react";
import { useQuery, useMutation, useQueryClient } from "@tanstack/react-query";
import { toast } from "sonner";
import { LifeBuoy } from "lucide-react";
import api, { formatApiError } from "@/lib/api";
import { PageHeader } from "@/components/PageHeader";
import { Card, Input, Select, Button, Badge } from "@/components/ui-kit";

const STATUS_COLOR = { open: "#FFB800", in_progress: "#0052FF", resolved: "#00DF89" };

export default function Support() {
  const qc = useQueryClient();
  const [form, setForm] = useState({ subject: "", description: "", priority: "normal" });
  const { data } = useQuery({ queryKey: ["my-tickets"], queryFn: () => api.get("/support/tickets").then((r) => r.data) });
  const tickets = data?.tickets || [];

  const submit = useMutation({
    mutationFn: (b) => api.post("/support/tickets", b).then((r) => r.data),
    onSuccess: () => { qc.invalidateQueries({ queryKey: ["my-tickets"] }); setForm({ subject: "", description: "", priority: "normal" }); toast.success("Request submitted — our team will be in touch"); },
    onError: (e) => toast.error(formatApiError(e.response?.data?.detail)),
  });

  return (
    <div className="space-y-6" data-testid="support-page">
      <PageHeader title="Support" subtitle="File a request — it goes straight to our support team." />
      <Card className="p-6 space-y-4">
        <div className="flex items-center gap-2"><LifeBuoy size={18} className="text-compass-blue" /><h3 className="font-heading font-bold text-compass-navy">New request</h3></div>
        <Input placeholder="Subject" value={form.subject} onChange={(e) => setForm({ ...form, subject: e.target.value })} data-testid="support-subject" />
        <Select value={form.priority} onChange={(e) => setForm({ ...form, priority: e.target.value })} className="max-w-[180px]" data-testid="support-priority">
          <option value="low">Low</option><option value="normal">Normal</option><option value="high">High</option><option value="urgent">Urgent</option>
        </Select>
        <Input placeholder="Describe your request…" value={form.description} onChange={(e) => setForm({ ...form, description: e.target.value })} data-testid="support-desc" />
        <Button onClick={() => form.subject && submit.mutate(form)} disabled={!form.subject || submit.isPending} data-testid="support-submit">Submit request</Button>
      </Card>

      <div className="space-y-3">
        <h3 className="font-heading font-bold text-compass-navy">Your requests</h3>
        {tickets.map((t) => (
          <Card key={t.id} className="p-4 flex items-start justify-between gap-4" data-testid={`my-ticket-${t.id}`}>
            <div>
              <div className="font-bold text-compass-navy">{t.subject}</div>
              {t.description && <div className="text-sm text-compass-muted mt-1">{t.description}</div>}
            </div>
            <Badge color={STATUS_COLOR[t.status] || "#A3AED0"} bg="rgba(0,0,0,0.04)">{t.status.replace("_", " ")}</Badge>
          </Card>
        ))}
        {!tickets.length && <div className="text-sm text-compass-muted">No requests yet.</div>}
      </div>
    </div>
  );
}
