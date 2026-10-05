import React, { useState, useMemo } from "react";
import { useQuery, useMutation, useQueryClient } from "@tanstack/react-query";
import { toast } from "sonner";
import { Plus, Target, Trash2, Pencil, Link2, CalendarCheck, AlertTriangle } from "lucide-react";
import api, { formatApiError } from "@/lib/api";
import { planApi } from "@/lib/planning";
import { Card, Button, Input, Field, Select, Badge, Progress, Modal, Empty, StatBand, Donut } from "@/components/ui-kit";
import { PageHeader } from "@/components/PageHeader";
import { useTr } from "@/lib/i18n";
import { money, STATUS_META } from "@/lib/format";

const CATEGORIES = ["retirement", "income", "legacy", "purchase", "education"];

// Months until `current` reaches `target` given monthly contribution + annual growth.
function projectFunding(current, target, monthly, annualGrowth) {
  if (current >= target) return { label: "Funded", year: new Date().getFullYear() };
  if (monthly <= 0 && annualGrowth <= 0) return null;
  let bal = current, m = 0; const r = annualGrowth / 100 / 12;
  while (bal < target && m < 1200) { m++; bal = bal * (1 + r) + monthly; }
  if (m >= 1200) return { label: "60+ yrs", year: 9999 };
  const d = new Date(); d.setMonth(d.getMonth() + m);
  return { label: d.toLocaleDateString("en-CA", { year: "numeric", month: "short" }), year: d.getFullYear() };
}

// Monthly contribution needed to reach `target` by `targetYear` at `annualGrowth`.
function requiredMonthly(current, target, annualGrowth, targetYear) {
  if (current >= target) return 0;
  const now = new Date();
  const n = Math.max(1, (targetYear - now.getFullYear()) * 12 - now.getMonth());
  const rm = annualGrowth / 100 / 12;
  if (rm <= 0) return (target - current) / n;
  const fvCurrent = current * Math.pow(1 + rm, n);
  const factor = (Math.pow(1 + rm, n) - 1) / rm;
  return Math.max(0, (target - fvCurrent) / factor);
}

// Earliest target year at which the required monthly contribution falls within `cap`.
// Falls back to the furthest horizon so an "extend" option is always offered.
function realisticYear(current, target, annualGrowth, cap, fromYear) {
  const base = new Date().getFullYear();
  const max = base + 50;
  for (let y = Math.max(fromYear, base) + 1; y <= max; y++) {
    if (requiredMonthly(current, target, annualGrowth, y) <= cap) return y;
  }
  return max;
}

export default function Goals() {
  const qc = useQueryClient();
  const [modal, setModal] = useState(null);
  const tr = useTr();

  const goals = useQuery({ queryKey: ["goals"], queryFn: async () => (await api.get("/goals")).data });
  const owners = useQuery({ queryKey: ["owners"], queryFn: async () => (await api.get("/owners")).data });
  const networth = useQuery({ queryKey: ["plan", "networth"], queryFn: () => planApi.list("networth") });
  const accounts = useQuery({ queryKey: ["accounts"], queryFn: async () => (await api.get("/accounts")).data });

  const linkItems = useMemo(() => {
    const nw = (networth.data || []).filter((r) => r.kind === "asset").map((r) => ({ id: r.id, label: `${r.name || r.category} (Net Worth)`, value: Number(r.value || 0) }));
    const acc = (accounts.data || []).map((a) => ({ id: a.id, label: `${a.account_type} · ${a.institution} (Account)`, value: Number(a.balance || 0) }));
    return [...nw, ...acc];
  }, [networth.data, accounts.data]);
  const itemsById = useMemo(() => Object.fromEntries(linkItems.map((i) => [i.id, i])), [linkItems]);
  const linkedTotal = (ids) => (ids || []).reduce((s, id) => s + (itemsById[id]?.value || 0), 0);
  const monthlyIncome = useMemo(() => (owners.data || []).reduce((s, o) => s + Number(o.annual_income || 0), 0) / 12, [owners.data]);

  const invalidate = () => { qc.invalidateQueries({ queryKey: ["goals"] }); qc.invalidateQueries({ queryKey: ["dashboard"] }); };
  const save = useMutation({
    mutationFn: (b) => (b.id ? api.put(`/goals/${b.id}`, strip(b)) : api.post("/goals", strip(b))),
    onSuccess: () => { toast.success("Saved"); setModal(null); invalidate(); },
    onError: (e) => toast.error(formatApiError(e.response?.data?.detail)),
  });
  const del = useMutation({ mutationFn: (id) => api.delete(`/goals/${id}`), onSuccess: () => { toast.success("Goal deleted"); invalidate(); } });

  const goalsList = goals.data || [];
  const currentOf = (g) => (g.linked_asset_ids && g.linked_asset_ids.length ? linkedTotal(g.linked_asset_ids) : Number(g.current_amount || 0));
  const totalTarget = goalsList.reduce((s, g) => s + Number(g.target_amount || 0), 0);
  const totalSaved = goalsList.reduce((s, g) => s + currentOf(g), 0);
  const onTrackCount = goalsList.filter((g) => (g.status || "on_track") === "on_track" || g.status === "achieved").length;
  const needsCount = goalsList.filter((g) => g.status === "at_risk" || g.status === "behind").length;
  const STATUS_PALETTE = { on_track: "#7CFFC4", achieved: "#8FB3FF", at_risk: "#FFD36B", behind: "#FF8A8A" };
  const statusCounts = {};
  goalsList.forEach((g) => { const st = g.status || "on_track"; statusCounts[st] = (statusCounts[st] || 0) + 1; });
  const statusDonut = Object.entries(statusCounts).map(([k, v]) => ({ name: (STATUS_META[k] || STATUS_META.on_track).label, value: v, color: STATUS_PALETTE[k] || "#8FB3FF" }));

  const applyFix = (g, current, req) => save.mutate({
    id: g.id, title: g.title, category: g.category, target_amount: Number(g.target_amount || 0),
    current_amount: Number(current || 0), target_year: Number(g.target_year), owner_id: g.owner_id || null,
    linked_asset_ids: g.linked_asset_ids || [], monthly_contribution: Math.round(req), growth_rate: Number(g.growth_rate || 0),
  });

  const applyExtend = (g, current, year) => {
    const req = requiredMonthly(current, Number(g.target_amount || 0), Number(g.growth_rate || 0), year);
    save.mutate({
      id: g.id, title: g.title, category: g.category, target_amount: Number(g.target_amount || 0),
      current_amount: Number(current || 0), target_year: year, owner_id: g.owner_id || null,
      linked_asset_ids: g.linked_asset_ids || [], monthly_contribution: Math.round(req), growth_rate: Number(g.growth_rate || 0),
    });
  };

  return (
    <div>
      <PageHeader title="Financial Goals" subtitle="Track progress toward retirement, income, legacy and major-purchase goals.">
        <Button onClick={() => setModal({})} data-testid="add-goal-button"><Plus size={16} /> {tr("New goal")}</Button>
      </PageHeader>

      {goalsList.length > 0 && (
        <StatBand testid="goals-statband" items={[
          { label: "Total target", value: money(totalTarget), color: "#8FB3FF" },
          { label: "Total saved", value: money(totalSaved), color: "#7CFFC4" },
          { label: "On track", value: onTrackCount, color: "#7CFFC4" },
          { label: "Needs attention", value: needsCount, color: needsCount > 0 ? "#FFD36B" : "#8FB3FF" },
        ]}>
          {statusDonut.length > 0 && (
            <div className="flex flex-col sm:flex-row items-center gap-6">
              <div className="shrink-0">
                <div className="text-[11px] font-semibold uppercase tracking-wider text-white/55 mb-2 text-center sm:text-left">{tr("Goal health")}</div>
                <Donut data={statusDonut} size={140} thickness={18} />
              </div>
              <div className="flex-1 w-full space-y-2">
                {statusDonut.map((d) => (
                  <div key={d.name} className="flex items-center justify-between text-sm">
                    <span className="flex items-center gap-2 text-white/80"><span className="h-2.5 w-2.5 rounded-full shrink-0" style={{ background: d.color }} />{d.name}</span>
                    <span className="font-semibold text-white">{d.value}</span>
                  </div>
                ))}
              </div>
            </div>
          )}
        </StatBand>
      )}

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
            const proj = projectFunding(current, Number(g.target_amount || 0), Number(g.monthly_contribution || 0), Number(g.growth_rate || 0));
            const onTime = proj && proj.year <= Number(g.target_year || 9999);
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
                  {proj && (
                    <div className={`flex items-center gap-1.5 text-xs mt-2.5 font-semibold ${onTime ? "text-compass-green" : "text-compass-amber"}`} data-testid={`goal-projection-${g.id}`}>
                      <CalendarCheck size={13} /> Projected funding: {proj.label}
                      {proj.year !== 9999 && proj.label !== "Funded" && <span className="text-compass-muted font-normal">({onTime ? "on track" : "after target"})</span>}
                    </div>
                  )}
                  {current < Number(g.target_amount || 0) && (!proj || !onTime) && (() => {
                    const overdue = Number(g.target_year || 0) < new Date().getFullYear();
                    const req = requiredMonthly(current, Number(g.target_amount || 0), Number(g.growth_rate || 0), Number(g.target_year || new Date().getFullYear()));
                    const cap = monthlyIncome > 0 ? 0.2 * monthlyIncome : 3000;
                    const unrealistic = !overdue && req > cap;
                    const extYear = unrealistic ? realisticYear(current, Number(g.target_amount || 0), Number(g.growth_rate || 0), cap, Number(g.target_year || new Date().getFullYear())) : null;
                    return (
                      <div className={`mt-2.5 rounded-lg px-3 py-2 text-xs ${unrealistic ? "bg-compass-red/10" : "bg-compass-amber/10"}`} data-testid={`goal-fix-${g.id}`}>
                        {overdue ? (
                          <span className="text-compass-amber font-semibold">Target year passed — review the goal timeline.</span>
                        ) : (
                          <div className="flex flex-col gap-1.5">
                            <span className="text-compass-navy"><span className="font-semibold">Catch up:</span> contribute <span className="font-bold">{money(req)}/mo</span> to hit {g.target_year}</span>
                            {unrealistic && (
                              <span className="flex items-start gap-1.5 text-compass-red font-semibold" data-testid={`goal-unrealistic-${g.id}`}>
                                <AlertTriangle size={13} className="shrink-0 mt-0.5" />
                                That's over 20% of monthly income{extYear ? ` — extending the timeline to ${extYear} makes it realistic.` : " — consider extending the timeline."}
                              </span>
                            )}
                            <div className="flex items-center gap-4 pt-0.5">
                              <button onClick={() => applyFix(g, current, req)} className="text-compass-blue font-bold hover:underline" data-testid={`apply-fix-${g.id}`}>Apply {money(req)}/mo</button>
                              {unrealistic && extYear && (
                                <button onClick={() => applyExtend(g, current, extYear)} className="text-compass-navy font-bold hover:underline" data-testid={`extend-timeline-${g.id}`}>Extend to {extYear}</button>
                              )}
                            </div>
                          </div>
                        )}
                      </div>
                    );
                  })()}
                </div>
                <div className="flex gap-2 mt-5">
                  <Button size="sm" variant="outline" onClick={() => setModal(g)} data-testid={`edit-goal-${g.id}`}><Pencil size={14} /> {tr("Edit")}</Button>
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
  const tr = useTr();
  const [f, setF] = useState({ title: "", category: "retirement", target_amount: "", current_amount: "", target_year: new Date().getFullYear() + 10, owner_id: "", linked_asset_ids: [], monthly_contribution: "", growth_rate: "" });
  React.useEffect(() => {
    if (open) setF({
      id: initial?.id, title: initial?.title || "", category: initial?.category || "retirement",
      target_amount: initial?.target_amount ?? "", current_amount: initial?.current_amount ?? "",
      target_year: initial?.target_year || new Date().getFullYear() + 10, owner_id: initial?.owner_id || "",
      linked_asset_ids: initial?.linked_asset_ids || [],
      monthly_contribution: initial?.monthly_contribution ?? "", growth_rate: initial?.growth_rate ?? "",
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
    monthly_contribution: Number(f.monthly_contribution || 0), growth_rate: Number(f.growth_rate || 0),
  });

  return (
    <Modal open={open} onClose={onClose} title={f.id ? `Edit · ${f.title}` : "New financial goal"} testid="goal-modal">
      <div className="space-y-4 max-h-[65vh] overflow-y-auto pr-1">
        <Field label={tr("Goal title")}><Input value={f.title || ""} onChange={set("title")} placeholder="Retire at 65" data-testid="goal-title-input" /></Field>
        <div className="grid grid-cols-2 gap-3">
          <Field label={tr("Category")}><Select value={f.category} onChange={set("category")} data-testid="goal-category">{CATEGORIES.map((c) => <option key={c} value={c} className="capitalize">{c}</option>)}</Select></Field>
          <Field label={tr("Target year")}><Input type="number" value={f.target_year} onChange={set("target_year")} /></Field>
        </div>
        <div className="grid grid-cols-2 gap-3">
          <Field label={tr("Target amount")}><Input type="number" value={f.target_amount} onChange={set("target_amount")} data-testid="goal-target" /></Field>
          <Field label={tr("Current amount")}>
            <Input type="number" value={linked ? computed : f.current_amount} onChange={set("current_amount")} disabled={linked} data-testid="goal-current" />
          </Field>
        </div>
        <div className="grid grid-cols-2 gap-3">
          <Field label={tr("Monthly contribution")}><Input type="number" value={f.monthly_contribution} onChange={set("monthly_contribution")} data-testid="goal-contribution" /></Field>
          <Field label={tr("Expected growth (%/yr)")}><Input type="number" step="0.1" value={f.growth_rate} onChange={set("growth_rate")} data-testid="goal-growth" /></Field>
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
          <Button variant="ghost" onClick={onClose}>{tr("Cancel")}</Button>
          <Button onClick={submit} disabled={!f.title || !f.target_amount || loading} data-testid="goal-save">{f.id ? tr("Save goal") : tr("Create goal")}</Button>
        </div>
      </div>
    </Modal>
  );
}
