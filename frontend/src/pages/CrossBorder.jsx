import React, { useState } from "react";
import { useMutation } from "@tanstack/react-query";
import { toast } from "sonner";
import { Globe, Play, Flag, Landmark, PiggyBank, FileWarning } from "lucide-react";
import { formatApiError } from "@/lib/api";
import { crossBorderApi } from "@/lib/planning";
import { Card, Button, Input, Field, Select, Badge, Stat } from "@/components/ui-kit";
import { PageHeader } from "@/components/PageHeader";
import { money } from "@/lib/format";

const STATES = ["Other", "CA", "NY", "NJ", "IL", "MA", "PA", "CO", "MI", "UT", "NC", "AZ", "GA", "VA", "TX", "FL", "WA", "NV", "TN", "NH"];
const CAT_COLOR = { dual: "#FFB800", canadian_resident: "#00A36C", us_person: "#0052FF", other: "#A3AED0" };

function Toggle({ label, checked, onChange, testid }) {
  return (
    <label className="flex items-center justify-between gap-3 rounded-xl border border-compass-border px-4 py-3 cursor-pointer" data-testid={testid}>
      <span className="text-sm font-semibold text-compass-navy">{label}</span>
      <input type="checkbox" checked={checked} onChange={(e) => onChange(e.target.checked)} className="h-4 w-4 accent-compass-blue" />
    </label>
  );
}

export default function CrossBorder() {
  const [inp, setInp] = useState({
    ca_resident: true, us_citizen: false, us_green_card: false, us_substantial_presence: false, ca_citizen: true,
    annual_income: 120000, filing_status: "single", state: "Other", avg_annual_earnings: 75000, claim_age: 67,
  });
  const [res, setRes] = useState(null);
  const set = (k, v) => setInp((s) => ({ ...s, [k]: v }));
  const run = useMutation({
    mutationFn: () => crossBorderApi.analyze(inp),
    onSuccess: (d) => setRes(d),
    onError: (e) => toast.error(formatApiError(e.response?.data?.detail) || "Analysis failed"),
  });
  const j = res?.jurisdiction;
  const ut = res?.us_tax;
  const ss = res?.social_security;

  return (
    <div data-testid="crossborder-page">
      <PageHeader title="US / Cross-Border" subtitle="Classify tax jurisdiction and estimate US federal + state tax and Social Security for cross-border households." />

      <div className="grid lg:grid-cols-3 gap-6">
        <Card className="p-6 lg:col-span-1" data-testid="cb-inputs">
          <h3 className="font-heading font-bold text-compass-navy mb-4 flex items-center gap-2"><Globe size={18} className="text-compass-blue" /> Residency & status</h3>
          <div className="space-y-2.5">
            <Toggle label="Canadian resident" checked={inp.ca_resident} onChange={(v) => set("ca_resident", v)} testid="cb-ca-resident" />
            <Toggle label="US citizen" checked={inp.us_citizen} onChange={(v) => set("us_citizen", v)} testid="cb-us-citizen" />
            <Toggle label="US green-card holder" checked={inp.us_green_card} onChange={(v) => set("us_green_card", v)} testid="cb-green-card" />
            <Toggle label="Meets US substantial presence" checked={inp.us_substantial_presence} onChange={(v) => set("us_substantial_presence", v)} testid="cb-spt" />
          </div>
          <div className="grid grid-cols-2 gap-3 mt-4">
            <Field label="Annual income"><Input type="number" value={inp.annual_income} onChange={(e) => set("annual_income", Number(e.target.value || 0))} data-testid="cb-income" /></Field>
            <Field label="US filing status"><Select value={inp.filing_status} onChange={(e) => set("filing_status", e.target.value)} data-testid="cb-filing"><option value="single">Single</option><option value="mfj">Married filing jointly</option></Select></Field>
            <Field label="US state"><Select value={inp.state} onChange={(e) => set("state", e.target.value)} data-testid="cb-state">{STATES.map((s) => <option key={s}>{s}</option>)}</Select></Field>
            <Field label="Avg annual earnings"><Input type="number" value={inp.avg_annual_earnings} onChange={(e) => set("avg_annual_earnings", Number(e.target.value || 0))} data-testid="cb-earnings" /></Field>
            <Field label="SS claim age"><Select value={inp.claim_age} onChange={(e) => set("claim_age", Number(e.target.value))} data-testid="cb-claim-age"><option value={62}>62 (early)</option><option value={67}>67 (full)</option><option value={70}>70 (delayed)</option></Select></Field>
          </div>
          <Button className="mt-5 w-full" onClick={() => run.mutate()} disabled={run.isPending} data-testid="cb-run"><Play size={16} /> {run.isPending ? "Analyzing…" : "Analyze jurisdiction"}</Button>
        </Card>

        <div className="lg:col-span-2 space-y-6">
          {!res && <Card className="p-8 text-center text-sm text-compass-muted" data-testid="cb-empty">Set the residency, citizenship and income inputs, then analyze to route the household and estimate US tax + Social Security.</Card>}

          {j && (
            <Card className="p-6" data-testid="cb-jurisdiction">
              <div className="flex items-center justify-between mb-2">
                <h3 className="font-heading font-bold text-compass-navy flex items-center gap-2"><Flag size={18} className="text-compass-blue" /> Jurisdiction</h3>
                <Badge color={CAT_COLOR[j.category]} bg={`${CAT_COLOR[j.category]}22`} data-testid="cb-category">{j.label}</Badge>
              </div>
              <p className="text-sm text-compass-muted">{j.summary}</p>
              {j.flags.length > 0 && (
                <ul className="mt-4 space-y-1.5">
                  {j.flags.map((f, i) => (
                    <li key={i} className="flex items-start gap-2 text-sm text-compass-navy" data-testid={`cb-flag-${i}`}><FileWarning size={14} className="text-compass-amber shrink-0 mt-0.5" /> {f}</li>
                  ))}
                </ul>
              )}
            </Card>
          )}

          {ut && (
            <Card className="p-6" data-testid="cb-us-tax">
              <h3 className="font-heading font-bold text-compass-navy mb-4 flex items-center gap-2"><Landmark size={18} className="text-compass-blue" /> US income tax estimate</h3>
              <div className="grid grid-cols-2 sm:grid-cols-4 gap-4 mb-4">
                <Stat label="Federal tax" value={money(ut.federal_tax)} accent />
                <Stat label={`State (${ut.state})`} value={money(ut.state_tax)} />
                <Stat label="Total US tax" value={money(ut.total_us_tax)} />
                <Stat label="Effective rate" value={`${ut.effective_rate}%`} />
              </div>
              <div className="text-xs text-compass-muted space-y-1">
                <div>Gross income {money(ut.gross_income)} · standard deduction {money(ut.standard_deduction)}{ut.feie_excluded > 0 ? ` · FEIE excluded ${money(ut.feie_excluded)}` : ""} · taxable {money(ut.taxable_income)}</div>
                <div>{ut.state_note}</div>
              </div>
            </Card>
          )}

          {ss && (
            <Card className="p-6" data-testid="cb-social-security">
              <h3 className="font-heading font-bold text-compass-navy mb-4 flex items-center gap-2"><PiggyBank size={18} className="text-compass-blue" /> US Social Security estimate</h3>
              <div className="mb-4"><span className="text-sm text-compass-muted">At your selected claim age {ss.claim_age}: </span><span className="font-heading text-2xl font-extrabold gradient-text" data-testid="cb-ss-monthly">{money(ss.monthly)}/mo</span></div>
              <div className="grid grid-cols-3 gap-3">
                {ss.schedule.map((s) => (
                  <div key={s.age} className={`rounded-xl border px-4 py-3 text-center ${s.age === ss.claim_age ? "border-compass-blue bg-compass-blue/5" : "border-compass-border"}`} data-testid={`cb-ss-${s.age}`}>
                    <div className="text-xs text-compass-muted">Age {s.age}</div>
                    <div className="font-heading font-bold text-compass-navy">{money(s.monthly)}/mo</div>
                    <div className="text-xs text-compass-muted">{money(s.annual)}/yr</div>
                  </div>
                ))}
              </div>
              <p className="text-xs text-compass-muted mt-3">Simplified PIA estimate from average earnings; actual benefit uses your 35 highest indexed-earning years.</p>
            </Card>
          )}

          {res && (
            <Card className="p-6" data-testid="cb-treaty">
              <h3 className="font-heading font-bold text-compass-navy mb-3">Canada–US treaty notes</h3>
              <ul className="space-y-1.5">
                {res.treaty_notes.map((n, i) => <li key={i} className="text-sm text-compass-muted flex items-start gap-2"><span className="text-compass-blue mt-1">•</span> {n}</li>)}
              </ul>
              <p className="text-xs text-compass-muted mt-3">Illustrative only — not tax advice. Confirm with a cross-border tax professional.</p>
            </Card>
          )}
        </div>
      </div>
    </div>
  );
}
