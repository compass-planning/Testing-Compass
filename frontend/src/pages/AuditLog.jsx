import React from "react";
import { useQuery } from "@tanstack/react-query";
import { ScrollText, LogIn, RefreshCw, ShieldCheck, UserPlus, Trash2, Pencil, ArrowUpCircle, FileDown } from "lucide-react";
import api from "@/lib/api";
import { Card, Badge, Empty } from "@/components/ui-kit";
import { PageHeader } from "@/components/PageHeader";
import { dateFmt } from "@/lib/format";

const ICONS = {
  "auth.login": LogIn, "auth.register": UserPlus, "crm.sync": RefreshCw,
  "consent.update": ShieldCheck, "pipeda.export": FileDown, "pipeda.erasure": Trash2,
  "owner.create": UserPlus, "owner.update": Pencil, "owner.delete": Trash2,
  "goal.create": UserPlus, "goal.progress": Pencil, "goal.update": Pencil, "goal.delete": Trash2,
  "account.create": UserPlus, "account.delete": Trash2,
  "promotion.migrate": ArrowUpCircle, "promotion.receive": ArrowUpCircle, "client.create": UserPlus,
};

export default function AuditLog() {
  const { data, isLoading } = useQuery({ queryKey: ["audit"], queryFn: async () => (await api.get("/audit-log")).data });

  return (
    <div>
      <PageHeader title="Audit Log" subtitle="Append-only record of activity within your tenant scope. Foundation for PIPEDA breach/audit reporting." />
      {isLoading ? (
        <div className="text-compass-muted">Loading…</div>
      ) : (data || []).length === 0 ? (
        <Empty icon={ScrollText} title="No activity yet" />
      ) : (
        <Card className="p-2">
          <div className="divide-y divide-compass-border">
            {data.map((e) => {
              const Icon = ICONS[e.action] || ScrollText;
              return (
                <div key={e.id} className="flex items-start gap-4 px-4 py-4" data-testid={`audit-${e.id}`}>
                  <div className="h-9 w-9 rounded-xl bg-compass-bg flex items-center justify-center text-compass-blue shrink-0">
                    <Icon size={16} />
                  </div>
                  <div className="flex-1 min-w-0">
                    <div className="flex items-center gap-2 flex-wrap">
                      <Badge color="#0052FF" bg="rgba(0,82,255,0.08)">{e.action}</Badge>
                      <span className="text-sm font-semibold text-compass-navy">{e.resource}</span>
                    </div>
                    {e.detail && <div className="text-sm text-compass-muted mt-1 break-words">{e.detail}</div>}
                    <div className="text-xs text-compass-muted mt-1">{e.actor_email} · {dateFmt(e.timestamp)}</div>
                  </div>
                </div>
              );
            })}
          </div>
        </Card>
      )}
    </div>
  );
}
