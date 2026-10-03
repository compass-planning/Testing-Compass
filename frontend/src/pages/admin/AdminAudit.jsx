import React, { useState } from "react";
import { useQuery } from "@tanstack/react-query";
import { toast } from "sonner";
import { Download } from "lucide-react";
import api from "@/lib/api";
import { PageHeader } from "@/components/PageHeader";
import { Card, Badge, Button, Input, Select } from "@/components/ui-kit";

const LABEL = {
  "admin.suspend": "Account suspended", "admin.reactivate": "Account reactivated",
  "admin.invoice.pay": "Invoice paid", "admin.invoice.refund": "Invoice refunded",
  "admin.announcement.create": "Announcement posted", "admin.ticket.create": "Ticket created",
  "admin.ticket.reply": "Ticket reply", "admin.status.create": "Status posted", "admin.sub.create": "Subscription created",
};
const COLOR = (a) => (a.includes("refund") || a.includes("suspend") ? "#EE5D50" : a.includes("pay") ? "#00DF89" : "#0052FF");

export default function AdminAudit() {
  const [from, setFrom] = useState("");
  const [to, setTo] = useState("");
  const [action, setAction] = useState("");
  const [busy, setBusy] = useState(false);
  const params = { from: from || undefined, to: to || undefined, action: action || undefined };
  const { data } = useQuery({ queryKey: ["admin-audit", from, to, action], queryFn: () => api.get("/admin/audit", { params }).then((r) => r.data) });
  const entries = data?.entries || [];
  const actions = data?.actions || [];

  const exportFile = async (format) => {
    setBusy(true);
    try {
      const res = await api.get("/admin/audit/export", { params: { ...params, format }, responseType: "blob" });
      const url = URL.createObjectURL(res.data);
      const a = document.createElement("a");
      a.href = url; a.download = `audit_trail.${format}`; document.body.appendChild(a); a.click();
      a.remove(); URL.revokeObjectURL(url);
    } catch (e) { toast.error("Export failed"); } finally { setBusy(false); }
  };

  return (
    <div className="space-y-6" data-testid="admin-audit">
      <PageHeader title="Audit Trail" subtitle="Every admin action, for compliance." />
      <Card className="p-4 flex flex-wrap items-end gap-3">
        <div><div className="muted-label mb-1">From</div><Input type="date" value={from} onChange={(e) => setFrom(e.target.value)} data-testid="audit-from" /></div>
        <div><div className="muted-label mb-1">To</div><Input type="date" value={to} onChange={(e) => setTo(e.target.value)} data-testid="audit-to" /></div>
        <div><div className="muted-label mb-1">Action</div>
          <Select value={action} onChange={(e) => setAction(e.target.value)} className="max-w-[220px]" data-testid="audit-action">
            <option value="">All actions</option>
            {actions.map((a) => <option key={a} value={a}>{LABEL[a] || a}</option>)}
          </Select>
        </div>
        <div className="flex gap-2 ml-auto">
          <Button variant="outline" onClick={() => exportFile("csv")} disabled={busy} data-testid="export-csv"><Download size={15} /> CSV</Button>
          <Button onClick={() => exportFile("pdf")} disabled={busy} data-testid="export-pdf"><Download size={15} /> PDF</Button>
        </div>
      </Card>
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
            {!entries.length && <tr><td colSpan={4} className="px-4 py-8 text-center text-compass-muted">No admin actions match these filters.</td></tr>}
          </tbody>
        </table>
      </Card>
    </div>
  );
}
