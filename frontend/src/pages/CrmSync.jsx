import React from "react";
import { useQuery, useMutation, useQueryClient } from "@tanstack/react-query";
import { toast } from "sonner";
import { RefreshCw, Building2, CheckCircle2, ShieldOff, Database } from "lucide-react";
import api, { formatApiError } from "@/lib/api";
import { Card, Button, Badge } from "@/components/ui-kit";
import { PageHeader } from "@/components/PageHeader";
import { dateFmt } from "@/lib/format";

export default function CrmSync() {
  const qc = useQueryClient();
  const state = useQuery({ queryKey: ["crm"], queryFn: async () => (await api.get("/crm/sync-state")).data });
  const owners = useQuery({ queryKey: ["owners"], queryFn: async () => (await api.get("/owners")).data });

  const resync = useMutation({
    mutationFn: () => api.post("/crm/resync"),
    onSuccess: () => { toast.success("Re-synced from Salesforce"); qc.invalidateQueries({ queryKey: ["crm"] }); qc.invalidateQueries({ queryKey: ["owners"] }); qc.invalidateQueries({ queryKey: ["audit"] }); },
    onError: (e) => toast.error(formatApiError(e.response?.data?.detail)),
  });

  const s = state.data;

  return (
    <div>
      <PageHeader title="CRM Sync" subtitle="Salesforce is the authoritative source of truth. Compass pulls from it — deletions never propagate back.">
        <Button onClick={() => resync.mutate()} disabled={resync.isPending} data-testid="crm-resync-button">
          <RefreshCw size={16} className={resync.isPending ? "animate-spin" : ""} /> {resync.isPending ? "Syncing…" : "Manual re-sync"}
        </Button>
      </PageHeader>

      {s && (
        <div className="grid lg:grid-cols-3 gap-6">
          <Card className="p-6 lg:col-span-1">
            <div className="flex items-center gap-3 mb-5">
              <div className="h-12 w-12 rounded-xl gradient-bg flex items-center justify-center text-white"><Building2 size={24} /></div>
              <div>
                <div className="font-heading font-bold text-compass-navy">{s.connector}</div>
                <Badge color="#00DF89" bg="rgba(0,223,137,0.12)"><CheckCircle2 size={13} /> {s.status}</Badge>
              </div>
            </div>
            <dl className="space-y-3 text-sm">
              <Row label="Authoritative" value={s.authoritative ? "Yes — CRM owns lifecycle" : "No"} />
              <Row label="Last synced" value={dateFmt(s.last_synced_at)} />
              <Row label="Records synced" value={s.records_synced} />
              <Row label="Pending changes" value={s.pending_changes} />
              <Row label="Delete propagation" value={s.delete_propagation ? "Enabled" : "Disabled"} />
            </dl>
          </Card>

          <Card className="p-6 lg:col-span-2">
            <div className="flex items-center gap-2 mb-4">
              <Database size={18} className="text-compass-blue" />
              <h3 className="font-heading font-bold text-compass-navy">Synced records (corp scope)</h3>
            </div>
            <div className="space-y-2">
              {(owners.data || []).map((o) => (
                <div key={o.id} className="flex items-center gap-3 rounded-xl border border-compass-border px-4 py-3">
                  <span className="font-semibold text-compass-navy flex-1">{o.full_name}</span>
                  <Badge color="#A3AED0" bg="rgba(163,174,208,0.15)">{o.crm_record_id || "—"}</Badge>
                  <Badge color="#0052FF" bg="rgba(0,82,255,0.08)">{o.province}</Badge>
                </div>
              ))}
            </div>
            <div className="mt-5 flex items-start gap-3 rounded-xl bg-compass-bg p-4">
              <ShieldOff size={18} className="text-compass-navy shrink-0 mt-0.5" />
              <p className="text-xs text-compass-navy">
                <span className="font-semibold">No orphaned PII:</span> records removed in Compass are never deleted from
                Salesforce. The CRM governs record lifecycle to prevent accidental data loss.
              </p>
            </div>
          </Card>
        </div>
      )}
    </div>
  );
}

function Row({ label, value }) {
  return (
    <div className="flex items-center justify-between">
      <dt className="text-compass-muted">{label}</dt>
      <dd className="font-semibold text-compass-navy">{String(value)}</dd>
    </div>
  );
}
