import React, { useState } from "react";
import { useQuery, useMutation, useQueryClient } from "@tanstack/react-query";
import { toast } from "sonner";
import { ShieldCheck, Clock, KeyRound } from "lucide-react";
import api, { formatApiError } from "@/lib/api";
import { useAuth } from "@/context/AuthContext";
import { PageHeader } from "@/components/PageHeader";
import { Card, Button, Badge } from "@/components/ui-kit";
import ChangePasswordModal from "@/components/ChangePasswordModal";

const OPTIONS = [5, 15, 30];

export default function SecuritySettings() {
  const { user, refresh } = useAuth();
  const qc = useQueryClient();
  const [pwOpen, setPwOpen] = useState(false);

  const q = useQuery({
    queryKey: ["security-settings"],
    queryFn: () => api.get("/auth/security-settings").then((r) => r.data),
  });
  const idle = q.data?.idle_minutes ?? 15;

  const save = useMutation({
    mutationFn: (idle_minutes) => api.put("/auth/security-settings", { idle_minutes }).then((r) => r.data),
    onSuccess: async () => {
      await qc.invalidateQueries({ queryKey: ["security-settings"] });
      await refresh();
      toast.success("Security settings saved");
    },
    onError: (e) => toast.error(formatApiError(e.response?.data?.detail)),
  });

  return (
    <div className="space-y-6" data-testid="security-page">
      <PageHeader title="Security" subtitle="Manage your sign-in protection and session settings." />

      <Card className="p-6">
        <div className="flex items-center gap-2 mb-1">
          <Clock size={18} className="text-compass-blue" />
          <h3 className="font-heading font-bold text-compass-navy">Automatic sign-out</h3>
        </div>
        <p className="text-sm text-compass-muted mb-4">
          Sign me out after this period of inactivity. You'll get a warning one minute before.
        </p>
        <div className="flex flex-wrap gap-2" data-testid="idle-options">
          {OPTIONS.map((m) => (
            <button
              key={m}
              data-testid={`idle-option-${m}`}
              disabled={save.isPending}
              onClick={() => save.mutate(m)}
              className={`rounded-xl border px-5 py-2.5 text-sm font-semibold transition-colors disabled:opacity-50 ${
                idle === m
                  ? "gradient-bg text-white border-transparent"
                  : "bg-white border-compass-border text-compass-navy hover:border-compass-blue"
              }`}
            >
              {m} minutes
            </button>
          ))}
        </div>
        <div className="text-xs text-compass-muted mt-3">
          Current: <span className="font-semibold text-compass-navy" data-testid="idle-current">{idle} minutes</span>
        </div>
      </Card>

      <Card className="p-6">
        <div className="flex items-center gap-2 mb-1">
          <KeyRound size={18} className="text-compass-blue" />
          <h3 className="font-heading font-bold text-compass-navy">Password</h3>
        </div>
        <p className="text-sm text-compass-muted mb-4">Change the password you use to sign in.</p>
        <Button variant="outline" onClick={() => setPwOpen(true)} data-testid="security-change-password">Change password</Button>
      </Card>

      <Card className="p-6">
        <div className="flex items-center gap-2 mb-1">
          <ShieldCheck size={18} className="text-compass-blue" />
          <h3 className="font-heading font-bold text-compass-navy">Two-factor authentication</h3>
        </div>
        <p className="text-sm text-compass-muted mb-4">An authenticator app code is required at every sign-in.</p>
        {user.mfa_enabled ? (
          <Badge color="#00DF89" bg="rgba(0,223,137,0.12)" data-testid="mfa-status"><ShieldCheck size={13} /> Enabled</Badge>
        ) : (
          <Badge color="#FFB800" bg="rgba(255,184,0,0.14)" data-testid="mfa-status"><ShieldCheck size={13} /> Set up at next sign-in</Badge>
        )}
      </Card>

      <ChangePasswordModal open={pwOpen} onClose={() => setPwOpen(false)} />
    </div>
  );
}
