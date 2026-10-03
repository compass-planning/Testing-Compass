import React from "react";
import { useQuery } from "@tanstack/react-query";
import api from "@/lib/api";
import { PageHeader } from "@/components/PageHeader";
import { Card, Badge } from "@/components/ui-kit";

const LABEL = {
  "admin.suspend": "Account suspended", "admin.reactivate": "Account reactivated",
  "admin.invoice.pay": "Invoice paid", "admin.invoice.refund": "Invoice refunded",
  "admin.announcement.create": "Announcement posted", "admin.ticket.create": "Ticket created",
  "admin.status.create": "Status posted", "admin.sub.create": "Subscription created",
};
const COLOR = (a) => (a.includes("refund") || a.includes("suspend") ? "#EE5D50" : a.includes("pay") ? "#00DF89" : "#0052FF");

export default function AdminAudit() {
  const { data } = useQuery({ queryKey: ["admin-audit"], queryFn: () => api.get("/admin/audit").then((r) => r.data) });
  const entries = data?.entries || [];
  return (
    <div className="space-y-6" data-testid="admin-audit">
      <PageHeader title="Audit Trail" subtitle="Every admin action, for compliance." />
      <Card className="p-0 overflow-hidden">
        <table className="w-full text-sm">
          <thead className="bg-compass-bg text-compass-muted"><tr className="text-left">
            <th className="px-4 py-3 font-semibold">When</th><th className="px-4 py-3 font-semibold">Admin</th>
            <th className="px-4 py-3 font-semibold">Action</th><th className="px-4 py-3 font-semibold">Detail</th>
          </tr></thead>
          <tbody>
            {entries.map((e) => (
              <tr key={e.id} className="border-t border-compass-border" data-testid={`audit-row-${e.id}`}>
                <td className="px-4 py-3 text-compass-muted whitespace-nowrap">{new Date(e.timestamp).toLocaleString()}</td>
                <td className="px-4 py-3 text-compass-navy">{e.actor_email}</td>
                <td className="px-4 py-3"><Badge color={COLOR(e.action)} bg="rgba(0,0,0,0.04)">{LABEL[e.action] || e.action}</Badge></td>
                <td className="px-4 py-3 text-compass-muted">{e.detail}</td>
              </tr>
            ))}
            {!entries.length && <tr><td colSpan={4} className="px-4 py-8 text-center text-compass-muted">No admin actions logged yet.</td></tr>}
          </tbody>
        </table>
      </Card>
    </div>
  );
}
