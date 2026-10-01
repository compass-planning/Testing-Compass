import React, { useState } from "react";
import { useNavigate, useSearchParams } from "react-router-dom";
import { KeyRound, ArrowRight, Check, X } from "lucide-react";
import { toast } from "sonner";
import api, { formatApiError } from "@/lib/api";
import { Button, Input, Field } from "@/components/ui-kit";
import { Logo } from "@/components/Logo";

const RULES = [
  { key: "length", label: "At least 8 characters", test: (p) => p.length >= 8 },
  { key: "upper", label: "An uppercase letter", test: (p) => /[A-Z]/.test(p) },
  { key: "lower", label: "A lowercase letter", test: (p) => /[a-z]/.test(p) },
  { key: "number", label: "A number", test: (p) => /\d/.test(p) },
  { key: "special", label: "A symbol (!@#…)", test: (p) => /[^A-Za-z0-9]/.test(p) },
];

export default function Activate() {
  const [params] = useSearchParams();
  const token = params.get("token") || "";
  const nav = useNavigate();
  const [pw, setPw] = useState("");
  const [confirm, setConfirm] = useState("");
  const [loading, setLoading] = useState(false);

  const lengthOk = RULES[0].test(pw);
  const categories = RULES.slice(1).filter((r) => r.test(pw)).length;
  const strong = lengthOk && categories >= 3;
  const match = pw.length > 0 && pw === confirm;

  const submit = async (e) => {
    e.preventDefault();
    if (!strong) { toast.error("Please choose a stronger password"); return; }
    if (!match) { toast.error("Passwords do not match"); return; }
    setLoading(true);
    try {
      await api.post("/auth/activate", { token, new_password: pw });
      toast.success("Account activated — please sign in");
      nav("/login", { replace: true });
    } catch (e) { toast.error(formatApiError(e.response?.data?.detail)); } finally { setLoading(false); }
  };

  return (
    <div className="min-h-screen bg-compass-bg flex items-center justify-center px-4">
      <div className="w-full max-w-md bg-white rounded-2xl border border-compass-border p-8 shadow-sm" data-testid="activate-card">
        <div className="mb-6"><Logo /></div>
        {!token ? (
          <p className="text-sm text-compass-red font-semibold" data-testid="activate-no-token">This activation link is invalid. Please ask your advisor to resend it.</p>
        ) : (
          <>
            <div className="h-11 w-11 rounded-xl gradient-bg flex items-center justify-center text-white mb-4"><KeyRound size={22} /></div>
            <h1 className="font-heading text-2xl font-extrabold text-compass-navy">Activate your account</h1>
            <p className="text-sm text-compass-muted mt-1 mb-4">Choose a password to finish setting up your plan access.</p>
            <form onSubmit={submit} className="space-y-4" data-testid="activate-form">
              <Field label="New password"><Input type="password" required value={pw} onChange={(e) => setPw(e.target.value)} placeholder="At least 8 characters" data-testid="activate-password" /></Field>
              {pw.length > 0 && (
                <ul className="grid grid-cols-1 gap-1" data-testid="activate-rules">
                  {RULES.map((r) => {
                    const ok = r.test(pw);
                    return <li key={r.key} className={`flex items-center gap-1.5 text-xs ${ok ? "text-compass-green" : "text-compass-muted"}`}>{ok ? <Check size={13} /> : <X size={13} />} {r.label}</li>;
                  })}
                </ul>
              )}
              <Field label="Confirm password"><Input type="password" required value={confirm} onChange={(e) => setConfirm(e.target.value)} placeholder="Re-enter password" data-testid="activate-confirm" /></Field>
              {confirm.length > 0 && !match && <p className="text-xs text-compass-red font-semibold -mt-2">Passwords do not match</p>}
              <Button type="submit" className="w-full" disabled={loading || !strong || !match} data-testid="activate-submit">{loading ? "Activating…" : "Activate & continue"} <ArrowRight size={16} /></Button>
            </form>
          </>
        )}
      </div>
    </div>
  );
}
