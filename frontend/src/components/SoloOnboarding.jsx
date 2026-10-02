import React, { useState } from "react";
import { useQueryClient } from "@tanstack/react-query";
import { toast } from "sonner";
import { Rocket, Check, ArrowRight, ArrowLeft } from "lucide-react";
import api, { formatApiError } from "@/lib/api";
import { Modal, Button, Input, Field, Select } from "@/components/ui-kit";

const PROVINCES = ["ON", "BC", "AB", "QC", "MB", "SK", "NS", "NB", "NL", "PE", "NT", "YT", "NU"];
const ACCT_TYPES = ["RRSP", "TFSA", "Non-registered", "DC Pension", "DB Pension"];
const STEPS = ["Profile", "Account", "Goal"];

export default function SoloOnboarding({ open, onClose, selfOwnerId, profile }) {
  const qc = useQueryClient();
  const [step, setStep] = useState(0);
  const [saving, setSaving] = useState(false);
  const [prof, setProf] = useState({
    province: profile?.province || "ON",
    annual_income: profile?.annual_income || "",
    retirement_age: profile?.retirement_age || 65,
    desired_income: profile?.desired_income || "",
  });
  const [acct, setAcct] = useState({ account_type: "RRSP", institution: "", balance: "", annual_contribution: "" });
  const [goal, setGoal] = useState({ title: "Retirement", target_amount: 1000000, current_amount: 0, target_year: new Date().getFullYear() + 25 });

  const invalidate = () => {
    qc.invalidateQueries({ queryKey: ["dashboard"] });
    qc.invalidateQueries({ queryKey: ["plan", "overview"] });
    qc.invalidateQueries({ queryKey: ["accounts"] });
    qc.invalidateQueries({ queryKey: ["goals"] });
    qc.invalidateQueries({ queryKey: ["owners"] });
    qc.invalidateQueries({ queryKey: ["action-items"] });
  };

  const saveProfile = async () => {
    setSaving(true);
    try {
      await api.put("/plan/profile", {
        province: prof.province, annual_income: Number(prof.annual_income || 0),
        retirement_age: Number(prof.retirement_age || 65), desired_income: Number(prof.desired_income || 0),
      });
      setStep(1);
    } catch (e) { toast.error(formatApiError(e.response?.data?.detail) || "Could not save profile"); }
    finally { setSaving(false); }
  };
  const saveAccount = async () => {
    if (!selfOwnerId) { setStep(2); return; }
    setSaving(true);
    try {
      await api.post("/accounts", {
        owner_id: selfOwnerId, account_type: acct.account_type, institution: acct.institution,
        balance: Number(acct.balance || 0), annual_contribution: Number(acct.annual_contribution || 0),
      });
      setStep(2);
    } catch (e) { toast.error(formatApiError(e.response?.data?.detail) || "Could not add account"); }
    finally { setSaving(false); }
  };
  const finish = async () => {
    setSaving(true);
    try {
      await api.post("/goals", {
        title: goal.title, category: "retirement", target_amount: Number(goal.target_amount || 0),
        current_amount: Number(goal.current_amount || 0), target_year: Number(goal.target_year),
      });
      invalidate();
      toast.success("You're all set — your dashboard is ready");
      onClose(true);
    } catch (e) { toast.error(formatApiError(e.response?.data?.detail) || "Could not add goal"); }
    finally { setSaving(false); }
  };

  return (
    <Modal open={open} onClose={() => onClose(false)} title="" testid="solo-onboarding">
      <div className="flex items-center gap-3 mb-5">
        <div className="h-11 w-11 rounded-xl gradient-bg flex items-center justify-center text-white"><Rocket size={22} /></div>
        <div>
          <div className="font-heading text-xl font-extrabold text-compass-navy">Let's set up your plan</div>
          <div className="text-sm text-compass-muted">Three quick steps to fill your dashboard.</div>
        </div>
      </div>

      <div className="flex items-center gap-2 mb-6" data-testid="onboarding-steps">
        {STEPS.map((s, i) => (
          <div key={s} className="flex items-center gap-2">
            <div className={`h-7 w-7 rounded-full flex items-center justify-center text-xs font-bold ${i < step ? "bg-compass-green text-compass-navy" : i === step ? "gradient-bg text-white" : "bg-compass-bg text-compass-muted"}`}>
              {i < step ? <Check size={14} /> : i + 1}
            </div>
            <span className={`text-sm font-semibold ${i === step ? "text-compass-navy" : "text-compass-muted"}`}>{s}</span>
            {i < STEPS.length - 1 && <span className="w-6 h-px bg-compass-border" />}
          </div>
        ))}
      </div>

      {step === 0 && (
        <div className="space-y-4" data-testid="onboarding-profile">
          <div className="grid grid-cols-2 gap-3">
            <Field label="Province"><Select value={prof.province} onChange={(e) => setProf({ ...prof, province: e.target.value })} data-testid="ob-province">{PROVINCES.map((p) => <option key={p}>{p}</option>)}</Select></Field>
            <Field label="Annual income"><Input type="number" value={prof.annual_income} onChange={(e) => setProf({ ...prof, annual_income: e.target.value })} data-testid="ob-income" /></Field>
            <Field label="Retirement age"><Input type="number" value={prof.retirement_age} onChange={(e) => setProf({ ...prof, retirement_age: e.target.value })} data-testid="ob-retire-age" /></Field>
            <Field label="Desired monthly income"><Input type="number" value={prof.desired_income} onChange={(e) => setProf({ ...prof, desired_income: e.target.value })} data-testid="ob-desired" /></Field>
          </div>
          <div className="flex justify-between pt-2">
            <Button variant="ghost" onClick={() => onClose(false)} data-testid="ob-skip">Skip for now</Button>
            <Button onClick={saveProfile} disabled={saving} data-testid="ob-next-1">Continue <ArrowRight size={15} /></Button>
          </div>
        </div>
      )}

      {step === 1 && (
        <div className="space-y-4" data-testid="onboarding-account">
          <Field label="Account type"><Select value={acct.account_type} onChange={(e) => setAcct({ ...acct, account_type: e.target.value })} data-testid="ob-acct-type">{ACCT_TYPES.map((t) => <option key={t}>{t}</option>)}</Select></Field>
          <Field label="Institution"><Input value={acct.institution} onChange={(e) => setAcct({ ...acct, institution: e.target.value })} placeholder="e.g. Wealthsimple" data-testid="ob-acct-inst" /></Field>
          <div className="grid grid-cols-2 gap-3">
            <Field label="Balance (CAD)"><Input type="number" value={acct.balance} onChange={(e) => setAcct({ ...acct, balance: e.target.value })} data-testid="ob-acct-balance" /></Field>
            <Field label="Annual contribution"><Input type="number" value={acct.annual_contribution} onChange={(e) => setAcct({ ...acct, annual_contribution: e.target.value })} data-testid="ob-acct-contrib" /></Field>
          </div>
          <div className="flex justify-between pt-2">
            <Button variant="ghost" onClick={() => setStep(0)}><ArrowLeft size={15} /> Back</Button>
            <Button onClick={saveAccount} disabled={saving} data-testid="ob-next-2">Continue <ArrowRight size={15} /></Button>
          </div>
        </div>
      )}

      {step === 2 && (
        <div className="space-y-4" data-testid="onboarding-goal">
          <Field label="Goal name"><Input value={goal.title} onChange={(e) => setGoal({ ...goal, title: e.target.value })} data-testid="ob-goal-title" /></Field>
          <div className="grid grid-cols-3 gap-3">
            <Field label="Target amount"><Input type="number" value={goal.target_amount} onChange={(e) => setGoal({ ...goal, target_amount: e.target.value })} data-testid="ob-goal-target" /></Field>
            <Field label="Saved so far"><Input type="number" value={goal.current_amount} onChange={(e) => setGoal({ ...goal, current_amount: e.target.value })} data-testid="ob-goal-current" /></Field>
            <Field label="Target year"><Input type="number" value={goal.target_year} onChange={(e) => setGoal({ ...goal, target_year: e.target.value })} data-testid="ob-goal-year" /></Field>
          </div>
          <div className="flex justify-between pt-2">
            <Button variant="ghost" onClick={() => setStep(1)}><ArrowLeft size={15} /> Back</Button>
            <Button onClick={finish} disabled={saving} data-testid="ob-finish"><Check size={15} /> Finish setup</Button>
          </div>
        </div>
      )}
    </Modal>
  );
}
