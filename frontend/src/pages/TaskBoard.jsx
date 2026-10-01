import React from "react";
import { useQuery, useMutation, useQueryClient } from "@tanstack/react-query";
import { CheckCircle2, Trash2, ClipboardList, Bell, CalendarIcon, Send } from "lucide-react";
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
    <Popover open={open} onOpenChange={setOpen}>
      <PopoverTrigger asChild>
        <button className="inline-flex items-center gap-1.5 text-xs border border-compass-border rounded px-2.5 py-1.5 text-compass-navy hover:border-compass-blue transition-colors" data-testid={testid}>
          <CalendarIcon size={13} className="text-compass-muted" />
          {selected ? format(selected, "dd MMM yyyy") : "Set due date"}
        </button>
      </PopoverTrigger>
      <PopoverContent className="w-auto p-0" align="end">
        <Calendar mode="single" selected={selected} onSelect={(d) => { if (d) { onChange(toISO(d)); setOpen(false); } }} initialFocus />
        {value && <div className="border-t p-2"><button onClick={() => { onChange(""); setOpen(false); }} className="w-full text-xs text-compass-red font-semibold py-1" data-testid={`${testid}-clear`}>Clear date</button></div>}
      </PopoverContent>
    </Popover>
  );
}

function DigestSettings() {
  const qc = useQueryClient();
  const q = useQuery({ queryKey: ["digest-settings"], queryFn: async () => (await api.get("/advisor/digest-settings")).data });
  const s = q.data || { enabled: true, hour: 8 };
  const save = useMutation({
    mutationFn: (next) => api.put("/advisor/digest-settings", next),
    onSuccess: () => { qc.invalidateQueries({ queryKey: ["digest-settings"] }); toast.success("Digest settings saved"); },
    onError: () => toast.error("Could not save digest settings"),
  });
  const preview = useMutation({
    mutationFn: () => api.post("/advisor/digest-preview"),
    onSuccess: (res) => res.data.sent ? toast.success(`Test digest sent to ${res.data.to}`) : toast.info("Preview built, but email delivery is unavailable in this environment"),
    onError: () => toast.error("Could not send test digest"),
  });
  const fmtHour = (h) => { const am = h < 12; const base = h % 12 === 0 ? 12 : h % 12; return `${base}:00 ${am ? "AM" : "PM"}`; };
  if (q.isLoading) return <Card className="p-5 mb-6 h-24 animate-pulse" data-testid="digest-settings-card" />;
  return (
    <Card className="p-5 mb-6" data-testid="digest-settings-card">
      <div className="flex items-start gap-3">
        <div className="h-10 w-10 rounded-xl bg-compass-blue/10 flex items-center justify-center shrink-0"><Bell size={18} className="text-compass-blue" /></div>
        <div className="flex-1">
          <div className="font-heading font-bold text-compass-navy">Morning task digest</div>
          <p className="text-sm text-compass-muted mt-0.5 mb-3">Get a daily email of tasks due today or overdue. We only email you on days you actually have tasks.</p>
          <div className="flex flex-wrap items-center gap-5">
            <label className="flex items-center gap-2 text-sm font-semibold text-compass-navy">
              <Toggle checked={s.enabled} onChange={(v) => save.mutate({ enabled: v, hour: s.hour })} testid="digest-enabled-toggle" />
              {s.enabled ? "On" : "Off"}
            </label>
            <div className="flex items-center gap-2">
              <span className="text-sm text-compass-muted">Send at</span>
              <div className="w-32">
                <Select value={String(s.hour)} disabled={!s.enabled} onChange={(e) => save.mutate({ enabled: s.enabled, hour: Number(e.target.value) })} data-testid="digest-hour-select">
                  {Array.from({ length: 24 }, (_, h) => <option key={h} value={h}>{fmtHour(h)}</option>)}
                </Select>
              </div>
              <span className="text-xs text-compass-muted">ET</span>
            </div>
            <Button size="sm" variant="outline" onClick={() => preview.mutate()} disabled={preview.isPending} data-testid="digest-preview-button"><Send size={13} /> {preview.isPending ? "Sending…" : "Send test email"}</Button>
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
