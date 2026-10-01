import React from "react";
import { useQuery, useMutation, useQueryClient } from "@tanstack/react-query";
import { CheckCircle2, Trash2, ClipboardList, Bell, CalendarIcon, Send, X } from "lucide-react";
import { format } from "date-fns";
import { toast } from "sonner";
import api, { formatApiError } from "@/lib/api";
import { Card, Button, Empty, Badge, Toggle, Select } from "@/components/ui-kit";
import { Popover, PopoverTrigger, PopoverContent } from "@/components/ui/popover";
import { Calendar } from "@/components/ui/calendar";
import { PageHeader } from "@/components/PageHeader";

const toISO = (d) => `${d.getFullYear()}-${String(d.getMonth() + 1).padStart(2, "0")}-${String(d.getDate()).padStart(2, "0")}`;
const fromISO = (s) => { if (!s) return undefined; const [y, m, d] = s.split("-").map(Number); return new Date(y, m - 1, d); };

function DueDatePicker({ value, onChange, testid }) {
  const [open, setOpen] = React.useState(false);
  const selected = fromISO(value);
  return (
    <div className="inline-flex items-center border border-compass-border rounded overflow-hidden">
      <Popover open={open} onOpenChange={setOpen}>
        <PopoverTrigger asChild>
          <button className="inline-flex items-center gap-1.5 text-xs px-2.5 py-1.5 text-compass-navy hover:bg-compass-bg/60 transition-colors" data-testid={testid}>
            <CalendarIcon size={13} className="text-compass-muted" />
            {selected ? format(selected, "dd MMM yyyy") : "Set due date"}
          </button>
        </PopoverTrigger>
        <PopoverContent className="w-auto p-0" align="end">
          <Calendar mode="single" selected={selected} onSelect={(d) => { if (d) { onChange(toISO(d)); setOpen(false); } }} initialFocus />
        </PopoverContent>
      </Popover>
      {value && <button onClick={() => onChange("")} title="Clear due date" className="px-1.5 py-1.5 text-compass-muted hover:text-compass-red border-l border-compass-border transition-colors" data-testid={`${testid}-clear`}><X size={13} /></button>}
    </div>
  );
}

function DigestSettings() {
  const qc = useQueryClient();
  const q = useQuery({ queryKey: ["digest-settings"], queryFn: async () => (await api.get("/advisor/digest-settings")).data });
  const historyQ = useQuery({ queryKey: ["digest-history"], queryFn: async () => (await api.get("/advisor/digest-history")).data });
  const s = q.data || { enabled: true, weekly_enabled: true, summary_enabled: false, daily_hour: 8, weekly_hour: 8, summary_hour: 17 };
  const save = useMutation({
    mutationFn: (next) => api.put("/advisor/digest-settings", next),
    onSuccess: () => { qc.invalidateQueries({ queryKey: ["digest-settings"] }); toast.success("Digest settings saved"); },
    onError: () => toast.error("Could not save digest settings"),
  });
  const patch = (delta) => save.mutate({ enabled: s.enabled, weekly_enabled: s.weekly_enabled, summary_enabled: s.summary_enabled, daily_hour: s.daily_hour, weekly_hour: s.weekly_hour, summary_hour: s.summary_hour, ...delta });
  const preview = useMutation({
    mutationFn: () => api.post("/advisor/digest-preview"),
    onSuccess: (res) => { qc.invalidateQueries({ queryKey: ["digest-history"] }); res.data.sent ? toast.success(`Test digest sent to ${res.data.to}`) : toast.info("Preview built, but email delivery is unavailable in this environment"); },
    onError: () => toast.error("Could not send test digest"),
  });
  const weeklyPreview = useMutation({
    mutationFn: () => api.post("/advisor/book-digest/preview"),
    onSuccess: (res) => { qc.invalidateQueries({ queryKey: ["digest-history"] }); res.data.sent ? toast.success(`Weekly summary sent to ${res.data.to}`) : toast.info("Preview built, but email delivery is unavailable in this environment"); },
    onError: () => toast.error("Could not send weekly summary"),
  });
  const summaryPreview = useMutation({
    mutationFn: () => api.post("/advisor/today-summary/preview"),
    onSuccess: (res) => { qc.invalidateQueries({ queryKey: ["digest-history"] }); res.data.sent ? toast.success(`End-of-day recap sent to ${res.data.to}`) : toast.info("Preview built, but email delivery is unavailable in this environment"); },
    onError: () => toast.error("Could not send recap"),
  });
  const retryFor = (kind) => (kind === "weekly" ? weeklyPreview : kind === "summary" ? summaryPreview : preview);
  const fmtHour = (h) => { const am = h < 12; const base = h % 12 === 0 ? 12 : h % 12; return `${base}:00 ${am ? "AM" : "PM"}`; };
  const HourSelect = ({ value, onChange, disabled, testid }) => (
    <div className="w-28"><Select value={String(value)} disabled={disabled} onChange={(e) => onChange(Number(e.target.value))} data-testid={testid}>
      {Array.from({ length: 24 }, (_, h) => <option key={h} value={h}>{fmtHour(h)}</option>)}
    </Select></div>
  );
  const history = historyQ.data || [];
  const fmtTs = (ts) => new Date(ts).toLocaleString("en-CA", { month: "short", day: "numeric", hour: "numeric", minute: "2-digit" });
  if (q.isLoading) return <Card className="p-5 mb-6 h-24 animate-pulse" data-testid="digest-settings-card" />;
  return (
    <Card className="p-5 mb-6" data-testid="digest-settings-card">
      <div className="flex items-start gap-3">
        <div className="h-10 w-10 rounded-xl bg-compass-blue/10 flex items-center justify-center shrink-0"><Bell size={18} className="text-compass-blue" /></div>
        <div className="flex-1 min-w-0">
          <div className="font-heading font-bold text-compass-navy">Email digests</div>
          <p className="text-sm text-compass-muted mt-0.5 mb-3">We only email you when there's something to see, and never ask for passwords or card details.</p>
          <div className="space-y-3">
            <div className="flex flex-wrap items-center gap-3 justify-between rounded-lg bg-compass-bg/50 px-3 py-2.5">
              <div>
                <div className="text-sm font-semibold text-compass-navy">Daily task digest</div>
                <div className="text-xs text-compass-muted">Tasks due today or overdue.</div>
              </div>
              <div className="flex items-center gap-3">
                <span className="text-xs text-compass-muted">at</span>
                <HourSelect value={s.daily_hour} disabled={!s.enabled} onChange={(v) => patch({ daily_hour: v })} testid="digest-daily-hour-select" />
                <Toggle checked={s.enabled} onChange={(v) => patch({ enabled: v })} testid="digest-enabled-toggle" />
                <Button size="sm" variant="outline" onClick={() => preview.mutate()} disabled={preview.isPending} data-testid="digest-preview-button"><Send size={13} /> {preview.isPending ? "Sending…" : "Send test"}</Button>
              </div>
            </div>
            <div className="flex flex-wrap items-center gap-3 justify-between rounded-lg bg-compass-bg/50 px-3 py-2.5">
              <div>
                <div className="text-sm font-semibold text-compass-navy">Weekly book-health summary</div>
                <div className="text-xs text-compass-muted">Mondays — avg score & households needing attention.</div>
              </div>
              <div className="flex items-center gap-3">
                <span className="text-xs text-compass-muted">at</span>
                <HourSelect value={s.weekly_hour} disabled={!s.weekly_enabled} onChange={(v) => patch({ weekly_hour: v })} testid="digest-weekly-hour-select" />
                <Toggle checked={s.weekly_enabled} onChange={(v) => patch({ weekly_enabled: v })} testid="digest-weekly-toggle" />
                <Button size="sm" variant="outline" onClick={() => weeklyPreview.mutate()} disabled={weeklyPreview.isPending} data-testid="weekly-preview-button"><Send size={13} /> {weeklyPreview.isPending ? "Sending…" : "Send weekly summary test"}</Button>
              </div>
            </div>
            <div className="flex flex-wrap items-center gap-3 justify-between rounded-lg bg-compass-bg/50 px-3 py-2.5">
              <div>
                <div className="text-sm font-semibold text-compass-navy">End-of-day recap</div>
                <div className="text-xs text-compass-muted">What you completed today & what rolled over.</div>
              </div>
              <div className="flex items-center gap-3">
                <span className="text-xs text-compass-muted">at</span>
                <HourSelect value={s.summary_hour} disabled={!s.summary_enabled} onChange={(v) => patch({ summary_hour: v })} testid="digest-summary-hour-select" />
                <Toggle checked={s.summary_enabled} onChange={(v) => patch({ summary_enabled: v })} testid="digest-summary-toggle" />
                <Button size="sm" variant="outline" onClick={() => summaryPreview.mutate()} disabled={summaryPreview.isPending} data-testid="summary-preview-button"><Send size={13} /> {summaryPreview.isPending ? "Sending…" : "Send recap test"}</Button>
              </div>
            </div>
            <div className="text-[11px] text-compass-muted pl-1">Times are America/Toronto (ET).</div>
            {history.length > 0 && (
              <div className="pt-2 border-t border-compass-border" data-testid="digest-history">
                <div className="muted-label mb-1.5">Recent sends</div>
                <div className="space-y-1">
                  {history.slice(0, 5).map((h) => (
                    <div key={h.id} className="flex items-center gap-2 text-xs">
                      <span className={`h-1.5 w-1.5 rounded-full shrink-0 ${h.sent ? "bg-compass-green" : "bg-compass-red"}`} />
                      <span className="font-semibold text-compass-navy capitalize">{h.kind}</span>
                      <span className="text-compass-muted">{h.channel === "preview" ? "test" : "scheduled"}</span>
                      <span className="text-compass-muted">· {h.sent ? "sent" : "not delivered"}</span>
                      <span className="text-compass-muted ml-auto">{fmtTs(h.timestamp)}</span>
                      {!h.sent && <button onClick={() => retryFor(h.kind).mutate()} disabled={preview.isPending || weeklyPreview.isPending || summaryPreview.isPending} className="shrink-0 font-semibold text-compass-blue hover:underline" data-testid={`digest-retry-${h.id}`}>Resend</button>}
                    </div>
                  ))}
                </div>
              </div>
            )}
          </div>
        </div>
      </div>
    </Card>
  );
}

export default function TaskBoard() {
  const qc = useQueryClient();
  const tasksQ = useQuery({ queryKey: ["tasks"], queryFn: async () => (await api.get("/advisor/tasks")).data });
  const clientsQ = useQuery({ queryKey: ["clients"], queryFn: async () => (await api.get("/advisor/clients")).data });
  const tasks = tasksQ.data || [];
  const clients = clientsQ.data || [];
  const nameFor = (cid) => clients.find((c) => c.client_id === cid)?.primary || cid;

  const complete = useMutation({ mutationFn: (id) => api.patch(`/advisor/tasks/${id}`, { done: true }), onSuccess: () => { qc.invalidateQueries({ queryKey: ["tasks"] }); toast.success("Task completed"); }, onError: () => toast.error("Could not update task") });
  const setDue = useMutation({ mutationFn: ({ id, due_date }) => api.patch(`/advisor/tasks/${id}`, { due_date }), onSuccess: () => qc.invalidateQueries({ queryKey: ["tasks"] }), onError: () => toast.error("Could not set due date") });
  const clear = useMutation({ mutationFn: (id) => api.delete(`/advisor/tasks/${id}`), onSuccess: () => { qc.invalidateQueries({ queryKey: ["tasks"] }); toast.success("Task cleared"); }, onError: (e) => toast.error(formatApiError(e.response?.data?.detail)) });

  const open = tasks.filter((t) => !t.done);
  const done = tasks.filter((t) => t.done);
  const isOverdue = (t) => t.due_date && !t.done && new Date(t.due_date) < new Date(new Date().toDateString());

  const Row = ({ t }) => (
    <Card className={`p-4 flex items-center gap-3 flex-wrap ${isOverdue(t) ? "ring-1 ring-compass-red/40" : ""}`} data-testid={`task-${t.id}`}>
      <div className="flex-1 min-w-0">
        <div className={`font-semibold text-compass-navy ${t.done ? "line-through opacity-60" : ""}`}>{t.title}</div>
        <div className="text-xs text-compass-muted mt-0.5">{nameFor(t.scope?.client_id)} · {new Date(t.created_at).toLocaleDateString("en-CA", { month: "short", day: "numeric" })}</div>
      </div>
      {isOverdue(t) && <Badge color="#EE5D50" bg="rgba(238,93,80,0.12)">Overdue</Badge>}
      {!t.done && <DueDatePicker value={t.due_date || ""} onChange={(due_date) => setDue.mutate({ id: t.id, due_date })} testid={`task-due-${t.id}`} />}
      {!t.done && <Button size="sm" variant="outline" onClick={() => complete.mutate(t.id)} data-testid={`task-complete-${t.id}`}><CheckCircle2 size={14} /> Complete</Button>}
      <Button size="sm" variant="ghost" onClick={() => clear.mutate(t.id)} data-testid={`task-clear-${t.id}`}><Trash2 size={14} /></Button>
    </Card>
  );

  return (
    <div data-testid="task-board-page">
      <PageHeader title="Task Board" subtitle="Follow-ups logged from your household queue, in one place." />
      <DigestSettings />
      {tasks.length === 0 ? (
        <Empty icon={ClipboardList} title="No tasks yet">Log a task from any Opportunities row to see it here.</Empty>
      ) : (
        <div className="space-y-6">
          <div>
            <div className="flex items-center gap-2 mb-2"><h2 className="font-heading font-bold text-compass-navy">Open</h2><Badge color="#0052FF" bg="rgba(0,82,255,0.08)">{open.length}</Badge></div>
            <div className="space-y-2.5" data-testid="tasks-open">{open.length ? open.map((t) => <Row key={t.id} t={t} />) : <p className="text-sm text-compass-muted">Nothing open — nice work.</p>}</div>
          </div>
          {done.length > 0 && (
            <div>
              <div className="flex items-center gap-2 mb-2"><h2 className="font-heading font-bold text-compass-navy">Completed</h2><Badge color="#00A36C" bg="rgba(0,163,108,0.1)">{done.length}</Badge></div>
              <div className="space-y-2.5" data-testid="tasks-done">{done.map((t) => <Row key={t.id} t={t} />)}</div>
            </div>
          )}
        </div>
      )}
    </div>
  );
}
