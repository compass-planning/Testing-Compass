import React, { useState } from "react";
import { useNavigate } from "react-router-dom";
import { useQuery } from "@tanstack/react-query";
import { Users, ArrowLeft, Landmark, Target } from "lucide-react";
import api from "@/lib/api";
import { useHousehold } from "@/context/HouseholdContext";
import { Card, Button, Badge, Progress, Empty } from "@/components/ui-kit";
import { PageHeader } from "@/components/PageHeader";
import { money, STATUS_META } from "@/lib/format";

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

  return (
    <div>
      <PageHeader title="Client Roster" subtitle="Every household in your book. Select one to drill into owners, accounts and goals." />
      {clients.isLoading ? (
        <div className="text-compass-muted">Loading…</div>
      ) : (clients.data || []).length === 0 ? (
        <Empty icon={Users} title="No clients yet">Onboard a household to get started.</Empty>
      ) : (
        <Card className="overflow-hidden">
          <table className="w-full text-sm">
            <thead>
              <tr className="text-left border-b border-compass-border">
                <th className="muted-label px-6 py-4">Household</th>
                <th className="muted-label px-6 py-4 hidden sm:table-cell">Members</th>
                <th className="muted-label px-6 py-4 text-right">Assets</th>
                <th className="muted-label px-6 py-4 text-center hidden sm:table-cell">Goals</th>
                <th className="px-6 py-4"></th>
              </tr>
            </thead>
            <tbody>
              {clients.data.map((c) => (
                <tr key={c.client_id} className="border-b border-compass-border last:border-0 hover:bg-compass-bg/50 transition-colors" data-testid={`client-row-${c.client_id}`}>
                  <td className="px-6 py-4">
                    <div className="flex items-center gap-3">
                      <div className="h-9 w-9 rounded-lg gradient-bg flex items-center justify-center text-white font-bold text-sm">
                        {(c.primary || "H").slice(0, 1)}
                      </div>
                      <span className="font-semibold text-compass-navy">{c.primary || c.client_id}</span>
                    </div>
                  </td>
                  <td className="px-6 py-4 text-compass-muted hidden sm:table-cell">{c.members.join(", ")}</td>
                  <td className="px-6 py-4 text-right font-heading font-bold text-compass-navy">{money(c.assets)}</td>
                  <td className="px-6 py-4 text-center hidden sm:table-cell"><Badge>{c.goals}</Badge></td>
                  <td className="px-6 py-4 text-right">
                    <Button size="sm" variant="outline" onClick={() => openClient(c)} data-testid={`open-client-${c.client_id}`}>Open</Button>
                  </td>
                </tr>
              ))}
            </tbody>
          </table>
        </Card>
      )}
    </div>
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
