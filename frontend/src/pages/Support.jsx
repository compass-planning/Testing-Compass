import React, { useState } from "react";
import { useQuery, useMutation, useQueryClient } from "@tanstack/react-query";
import { toast } from "sonner";
import { LifeBuoy, MessageSquare } from "lucide-react";
import api, { formatApiError } from "@/lib/api";
import { PageHeader } from "@/components/PageHeader";
import { Card, Input, Select, Button, Badge } from "@/components/ui-kit";

const STATUS_COLOR = { open: "#FFB800", in_progress: "#0052FF", resolved: "#00DF89" };

function Thread({ ticket }) {
  const qc = useQueryClient();
  const [text, setText] = useState("");
  const reply = useMutation({
    mutationFn: (t) => api.post(`/support/tickets/${ticket.id}/reply`, { text: t }).then((r) => r.data),
    onSuccess: () => { qc.invalidateQueries({ queryKey: ["my-tickets"] }); setText(""); },
    onError: (e) => toast.error(formatApiError(e.response?.data?.detail)),
  });
  const replies = ticket.replies || [];
  return (
    <div className="mt-3 border-t border-compass-border pt-3 space-y-2" data-testid={`thread-${ticket.id}`}>
      {replies.map((m, i) => (
        <div key={i} className={`flex ${m.role === "user" ? "justify-end" : "justify-start"}`}>
          <div className={`max-w-[80%] rounded-xl px-3 py-2 text-sm ${m.role === "user" ? "bg-compass-blue/10 text-compass-navy" : "bg-compass-bg text-compass-navy"}`}>
            <div className="text-[10px] font-bold uppercase tracking-wide text-compass-muted mb-0.5">{m.role === "admin" ? "Support" : "You"}</div>
            {m.text}
          </div>
        </div>
      ))}
      {!replies.length && <div className="text-xs text-compass-muted">No replies yet — we'll respond here.</div>}
      <div className="flex gap-2">
        <Input value={text} onChange={(e) => setText(e.target.value)} placeholder="Write a reply…" data-testid={`reply-input-${ticket.id}`} />
        <Button size="sm" onClick={() => text.trim() && reply.mutate(text)} disabled={!text.trim() || reply.isPending} data-testid={`reply-send-${ticket.id}`}>Send</Button>
      </div>
    </div>
  );
}

export default function Support() {
  const qc = useQueryClient();
  const [form, setForm] = useState({ subject: "", description: "", priority: "normal" });
  const [open, setOpen] = useState(null);
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
          <Card key={t.id} className="p-4" data-testid={`my-ticket-${t.id}`}>
            <div className="flex items-start justify-between gap-4">
              <div>
                <div className="font-bold text-compass-navy">{t.subject}</div>
                {t.description && <div className="text-sm text-compass-muted mt-1">{t.description}</div>}
              </div>
              <div className="flex items-center gap-2 shrink-0">
                <Badge color={STATUS_COLOR[t.status] || "#A3AED0"} bg="rgba(0,0,0,0.04)">{t.status.replace("_", " ")}</Badge>
                <Button size="sm" variant="ghost" onClick={() => setOpen(open === t.id ? null : t.id)} data-testid={`thread-toggle-${t.id}`}>
                  <MessageSquare size={15} /> {(t.replies || []).length || ""}
                </Button>
              </div>
            </div>
            {open === t.id && <Thread ticket={t} />}
          </Card>
        ))}
        {!tickets.length && <div className="text-sm text-compass-muted">No requests yet.</div>}
      </div>
    </div>
  );
}
