import React, { useState } from "react";
import { useQuery } from "@tanstack/react-query";
import { Sparkles, ArrowRight, ShieldCheck, Target, Wallet } from "lucide-react";
import api from "@/lib/api";
import { useAuth } from "@/context/AuthContext";
import { Modal, Button, Stat } from "@/components/ui-kit";
import { money } from "@/lib/format";

export default function ClientWelcome() {
  const { user } = useAuth();
  const key = `compass_client_welcomed_${user.id}`;
  const [open, setOpen] = useState(() => user.is_client && !localStorage.getItem(key));
  const dash = useQuery({ queryKey: ["dashboard"], queryFn: async () => (await api.get("/dashboard")).data, enabled: open });
  const goals = useQuery({ queryKey: ["goals"], queryFn: async () => (await api.get("/goals")).data, enabled: open });
  if (!user.is_client) return null;
  const d = dash.data || {};
  const firstName = (d.name || user.name || "there").split(" ")[0];
  const close = () => { localStorage.setItem(key, "1"); setOpen(false); };

  return (
    <Modal open={open} onClose={close} title="" testid="client-welcome">
      <div className="flex items-center gap-3 mb-5">
        <div className="h-11 w-11 rounded-xl gradient-bg flex items-center justify-center text-white"><Sparkles size={22} /></div>
        <div>
          <div className="font-heading text-xl font-extrabold text-compass-navy">Welcome, {firstName}</div>
          <div className="text-sm text-compass-muted">{d.advisor_firm ? `${d.advisor_firm} has prepared your plan.` : "Your advisor has prepared your plan."}{d.advisor_name ? ` Your planner is ${d.advisor_name}.` : ""}</div>
        </div>
      </div>

      <div className="grid grid-cols-3 gap-3 mb-5" data-testid="welcome-snapshot">
        <Stat label="Assets under plan" value={money(d.total_assets || 0)} accent />
        <Stat label="Accounts" value={d.accounts_count ?? 0} />
        <Stat label="Active goals" value={(goals.data || []).length || d.goals_count || 0} />
      </div>

      <div className="space-y-2.5 mb-5">
        <div className="flex items-start gap-2.5 text-sm text-compass-navy"><Wallet size={16} className="text-compass-blue shrink-0 mt-0.5" /> Review your net worth, accounts and goals any time from the sidebar.</div>
        <div className="flex items-start gap-2.5 text-sm text-compass-navy"><Target size={16} className="text-compass-blue shrink-0 mt-0.5" /> Track progress toward each goal and see projected funding dates.</div>
        <div className="flex items-start gap-2.5 text-sm text-compass-navy"><ShieldCheck size={16} className="text-compass-green shrink-0 mt-0.5" /> Your data is protected under PIPEDA and shared only with your advisor.</div>
      </div>

      <div className="rounded-xl bg-compass-bg px-4 py-3 text-xs text-compass-muted mb-5">
        By continuing you acknowledge your advisor can view and update this plan on your behalf. You can manage notification and consent preferences in Settings at any time.
      </div>

      <div className="flex justify-end">
        <Button onClick={close} data-testid="welcome-explore">Explore my plan <ArrowRight size={16} /></Button>
      </div>
    </Modal>
  );
}
