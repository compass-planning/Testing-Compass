import React, { useState } from "react";
import { useQuery, useMutation, useQueryClient } from "@tanstack/react-query";
import { toast } from "sonner";
import api, { formatApiError } from "@/lib/api";
import { PageHeader } from "@/components/PageHeader";
import { Card, Input, Select, Button, Badge } from "@/components/ui-kit";

const STATUS_COLOR = { open: "#FFB800", in_progress: "#0052FF", resolved: "#00DF89" };
const PRIO_COLOR = { low: "#A3AED0", normal: "#0052FF", high: "#FFB800", urgent: "#EE5D50" };

function Thread({ ticket }) {
  const qc = useQueryClient();
  const [text, setText] = useState("");
  const reply = useMutation({
    mutationFn: (t) => api.post(`/admin/tickets/${ticket.id}/reply`, { text: t }).then((r) => r.data),
    onSuccess: () => { qc.invalidateQueries({ queryKey: ["admin-tickets"] }); setText(""); toast.success("Reply sent"); },
    onError: (e) => toast.error(formatApiError(e.response?.data?.detail)),
  });
  const replies = ticket.replies || [];
  return (
    <div className="mt-3 border-t border-compass-border pt-3 space-y-2" data-testid={`admin-thread-${ticket.id}`}>
      {replies.map((m, i) => (
        <div key={i} className={`flex ${m.role === "admin" ? "justify-end" : "justify-start"}`}>
          <div className={`max-w-[80%] rounded-xl px-3 py-2 text-sm ${m.role === "admin" ? "bg-compass-blue/10 text-compass-navy" : "bg-compass-bg text-compass-navy"}`}>
            <div className="text-[10px] font-bold uppercase tracking-wide text-compass-muted mb-0.5">{m.role === "admin" ? "You (Support)" : m.by}</div>
            {m.text}
          </div>
        </div>
      ))}
      {!replies.length && <div className="text-xs text-compass-muted">No replies yet.</div>}
      <div className="flex gap-2">
        <Input value={text} onChange={(e) => setText(e.target.value)} placeholder="Reply to requester…" data-testid={`admin-reply-input-${ticket.id}`} />
        <Button size="sm" onClick={() => text.trim() && reply.mutate(text)} disabled={!text.trim() || reply.isPending} data-testid={`admin-reply-send-${ticket.id}`}>Send</Button>
      </div>
    </div>
  );
}

export default function AdminTickets() {
  const qc = useQueryClient();
  const [form, setForm] = useState({ type: "service_request", subject: "", description: "", priority: "normal", requester_email: "" });
  const [open, setOpen] = useState(null);
  const { data } = useQuery({ queryKey: ["admin-tickets"], queryFn: () => api.get("/admin/tickets").then((r) => r.data) });
  const tickets = data?.tickets || [];
  const inval = () => qc.invalidateQueries({ queryKey: ["admin-tickets"] });

  const create = useMutation({
    mutationFn: (b) => api.post("/admin/tickets", b).then((r) => r.data),
    onSuccess: () => { inval(); setForm({ type: "service_request", subject: "", description: "", priority: "normal", requester_email: "" }); toast.success("Ticket created"); },
    onError: (e) => toast.error(formatApiError(e.response?.data?.detail)),
  });
  const patch = useMutation({
    mutationFn: ({ id, body }) => api.patch(`/admin/tickets/${id}`, body).then((r) => r.data),
    onSuccess: inval,
  });

  return (
    <div className="space-y-6" data-testid="admin-tickets">
      <PageHeader title="Tickets" subtitle="Incidents and service requests." />
      <Card className="p-6 space-y-4">
        <div className="flex gap-3 flex-wrap">
          <Select value={form.type} onChange={(e) => setForm({ ...form, type: e.target.value })} className="max-w-[180px]" data-testid="ticket-type">
            <option value="service_request">Service request</option><option value="incident">Incident</option>
          </Select>
          <Select value={form.priority} onChange={(e) => setForm({ ...form, priority: e.target.value })} className="max-w-[140px]" data-testid="ticket-priority">
            <option value="low">Low</option><option value="normal">Normal</option><option value="high">High</option><option value="urgent">Urgent</option>
          </Select>
        </div>
        <Input placeholder="Subject" value={form.subject} onChange={(e) => setForm({ ...form, subject: e.target.value })} data-testid="ticket-subject" />
        <Input placeholder="Requester email (optional)" value={form.requester_email} onChange={(e) => setForm({ ...form, requester_email: e.target.value })} data-testid="ticket-requester" />
        <Input placeholder="Description" value={form.description} onChange={(e) => setForm({ ...form, description: e.target.value })} data-testid="ticket-desc" />
        <Button onClick={() => form.subject && create.mutate(form)} disabled={!form.subject || create.isPending} data-testid="ticket-create">Create ticket</Button>
      </Card>
      <div className="space-y-3">
        {tickets.map((t) => (
          <Card key={t.id} className="p-4" data-testid={`ticket-${t.id}`}>
            <div className="flex items-start justify-between gap-4">
              <div>
                <div className="flex items-center gap-2 flex-wrap">
                  <span className="font-bold text-compass-navy">{t.subject}</span>
                  <Badge color="#1B2559" bg="rgba(0,0,0,0.04)">{t.type === "incident" ? "Incident" : "Service"}</Badge>
                  <Badge color={PRIO_COLOR[t.priority] || "#A3AED0"} bg="rgba(0,0,0,0.04)">{t.priority}</Badge>
                  <Badge color={STATUS_COLOR[t.status] || "#A3AED0"} bg="rgba(0,0,0,0.04)">{t.status.replace("_", " ")}</Badge>
                  {t.source === "in_app" && <Badge color="#00DF89" bg="rgba(0,223,137,0.12)">in-app</Badge>}
                </div>
                {t.description && <div className="text-sm text-compass-muted mt-1">{t.description}</div>}
                {t.requester_email && <div className="text-xs text-compass-muted mt-1">From: {t.requester_email}</div>}
              </div>
              <div className="flex items-center gap-2 shrink-0">
                <Select value={t.status} onChange={(e) => patch.mutate({ id: t.id, body: { status: e.target.value } })} className="max-w-[150px]" data-testid={`ticket-status-${t.id}`}>
                  <option value="open">Open</option><option value="in_progress">In progress</option><option value="resolved">Resolved</option>
                </Select>
                <Button size="sm" variant="outline" onClick={() => setOpen(open === t.id ? null : t.id)} data-testid={`ticket-reply-toggle-${t.id}`}>Reply</Button>
              </div>
            </div>
            {open === t.id && <Thread ticket={t} />}
          </Card>
        ))}
        {!tickets.length && <div className="text-sm text-compass-muted">No tickets.</div>}
      </div>
    </div>
  );
}
