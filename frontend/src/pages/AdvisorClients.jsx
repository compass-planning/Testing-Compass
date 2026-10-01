import React, { useState } from "react";
import { useNavigate } from "react-router-dom";
import { useQuery, useQueryClient } from "@tanstack/react-query";
import { Users, ArrowLeft, Landmark, Target, AlertTriangle, ArrowRight, Download, Plus, Zap, ArrowUpDown } from "lucide-react";
import { jsPDF } from "jspdf";
import { toast } from "sonner";
import api, { formatApiError } from "@/lib/api";
import { useHousehold } from "@/context/HouseholdContext";
import { Card, Button, Badge, Progress, Empty, Modal, Input, Field, Select } from "@/components/ui-kit";
import { PageHeader } from "@/components/PageHeader";
import { money, STATUS_META } from "@/lib/format";

const PROVINCES = ["ON", "BC", "AB", "QC", "MB", "SK", "NS", "NB", "NL", "PE"];

const SCORE_META = {
  "On Track": { color: "#00DF89", bg: "rgba(0,223,137,0.12)" },
  "Needs Review": { color: "#FFB800", bg: "rgba(255,184,0,0.14)" },
  "At Risk": { color: "#EE5D50", bg: "rgba(238,93,80,0.12)" },
};
const scoreColor = (s) => (s >= 75 ? "#00DF89" : s >= 50 ? "#FFB800" : "#EE5D50");

export default function AdvisorClients() {
  const [selected, setSelected] = useState(null);
  const [view, setView] = useState("queue");
  const [sort, setSort] = useState("score-asc");
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
    const { data } = await api.post("/owners", { full_name: form.full_name, relationship: "self", province: form.province });
    const cid = data?.scope?.client_id;
    qc.invalidateQueries({ queryKey: ["clients"] });
    setActive(cid, form.full_name);
    toast.success(`Created ${form.full_name}'s household`);
    navigate("/profile");
  };

  if (selected) return <ClientDetail clientId={selected} onBack={() => setSelected(null)} />;

  const list = clients.data || [];
  const avgScore = list.length ? Math.round(list.reduce((s, c) => s + (c.score || 0), 0) / list.length) : 0;
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

          {view === "opps" && <OpportunitiesList list={list} sort={sort} setSort={setSort} onOpen={openClient} />}
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

function OpportunitiesList({ list, sort, setSort, onOpen }) {
  const opps = list.flatMap((c) => (c.alerts || []).map((a) => ({ c, alert: a })));
  opps.sort((x, y) => {
    if (sort === "score-desc") return (y.c.score || 0) - (x.c.score || 0);
    if (sort === "name") return (x.c.primary || "").localeCompare(y.c.primary || "");
    return (x.c.score || 0) - (y.c.score || 0);
  });
  return (
    <div data-testid="opportunities-list">
      <div className="flex items-center justify-between mb-4 gap-3">
        <div className="text-sm text-compass-muted">{opps.length} open opportunit{opps.length === 1 ? "y" : "ies"} across {list.length} households</div>
        <div className="flex items-center gap-2">
          <ArrowUpDown size={15} className="text-compass-muted shrink-0" />
          <div className="w-52"><Select value={sort} onChange={(e) => setSort(e.target.value)} data-testid="opps-sort">{SORTS.map((s) => <option key={s.key} value={s.key}>{s.label}</option>)}</Select></div>
        </div>
      </div>
      {opps.length === 0 ? (
        <Empty icon={Zap} title="No open opportunities">Every household is on track.</Empty>
      ) : (
        <div className="space-y-2.5">
          {opps.map((o, i) => {
            const meta = SCORE_META[o.c.status] || SCORE_META["Needs Review"];
            return (
              <Card key={`${o.c.client_id}-${i}`} className="p-4 flex items-center gap-4" data-testid={`opp-row-${i}`}>
                <div className="h-9 w-9 rounded-lg flex items-center justify-center shrink-0" style={{ backgroundColor: meta.bg }}>
                  <AlertTriangle size={16} style={{ color: meta.color }} />
                </div>
                <div className="flex-1 min-w-0">
                  <div className="flex items-center gap-2">
                    <span className="font-heading font-bold text-compass-navy truncate">{o.c.primary || o.c.client_id}</span>
                    <Badge color={meta.color} bg={meta.bg}>{o.c.status}</Badge>
                  </div>
                  <div className="text-sm text-compass-navy mt-0.5">{o.alert}</div>
                  <div className="text-xs text-compass-muted mt-0.5"><span className="muted-label">Next: </span>{o.c.next_action}</div>
                </div>
                <div className="text-right shrink-0">
                  <div className="font-heading text-xl font-extrabold" style={{ color: scoreColor(o.c.score || 0) }}>{o.c.score ?? "—"}</div>
                </div>
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
  const [loading, setLoading] = useState(false);
  React.useEffect(() => { if (open) { setFullName(""); setProvince("ON"); } }, [open]);
  const submit = async () => {
    if (!full_name.trim()) return;
    setLoading(true);
    try { await onCreate({ full_name: full_name.trim(), province }); }
    catch (e) { toast.error(formatApiError(e.response?.data?.detail)); }
    finally { setLoading(false); }
  };
  return (
    <Modal open={open} onClose={onClose} title="New household" testid="new-household-modal">
      <div className="space-y-4">
        <p className="text-sm text-compass-muted">Create a household and open its planner. You can add a spouse and dependants on the next screen.</p>
        <Field label="Primary client name"><Input value={full_name} onChange={(e) => setFullName(e.target.value)} placeholder="e.g. Jordan Blake" data-testid="new-household-name" /></Field>
        <Field label="Province"><Select value={province} onChange={(e) => setProvince(e.target.value)} data-testid="new-household-province">{PROVINCES.map((p) => <option key={p} value={p}>{p}</option>)}</Select></Field>
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
  const { data, isLoading } = useQuery({ queryKey: ["client", clientId], queryFn: async () => (await api.get(`/advisor/clients/${clientId}`)).data });
  if (isLoading || !data) return <div className="text-compass-muted">Loading household…</div>;

  const totalAssets = data.accounts.reduce((s, a) => s + a.balance, 0);
  const primary = data.owners.find((o) => o.relationship === "self");

  return (
    <div>
      <button onClick={onBack} className="flex items-center gap-2 text-sm font-semibold text-compass-blue mb-4" data-testid="back-to-roster">
        <ArrowLeft size={16} /> Back to roster
      </button>
      <PageHeader title={primary ? `${primary.full_name}'s Household` : "Household"} subtitle={`Client ${clientId} · ${money(totalAssets)} under plan`} />

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
