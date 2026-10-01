import React, { useState, useMemo } from "react";
import { useQuery, useMutation, useQueryClient } from "@tanstack/react-query";
import { toast } from "sonner";
import { Plus, Target, Trash2, Pencil, Link2 } from "lucide-react";
import api, { formatApiError } from "@/lib/api";
import { planApi } from "@/lib/planning";
import { Card, Button, Input, Field, Select, Badge, Progress, Modal, Empty } from "@/components/ui-kit";
import { PageHeader } from "@/components/PageHeader";
import { money, STATUS_META } from "@/lib/format";

const CATEGORIES = ["retirement", "income", "legacy", "purchase"];

export default function Goals() {
  const qc = useQueryClient();
  const [modal, setModal] = useState(null); // null | {} (new) | goal (edit)

  const goals = useQuery({ queryKey: ["goals"], queryFn: async () => (await api.get("/goals")).data });
  const owners = useQuery({ queryKey: ["owners"], queryFn: async () => (await api.get("/owners")).data });
  const networth = useQuery({ queryKey: ["plan", "networth"], queryFn: () => planApi.list("networth") });
  const accounts = useQuery({ queryKey: ["accounts"], queryFn: async () => (await api.get("/accounts")).data });

  // Linkable funding sources: net-worth assets + investment accounts.
  const linkItems = useMemo(() => {
    const nw = (networth.data || []).filter((r) => r.kind === "asset").map((r) => ({ id: r.id, label: `${r.name || r.category} (Net Worth)`, value: Number(r.value || 0) }));
    const acc = (accounts.data || []).map((a) => ({ id: a.id, label: `${a.account_type} · ${a.institution} (Account)`, value: Number(a.balance || 0) }));
    return [...nw, ...acc];
  }, [networth.data, accounts.data]);
  const itemsById = useMemo(() => Object.fromEntries(linkItems.map((i) => [i.id, i])), [linkItems]);
  const linkedTotal = (ids) => (ids || []).reduce((s, id) => s + (itemsById[id]?.value || 0), 0);

  const invalidate = () => { qc.invalidateQueries({ queryKey: ["goals"] }); qc.invalidateQueries({ queryKey: ["dashboard"] }); };
  const save = useMutation({
    mutationFn: (b) => (b.id ? api.put(`/goals/${b.id}`, strip(b)) : api.post("/goals", strip(b))),
    onSuccess: () => { toast.success("Saved"); setModal(null); invalidate(); },
    onError: (e) => toast.error(formatApiError(e.response?.data?.detail)),
  });
  const del = useMutation({ mutationFn: (id) => api.delete(`/goals/${id}`), onSuccess: () => { toast.success("Goal deleted"); invalidate(); } });

  return (
    <div>
      <PageHeader title="Financial Goals" subtitle="Track progress toward retirement, income, legacy and major-purchase goals.">
        <Button onClick={() => setModal({})} data-testid="add-goal-button"><Plus size={16} /> New goal</Button>
      </PageHeader>

      {goals.isLoading ? (
        <div className="text-compass-muted">Loading…</div>
      ) : (goals.data || []).length === 0 ? (
        <Empty icon={Target} title="No goals yet">Create your first financial goal to start tracking.</Empty>
      ) : (
        <div className="grid md:grid-cols-2 gap-4">
          {goals.data.map((g) => {
            const linked = g.linked_asset_ids && g.linked_asset_ids.length > 0;
            const current = linked ? linkedTotal(g.linked_asset_ids) : Number(g.current_amount || 0);
            const pct = g.target_amount ? Math.round((current / g.target_amount) * 100) : 0;
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
                    <span className="font-heading text-xl font-extrabold text-compass-navy">{money(current)}</span>
                    <span className="text-sm text-compass-muted">of {money(g.target_amount)}</span>
                  </div>
                  <Progress value={Math.min(100, pct)} color={meta.color} />
                  <div className="flex items-center justify-between text-xs mt-1.5">
                    <span className="text-compass-muted">{pct}% funded</span>
                    {linked && <Badge color="#00DF89" bg="rgba(0,223,137,0.12)" data-testid={`goal-linked-${g.id}`}><Link2 size={11} /> Auto-funded · {g.linked_asset_ids.length} source{g.linked_asset_ids.length > 1 ? "s" : ""}</Badge>}
                  </div>
                </div>
                <div className="flex gap-2 mt-5">
                  <Button size="sm" variant="outline" onClick={() => setModal(g)} data-testid={`edit-goal-${g.id}`}><Pencil size={14} /> Edit</Button>
                  <Button size="sm" variant="ghost" className="text-compass-red" onClick={() => del.mutate(g.id)} data-testid={`delete-goal-${g.id}`}><Trash2 size={14} /></Button>
                </div>
              </Card>
            );
          })}
        </div>
      )}

      <GoalModal open={modal !== null} initial={modal} owners={owners.data || []} linkItems={linkItems}
        onClose={() => setModal(null)} onSubmit={(b) => save.mutate(b)} loading={save.isPending} />
    </div>
  );
}

function strip(body) { const { store, scope, household_id, created_at, status, ...rest } = body; return rest; }

function GoalModal({ open, initial, owners, linkItems, onClose, onSubmit, loading }) {
  const [f, setF] = useState({ title: "", category: "retirement", target_amount: "", current_amount: "", target_year: new Date().getFullYear() + 10, owner_id: "", linked_asset_ids: [] });
  React.useEffect(() => {
    if (open) setF({
      id: initial?.id, title: initial?.title || "", category: initial?.category || "retirement",
      target_amount: initial?.target_amount ?? "", current_amount: initial?.current_amount ?? "",
      target_year: initial?.target_year || new Date().getFullYear() + 10, owner_id: initial?.owner_id || "",
      linked_asset_ids: initial?.linked_asset_ids || [],
    });
  }, [open, initial]); // eslint-disable-line
  const set = (k) => (e) => setF({ ...f, [k]: e.target.value });
  const toggleLink = (id) => setF((s) => ({ ...s, linked_asset_ids: s.linked_asset_ids.includes(id) ? s.linked_asset_ids.filter((x) => x !== id) : [...s.linked_asset_ids, id] }));
  const linked = (f.linked_asset_ids || []).length > 0;
  const computed = (f.linked_asset_ids || []).reduce((s, id) => s + (linkItems.find((i) => i.id === id)?.value || 0), 0);

  const submit = () => onSubmit({
    id: f.id, title: f.title, category: f.category, target_amount: Number(f.target_amount || 0),
    current_amount: linked ? computed : Number(f.current_amount || 0),
    target_year: Number(f.target_year), owner_id: f.owner_id || null, linked_asset_ids: f.linked_asset_ids,
  });

  return (
    <Modal open={open} onClose={onClose} title={f.id ? `Edit · ${f.title}` : "New financial goal"} testid="goal-modal">
      <div className="space-y-4 max-h-[65vh] overflow-y-auto pr-1">
        <Field label="Goal title"><Input value={f.title || ""} onChange={set("title")} placeholder="Retire at 65" data-testid="goal-title-input" /></Field>
        <div className="grid grid-cols-2 gap-3">
          <Field label="Category"><Select value={f.category} onChange={set("category")} data-testid="goal-category">{CATEGORIES.map((c) => <option key={c} value={c} className="capitalize">{c}</option>)}</Select></Field>
          <Field label="Target year"><Input type="number" value={f.target_year} onChange={set("target_year")} /></Field>
        </div>
        <div className="grid grid-cols-2 gap-3">
          <Field label="Target amount"><Input type="number" value={f.target_amount} onChange={set("target_amount")} data-testid="goal-target" /></Field>
          <Field label="Current amount">
            <Input type="number" value={linked ? computed : f.current_amount} onChange={set("current_amount")} disabled={linked} data-testid="goal-current" />
          </Field>
        </div>
        {owners.length > 0 && (
          <Field label="Link to owner (optional)">
            <Select value={f.owner_id} onChange={set("owner_id")}><option value="">— none —</option>{owners.map((o) => <option key={o.id} value={o.id}>{o.full_name}</option>)}</Select>
          </Field>
        )}
        {linkItems.length > 0 && (
          <div>
            <div className="muted-label mb-2 flex items-center gap-1.5"><Link2 size={13} /> Fund from accounts (auto-tracks balances)</div>
            <div className="space-y-1.5 max-h-40 overflow-y-auto rounded-xl border border-compass-border p-2">
              {linkItems.map((i) => (
                <label key={i.id} className="flex items-center justify-between gap-2 px-2 py-1.5 rounded-lg hover:bg-compass-bg cursor-pointer text-sm" data-testid={`link-${i.id}`}>
                  <span className="flex items-center gap-2 text-compass-navy">
                    <input type="checkbox" checked={(f.linked_asset_ids || []).includes(i.id)} onChange={() => toggleLink(i.id)} className="accent-compass-blue" />
                    {i.label}
                  </span>
                  <span className="font-semibold text-compass-navy">{money(i.value)}</span>
                </label>
              ))}
            </div>
            {linked && <div className="text-xs text-compass-green font-semibold mt-1.5">Auto-funded current amount: {money(computed)}</div>}
          </div>
        )}
        <div className="flex gap-2 justify-end pt-2">
          <Button variant="ghost" onClick={onClose}>Cancel</Button>
          <Button onClick={submit} disabled={!f.title || !f.target_amount || loading} data-testid="goal-save">{f.id ? "Save goal" : "Create goal"}</Button>
        </div>
      </div>
    </Modal>
  );
}
