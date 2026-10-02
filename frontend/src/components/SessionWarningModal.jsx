import React, { useEffect, useState } from "react";
import { AlertTriangle } from "lucide-react";
import { Modal, Button } from "@/components/ui-kit";

export default function SessionWarningModal({ open, seconds = 60, onStay, onLogout }) {
  const [left, setLeft] = useState(seconds);

  useEffect(() => {
    if (!open) {
      setLeft(seconds);
      return undefined;
    }
    setLeft(seconds);
    const id = setInterval(() => setLeft((s) => (s > 0 ? s - 1 : 0)), 1000);
    return () => clearInterval(id);
  }, [open, seconds]);

  return (
    <Modal open={open} onClose={onStay} title="Still there?" testid="session-warning-modal">
      <div className="space-y-5">
        <div className="flex items-start gap-3">
          <div className="h-10 w-10 rounded-xl bg-compass-red/10 flex items-center justify-center text-compass-red shrink-0">
            <AlertTriangle size={20} />
          </div>
          <p className="text-sm text-compass-navy">
            You've been inactive for a while. For your security you'll be signed out in{" "}
            <span className="font-bold text-compass-red" data-testid="session-warning-countdown">{left}s</span>.
          </p>
        </div>
        <div className="flex justify-end gap-2">
          <Button variant="outline" onClick={onLogout} data-testid="session-warning-logout">Sign out now</Button>
          <Button onClick={onStay} data-testid="session-warning-stay">Stay logged in</Button>
        </div>
      </div>
    </Modal>
  );
}
