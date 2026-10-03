import React, { useEffect, useState } from "react";
import { useQuery, useMutation, useQueryClient } from "@tanstack/react-query";
import { toast } from "sonner";
import { CreditCard, Minus, Plus, Check } from "lucide-react";
import api, { formatApiError } from "@/lib/api";
import { PageHeader } from "@/components/PageHeader";
import { Card, Button, Input, Select, Badge, Modal } from "@/components/ui-kit";

const SUB_COLOR = { active: "#00DF89", past_due: "#EE5D50", canceled: "#A3AED0", trialing: "#0052FF" };

export default function BillingSelfService() {
  const qc = useQueryClient();
  const { data, isLoading } = useQuery({ queryKey: ["my-sub"], queryFn: () => api.get("/me/subscription").then((r) => r.data) });
  const sub = data?.subscription;
  const catalog = data?.features_catalog || [];
  const seatPrice = data?.seat_price || 0;
  const seatsEditable = data?.seats_editable;
  const plansQ = useQuery({ queryKey: ["my-plans"], queryFn: () => api.get("/me/plans").then((r) => r.data) });
  const [changeTier, setChangeTier] = useState(null);
  const [preview, setPreview] = useState(null);

  const [seats, setSeats] = useState(1);
  const [features, setFeatures] = useState([]);
  const [card, setCard] = useState({ card_name: "", card_brand: "Visa", card_last4: "", billing_email: "" });

  useEffect(() => {
    if (sub) {
      setSeats(sub.seats || 1);
      setFeatures(sub.features || []);
      const bi = sub.billing_info || {};
      setCard({ card_name: bi.card_name || "", card_brand: bi.card_brand || "Visa", card_last4: "", billing_email: bi.billing_email || "" });
    }
  }, [sub]);

  const savePlan = useMutation({
    mutationFn: () => api.put("/me/subscription", seatsEditable ? { seats, features } : { features }).then((r) => r.data),
    onSuccess: () => { qc.invalidateQueries({ queryKey: ["my-sub"] }); toast.success("Plan updated"); },
    onError: (e) => toast.error(formatApiError(e.response?.data?.detail)),
  });
  const saveCard = useMutation({
    mutationFn: () => api.put("/me/billing", card).then((r) => r.data),
    onSuccess: () => { qc.invalidateQueries({ queryKey: ["my-sub"] }); toast.success("Billing info saved"); setCard((c) => ({ ...c, card_last4: "" })); },
    onError: (e) => toast.error(formatApiError(e.response?.data?.detail)),
  });
  const payInvoice = useMutation({
    mutationFn: (id) => api.post(`/me/invoices/${id}/pay`).then((r) => r.data),
    onSuccess: () => { qc.invalidateQueries({ queryKey: ["my-sub"] }); qc.invalidateQueries({ queryKey: ["notices"] }); toast.success("Payment received — thank you"); },
    onError: (e) => toast.error(formatApiError(e.response?.data?.detail)),
  });
  const openInvoices = data?.open_invoices || [];

  const openChange = async (tier) => {
    try { const { data: pr } = await api.post("/me/subscription/preview-change", { tier }); setPreview(pr); setChangeTier(tier); }
    catch (e) { toast.error(formatApiError(e.response?.data?.detail)); }
  };
  const confirmChange = useMutation({
    mutationFn: () => api.post("/me/subscription/change", { tier: changeTier }).then((r) => r.data),
    onSuccess: () => { qc.invalidateQueries({ queryKey: ["my-sub"] }); qc.invalidateQueries({ queryKey: ["my-plans"] }); setChangeTier(null); setPreview(null); toast.success("Plan changed"); },
    onError: (e) => toast.error(formatApiError(e.response?.data?.detail)),
  });

  const toggle = (k) => setFeatures((f) => (f.includes(k) ? f.filter((x) => x !== k) : [...f, k]));

  if (isLoading) return <div className="text-compass-muted">Loading…</div>;
  if (!sub) {
    return (
      <div className="space-y-6" data-testid="billing-self">
        <PageHeader title="Plan & Billing" subtitle="Your subscription and payment details." />
        <Card className="p-6 text-sm text-compass-muted" data-testid="no-subscription">Your plan is managed by your administrator. Contact them for billing changes.</Card>
      </div>
    );
  }

  return (
    <div className="space-y-6" data-testid="billing-self">
      <PageHeader title="Plan & Billing" subtitle="Manage your plan, seats, features and payment method." />

      {openInvoices.length > 0 && (
        <Card className="p-6 border-compass-red/40 bg-compass-red/5" data-testid="outstanding-invoices">
          <h3 className="font-heading font-bold text-compass-navy mb-3">Outstanding invoices</h3>
          <div className="space-y-2">
            {openInvoices.map((inv) => (
              <div key={inv.id} className="flex items-center justify-between gap-3 text-sm" data-testid={`open-invoice-${inv.id}`}>
                <span className="font-mono text-xs text-compass-navy">{inv.number}</span>
                <span className="text-compass-navy">${Number(inv.amount || 0).toLocaleString()} {inv.currency}</span>
                <Button size="sm" onClick={() => payInvoice.mutate(inv.id)} disabled={payInvoice.isPending} data-testid={`pay-now-${inv.id}`}>Pay now</Button>
              </div>
            ))}
          </div>
        </Card>
      )}

      <Card className="p-6">
        <div className="flex items-center justify-between">
          <div>
            <div className="text-xs text-compass-muted uppercase tracking-wide">Current plan</div>
            <div className="font-heading text-xl font-extrabold text-compass-navy">{sub.plan}</div>
          </div>
          <Badge color={SUB_COLOR[sub.status] || "#A3AED0"} bg="rgba(0,0,0,0.04)" data-testid="my-sub-status">{sub.status}</Badge>
        </div>
      </Card>

      <Card className="p-6 space-y-4" data-testid="change-plan">
        <h3 className="font-heading font-bold text-compass-navy">Change plan</h3>
        <div className="grid sm:grid-cols-3 gap-3">
          {(plansQ.data?.plans || []).map((p) => (
            <div key={p.tier} className={`rounded-xl border p-4 ${p.current ? "border-compass-blue bg-compass-blue/5" : "border-compass-border"}`} data-testid={`plan-${p.tier}`}>
              <div className="font-heading font-bold text-compass-navy">{p.label}</div>
              <div className="text-sm text-compass-muted">${p.price.toLocaleString()}/mo · {p.seats} seat{p.seats > 1 ? "s" : ""}</div>
              <div className="mt-3">
                {p.current
                  ? <Badge color="#0052FF" bg="rgba(0,82,255,0.1)">Current plan</Badge>
                  : <Button size="sm" variant="outline" onClick={() => openChange(p.tier)} data-testid={`switch-${p.tier}`}>Switch to {p.label}</Button>}
              </div>
            </div>
          ))}
        </div>
      </Card>

      <Card className="p-6 space-y-5">
        <h3 className="font-heading font-bold text-compass-navy">Seats</h3>
        {seatsEditable ? (
          <div className="flex items-center gap-4">
            <div className="flex items-center gap-2">
              <Button size="sm" variant="outline" onClick={() => setSeats((s) => Math.max(1, s - 1))} data-testid="seats-dec"><Minus size={15} /></Button>
              <span className="w-10 text-center font-bold text-compass-navy" data-testid="seats-count">{seats}</span>
              <Button size="sm" variant="outline" onClick={() => setSeats((s) => s + 1)} data-testid="seats-inc"><Plus size={15} /></Button>
            </div>
            <div className="text-sm text-compass-muted">× ${seatPrice}/seat = <span className="font-bold text-compass-navy" data-testid="seats-total">${(seats * seatPrice).toLocaleString()}/mo</span></div>
          </div>
        ) : (
          <div className="text-sm text-compass-muted">Your plan includes {sub.seats} seat{sub.seats > 1 ? "s" : ""} (fixed).</div>
        )}
      </Card>

      <Card className="p-6 space-y-4">
        <h3 className="font-heading font-bold text-compass-navy">Features</h3>
        <div className="grid sm:grid-cols-2 gap-2">
          {catalog.map((f) => {
            const on = features.includes(f.key);
            return (
              <button key={f.key} onClick={() => toggle(f.key)} data-testid={`feature-${f.key}`}
                className={`flex items-center justify-between rounded-xl border px-4 py-3 text-sm font-semibold transition-colors ${on ? "border-compass-green bg-compass-green/5 text-compass-navy" : "border-compass-border text-compass-muted hover:border-compass-blue"}`}>
                {f.label}
                <span className={`h-5 w-5 rounded-full flex items-center justify-center ${on ? "bg-compass-green text-white" : "bg-compass-bg"}`}>{on && <Check size={13} />}</span>
              </button>
            );
          })}
        </div>
        <Button onClick={() => savePlan.mutate()} disabled={savePlan.isPending} data-testid="save-plan">Save plan</Button>
      </Card>

      <Card className="p-6 space-y-4">
        <div className="flex items-center gap-2"><CreditCard size={18} className="text-compass-blue" /><h3 className="font-heading font-bold text-compass-navy">Payment method</h3></div>
        {sub.billing_info?.card_last4 && <div className="text-sm text-compass-muted" data-testid="current-card">On file: {sub.billing_info.card_brand} ending {sub.billing_info.card_last4}</div>}
        <div className="grid sm:grid-cols-2 gap-3">
          <Input placeholder="Name on card" value={card.card_name} onChange={(e) => setCard({ ...card, card_name: e.target.value })} data-testid="card-name" />
          <Select value={card.card_brand} onChange={(e) => setCard({ ...card, card_brand: e.target.value })} data-testid="card-brand">
            <option>Visa</option><option>Mastercard</option><option>Amex</option>
          </Select>
          <Input placeholder="Card number" value={card.card_last4} onChange={(e) => setCard({ ...card, card_last4: e.target.value.replace(/\D/g, "") })} data-testid="card-number" />
          <Input placeholder="Billing email" value={card.billing_email} onChange={(e) => setCard({ ...card, billing_email: e.target.value })} data-testid="card-email" />
        </div>
        <p className="text-xs text-compass-muted">Processed via Chase Payment Solutions (test mode). Only the last 4 digits are stored.</p>
        <Button onClick={() => (card.card_name && card.card_last4.length >= 4 ? saveCard.mutate() : toast.error("Enter card name and number"))} disabled={saveCard.isPending} data-testid="save-card">Save payment method</Button>
      </Card>

      <Modal open={!!changeTier} onClose={() => { setChangeTier(null); setPreview(null); }} title="Confirm plan change" testid="proration-modal">
        {preview && (
          <div className="space-y-3 text-sm">
            <div className="flex justify-between"><span className="text-compass-muted">New plan</span><span className="font-semibold text-compass-navy">{preview.new_plan} · ${preview.new_amount.toLocaleString()}/mo</span></div>
            <div className="flex justify-between"><span className="text-compass-muted">Days left in cycle</span><span>{preview.days_remaining}</span></div>
            <div className="flex justify-between"><span className="text-compass-muted">Credit (unused)</span><span className="text-compass-green">−${preview.credit.toLocaleString()}</span></div>
            <div className="flex justify-between"><span className="text-compass-muted">Prorated charge</span><span>${preview.charge.toLocaleString()}</span></div>
            <div className="flex justify-between border-t border-compass-border pt-2 font-bold text-compass-navy"><span>Due today</span><span data-testid="net-due">${preview.net_due > 0 ? preview.net_due.toLocaleString() : "0.00"} {preview.currency}</span></div>
            {preview.net_due <= 0 && <div className="text-xs text-compass-muted">This is a downgrade — the credit is applied to your next invoice.</div>}
            <div className="flex justify-end gap-2 pt-2">
              <Button variant="outline" onClick={() => { setChangeTier(null); setPreview(null); }} data-testid="proration-cancel">Cancel</Button>
              <Button onClick={() => confirmChange.mutate()} disabled={confirmChange.isPending} data-testid="proration-confirm">Confirm change</Button>
            </div>
          </div>
        )}
      </Modal>
    </div>
  );
}
