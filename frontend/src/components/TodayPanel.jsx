import React, { useState } from "react";
import { useQuery, useMutation, useQueryClient } from "@tanstack/react-query";
import { toast } from "sonner";
import { Link, useNavigate } from "react-router-dom";
import { ClipboardCheck, AlertTriangle, ArrowRight, Plus, X, Clock } from "lucide-react";
import api from "@/lib/api";
import { useAuth } from "@/context/AuthContext";
import { useHousehold } from "@/context/HouseholdContext";
import { Card, Badge, Button } from "@/components/ui-kit";

export default function TodayPanel() {
  const { user } = useAuth();
  const { setActive } = useHousehold();
  const navigate = useNavigate();
  const qc = useQueryClient();
  const enabled = user.tier === "advisor";
  const todayQ = useQuery({ queryKey: ["advisor-today"], queryFn: async () => (await api.get("/advisor/today")).data, enabled });
  const clientsQ = useQuery({ queryKey: ["clients"], queryFn: async () => (await api.get("/advisor/clients")).data, enabled });
  const [qaClient, setQaClient] = useState("");
  const [qaTitle, setQaTitle] = useState("");

  const invalidate = () => qc.invalidateQueries({ queryKey: ["advisor-today"] });
  const reviewMut = useMutation({ mutationFn: ({ cid, duration }) => api.post(`/advisor/households/${cid}/review`, { duration }), onSuccess: (res, vars) => { invalidate(); toast.success("Snoozed from the panel", { duration: 8000, action: { label: "Undo", onClick: () => unreviewMut.mutate(vars.cid) } }); }, onError: () => toast.error("Could not snooze household") });
  const unreviewMut = useMutation({ mutationFn: (cid) => api.delete(`/advisor/households/${cid}/review`), onSuccess: () => { invalidate(); toast.success("Brought back to the panel"); }, onError: () => toast.error("Could not un-snooze") });
  const noteMut = useMutation({ mutationFn: ({ cid, note }) => api.post(`/advisor/households/${cid}/review`, { note }), onSuccess: () => { invalidate(); toast.success("Note saved"); }, onError: () => toast.error("Could not save note") });
  const ackReturnMut = useMutation({ mutationFn: (cid) => api.post(`/advisor/households/${cid}/ack-return`), onSuccess: () => invalidate(), onError: () => toast.error("Could not dismiss") });
  const bulkSnoozeMut = useMutation({ mutationFn: () => api.post("/advisor/snooze-bulk", { duration: "week", statuses: ["Needs Review", "Needs Setup"] }), onSuccess: (res) => { invalidate(); const ids = res.data.applied || []; if (!ids.length) { toast.info("No lower-priority households to snooze"); return; } toast.success(`Snoozed ${res.data.count} household${res.data.count === 1 ? "" : "s"}`, { duration: 8000, action: { label: "Undo", onClick: () => Promise.all(ids.map((id) => api.delete(`/advisor/households/${id}/review`))).then(invalidate) } }); }, onError: () => toast.error("Could not snooze households") });
  const addTaskMut = useMutation({ mutationFn: (b) => api.post("/advisor/tasks", b), onSuccess: () => { invalidate(); qc.invalidateQueries({ queryKey: ["tasks"] }); setQaTitle(""); toast.success("Task added"); }, onError: () => toast.error("Could not add task") });

  if (!enabled || !todayQ.data) return null;
  const t = todayQ.data;
  const openCid = (cid, name) => { setActive(cid, name || cid); navigate("/profile"); };
  const total = t.overdue.length + t.due_today.length;

  return (
    <div className="grid grid-cols-1 lg:grid-cols-2 gap-6 mt-6" data-testid="advisor-today-panel">
      <Card className="p-6">
        <div className="flex items-center justify-between mb-4">
          <h3 className="font-heading font-bold text-compass-navy flex items-center gap-2"><ClipboardCheck size={18} className="text-compass-blue" /> Today's tasks</h3>
          <Badge color={t.overdue.length ? "#EE5D50" : "#0052FF"} bg={t.overdue.length ? "rgba(238,93,80,0.12)" : "rgba(0,82,255,0.08)"}>{total}</Badge>
        </div>
        {total === 0 ? (
          <div className="text-sm text-compass-muted py-6 text-center">Nothing due today — you're all caught up.</div>
        ) : (
          <div className="space-y-2">
            {[...t.overdue.map((x) => ({ ...x, od: true })), ...t.due_today.map((x) => ({ ...x, od: false }))].slice(0, 8).map((x) => (
              <button key={x.id} onClick={() => openCid(x.client_id, x.primary)} data-testid={`today-task-${x.id}`}
                className="w-full flex items-center gap-3 rounded-xl bg-compass-bg hover:bg-compass-blue/5 border border-transparent hover:border-compass-blue/20 px-4 py-2.5 text-left transition-colors">
                <span className={`h-2 w-2 rounded-full shrink-0 ${x.od ? "bg-compass-red" : "bg-compass-blue"}`} />
                <div className="min-w-0 flex-1">
                  <div className="text-sm font-semibold text-compass-navy truncate">{x.title}</div>
                  <div className="text-xs text-compass-muted truncate">{x.primary}</div>
                </div>
                <span className={`text-xs font-semibold shrink-0 ${x.od ? "text-compass-red" : "text-compass-muted"}`}>{x.od ? `Overdue · ${x.due_date}` : "Due today"}</span>
              </button>
            ))}
          </div>
        )}
        <div className="flex items-center gap-2 mt-3 pt-3 border-t border-compass-border">
          <select value={qaClient} onChange={(e) => setQaClient(e.target.value)} data-testid="quick-add-client" className="rounded-lg border border-compass-border bg-white px-2 py-1.5 text-xs text-compass-navy max-w-[40%] min-w-0 focus:border-compass-blue focus:outline-none">
            <option value="">Household…</option>
            {(clientsQ.data || []).map((c) => <option key={c.client_id} value={c.client_id}>{c.primary || c.client_id}</option>)}
          </select>
          <input value={qaTitle} onChange={(e) => setQaTitle(e.target.value)} onKeyDown={(e) => { if (e.key === "Enter" && qaClient && qaTitle.trim()) addTaskMut.mutate({ client_id: qaClient, title: qaTitle.trim() }); }} placeholder="Quick-add a task…" data-testid="quick-add-title" className="flex-1 min-w-0 rounded-lg border border-compass-border bg-white px-2.5 py-1.5 text-xs text-compass-navy placeholder:text-compass-muted focus:border-compass-blue focus:outline-none" />
          <Button size="sm" onClick={() => qaClient && qaTitle.trim() && addTaskMut.mutate({ client_id: qaClient, title: qaTitle.trim() })} disabled={!qaClient || !qaTitle.trim() || addTaskMut.isPending} data-testid="quick-add-submit"><Plus size={13} /> Add</Button>
        </div>
        <Link to="/tasks" className="inline-flex items-center gap-1 text-sm font-semibold text-compass-blue mt-3" data-testid="today-open-tasks">Open Task Board <ArrowRight size={14} /></Link>
      </Card>

      <Card className="p-6">
        <div className="flex items-center justify-between mb-1">
          <h3 className="font-heading font-bold text-compass-navy flex items-center gap-2"><AlertTriangle size={18} className="text-compass-amber" /> Households needing attention</h3>
          <Badge color="#FFB800" bg="rgba(255,184,0,0.14)">{t.attention.length}</Badge>
        </div>
        <div className="flex items-center justify-between mb-4">
          <span className="text-xs text-compass-muted" data-testid="reviewed-this-week">Reviewed this week: <span className="font-semibold text-compass-navy">{t.reviewed_this_week ?? 0}</span></span>
          {t.attention.some((c) => c.status === "Needs Review" || c.status === "Needs Setup") && (
            <button onClick={() => bulkSnoozeMut.mutate()} disabled={bulkSnoozeMut.isPending} className="text-xs font-semibold text-compass-blue hover:underline" data-testid="bulk-snooze-button">Snooze lower-priority</button>
          )}
        </div>
        {t.attention.length === 0 ? (
          <div className="text-sm text-compass-muted py-6 text-center">Every household is on track. 🎯</div>
        ) : (
          <div className="space-y-2">
            {t.attention.map((c) => (
              <div key={c.client_id} data-testid={`today-attention-${c.client_id}`}
                className={`w-full flex items-center gap-3 rounded-xl border px-4 py-2.5 transition-colors ${c.returned_from_snooze ? "bg-compass-amber/5 border-compass-amber/30" : "bg-compass-bg border-transparent hover:bg-compass-blue/5 hover:border-compass-blue/20"}`}>
                <button onClick={() => openCid(c.client_id, c.primary)} className="flex items-center gap-3 min-w-0 flex-1 text-left" data-testid={`today-attention-open-${c.client_id}`}>
                  <span className="h-7 w-7 rounded-lg flex items-center justify-center text-white text-xs font-bold shrink-0" style={{ background: (c.score == null ? "#60708f" : c.score >= 75 ? "#00DF89" : c.score >= 50 ? "#FFB800" : "#EE5D50") }}>{c.score ?? "—"}</span>
                  <span className="min-w-0 flex-1">
                    <span className="flex items-center gap-1.5 flex-wrap">
                      <span className="text-sm font-semibold text-compass-navy truncate">{c.primary} <span className="text-compass-muted font-normal">· {c.status}</span></span>
                      {c.returned_from_snooze && (
                        <span className="inline-flex items-center gap-1 rounded-full bg-compass-amber/15 px-1.5 py-0.5 text-[10px] font-bold text-compass-amber" data-testid={`snooze-ended-${c.client_id}`}><Clock size={10} /> Snooze ended</span>
                      )}
                    </span>
                    <span className="block text-xs text-compass-blue font-semibold truncate">Next: {c.next_action}</span>
                  </span>
                </button>
                {c.returned_from_snooze && (
                  <button onClick={(e) => { e.stopPropagation(); ackReturnMut.mutate(c.client_id); }} title="Dismiss the snooze-ended cue" className="shrink-0 text-compass-muted hover:text-compass-navy" data-testid={`snooze-ended-dismiss-${c.client_id}`}><X size={13} /></button>
                )}
                <select defaultValue="" onChange={(e) => { if (e.target.value) { reviewMut.mutate({ cid: c.client_id, duration: e.target.value }); e.target.value = ""; } }} title="Snooze this household from the panel" className="shrink-0 rounded-lg border border-compass-border bg-white px-2 py-1 text-xs font-semibold text-compass-green focus:border-compass-blue focus:outline-none" data-testid={`today-review-${c.client_id}`}>
                  <option value="">Reviewed…</option>
                  <option value="week">Hide for a week</option>
                  <option value="month">Hide for a month</option>
                  <option value="quarter">Hide for a quarter</option>
                </select>
              </div>
            ))}
          </div>
        )}
        {(t.snoozed || []).length > 0 && (
          <div className="mt-3 pt-3 border-t border-compass-border" data-testid="today-snoozed">
            <div className="muted-label mb-1.5">Snoozed</div>
            <div className="space-y-1.5">
              {t.snoozed.map((sn) => (
                <div key={sn.client_id} className="flex items-center gap-2" data-testid={`snoozed-${sn.client_id}`}>
                  <span className="text-xs font-semibold text-compass-navy truncate shrink-0 max-w-[32%]">{sn.primary}</span>
                  <input defaultValue={sn.note || ""} placeholder="Add a note…" onBlur={(e) => { if (e.target.value !== (sn.note || "")) noteMut.mutate({ cid: sn.client_id, note: e.target.value }); }} onKeyDown={(e) => { if (e.key === "Enter") e.target.blur(); }} data-testid={`snooze-note-${sn.client_id}`} className="flex-1 min-w-0 rounded-lg border border-compass-border bg-white px-2 py-1 text-xs text-compass-navy placeholder:text-compass-muted focus:border-compass-blue focus:outline-none" />
                  <button onClick={() => unreviewMut.mutate(sn.client_id)} className="shrink-0 text-compass-muted hover:text-compass-navy" title="Bring back to the panel" data-testid={`unsnooze-${sn.client_id}`}><X size={13} /></button>
                </div>
              ))}
            </div>
          </div>
        )}
      </Card>
    </div>
  );
}
