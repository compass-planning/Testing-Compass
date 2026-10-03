import React from "react";
import { useQuery } from "@tanstack/react-query";
import { Link } from "react-router-dom";
import { Megaphone, AlertTriangle, CreditCard } from "lucide-react";
import api from "@/lib/api";

export default function NoticeBanner() {
  const { data } = useQuery({
    queryKey: ["notices"],
    queryFn: () => api.get("/notices").then((r) => r.data),
    refetchInterval: 60000,
  });
  const anns = data?.announcements || [];
  const outages = data?.outages || [];
  const due = data?.billing_due;
  if (!anns.length && !outages.length && !due) return null;
  return (
    <div className="space-y-2 mb-5" data-testid="notice-banner">
      {due && (
        <Link to="/billing" className="flex items-center justify-between gap-2 rounded-xl border border-compass-red/40 bg-compass-red/10 px-4 py-2.5 text-sm text-compass-navy hover:bg-compass-red/15 transition-colors" data-testid="billing-due-banner">
          <span className="flex items-center gap-2"><CreditCard size={16} className="text-compass-red shrink-0" />
            <span><span className="font-bold">Payment due</span> — ${Number(due.amount || 0).toLocaleString()} {due.currency}{due.past_due ? " (past due)" : ""}</span>
          </span>
          <span className="font-semibold text-compass-red">Pay now →</span>
        </Link>
      )}
      {outages.map((o) => (
        <div key={o.id} className="flex items-start gap-2 rounded-xl border border-compass-amber/40 bg-compass-amber/10 px-4 py-2.5 text-sm text-compass-navy">
          <AlertTriangle size={16} className="text-compass-amber mt-0.5 shrink-0" />
          <div><span className="font-bold">{o.title}</span>{o.body ? ` — ${o.body}` : ""}</div>
        </div>
      ))}
      {anns.map((a) => (
        <div key={a.id} className="flex items-start gap-2 rounded-xl border border-compass-blue/30 bg-compass-blue/5 px-4 py-2.5 text-sm text-compass-navy">
          <Megaphone size={16} className="text-compass-blue mt-0.5 shrink-0" />
          <div><span className="font-bold">{a.title}</span>{a.body ? ` — ${a.body}` : ""}</div>
        </div>
      ))}
    </div>
  );
}
