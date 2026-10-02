import React, { useState } from "react";
import { Check, X } from "lucide-react";
import { toast } from "sonner";
import { Modal, Field, Input, Button } from "@/components/ui-kit";
import api, { formatApiError } from "@/lib/api";

const PW_RULES = [
  { key: "length", label: "At least 8 characters", test: (p) => p.length >= 8 },
  { key: "upper", label: "An uppercase letter", test: (p) => /[A-Z]/.test(p) },
  { key: "lower", label: "A lowercase letter", test: (p) => /[a-z]/.test(p) },
  { key: "number", label: "A number", test: (p) => /\d/.test(p) },
  { key: "special", label: "A symbol (!@#…)", test: (p) => /[^A-Za-z0-9]/.test(p) },
];
const STRENGTH = [
  { label: "Too weak", color: "#EE5D50", width: "20%" },
  { label: "Weak", color: "#EE5D50", width: "40%" },
  { label: "Fair", color: "#FFB800", width: "60%" },
  { label: "Good", color: "#0052FF", width: "80%" },
  { label: "Strong", color: "#00DF89", width: "100%" },
];

export default function ChangePasswordModal({ open, onClose }) {
  const [cur, setCur] = useState("");
  const [next, setNext] = useState("");
  const [confirm, setConfirm] = useState("");
  const [busy, setBusy] = useState(false);
  const [err, setErr] = useState("");

  const passed = PW_RULES.filter((r) => r.test(next));
  const lengthOk = PW_RULES[0].test(next);
  const categories = PW_RULES.slice(1).filter((r) => r.test(next)).length;
  const strong = lengthOk && categories >= 3;
  const strength = STRENGTH[strong ? Math.max(0, passed.length - 1) : Math.min(2, Math.max(0, passed.length - 1))] || STRENGTH[0];
  const match = next.length > 0 && next === confirm;
  const valid = cur.length > 0 && strong && match;

  const close = () => {
    setCur(""); setNext(""); setConfirm(""); setErr("");
    onClose();
  };

  const submit = async () => {
    setErr("");
    if (!strong) { setErr("Please choose a stronger password"); return; }
    if (next !== confirm) { setErr("New passwords do not match"); return; }
    setBusy(true);
    try {
      await api.post("/auth/change-password-self", { current_password: cur, new_password: next });
      toast.success("Password updated");
      close();
    } catch (e) {
      setErr(formatApiError(e.response?.data?.detail) || "Could not update password");
    } finally {
      setBusy(false);
    }
  };

  return (
    <Modal open={open} onClose={close} title="Change password" testid="change-password-modal">
      <div className="space-y-4">
        <Field label="Current password">
          <Input type="password" value={cur} onChange={(e) => setCur(e.target.value)}
            data-testid="cp-current" autoComplete="current-password" />
        </Field>
        <Field label="New password" hint="At least 8 characters, different from your current one">
          <Input type="password" value={next} onChange={(e) => setNext(e.target.value)}
            data-testid="cp-new" autoComplete="new-password" />
        </Field>

        {next.length > 0 && (
          <div data-testid="pw-strength">
            <div className="h-1.5 w-full rounded-full bg-compass-border overflow-hidden">
              <div className="h-full rounded-full transition-all duration-300" style={{ width: strength.width, backgroundColor: strength.color }} />
            </div>
            <div className="mt-1.5">
              <span className="text-xs font-semibold" style={{ color: strength.color }} data-testid="pw-strength-label">{strength.label}</span>
            </div>
            <ul className="mt-2 grid grid-cols-1 gap-1">
              {PW_RULES.map((r) => {
                const ok = r.test(next);
                return (
                  <li key={r.key} className={`flex items-center gap-1.5 text-xs ${ok ? "text-compass-green" : "text-compass-muted"}`} data-testid={`pw-rule-${r.key}`}>
                    {ok ? <Check size={13} /> : <X size={13} />} {r.label}
                  </li>
                );
              })}
            </ul>
          </div>
        )}

        <Field label="Confirm new password">
          <Input type="password" value={confirm} onChange={(e) => setConfirm(e.target.value)}
            data-testid="cp-confirm" autoComplete="new-password" />
        </Field>
        {confirm.length > 0 && !match && <p className="text-xs text-compass-red font-semibold -mt-2" data-testid="pw-mismatch">Passwords do not match</p>}
        {err && <div className="text-sm text-compass-red" data-testid="cp-error">{err}</div>}

        <div className="flex justify-end gap-2 pt-2">
          <Button variant="outline" onClick={close} data-testid="cp-cancel">Cancel</Button>
          <Button onClick={submit} disabled={!valid || busy} data-testid="cp-submit">
            {busy ? "Saving…" : "Update password"}
          </Button>
        </div>
      </div>
    </Modal>
  );
}
