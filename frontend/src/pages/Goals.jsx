import React, { useState } from "react";
import { useQuery, useMutation, useQueryClient } from "@tanstack/react-query";
import { toast } from "sonner";
import { Plus, Target, Trash2, Pencil } from "lucide-react";
import api, { formatApiError } from "@/lib/api";
import { Card, Button, Input, Field, Select, Badge, Progress, Modal, Empty } from "@/components/ui-kit";
import { PageHeader } from "@/components/PageHeader";
import { money, STATUS_META } from "@/lib/format";

const CATEGORIES = ["retirement", "income", "legacy", "purchase"];

export default function Goals() {
  const qc = useQueryClient();
  const [modal, setModal] = useState(false);
  const [progressGoal, setProgressGoal] = useState(null);

  const goals = useQuery({ queryKey: ["goals"], queryFn: async () => (await api.get("/goals")).data });
  const owners = useQuery({ queryKey: ["owners"], queryFn: async () => (await api.get("/owners")).data });

  const invalidate = () => { qc.invalidateQueries({ queryKey: ["goals"] }); qc.invalidateQueries({ queryKey: ["dashboard"] }); };

  const create = useMutation({
    mutationFn: (b) => api.post("/goals", b),
    onSuccess: () => { toast.success("Goal created"); setModal(false); invalidate(); },
    onError: (e) => toast.error(formatApiError(e.response?.data?.detail)),
  });
  const del = useMutation({
    mutationFn: (id) => api.delete(`/goals/${id}`),
    onSuccess: () => { toast.success("Goal deleted"); invalidate(); },
  });
  const progress = useMutation({
    mutationFn: ({ id, current_amount }) => api.patch(`/goals/${id}/progress`, { current_amount }),
    onSuccess: () => { toast.success("Progress updated"); setProgressGoal(null); invalidate(); },
  });

  return (
    <div>
      <PageHeader title="Financial Goals" subtitle="Track progress toward retirement, income, legacy and major-purchase goals.">
        <Button onClick={() => setModal(true)} data-testid="add-goal-button"><Plus size={16} /> New goal</Button>
      </PageHeader>

      {goals.isLoading ? (
        <div className="text-compass-muted">Loading…</div>
      ) : (goals.data || []).length === 0 ? (
        <Empty icon={Target} title="No goals yet">Create your first financial goal to start tracking.</Empty>
      ) : (
        <div className="grid md:grid-cols-2 gap-4">
          {goals.data.map((g) => {
            const pct = g.target_amount ? Math.round((g.current_amount / g.target_amount) * 100) : 0;
            const meta = STATUS_META[g.status] || STATUS_META.on_track;
            return (
              <Card key={g.id} className="p-6" data-testid={`goal-${g.id}`}>
                <div className="flex items-start justify-between gap-3">
                  <div>
                    <h3 className="font-heading font-bold text-compass-navy">{g.title}</h3>
                    <div className="text-xs text-compass-muted mt-0.5 capitalize">{g.category} · target {g.target_year}</div>
                  </div>
                  <Badge color={meta.color} bg={meta.bg}>{meta.label}</Badge>
                </div>

                <div className="mt-5">
                  <div className="flex items-end justify-between mb-2">
                    <span className="font-heading text-xl font-extrabold text-compass-navy">{money(g.current_amount)}</span>
                    <span className="text-sm text-compass-muted">of {money(g.target_amount)}</span>
                  </div>
                  <Progress value={pct} color={meta.color} />
                  <div className="text-xs text-compass-muted mt-1.5">{pct}% funded</div>
                </div>

                <div className="flex gap-2 mt-5">
                  <Button size="sm" variant="outline" onClick={() => setProgressGoal(g)} data-testid={`progress-${g.id}`}>
                    <Pencil size={14} /> Update progress
                  </Button>
                  <Button size="sm" variant="ghost" className="text-compass-red" onClick={() => del.mutate(g.id)} data-testid={`delete-goal-${g.id}`}>
                    <Trash2 size={14} />
                  </Button>
                </div>
              </Card>
            );
          })}
        </div>
      )}

      <GoalModal open={modal} onClose={() => setModal(false)} owners={owners.data || []} onSubmit={(b) => create.mutate(b)} loading={create.isPending} />
      <ProgressModal goal={progressGoal} onClose={() => setProgressGoal(null)} onSubmit={(v) => progress.mutate({ id: progressGoal.id, current_amount: v })} loading={progress.isPending} />
    </div>
  );
}

function GoalModal({ open, onClose, owners, onSubmit, loading }) {
  const [f, setF] = useState({ title: "", category: "retirement", target_amount: "", current_amount: "", target_year: new Date().getFullYear() + 10, owner_id: "" });
  const set = (k) => (e) => setF({ ...f, [k]: e.target.value });
  return (
    <Modal open={open} onClose={onClose} title="New financial goal" testid="goal-modal">
      <div className="space-y-4">
        <Field label="Goal title"><Input value={f.title} onChange={set("title")} placeholder="Retire at 65" data-testid="goal-title-input" /></Field>
        <div className="grid grid-cols-2 gap-3">
          <Field label="Category">
            <Select value={f.category} onChange={set("category")} data-testid="goal-category">
              {CATEGORIES.map((c) => <option key={c} value={c} className="capitalize">{c}</option>)}
            </Select>
          </Field>
          <Field label="Target year"><Input type="number" value={f.target_year} onChange={set("target_year")} /></Field>
        </div>
        <div className="grid grid-cols-2 gap-3">
          <Field label="Target amount"><Input type="number" value={f.target_amount} onChange={set("target_amount")} data-testid="goal-target" /></Field>
          <Field label="Current amount"><Input type="number" value={f.current_amount} onChange={set("current_amount")} /></Field>
        </div>
        {owners.length > 0 && (
          <Field label="Link to owner (optional)">
            <Select value={f.owner_id} onChange={set("owner_id")}>
              <option value="">— none —</option>
              {owners.map((o) => <option key={o.id} value={o.id}>{o.full_name}</option>)}
            </Select>
          </Field>
        )}
        <div className="flex gap-2 justify-end pt-2">
          <Button variant="ghost" onClick={onClose}>Cancel</Button>
          <Button onClick={() => onSubmit({ title: f.title, category: f.category, target_amount: Number(f.target_amount || 0), current_amount: Number(f.current_amount || 0), target_year: Number(f.target_year), owner_id: f.owner_id || null })} disabled={!f.title || !f.target_amount || loading} data-testid="goal-save">
            Create goal
          </Button>
        </div>
      </div>
    </Modal>
  );
}

function ProgressModal({ goal, onClose, onSubmit, loading }) {
  const [v, setV] = useState(0);
  React.useEffect(() => { if (goal) setV(goal.current_amount); }, [goal]);
  return (
    <Modal open={!!goal} onClose={onClose} title={goal ? `Update · ${goal.title}` : ""} testid="progress-modal">
      <div className="space-y-4">
        <Field label="Current amount (CAD)" hint={goal ? `Target ${money(goal.target_amount)}` : ""}>
          <Input type="number" value={v} onChange={(e) => setV(e.target.value)} data-testid="progress-input" />
        </Field>
        <div className="flex gap-2 justify-end">
          <Button variant="ghost" onClick={onClose}>Cancel</Button>
          <Button onClick={() => onSubmit(Number(v || 0))} disabled={loading} data-testid="progress-save">Save</Button>
        </div>
      </div>
    </Modal>
  );
}
