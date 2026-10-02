import React, { useState } from "react";
import { useQuery, useMutation, useQueryClient } from "@tanstack/react-query";
import { useNavigate } from "react-router-dom";
import { toast } from "sonner";
import { Building2, Users, Gauge, AlertTriangle, UserPlus, Pencil, Plus, Trash2, RefreshCw, Loader2 } from "lucide-react";
import api, { formatApiError } from "@/lib/api";
import { enterpriseApi } from "@/lib/planning";
import { useAuth } from "@/context/AuthContext";
import { useHousehold } from "@/context/HouseholdContext";
import { Card, Stat, Badge, Modal, Button, Input, Field, Select } from "@/components/ui-kit";
import { money } from "@/lib/format";

const STATUS_COLOR = { "On Track": "#00DF89", "Needs Review": "#FFB800", "At Risk": "#EE5D50", "Needs Setup": "#A3AED0" };

function sev(score) {
  return score == null ? "#A3AED0" : score >= 75 ? "#00A36C" : score >= 50 ? "#FFB800" : "#EE5D50";
}

function HouseholdDrill({ hid, onClose }) {
  const q = useQuery({ queryKey: ["enterprise-household", hid], queryFn: () => enterpriseApi.household(hid), enabled: !!hid });
  const d = q.data;
  const [inviteOpen, setInviteOpen] = useState(false);
  const [email, setEmail] = useState("");
  const invite = useMutation({
    mutationFn: () => enterpriseApi.invite({ email, full_name: d.primary, hid, base_url: window.location.origin }),
    onSuccess: (r) => { toast.success(r.emailed ? `Portal invite emailed to ${r.email}` : `Invite created for ${r.email}`); setInviteOpen(false); setEmail(""); },
    onError: (e) => toast.error(formatApiError(e.response?.data?.detail) || "Could not send invite"),
  });
  return (
    <Modal open={!!hid} onClose={onClose} title={d ? d.primary : "Household"} testid="enterprise-drill">
      {!d ? (
        <div className="py-8 text-center text-sm text-compass-muted">Loading household…</div>
      ) : (
        <div className="space-y-5 max-h-[70vh] overflow-y-auto pr-1">
          <div className="grid grid-cols-3 gap-3">
            <Stat label="Health score" value={d.score ?? "—"} accent />
            <Stat label="Status" value={d.status} />
            <Stat label="Assets" value={money(d.assets)} />
          </div>
          <Section title="Members">
            {d.owners.map((o, i) => (
              <div key={i} className="flex items-center justify-between text-sm py-1.5 border-b border-compass-border/60 last:border-0" data-testid={`drill-owner-${i}`}>
                <span className="font-semibold text-compass-navy">{o.full_name} <span className="text-xs text-compass-muted capitalize font-normal">· {o.relationship}</span></span>
                <span className="text-compass-muted text-xs">{o.province || "—"}{o.annual_income ? ` · ${money(o.annual_income)}/yr` : ""}</span>
              </div>
            ))}
          </Section>
          <Section title="Accounts">
            {d.accounts.length === 0 ? <Empty /> : d.accounts.map((a, i) => (
              <div key={i} className="flex items-center justify-between text-sm py-1.5 border-b border-compass-border/60 last:border-0" data-testid={`drill-account-${i}`}>
                <span className="text-compass-navy">{a.account_type} <span className="text-xs text-compass-muted">· {a.institution || "—"}</span></span>
                <span className="font-semibold text-compass-navy">{money(a.balance || 0)}</span>
              </div>
            ))}
          </Section>
          <Section title="Goals">
            {d.goals.length === 0 ? <Empty /> : d.goals.map((g, i) => (
              <div key={i} className="flex items-center justify-between text-sm py-1.5 border-b border-compass-border/60 last:border-0" data-testid={`drill-goal-${i}`}>
                <span className="text-compass-navy">{g.title} <span className="text-xs text-compass-muted capitalize">· {g.category}</span></span>
                <span className="text-compass-muted text-xs">{money(g.current_amount || 0)} / {money(g.target_amount || 0)}</span>
              </div>
            ))}
          </Section>

          <div className="rounded-xl bg-compass-bg px-4 py-3">
            {!inviteOpen ? (
              <div className="flex items-center justify-between gap-3">
                <div className="text-sm text-compass-navy font-semibold">Portal access <span className="text-xs text-compass-muted font-normal">· plan-data binding coming soon</span></div>
                <Button size="sm" variant="outline" onClick={() => setInviteOpen(true)} data-testid="drill-invite-open"><UserPlus size={14} /> Invite to portal</Button>
              </div>
            ) : (
              <div className="space-y-2.5" data-testid="drill-invite-form">
                <Field label={`Email for ${d.primary}`}><Input type="email" value={email} onChange={(e) => setEmail(e.target.value)} placeholder="client@email.com" data-testid="drill-invite-email" /></Field>
                <div className="flex justify-end gap-2">
                  <Button size="sm" variant="ghost" onClick={() => setInviteOpen(false)}>Cancel</Button>
                  <Button size="sm" onClick={() => invite.mutate()} disabled={!email || invite.isPending} data-testid="drill-invite-send">Send invite</Button>
                </div>
              </div>
            )}
          </div>
          <p className="text-xs text-compass-muted">Read-only corp view. Household data is managed via the CRM source of record.</p>
        </div>
      )}
    </Modal>
  );
}

const Section = ({ title, children }) => (
  <div><div className="muted-label mb-2">{title}</div><div className="rounded-xl border border-compass-border px-4 py-2">{children}</div></div>
);
const Empty = () => <div className="text-sm text-compass-muted py-1.5">None on file.</div>;

export default function EnterpriseOverview() {
  const q = useQuery({ queryKey: ["enterprise-overview"], queryFn: enterpriseApi.overview });
  const [drill, setDrill] = useState(null);
  const [newOpen, setNewOpen] = useState(false);
  const [delHh, setDelHh] = useState(null);
  const [resetOpen, setResetOpen] = useState(false);
  const [resetting, setResetting] = useState(false);
  const { user } = useAuth();
  const { setActive, clear } = useHousehold();
  const navigate = useNavigate();
  const qc = useQueryClient();
  const canWrite = !!user.enterprise_write;
  const openHousehold = (h) => { setActive(h.id, h.primary || h.id); navigate("/profile"); };

  const createHousehold = async (form) => {
    clear(); // a fresh 'self' owner starts a brand-new corp household
    const { data: self } = await api.post("/owners", { full_name: form.full_name, relationship: "self", province: form.province, annual_income: Number(form.income || 0) });
    const hid = self.id;
    if (form.spouse_name && form.spouse_name.trim()) {
      await api.post("/owners", { full_name: form.spouse_name.trim(), relationship: "spouse", province: form.province, annual_income: Number(form.spouse_income || 0) });
    }
    if (form.seed_goal) {
      await api.post("/goals", { title: "Retirement", category: "retirement", target_amount: 1000000, current_amount: 0, target_year: new Date().getFullYear() + 30, owner_id: hid, linked_asset_ids: [], monthly_contribution: 0, growth_rate: 5 }, { params: { household_id: hid } });
    }
    qc.invalidateQueries({ queryKey: ["enterprise-overview"] });
    setNewOpen(false);
    setActive(hid, form.full_name);
    toast.success(`Created ${form.full_name}'s household`);
    navigate("/profile");
  };

  const d = q.data;
  if (!d) return null;

  const delMut = {
    run: async () => {
      try {
        await enterpriseApi.deleteHousehold(delHh.id);
        qc.invalidateQueries({ queryKey: ["enterprise-overview"] });
        toast.success(`Deleted ${delHh.primary}'s household`);
      } catch (e) {
        toast.error(formatApiError(e.response?.data?.detail) || "Could not delete household");
      } finally { setDelHh(null); }
    },
  };
  const runReset = async () => {
    setResetting(true);
    try {
      const r = await enterpriseApi.resetDemo();
      qc.invalidateQueries({ queryKey: ["enterprise-overview"] });
      toast.success(`Corp book reset — ${r.removed} record(s) cleared and sample households reseeded`);
    } catch (e) {
      toast.error(formatApiError(e.response?.data?.detail) || "Could not reset demo data");
    } finally { setResetting(false); setResetOpen(false); }
  };

  return (
    <div className="mt-6 space-y-6" data-testid="enterprise-overview">
      <div className="grid grid-cols-2 lg:grid-cols-4 gap-4">
        <Stat label="Households" value={d.households} accent sub="Across the corp book" />
        <Stat label="Book assets" value={money(d.book_assets)} />
        <Stat label="Avg. health score" value={d.avg_score ?? "—"} sub="Weighted by data on file" />
        <Stat label="Households / planner" value={d.households_per_planner ?? "—"} />
      </div>

      <Card className="p-0 overflow-hidden" data-testid="enterprise-households">
        <div className="px-6 py-4 border-b border-compass-border flex items-center justify-between gap-2">
          <span className="font-heading font-bold text-compass-navy flex items-center gap-2"><Building2 size={16} className="text-compass-blue" /> Corp book — click a household to inspect{canWrite && <Badge color="#FFB800" bg="rgba(255,184,0,0.14)">Edit mode (testing)</Badge>}</span>
          {canWrite && <div className="flex items-center gap-2"><Button size="sm" variant="outline" onClick={() => setResetOpen(true)} data-testid="reset-demo-button"><RefreshCw size={14} /> Reset corp book</Button><Button size="sm" onClick={() => setNewOpen(true)} data-testid="add-household-button"><Plus size={14} /> Add household</Button></div>}
        </div>
        <div className="overflow-x-auto">
          <table className="w-full text-sm">
            <thead className="bg-compass-bg/60"><tr className="text-left text-[11px] uppercase tracking-wide text-compass-muted">
              {["Household", "Province", "Assets", "Goals", "Score", "Status"].map((h) => <th key={h} className="px-5 py-2 font-semibold">{h}</th>)}
              {canWrite && <th className="px-5 py-2 font-semibold text-right">Action</th>}
            </tr></thead>
            <tbody>
              {(d.households_list || []).map((h) => (
                <tr key={h.id} className="border-t border-compass-border/60 hover:bg-compass-bg/50 cursor-pointer" onClick={() => setDrill(h.id)} data-testid={`household-row-${h.id}`}>
                  <td className="px-5 py-2.5 font-semibold text-compass-navy">{h.primary}</td>
                  <td className="px-5 py-2.5 text-compass-muted">{h.province || "—"}</td>
                  <td className="px-5 py-2.5">{money(h.assets)}</td>
                  <td className="px-5 py-2.5">{h.goals}</td>
                  <td className="px-5 py-2.5"><Badge color={sev(h.score)} bg="rgba(0,82,255,0.06)">{h.score ?? "—"}</Badge></td>
                  <td className="px-5 py-2.5"><span className="text-xs font-semibold" style={{ color: STATUS_COLOR[h.status] }}>{h.status}</span>{h.invite_status && <span className="ml-2 text-[10px] font-semibold px-1.5 py-0.5 rounded-full" style={{ color: h.invite_status === "accepted" ? "#00A36C" : "#FFB800", background: h.invite_status === "accepted" ? "rgba(0,163,108,0.12)" : "rgba(255,184,0,0.14)" }} data-testid={`invite-status-${h.id}`}>{h.invite_status === "accepted" ? "Portal active" : "Invite pending"}</span>}</td>
                  {canWrite && <td className="px-5 py-2.5 text-right whitespace-nowrap"><div className="inline-flex items-center gap-1.5"><Button size="sm" variant="outline" onClick={(e) => { e.stopPropagation(); openHousehold(h); }} data-testid={`open-household-${h.id}`}><Pencil size={13} /> Open &amp; edit</Button><button onClick={(e) => { e.stopPropagation(); setDelHh(h); }} data-testid={`delete-household-${h.id}`} className="text-compass-red hover:bg-compass-red/10 rounded-lg p-2"><Trash2 size={15} /></button></div></td>}
                </tr>
              ))}
            </tbody>
          </table>
        </div>
      </Card>

      <div className="grid lg:grid-cols-2 gap-6">
        <Card className="p-6" data-testid="enterprise-planners">
          <h3 className="font-heading font-bold text-compass-navy mb-4 flex items-center gap-2"><Users size={18} className="text-compass-blue" /> Planner productivity</h3>
          {(d.planners || []).length === 0 ? (
            <div className="text-sm text-compass-muted">No planners in this corp.</div>
          ) : (
            <div className="rounded-xl border border-compass-border overflow-hidden">
              <div className="grid grid-cols-[1.6fr_0.8fr_0.8fr] bg-compass-bg/60 px-4 py-2 text-[11px] font-semibold uppercase tracking-wide text-compass-muted">
                <span>Planner</span><span className="text-right">Households</span><span className="text-right">Avg score</span>
              </div>
              {d.planners.map((p) => (
                <div key={p.email} className="grid grid-cols-[1.6fr_0.8fr_0.8fr] items-center px-4 py-3 border-t border-compass-border text-sm" data-testid={`planner-row-${p.email}`}>
                  <span className="min-w-0"><span className="font-semibold text-compass-navy block truncate">{p.name}</span><span className="text-xs text-compass-muted truncate">{p.email}</span></span>
                  <span className="text-right font-semibold text-compass-navy">{p.households}</span>
                  <span className="text-right"><Badge color={sev(p.avg_score)} bg="rgba(0,82,255,0.06)">{p.avg_score ?? "—"}</Badge></span>
                </div>
              ))}
            </div>
          )}
          <p className="text-xs text-compass-muted mt-3">Illustrative even allocation of the corp book across planners.</p>
        </Card>

        <Card className="p-6" data-testid="enterprise-attention">
          <div className="flex items-center justify-between mb-4">
            <h3 className="font-heading font-bold text-compass-navy flex items-center gap-2"><AlertTriangle size={18} className="text-compass-amber" /> Needs attention</h3>
            <Badge color="#FFB800" bg="rgba(255,184,0,0.14)">{d.attention.length}</Badge>
          </div>
          <div className="flex flex-wrap gap-2 mb-4">
            {Object.entries(d.counts || {}).map(([k, v]) => (
              <span key={k} className="inline-flex items-center gap-1.5 rounded-full px-2.5 py-1 text-xs font-semibold" style={{ color: STATUS_COLOR[k], background: `${STATUS_COLOR[k]}22` }}>
                <Gauge size={12} /> {k}: {v}
              </span>
            ))}
          </div>
          {d.attention.length === 0 ? (
            <div className="text-sm text-compass-muted py-4 text-center">Every household is on track. 🎯</div>
          ) : (
            <div className="space-y-2">
              {d.attention.map((a, i) => (
                <div key={i} className="flex items-center gap-3 rounded-xl bg-compass-bg px-4 py-2.5" data-testid={`enterprise-attention-${i}`}>
                  <span className="h-7 w-7 rounded-lg flex items-center justify-center text-white text-xs font-bold shrink-0" style={{ background: STATUS_COLOR[a.status] }}>{a.score ?? "—"}</span>
                  <span className="text-sm font-semibold text-compass-navy truncate flex-1">{a.primary}</span>
                  <span className="text-xs font-semibold shrink-0" style={{ color: STATUS_COLOR[a.status] }}>{a.status}</span>
                </div>
              ))}
            </div>
          )}
        </Card>
      </div>

      <HouseholdDrill hid={drill} onClose={() => setDrill(null)} />
      <NewCorpHouseholdModal open={newOpen} onClose={() => setNewOpen(false)} onSubmit={createHousehold} />
      <Modal open={!!delHh} onClose={() => setDelHh(null)} title="Delete household?" testid="delete-household-modal">
        <div className="space-y-4">
          <p className="text-sm text-compass-navy">This permanently removes <span className="font-semibold">{delHh?.primary}</span>'s household — all members, accounts, goals and plan data. This cannot be undone.</p>
          <div className="flex gap-2 justify-end">
            <Button variant="ghost" onClick={() => setDelHh(null)}>Cancel</Button>
            <Button variant="danger" onClick={delMut.run} data-testid="confirm-delete-household"><Trash2 size={15} /> Delete household</Button>
          </div>
        </div>
      </Modal>
      <Modal open={resetOpen} onClose={() => setResetOpen(false)} title="Reset corp book?" testid="reset-demo-modal">
        <div className="space-y-4">
          <p className="text-sm text-compass-navy">This clears <span className="font-semibold">all</span> households, accounts, goals and plan data in this corp, then reseeds the original Sweston sample book. Use this to tidy up test data. This cannot be undone.</p>
          <div className="flex gap-2 justify-end">
            <Button variant="ghost" onClick={() => setResetOpen(false)}>Cancel</Button>
            <Button variant="danger" onClick={runReset} disabled={resetting} data-testid="confirm-reset-demo">{resetting ? <Loader2 size={15} className="animate-spin" /> : <RefreshCw size={15} />} Reset &amp; reseed</Button>
          </div>
        </div>
      </Modal>
    </div>
  );
}

const PROVINCES = ["ON", "BC", "AB", "QC", "MB", "SK", "NS", "NB", "NL", "PE", "NT", "YT", "NU"];

function NewCorpHouseholdModal({ open, onClose, onSubmit }) {
  const [f, setF] = useState({ full_name: "", province: "ON", income: "", spouse_name: "", spouse_income: "", seed_goal: true });
  const [saving, setSaving] = useState(false);
  const set = (k) => (e) => setF({ ...f, [k]: e.target.value });
  const submit = async () => {
    setSaving(true);
    try { await onSubmit(f); setF({ full_name: "", province: "ON", income: "", spouse_name: "", spouse_income: "", seed_goal: true }); }
    catch (e) { toast.error(formatApiError(e.response?.data?.detail) || "Could not create household"); }
    finally { setSaving(false); }
  };
  return (
    <Modal open={open} onClose={onClose} title="Add corp household" testid="new-corp-household-modal">
      <div className="space-y-4">
        <Field label="Primary member name"><Input value={f.full_name} onChange={set("full_name")} placeholder="e.g. Jordan Blake" data-testid="corp-household-name" /></Field>
        <div className="grid grid-cols-2 gap-3">
          <Field label="Province"><Select value={f.province} onChange={set("province")} data-testid="corp-household-province">{PROVINCES.map((p) => <option key={p} value={p}>{p}</option>)}</Select></Field>
          <Field label="Annual income"><Input type="number" min="0" value={f.income} onChange={set("income")} placeholder="e.g. 95000" data-testid="corp-household-income" /></Field>
        </div>
        <Field label="Spouse name (optional)"><Input value={f.spouse_name} onChange={set("spouse_name")} placeholder="e.g. Sam Blake" data-testid="corp-household-spouse" /></Field>
        <label className="flex items-center gap-2.5 text-sm text-compass-navy cursor-pointer">
          <input type="checkbox" checked={f.seed_goal} onChange={(e) => setF({ ...f, seed_goal: e.target.checked })} className="h-4 w-4 accent-compass-blue" data-testid="corp-household-seed-goal" />
          Seed a starter retirement goal
        </label>
        <div className="flex gap-2 justify-end pt-2">
          <Button variant="ghost" onClick={onClose}>Cancel</Button>
          <Button onClick={submit} disabled={!f.full_name.trim() || saving} data-testid="corp-household-save">Create household</Button>
        </div>
      </div>
    </Modal>
  );
}

