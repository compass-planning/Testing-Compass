import React, { useState } from "react";
import { useNavigate } from "react-router-dom";
import { useQuery } from "@tanstack/react-query";
import { Users, ArrowLeft, Landmark, Target, AlertTriangle, ArrowRight } from "lucide-react";
import api from "@/lib/api";
import { useHousehold } from "@/context/HouseholdContext";
import { Card, Button, Badge, Progress, Empty } from "@/components/ui-kit";
import { PageHeader } from "@/components/PageHeader";
import { money, STATUS_META } from "@/lib/format";

const SCORE_META = {
  "On Track": { color: "#00DF89", bg: "rgba(0,223,137,0.12)" },
  "Needs Review": { color: "#FFB800", bg: "rgba(255,184,0,0.14)" },
  "At Risk": { color: "#EE5D50", bg: "rgba(238,93,80,0.12)" },
};
const scoreColor = (s) => (s >= 75 ? "#00DF89" : s >= 50 ? "#FFB800" : "#EE5D50");

export default function AdvisorClients() {
  const [selected, setSelected] = useState(null);
  const { setActive } = useHousehold();
  const navigate = useNavigate();
  const clients = useQuery({ queryKey: ["clients"], queryFn: async () => (await api.get("/advisor/clients")).data });

  const openClient = (c) => {
    setActive(c.client_id, c.primary || c.client_id);
    navigate("/profile");
  };

  if (selected) return <ClientDetail clientId={selected} onBack={() => setSelected(null)} />;

  const list = clients.data || [];
  const avgScore = list.length ? Math.round(list.reduce((s, c) => s + (c.score || 0), 0) / list.length) : 0;
  const needAttention = list.filter((c) => (c.status || "") !== "On Track").length;

  return (
    <div>
      <PageHeader title="Household Queue" subtitle="Every household in your book, scored and triaged by what needs attention." />
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
        </>
      )}
    </div>
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
