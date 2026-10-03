import React from "react";
import { useQuery, useMutation, useQueryClient } from "@tanstack/react-query";
import { toast } from "sonner";
import { CreditCard } from "lucide-react";
import api, { formatApiError } from "@/lib/api";
import { PageHeader } from "@/components/PageHeader";
import { Card, Button, Badge } from "@/components/ui-kit";

const SUB_COLOR = { active: "#00DF89", past_due: "#EE5D50", canceled: "#A3AED0", trialing: "#0052FF" };
const INV_COLOR = { paid: "#00DF89", open: "#FFB800", void: "#A3AED0" };
const money = (v, c = "CAD") => `$${Number(v || 0).toLocaleString()} ${c}`;

export default function AdminBilling() {
  const qc = useQueryClient();
  const subsQ = useQuery({ queryKey: ["admin-subs"], queryFn: () => api.get("/admin/billing/subscriptions").then((r) => r.data) });
  const invQ = useQuery({ queryKey: ["admin-invoices"], queryFn: () => api.get("/admin/billing/invoices").then((r) => r.data) });
  const subs = subsQ.data?.subscriptions || [];
  const invoices = invQ.data?.invoices || [];
  const gw = subsQ.data?.gateway;

  const pay = useMutation({
    mutationFn: (id) => api.post(`/admin/billing/invoices/${id}/pay`).then((r) => r.data),
    onSuccess: () => { qc.invalidateQueries({ queryKey: ["admin-invoices"] }); qc.invalidateQueries({ queryKey: ["admin-subs"] }); toast.success("Payment captured (Chase mock)"); },
    onError: (e) => toast.error(formatApiError(e.response?.data?.detail)),
  });

  return (
    <div className="space-y-6" data-testid="admin-billing">
      <PageHeader title="Billing" subtitle="Subscriptions, invoices and payment status." />
      {gw && (
        <div className="flex items-center gap-2 text-sm" data-testid="billing-gateway">
          <CreditCard size={16} className="text-compass-blue" />
          <span className="text-compass-muted">Gateway:</span>
          <span className="font-semibold text-compass-navy capitalize">{gw.provider}</span>
          <Badge color="#FFB800" bg="rgba(255,184,0,0.14)">{gw.mode} mode</Badge>
        </div>
      )}

      <Card className="p-0 overflow-hidden">
        <div className="px-4 py-3 font-heading font-bold text-compass-navy border-b border-compass-border">Subscriptions</div>
        <table className="w-full text-sm">
          <thead className="bg-compass-bg text-compass-muted"><tr className="text-left">
            <th className="px-4 py-3 font-semibold">Account</th><th className="px-4 py-3 font-semibold">Plan</th>
            <th className="px-4 py-3 font-semibold">Seats</th><th className="px-4 py-3 font-semibold">Amount</th><th className="px-4 py-3 font-semibold">Status</th>
          </tr></thead>
          <tbody>
            {subs.map((s) => (
              <tr key={s.id} className="border-t border-compass-border">
                <td className="px-4 py-3 font-semibold text-compass-navy">{s.account_label}</td>
                <td className="px-4 py-3">{s.plan}</td><td className="px-4 py-3">{s.seats}</td>
                <td className="px-4 py-3">{money(s.amount, s.currency)}/mo</td>
                <td className="px-4 py-3"><Badge color={SUB_COLOR[s.status] || "#A3AED0"} bg="rgba(0,0,0,0.04)">{s.status}</Badge></td>
              </tr>
            ))}
          </tbody>
        </table>
      </Card>

      <Card className="p-0 overflow-hidden">
        <div className="px-4 py-3 font-heading font-bold text-compass-navy border-b border-compass-border">Invoices</div>
        <table className="w-full text-sm">
          <thead className="bg-compass-bg text-compass-muted"><tr className="text-left">
            <th className="px-4 py-3 font-semibold">Invoice</th><th className="px-4 py-3 font-semibold">Account</th>
            <th className="px-4 py-3 font-semibold">Amount</th><th className="px-4 py-3 font-semibold">Status</th><th className="px-4 py-3 font-semibold text-right">Action</th>
          </tr></thead>
          <tbody>
            {invoices.map((inv) => (
              <tr key={inv.id} className="border-t border-compass-border" data-testid={`invoice-row-${inv.id}`}>
                <td className="px-4 py-3 font-mono text-xs text-compass-navy">{inv.number}</td>
                <td className="px-4 py-3">{inv.account_label}</td>
                <td className="px-4 py-3">{money(inv.amount, inv.currency)}</td>
                <td className="px-4 py-3"><Badge color={INV_COLOR[inv.status] || "#A3AED0"} bg="rgba(0,0,0,0.04)">{inv.status}</Badge></td>
                <td className="px-4 py-3 text-right">
                  {inv.status === "open" && <Button size="sm" onClick={() => pay.mutate(inv.id)} data-testid={`pay-${inv.id}`}>Mark paid</Button>}
                </td>
              </tr>
            ))}
          </tbody>
        </table>
      </Card>
    </div>
  );
}
