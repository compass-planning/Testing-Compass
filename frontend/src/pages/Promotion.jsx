import React, { useState } from "react";
import { useMutation } from "@tanstack/react-query";
import { toast } from "sonner";
import { ArrowUpCircle, CheckCircle2, ShieldCheck, UserCog, ArrowRight } from "lucide-react";
import api, { formatApiError } from "@/lib/api";
import { useAuth } from "@/context/AuthContext";
import { Card, Button, Input, Field, Toggle, Badge } from "@/components/ui-kit";
import { PageHeader } from "@/components/PageHeader";

export default function Promotion() {
  const { refresh } = useAuth();
  const [advisorEmail, setAdvisorEmail] = useState("advisor@compass.ca");
  const [c1, setC1] = useState(false);
  const [c2, setC2] = useState(false);
  const [result, setResult] = useState(null);

  const promote = useMutation({
    mutationFn: () => api.post("/promotion/request", { target_tier: "advisor", advisor_email: advisorEmail, consent_data_sharing: c1, consent_reconfirmed: c2 }),
    onSuccess: async (res) => { setResult(res.data); toast.success("Household migrated to advisor"); await refresh(); },
    onError: (e) => toast.error(formatApiError(e.response?.data?.detail)),
  });

  if (result) {
    return (
      <div>
        <PageHeader title="Work with an Advisor" />
        <Card className="p-8 max-w-xl">
          <CheckCircle2 size={44} className="text-compass-green mb-4" />
          <h3 className="font-heading text-xl font-bold text-compass-navy">Migration complete</h3>
          <p className="text-sm text-compass-muted mt-2">
            Your household was securely migrated with an audited cross-store transfer to <span className="font-semibold text-compass-navy">{result.advisor}</span>.
            Consent was explicitly re-captured before any data moved.
          </p>
          <div className="grid grid-cols-3 gap-3 mt-6">
            {Object.entries(result.migrated).map(([k, v]) => (
              <div key={k} className="rounded-xl bg-compass-bg p-4 text-center">
                <div className="font-heading text-2xl font-extrabold gradient-text">{v}</div>
                <div className="text-xs text-compass-muted capitalize">{k}</div>
              </div>
            ))}
          </div>
          <div className="text-xs text-compass-muted mt-4">New advisor client id: <span className="font-mono">{result.new_client_id}</span></div>
        </Card>
      </div>
    );
  }

  const ready = c1 && c2 && advisorEmail;

  return (
    <div>
      <PageHeader title="Work with an Advisor" subtitle="Promote your Solo plan to an advisor-managed household. Your explicit consent is re-captured and the migration is fully audited." />

      <div className="grid lg:grid-cols-3 gap-6">
        <Card className="p-6 lg:col-span-2 space-y-5">
          <div className="flex items-center gap-3">
            <div className="h-11 w-11 rounded-xl gradient-bg flex items-center justify-center text-white"><UserCog size={22} /></div>
            <div>
              <h3 className="font-heading font-bold text-compass-navy">Select an advisor</h3>
              <p className="text-sm text-compass-muted">Your data will be shared with this advisor's firm.</p>
            </div>
          </div>
          <Field label="Advisor email">
            <Input value={advisorEmail} onChange={(e) => setAdvisorEmail(e.target.value)} data-testid="promotion-advisor-email" />
          </Field>

          <div className="space-y-3 pt-2">
            <div className="flex items-start gap-3 rounded-xl bg-compass-bg p-4">
              <Toggle checked={c1} onChange={setC1} testid="promotion-consent-sharing" />
              <div className="text-sm text-compass-navy">
                <span className="font-semibold">Data-sharing agreement.</span> I consent to sharing my household, accounts and goals with the selected advisor's organization.
              </div>
            </div>
            <div className="flex items-start gap-3 rounded-xl bg-compass-bg p-4">
              <Toggle checked={c2} onChange={setC2} testid="promotion-consent-reconfirm" />
              <div className="text-sm text-compass-navy">
                <span className="font-semibold">PIPEDA consent re-capture.</span> I understand my data will be migrated across stores and re-scoped under advisor governance.
              </div>
            </div>
          </div>

          <Button disabled={!ready || promote.isPending} onClick={() => promote.mutate()} data-testid="promotion-submit">
            {promote.isPending ? "Migrating…" : "Migrate my plan"} <ArrowRight size={16} />
          </Button>
        </Card>

        <Card className="p-6">
          <ShieldCheck size={22} className="text-compass-green mb-3" />
          <h3 className="font-heading font-bold text-compass-navy">What happens</h3>
          <ul className="text-sm text-compass-muted mt-3 space-y-2.5">
            <li className="flex gap-2"><ArrowUpCircle size={16} className="text-compass-blue shrink-0 mt-0.5" /> Consent is re-captured before any data moves.</li>
            <li className="flex gap-2"><ArrowUpCircle size={16} className="text-compass-blue shrink-0 mt-0.5" /> Owners, accounts and goals are copied under advisor scope.</li>
            <li className="flex gap-2"><ArrowUpCircle size={16} className="text-compass-blue shrink-0 mt-0.5" /> Every step is written to the append-only audit log.</li>
          </ul>
          <div className="mt-4"><Badge color="#00DF89" bg="rgba(0,223,137,0.12)">Solo is never advisor-linked until you opt in</Badge></div>
        </Card>
      </div>
    </div>
  );
}
