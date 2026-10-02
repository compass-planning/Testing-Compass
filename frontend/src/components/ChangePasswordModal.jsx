import React, { useState } from "react";
import { toast } from "sonner";
import { Modal, Field, Input, Button } from "@/components/ui-kit";
import api, { formatApiError } from "@/lib/api";

export default function ChangePasswordModal({ open, onClose }) {
  const [cur, setCur] = useState("");
  const [next, setNext] = useState("");
  const [confirm, setConfirm] = useState("");
  const [busy, setBusy] = useState(false);
  const [err, setErr] = useState("");

  const close = () => {
    setCur(""); setNext(""); setConfirm(""); setErr("");
    onClose();
  };

  const valid = cur.length > 0 && next.length >= 8 && next === confirm;

  const submit = async () => {
    setErr("");
    if (next !== confirm) { setErr("New passwords do not match"); return; }
    if (next.length < 8) { setErr("New password must be at least 8 characters"); return; }
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
        <Field label="Confirm new password">
          <Input type="password" value={confirm} onChange={(e) => setConfirm(e.target.value)}
            data-testid="cp-confirm" autoComplete="new-password" />
        </Field>
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
