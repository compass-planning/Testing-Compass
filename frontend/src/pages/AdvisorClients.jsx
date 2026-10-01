import React, { useState } from "react";
import { useNavigate } from "react-router-dom";
import { useQuery, useQueryClient, useMutation } from "@tanstack/react-query";
import { Users, ArrowLeft, Landmark, Target, AlertTriangle, ArrowRight, Download, Plus, Zap, ArrowUpDown, UserPlus, Copy, Bookmark, X } from "lucide-react";
import { jsPDF } from "jspdf";
import { toast } from "sonner";
import api, { formatApiError } from "@/lib/api";
import { useHousehold } from "@/context/HouseholdContext";
import { Card, Button, Badge, Progress, Empty, Modal, Input, Field, Select, Toggle } from "@/components/ui-kit";
import { PageHeader } from "@/components/PageHeader";
import { money, STATUS_META } from "@/lib/format";

const PROVINCES = ["ON", "BC", "AB", "QC", "MB", "SK", "NS", "NB", "NL", "PE"];

const SCORE_META = {
  "On Track": { color: "#00DF89", bg: "rgba(0,223,137,0.12)" },
  "Needs Review": { color: "#FFB800", bg: "rgba(255,184,0,0.14)" },
  "At Risk": { color: "#EE5D50", bg: "rgba(238,93,80,0.12)" },
  "Needs Setup": { color: "#60708f", bg: "rgba(96,112,143,0.14)" },
};
const scoreColor = (s) => (s >= 75 ? "#00DF89" : s >= 50 ? "#FFB800" : "#EE5D50");

export default function AdvisorClients() {
  const [selected, setSelected] = useState(null);
  const [view, setView] = useState("queue");
  const [sort, setSort] = useState("score-asc");
  const [typeFilter, setTypeFilter] = useState("all");
  const [statusFilter, setStatusFilter] = useState("all");
  const [newOpen, setNewOpen] = useState(false);
  const { setActive, clear } = useHousehold();
  const navigate = useNavigate();
  const qc = useQueryClient();
  const clients = useQuery({ queryKey: ["clients"], queryFn: async () => (await api.get("/advisor/clients")).data });
  const branding = useQuery({ queryKey: ["branding"], queryFn: async () => (await api.get("/advisor/branding")).data });

  const openClient = (c) => {
    setActive(c.client_id, c.primary || c.client_id);
    navigate("/profile");
  };

  const createHousehold = async (form) => {
    clear(); // ensure the owner POST creates a NEW client_id (no active household appended)
    const { data } = await api.post("/owners", { full_name: form.full_name, relationship: "self", province: form.province, annual_income: Number(form.income || 0) });
    const cid = data?.scope?.client_id;
    if (form.spouse_name && form.spouse_name.trim()) {
      await api.post("/owners", { full_name: form.spouse_name.trim(), relationship: "spouse", province: form.province, annual_income: Number(form.spouse_income || 0) }, { params: { household_id: cid } });
    }
    if (form.seed_goal) {
      await api.post("/goals", { title: "Retirement", category: "retirement", target_amount: 1000000, current_amount: 0, target_year: new Date().getFullYear() + 30, owner_id: null, linked_asset_ids: [], monthly_contribution: 0, growth_rate: 5 }, { params: { household_id: cid } });
    }
    qc.invalidateQueries({ queryKey: ["clients"] });
    setActive(cid, form.full_name);
    toast.success(`Created ${form.full_name}'s household`);
    navigate("/profile");
  };

  const resendInvite = async (cid) => {
    try {
      const { data } = await api.post("/advisor/clients/invite/resend", { client_id: cid, base_url: window.location.origin });
      if (data.emailed) { toast.success(`Invitation re-sent to ${data.email}`); }
      else { try { await navigator.clipboard.writeText(data.activation_link); toast.success("Activation link regenerated & copied"); } catch { toast.message("Activation link regenerated", { description: data.activation_link }); } }
    } catch (e) { toast.error(formatApiError(e.response?.data?.detail)); }
  };

  if (selected) return <ClientDetail clientId={selected} onBack={() => setSelected(null)} />;

  const list = clients.data || [];
  const scored = list.filter((c) => !c.needs_setup && c.score != null);
  const avgScore = scored.length ? Math.round(scored.reduce((s, c) => s + c.score, 0) / scored.length) : 0;
  const needAttention = list.filter((c) => (c.status || "") !== "On Track").length;

  const buildBookPdf = () => {
    const b = branding.data || {};
    const firm = b.firm_name || "Compass Planning";
    const doc = new jsPDF(); const W = 210; let y = 0;
    doc.setFillColor(0, 82, 255); doc.rect(0, 0, W, 28, "F");
    if (b.logo) { try { doc.addImage(b.logo, b.logo.includes("image/png") ? "PNG" : "JPEG", W - 30, 5, 18, 16); } catch { /* ignore */ } }
    doc.setTextColor(255, 255, 255); doc.setFont("helvetica", "bold"); doc.setFontSize(16); doc.text(firm, 14, 12);
    doc.setFont("helvetica", "normal"); doc.setFontSize(10); doc.text("Book Review", 14, 18);
    doc.setFontSize(9); doc.setTextColor(219, 230, 255);
    doc.text(`${list.length} households · avg score ${avgScore} · ${needAttention} need attention`, 14, 24);
    doc.setTextColor(255, 255, 255); doc.text(new Date().toLocaleDateString("en-CA", { dateStyle: "long" }), W - 14, 24, { align: "right" });
    y = 36;
    if (b.cover_note) {
      doc.setTextColor(60, 70, 100); doc.setFont("helvetica", "normal"); doc.setFontSize(10);
      const lines = doc.splitTextToSize(b.cover_note, W - 28);
      doc.text(lines, 14, y); y += Math.min(30, lines.length * 5) + 6;
    }
    [...list].sort((a, b) => (a.score || 0) - (b.score || 0)).forEach((c) => {
      if (y > 268) { doc.addPage(); y = 20; }
      doc.setTextColor(11, 20, 55); doc.setFont("helvetica", "bold"); doc.setFontSize(12);
      doc.text(c.primary || c.client_id, 14, y);
      doc.text(`${c.score ?? "-"} · ${c.status || ""}`, W - 14, y, { align: "right" });
      y += 6; doc.setFont("helvetica", "normal"); doc.setFontSize(9); doc.setTextColor(96, 112, 143);
      doc.text(`Net worth ${money(c.net_worth || 0)} · Assets ${money(c.assets || 0)} · Goals ${c.goals || 0}`, 16, y); y += 5;
      const top = (c.alerts || [])[0];
      if (top) { doc.text(`Alert: ${top} — ${c.next_action || ""}`, 16, y); y += 5; }
      doc.setDrawColor(226, 232, 240); doc.line(14, y, W - 14, y); y += 7;
    });
    doc.save("book-review.pdf");
    toast.success("Book report downloaded");
  };

  return (
    <div>
      <PageHeader title="Household Queue" subtitle="Every household in your book, scored and triaged by what needs attention.">
        <div className="flex items-center gap-2">
          <div className="flex rounded-xl border border-compass-border overflow-hidden" data-testid="view-switch">
            <button onClick={() => setView("queue")} className={`px-3 py-2 text-sm font-semibold transition-colors ${view === "queue" ? "bg-compass-blue text-white" : "text-compass-navy hover:bg-compass-bg"}`} data-testid="view-queue"><Users size={15} className="inline mr-1.5" />Queue</button>
            <button onClick={() => setView("opps")} className={`px-3 py-2 text-sm font-semibold transition-colors ${view === "opps" ? "bg-compass-blue text-white" : "text-compass-navy hover:bg-compass-bg"}`} data-testid="view-opps"><Zap size={15} className="inline mr-1.5" />Opportunities</button>
          </div>
          <Button onClick={() => setNewOpen(true)} data-testid="new-household-button"><Plus size={16} /> New household</Button>
          {list.length > 0 && <Button variant="outline" onClick={buildBookPdf} data-testid="book-report-button"><Download size={16} /> Book report</Button>}
        </div>
      </PageHeader>
      {clients.isLoading ? (
        <div className="text-compass-muted">Loading…</div>
      ) : list.length === 0 ? (
        <Empty icon={Users} title="No clients yet">Onboard a household to get started.</Empty>
      ) : (
        <>
          <div className="grid grid-cols-2 lg:grid-cols-4 gap-4 mb-6">
            <StatCard label="Households" value={list.length} />
            <StatCard label="Book assets" value={money(list.reduce((s, c) => s + (c.assets || 0), 0))} />
            <StatCard label="Avg. health score" value={avgScore} color={scoreColor(avgScore)} />
            <StatCard label="Need attention" value={needAttention} color={needAttention ? "#EE5D50" : "#00DF89"} />
          </div>

          {view === "queue" && (
          <div className="grid md:grid-cols-2 gap-4">
            {[...list].sort((a, b) => (a.score || 0) - (b.score || 0)).map((c) => {
              const meta = SCORE_META[c.status] || SCORE_META["Needs Review"];
              return (
                <Card key={c.client_id} className="p-5" data-testid={`client-row-${c.client_id}`}>
                  <div className="flex items-start justify-between mb-3">
                    <div className="flex items-center gap-3">
                      <div className="h-10 w-10 rounded-xl gradient-bg flex items-center justify-center text-white font-bold">{(c.primary || "H").slice(0, 1)}</div>
                      <div>
                        <div className="font-heading font-bold text-compass-navy">{c.primary || c.client_id}</div>
                        <div className="text-xs text-compass-muted">{c.members.join(", ")}</div>
                      </div>
                    </div>
                    <div className="text-right">
                      <div className="font-heading text-2xl font-extrabold" style={{ color: scoreColor(c.score || 0) }} data-testid={`client-score-${c.client_id}`}>{c.score ?? "—"}</div>
                      <Badge color={meta.color} bg={meta.bg} data-testid={`client-status-${c.client_id}`}>{c.status || "—"}</Badge>
                      {c.invite_pending && <div className="mt-1 text-[10px] font-semibold text-compass-amber" data-testid={`invite-pending-${c.client_id}`}>Invited · not activated</div>}
                      {c.invite_pending && <button onClick={() => resendInvite(c.client_id)} className="mt-0.5 text-[10px] font-semibold text-compass-blue hover:underline" data-testid={`resend-invite-${c.client_id}`}>Resend invite</button>}
                      {c.invite_pending && c.invite_expires_at && (() => { const d = Math.ceil((new Date(c.invite_expires_at) - Date.now()) / 86400000); return <div className={`text-[10px] font-semibold ${d <= 0 ? "text-compass-red" : "text-compass-muted"}`} data-testid={`invite-expiry-${c.client_id}`}>{d > 0 ? `Link expires in ${d}d` : "Link expired"}</div>; })()}
                    </div>
                  </div>
                  <Progress value={c.score || 0} color={scoreColor(c.score || 0)} />
                  <div className="grid grid-cols-3 gap-2 mt-3 text-sm">
                    <div><div className="muted-label">Assets</div><div className="font-semibold text-compass-navy">{money(c.assets)}</div></div>
                    <div><div className="muted-label">Net worth</div><div className="font-semibold text-compass-navy">{money(c.net_worth || 0)}</div></div>
                    <div><div className="muted-label">Goals</div><div className="font-semibold text-compass-navy">{c.goals}</div></div>
                  </div>
                  {(c.alerts || []).length > 0 && (
                    <div className="mt-3 space-y-1" data-testid={`client-alerts-${c.client_id}`}>
                      {c.alerts.map((a, i) => (
                        <div key={i} className="flex items-center gap-2 text-xs text-compass-navy"><AlertTriangle size={12} className="text-compass-amber shrink-0" /> {a}</div>
                      ))}
                    </div>
                  )}
                  <div className="flex items-center justify-between mt-4 pt-3 border-t border-compass-border">
                    <div className="text-xs"><span className="muted-label">Next: </span><span className="font-semibold text-compass-blue" data-testid={`client-action-${c.client_id}`}>{c.next_action}</span></div>
                    <div className="flex gap-2">
                      <Button size="sm" variant="ghost" onClick={() => setSelected(c.client_id)}>Details</Button>
                      <Button size="sm" variant="outline" onClick={() => openClient(c)} data-testid={`open-client-${c.client_id}`}>Open <ArrowRight size={14} /></Button>
                    </div>
                  </div>
                </Card>
              );
            })}
          </div>
          )}

          {view === "opps" && <OpportunitiesList list={list} sort={sort} setSort={setSort} typeFilter={typeFilter} setTypeFilter={setTypeFilter} statusFilter={statusFilter} setStatusFilter={setStatusFilter} onOpen={openClient} />}
        </>
      )}

      <NewHouseholdModal open={newOpen} onClose={() => setNewOpen(false)} onCreate={createHousehold} />
    </div>
  );
}

const SORTS = [
  { key: "score-asc", label: "Lowest score first" },
  { key: "score-desc", label: "Highest score first" },
  { key: "name", label: "Household A–Z" },
];

const OPP_TYPES = ["all", "Retirement", "Insurance", "Debt", "Goals", "Estate", "Net worth", "Setup", "Other"];

function alertType(a) {
  const s = (a || "").toLowerCase();
  if (s.includes("retirement")) return "Retirement";
  if (s.includes("insurance") || s.includes("protection")) return "Insurance";
  if (s.includes("debt")) return "Debt";
  if (s.includes("goal")) return "Goals";
  if (s.includes("will") || s.includes("beneficiar") || s.includes("estate")) return "Estate";
  if (s.includes("net worth")) return "Net worth";
  if (s.includes("set up") || s.includes("setup") || s.includes("not set up")) return "Setup";
  return "Other";
}

function OpportunitiesList({ list, sort, setSort, typeFilter, setTypeFilter, statusFilter, setStatusFilter, onOpen }) {
  const qc = useQueryClient();
  const viewsQ = useQuery({ queryKey: ["opps-views"], queryFn: async () => (await api.get("/advisor/opps-views")).data });
  const views = viewsQ.data || [];
  const saveMut = useMutation({ mutationFn: (next) => api.put("/advisor/opps-views", { views: next }), onSuccess: () => qc.invalidateQueries({ queryKey: ["opps-views"] }), onError: () => toast.error("Could not save view") });
  const tasksQ = useQuery({ queryKey: ["tasks"], queryFn: async () => (await api.get("/advisor/tasks")).data });
  const tasks = tasksQ.data || [];
  const taskMut = useMutation({ mutationFn: (b) => api.post("/advisor/tasks", b), onSuccess: () => { qc.invalidateQueries({ queryKey: ["tasks"] }); toast.success("Task logged"); }, onError: () => toast.error("Could not log task") });
  const logTask = (o) => { const t = window.prompt("Log a follow-up task", o.alert); if (t && t.trim()) taskMut.mutate({ client_id: o.c.client_id, title: t.trim() }); };
  const taskCount = (cid) => tasks.filter((t) => t.scope?.client_id === cid && !t.done).length;
  const nudgeMut = useMutation({ mutationFn: (cid) => api.post(`/advisor/households/${cid}/nudge-goals`), onSuccess: (res) => { qc.invalidateQueries({ queryKey: ["clients"] }); const n = res.data.nudged; toast.success(n ? `Nudged ${n} goal${n === 1 ? "" : "s"}` : "No underfunded goals to nudge"); }, onError: () => toast.error("Could not nudge goals") });
  const saveViews = (next) => saveMut.mutate(next);
  const saveCurrentView = () => { const name = window.prompt("Name this view"); if (name && name.trim()) saveViews([...views, { name: name.trim(), type: typeFilter, status: statusFilter, sort }]); };
  const applyView = (v) => { setTypeFilter(v.type); setStatusFilter(v.status); setSort(v.sort); };
  const deleteView = (i) => saveViews(views.filter((_, j) => j !== i));
  const statuses = ["all", ...Array.from(new Set(list.map((c) => c.status).filter(Boolean)))];
  let opps = list.flatMap((c) => (c.alerts || []).map((a) => ({ c, alert: a, type: alertType(a) })));
  if (typeFilter !== "all") opps = opps.filter((o) => o.type === typeFilter);
  if (statusFilter !== "all") opps = opps.filter((o) => o.c.status === statusFilter);
  opps.sort((x, y) => {
    if (sort === "score-desc") return (y.c.score || 0) - (x.c.score || 0);
    if (sort === "name") return (x.c.primary || "").localeCompare(y.c.primary || "");
    return (x.c.score || 0) - (y.c.score || 0);
  });
  return (
    <div data-testid="opportunities-list">
      <div className="flex flex-wrap items-center gap-2 mb-3" data-testid="saved-views">
        {views.map((v, i) => (
          <span key={i} className="inline-flex items-center gap-1.5 rounded-full bg-compass-blue/10 text-compass-blue text-xs font-semibold pl-3 pr-2 py-1">
            <button onClick={() => applyView(v)} data-testid={`saved-view-${i}`}>{v.name}</button>
            <button onClick={() => deleteView(i)} className="opacity-60 hover:opacity-100" data-testid={`saved-view-delete-${i}`}><X size={12} /></button>
          </span>
        ))}
        <button onClick={saveCurrentView} className="inline-flex items-center gap-1.5 rounded-full border border-dashed border-compass-border text-compass-muted hover:text-compass-navy text-xs font-semibold px-3 py-1" data-testid="save-view-button"><Bookmark size={12} /> Save view</button>
      </div>
      <div className="flex flex-col sm:flex-row sm:items-center sm:justify-between mb-4 gap-3">
        <div className="text-sm text-compass-muted">{opps.length} open opportunit{opps.length === 1 ? "y" : "ies"}</div>
        <div className="flex flex-wrap items-center gap-2">
          <div className="w-40"><Select value={typeFilter} onChange={(e) => setTypeFilter(e.target.value)} data-testid="opps-filter-type">{OPP_TYPES.map((t) => <option key={t} value={t}>{t === "all" ? "All types" : t}</option>)}</Select></div>
          <div className="w-40"><Select value={statusFilter} onChange={(e) => setStatusFilter(e.target.value)} data-testid="opps-filter-status">{statuses.map((s) => <option key={s} value={s}>{s === "all" ? "All statuses" : s}</option>)}</Select></div>
          <div className="flex items-center gap-1.5"><ArrowUpDown size={15} className="text-compass-muted shrink-0" /><div className="w-44"><Select value={sort} onChange={(e) => setSort(e.target.value)} data-testid="opps-sort">{SORTS.map((s) => <option key={s.key} value={s.key}>{s.label}</option>)}</Select></div></div>
        </div>
      </div>
      {opps.length === 0 ? (
        <Empty icon={Zap} title="No matching opportunities">Try a different filter — or every household is on track.</Empty>
      ) : (
        <div className="space-y-2.5">
          {opps.map((o, i) => {
            const meta = SCORE_META[o.c.status] || SCORE_META["Needs Review"];
            return (
              <Card key={`${o.c.client_id}-${o.alert}`} className="p-4 flex items-center gap-4" data-testid={`opp-row-${i}`}>
                <div className="h-9 w-9 rounded-lg flex items-center justify-center shrink-0" style={{ backgroundColor: meta.bg }}>
                  <AlertTriangle size={16} style={{ color: meta.color }} />
                </div>
                <div className="flex-1 min-w-0">
                  <div className="flex items-center gap-2 flex-wrap">
                    <span className="font-heading font-bold text-compass-navy truncate">{o.c.primary || o.c.client_id}</span>
                    <Badge color={meta.color} bg={meta.bg}>{o.c.status}</Badge>
                    <Badge color="#0052FF" bg="rgba(0,82,255,0.08)">{o.type}</Badge>
                  </div>
                  <div className="text-sm text-compass-navy mt-0.5">{o.alert}</div>
                  <div className="text-xs text-compass-muted mt-0.5"><span className="muted-label">Next: </span>{o.c.next_action}</div>
                </div>
                <div className="text-right shrink-0">
                  <div className="font-heading text-xl font-extrabold" style={{ color: o.c.score == null ? "#60708f" : scoreColor(o.c.score) }}>{o.c.score ?? "—"}</div>
                  {taskCount(o.c.client_id) > 0 && <div className="text-[10px] font-semibold text-compass-blue" data-testid={`task-count-${o.c.client_id}`}>{taskCount(o.c.client_id)} task{taskCount(o.c.client_id) > 1 ? "s" : ""}</div>}
                </div>
                <Button size="sm" variant="ghost" onClick={() => logTask(o)} data-testid={`log-task-${i}`}>Log task</Button>
                {(o.type === "Goals" || o.type === "Retirement") && <Button size="sm" variant="ghost" onClick={() => nudgeMut.mutate(o.c.client_id)} data-testid={`nudge-goals-${i}`}>Nudge</Button>}
                <Button size="sm" variant="outline" onClick={() => onOpen(o.c)} data-testid={`opp-open-${i}`}>Open <ArrowRight size={14} /></Button>
              </Card>
            );
          })}
        </div>
      )}
    </div>
  );
}

function NewHouseholdModal({ open, onClose, onCreate }) {
  const [full_name, setFullName] = useState("");
  const [province, setProvince] = useState("ON");
  const [income, setIncome] = useState("");
  const [spouse_name, setSpouseName] = useState("");
  const [spouse_income, setSpouseIncome] = useState("");
  const [seed_goal, setSeedGoal] = useState(true);
  const [loading, setLoading] = useState(false);
  React.useEffect(() => { if (open) { setFullName(""); setProvince("ON"); setIncome(""); setSpouseName(""); setSpouseIncome(""); setSeedGoal(true); } }, [open]);
  const submit = async () => {
    if (!full_name.trim()) return;
    setLoading(true);
    try { await onCreate({ full_name: full_name.trim(), province, income, spouse_name, spouse_income, seed_goal }); }
    catch (e) { toast.error(formatApiError(e.response?.data?.detail)); }
    finally { setLoading(false); }
  };
  return (
    <Modal open={open} onClose={onClose} title="New household" testid="new-household-modal">
      <div className="space-y-4">
        <p className="text-sm text-compass-muted">Capture the essentials now — you can add dependants and full details on the next screen.</p>
        <div className="grid grid-cols-2 gap-3">
          <Field label="Primary client name"><Input value={full_name} onChange={(e) => setFullName(e.target.value)} placeholder="e.g. Jordan Blake" data-testid="new-household-name" /></Field>
          <Field label="Province"><Select value={province} onChange={(e) => setProvince(e.target.value)} data-testid="new-household-province">{PROVINCES.map((p) => <option key={p} value={p}>{p}</option>)}</Select></Field>
        </div>
        <Field label="Primary annual income"><Input type="number" min="0" value={income} onChange={(e) => setIncome(e.target.value)} placeholder="e.g. 95000" data-testid="new-household-income" /></Field>
        <div className="pt-1 border-t border-compass-border" />
        <div className="muted-label">Spouse / partner (optional)</div>
        <div className="grid grid-cols-2 gap-3">
          <Field label="Spouse name"><Input value={spouse_name} onChange={(e) => setSpouseName(e.target.value)} placeholder="e.g. Sam Blake" data-testid="new-household-spouse-name" /></Field>
          <Field label="Spouse annual income"><Input type="number" min="0" value={spouse_income} onChange={(e) => setSpouseIncome(e.target.value)} placeholder="e.g. 60000" data-testid="new-household-spouse-income" /></Field>
        </div>
        <label className="flex items-center justify-between gap-3 rounded-lg bg-compass-bg/60 px-3 py-2">
          <span className="text-sm text-compass-navy">Add a starter retirement goal <span className="text-compass-muted">· $1M by {new Date().getFullYear() + 30}</span></span>
          <Toggle checked={seed_goal} onChange={setSeedGoal} testid="new-household-seed-goal" />
        </label>
        <div className="flex gap-2 justify-end pt-2">
          <Button variant="ghost" onClick={onClose}>Cancel</Button>
          <Button onClick={submit} disabled={!full_name.trim() || loading} data-testid="new-household-create">{loading ? "Creating…" : "Create & open"}</Button>
        </div>
      </div>
    </Modal>
  );
}

function StatCard({ label, value, color }) {
  return (
    <Card className="p-5">
      <div className="muted-label">{label}</div>
      <div className="font-heading text-2xl font-extrabold mt-1" style={{ color: color || "#0B1437" }}>{value}</div>
    </Card>
  );
}

function ClientDetail({ clientId, onBack }) {
  const [inviteOpen, setInviteOpen] = useState(false);
  const { data, isLoading } = useQuery({ queryKey: ["client", clientId], queryFn: async () => (await api.get(`/advisor/clients/${clientId}`)).data });
  if (isLoading || !data) return <div className="text-compass-muted">Loading household…</div>;

  const totalAssets = data.accounts.reduce((s, a) => s + a.balance, 0);
  const primary = data.owners.find((o) => o.relationship === "self");

  return (
    <div>
      <button onClick={onBack} className="flex items-center gap-2 text-sm font-semibold text-compass-blue mb-4" data-testid="back-to-roster">
        <ArrowLeft size={16} /> Back to roster
      </button>
      <PageHeader title={primary ? `${primary.full_name}'s Household` : "Household"} subtitle={`Client ${clientId} · ${money(totalAssets)} under plan`}>
        <Button variant="outline" onClick={() => setInviteOpen(true)} data-testid="invite-client-button"><UserPlus size={16} /> Invite client login</Button>
      </PageHeader>
      <InviteModal open={inviteOpen} onClose={() => setInviteOpen(false)} clientId={clientId} defaultName={primary ? primary.full_name : ""} />

      <div className="grid lg:grid-cols-2 gap-6">
        <Card className="p-6">
          <h3 className="font-heading font-bold text-compass-navy mb-4 flex items-center gap-2"><Users size={18} className="text-compass-blue" /> Members & accounts</h3>
          <div className="space-y-4">
            {data.owners.map((o) => {
              const accts = data.accounts.filter((a) => a.owner_id === o.id);
              return (
                <div key={o.id}>
                  <div className="flex items-center gap-2 mb-2">
                    <span className="font-semibold text-compass-navy">{o.full_name}</span>
                    <Badge color="#0052FF" bg="rgba(0,82,255,0.08)">{o.relationship}</Badge>
                  </div>
                  {accts.length ? accts.map((a) => (
                    <div key={a.id} className="flex items-center gap-3 rounded-lg bg-compass-bg/60 px-3 py-2 mb-1.5">
                      <Landmark size={15} className="text-compass-blue" />
                      <span className="text-sm text-compass-navy flex-1">{a.account_type} · {a.institution}</span>
                      <span className="font-semibold text-compass-navy text-sm">{money(a.balance)}</span>
                    </div>
                  )) : <div className="text-xs text-compass-muted mb-2">No accounts</div>}
                </div>
              );
            })}
          </div>
        </Card>

        <Card className="p-6">
          <h3 className="font-heading font-bold text-compass-navy mb-4 flex items-center gap-2"><Target size={18} className="text-compass-blue" /> Goals</h3>
          {data.goals.length === 0 ? <div className="text-sm text-compass-muted">No goals.</div> : (
            <div className="space-y-4">
              {data.goals.map((g) => {
                const pct = g.target_amount ? Math.round((g.current_amount / g.target_amount) * 100) : 0;
                const meta = STATUS_META[g.status] || STATUS_META.on_track;
                return (
                  <div key={g.id}>
                    <div className="flex items-center justify-between mb-1.5">
                      <span className="font-semibold text-compass-navy text-sm">{g.title}</span>
                      <Badge color={meta.color} bg={meta.bg}>{meta.label}</Badge>
                    </div>
                    <Progress value={pct} color={meta.color} />
                    <div className="text-xs text-compass-muted mt-1">{money(g.current_amount)} of {money(g.target_amount)} · {pct}%</div>
                  </div>
                );
              })}
            </div>
          )}
        </Card>
      </div>
    </div>
  );
}

function InviteModal({ open, onClose, clientId, defaultName }) {
  const [email, setEmail] = useState("");
  const [name, setName] = useState(defaultName);
  const [loading, setLoading] = useState(false);
  const [result, setResult] = useState(null);
  React.useEffect(() => { if (open) { setEmail(""); setName(defaultName); setResult(null); } }, [open, defaultName]);
  const submit = async () => {
    if (!email.trim()) return;
    setLoading(true);
    try {
      const { data } = await api.post("/advisor/clients/invite", { email: email.trim(), full_name: name.trim() || "Client", client_id: clientId, base_url: window.location.origin });
      setResult(data);
      toast.success("Client login created");
    } catch (e) { toast.error(formatApiError(e.response?.data?.detail)); }
    finally { setLoading(false); }
  };
  return (
    <Modal open={open} onClose={onClose} title="Invite client login" testid="invite-client-modal">
      {result ? (
        <div className="space-y-4" data-testid="invite-result">
          <p className="text-sm text-compass-navy">{result.emailed ? `We emailed a secure activation link to ${result.email}.` : `Couldn't send the email automatically — copy the secure activation link below and share it with ${result.email}.`}</p>
          <div className="rounded-lg bg-compass-bg px-4 py-3 text-sm space-y-2">
            <div><div className="muted-label">Email</div><div className="font-mono text-compass-navy" data-testid="invite-email">{result.email}</div></div>
            <div><div className="muted-label">Activation link</div><div className="font-mono text-compass-navy break-all flex items-start gap-2" data-testid="invite-activation-link">{result.activation_link}
              <button onClick={() => { navigator.clipboard?.writeText(result.activation_link); toast.success("Link copied"); }} className="text-compass-blue shrink-0" data-testid="invite-copy"><Copy size={14} /></button></div></div>
          </div>
          <div className="flex justify-end"><Button onClick={onClose} data-testid="invite-done">Done</Button></div>
        </div>
      ) : (
        <div className="space-y-4">
          <p className="text-sm text-compass-muted">Create a secure login for this household. They'll get an email with an activation link, then set up MFA and a password on first sign-in.</p>
          <Field label="Client email"><Input type="email" value={email} onChange={(e) => setEmail(e.target.value)} placeholder="client@email.com" data-testid="invite-email-input" /></Field>
          <Field label="Client name"><Input value={name} onChange={(e) => setName(e.target.value)} placeholder="Full name" data-testid="invite-name-input" /></Field>
          <div className="flex gap-2 justify-end pt-2">
            <Button variant="ghost" onClick={onClose}>Cancel</Button>
            <Button onClick={submit} disabled={!email.trim() || loading} data-testid="invite-submit">{loading ? "Creating…" : "Create login"}</Button>
          </div>
        </div>
      )}
    </Modal>
  );
}
