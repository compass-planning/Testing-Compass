import React, { useState } from "react";
import { useQuery, useMutation, useQueryClient } from "@tanstack/react-query";
import { toast } from "sonner";
import { ShieldCheck, Download, Trash2, Clock, FileJson } from "lucide-react";
import api, { formatApiError } from "@/lib/api";
import { useAuth } from "@/context/AuthContext";
import { Card, Button, Toggle, Badge, Modal, Field, Input } from "@/components/ui-kit";
import { PageHeader } from "@/components/PageHeader";
import { dateFmt } from "@/lib/format";

const CONSENTS = [
  { key: "data_processing", label: "Data processing", desc: "Required to provide planning services." },
  { key: "crm_sharing", label: "CRM sharing", desc: "Allow syncing your data with connected CRM systems." },
  { key: "marketing", label: "Marketing communications", desc: "Occasional product updates and insights." },
];

export default function Privacy() {
  const { user, refresh } = useAuth();
  const qc = useQueryClient();
  const [erase, setErase] = useState(false);
  const [reason, setReason] = useState("");

  const consent = useQuery({ queryKey: ["consent"], queryFn: async () => (await api.get("/consent")).data });
  const retention = useQuery({ queryKey: ["retention"], queryFn: async () => (await api.get("/retention")).data });

  const setConsent = useMutation({
    mutationFn: (patch) => api.put("/consent", patch),
    onSuccess: async () => { toast.success("Consent updated"); qc.invalidateQueries({ queryKey: ["consent"] }); await refresh(); },
    onError: (e) => toast.error(formatApiError(e.response?.data?.detail)),
  });

  const eraseReq = useMutation({
    mutationFn: (r) => api.post("/erasure", { reason: r }),
    onSuccess: (res) => {
      setErase(false);
      qc.invalidateQueries({ queryKey: ["retention"] });
      if (res.data.auto_purge) toast.success(`Opt-out recorded. Hard purge scheduled ${dateFmt(res.data.purge_at)}`);
      else toast.success("Erasure request logged (controller retention applies)");
    },
    onError: (e) => toast.error(formatApiError(e.response?.data?.detail)),
  });

  const exportData = async () => {
    try {
      const { data } = await api.get("/export");
      const blob = new Blob([JSON.stringify(data, null, 2)], { type: "application/json" });
      const url = URL.createObjectURL(blob);
      const a = document.createElement("a");
      a.href = url; a.download = `compass-export-${Date.now()}.json`; a.click();
      URL.revokeObjectURL(url);
      toast.success("Your data export was downloaded");
    } catch (e) {
      toast.error("Export failed");
    }
  };

  const c = consent.data || user.consent;

  return (
    <div>
      <PageHeader title="Privacy & PIPEDA" subtitle="Manage consent, exercise your right to access and erasure, and review your retention policy." />

      <div className="grid lg:grid-cols-3 gap-6">
        <Card className="p-6 lg:col-span-2">
          <div className="flex items-center gap-2 mb-5">
            <ShieldCheck size={18} className="text-compass-green" />
            <h3 className="font-heading font-bold text-compass-navy">Consent preferences</h3>
          </div>
          <div className="space-y-3">
            {CONSENTS.map((item) => (
              <div key={item.key} className="flex items-center justify-between gap-4 rounded-xl border border-compass-border px-4 py-3.5">
                <div>
                  <div className="font-semibold text-compass-navy text-sm">{item.label}</div>
                  <div className="text-xs text-compass-muted">{item.desc}</div>
                </div>
                <Toggle checked={!!c?.[item.key]} onChange={(v) => setConsent.mutate({ [item.key]: v })} testid={`consent-${item.key}`} />
              </div>
            ))}
          </div>
          <div className="text-xs text-compass-muted mt-4">Last updated {dateFmt(c?.updated_at)}</div>
        </Card>

        <div className="space-y-6">
          <Card className="p-6">
            <div className="flex items-center gap-2 mb-4"><Clock size={18} className="text-compass-blue" /><h3 className="font-heading font-bold text-compass-navy">Retention</h3></div>
            {retention.data && (
              <div className="text-sm space-y-2">
                <div className="flex justify-between"><span className="text-compass-muted">Controller</span><span className="font-semibold text-compass-navy capitalize">{retention.data.controller}</span></div>
                <div className="flex justify-between"><span className="text-compass-muted">Policy</span><span className="font-semibold text-compass-navy text-right">{prettyPolicy(retention.data.policy)}</span></div>
                {retention.data.purge_at && <div className="flex justify-between"><span className="text-compass-muted">Purge at</span><span className="font-semibold text-compass-red">{dateFmt(retention.data.purge_at)}</span></div>}
                {retention.data.status && <Badge color="#0052FF" bg="rgba(0,82,255,0.08)">{retention.data.status}</Badge>}
              </div>
            )}
            {user.tier !== "solo" && (
              <p className="text-xs text-compass-muted mt-3">Advisor/Enterprise records follow PIPEDA controller retention — no automatic purge.</p>
            )}
          </Card>

          <Card className="p-6">
            <h3 className="font-heading font-bold text-compass-navy mb-4 flex items-center gap-2"><FileJson size={18} className="text-compass-blue" /> Your data rights</h3>
            <div className="space-y-2">
              <Button variant="outline" className="w-full justify-start" onClick={exportData} data-testid="pipeda-export-btn">
                <Download size={16} /> Export my data (JSON)
              </Button>
              <Button variant="ghost" className="w-full justify-start text-compass-red" onClick={() => setErase(true)} data-testid="pipeda-erasure-btn">
                <Trash2 size={16} /> Request erasure
              </Button>
            </div>
          </Card>
        </div>
      </div>

      <Modal open={erase} onClose={() => setErase(false)} title="Request data erasure" testid="erasure-modal">
        <p className="text-sm text-compass-muted mb-4">
          {user.tier === "solo"
            ? "As a Solo user you are the controller. Opting out schedules a hard purge of your data after 30 days."
            : "Your records are under organizational (PIPEDA controller) retention. Your request will be logged; no automatic purge applies."}
        </p>
        <Field label="Reason (optional)"><Input value={reason} onChange={(e) => setReason(e.target.value)} placeholder="Why are you requesting erasure?" data-testid="erasure-reason" /></Field>
        <div className="flex gap-2 justify-end mt-4">
          <Button variant="ghost" onClick={() => setErase(false)}>Cancel</Button>
          <Button variant="danger" onClick={() => eraseReq.mutate(reason)} disabled={eraseReq.isPending} data-testid="erasure-confirm">Confirm request</Button>
        </div>
      </Modal>
    </div>
  );
}

function prettyPolicy(p) {
  return { "30_day_purge_on_optout": "30-day purge on opt-out", "controller_retention": "Controller retention" }[p] || p;
}
