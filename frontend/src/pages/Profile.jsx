import React, { useState, useEffect } from "react";
import { useQuery, useMutation, useQueryClient } from "@tanstack/react-query";
import { toast } from "sonner";
import { UserCog, Save } from "lucide-react";
import { planApi } from "@/lib/planning";
import { formatApiError } from "@/lib/api";
import { useAuth } from "@/context/AuthContext";
import { Card, Button, Input, Field, Select } from "@/components/ui-kit";
import { PageHeader } from "@/components/PageHeader";

const PROVINCES = ["ON", "BC", "AB", "QC", "MB", "SK", "NS", "NB", "NL", "PE", "NT", "YT", "NU"];
const PENSIONS = ["", "DBPP", "DCPP", "Group RRSP", "DPSP", "No Pension"];

export default function Profile() {
  const { user } = useAuth();
  const qc = useQueryClient();
  const readOnly = user.tier === "enterprise";
  const { data, isLoading } = useQuery({ queryKey: ["profile"], queryFn: planApi.profile });
  const [f, setF] = useState({});

  useEffect(() => { if (data) setF(data); }, [data]);
  const set = (k) => (e) => setF({ ...f, [k]: e.target.value });

  const save = useMutation({
    mutationFn: () => planApi.saveProfile({
      full_name: f.full_name, province: f.province, date_of_birth: f.date_of_birth,
      occupation: f.occupation, annual_income: Number(f.annual_income || 0),
      pension_type: f.pension_type, retirement_age: Number(f.retirement_age || 0),
      desired_income: Number(f.desired_income || 0),
      spouse_name: f.spouse_name, spouse_dob: f.spouse_dob, spouse_income: Number(f.spouse_income || 0),
    }),
    onSuccess: () => { toast.success("Profile saved"); qc.invalidateQueries({ queryKey: ["profile"] }); qc.invalidateQueries({ queryKey: ["owners"] }); },
    onError: (e) => toast.error(formatApiError(e.response?.data?.detail)),
  });

  if (isLoading) return <div className="text-compass-muted">Loading…</div>;

  return (
    <div>
      <PageHeader title="My Profile" subtitle="Household details that power your plan: income, retirement age and spouse." />
      <Card className="p-6 max-w-3xl">
        <div className="flex items-center gap-3 mb-6">
          <div className="h-11 w-11 rounded-xl gradient-bg flex items-center justify-center text-white"><UserCog size={22} /></div>
          <div>
            <h3 className="font-heading font-bold text-compass-navy">Primary client</h3>
            <p className="text-sm text-compass-muted">{f.full_name || user.name}</p>
          </div>
        </div>

        <div className="grid sm:grid-cols-2 gap-4">
          <Field label="Full name"><Input value={f.full_name || ""} onChange={set("full_name")} disabled={readOnly} data-testid="profile-name" /></Field>
          <Field label="Date of birth"><Input type="date" value={(f.date_of_birth || "").slice(0,10)} onChange={set("date_of_birth")} disabled={readOnly} /></Field>
          <Field label="Province"><Select value={f.province || "ON"} onChange={set("province")} disabled={readOnly}>{PROVINCES.map((p) => <option key={p}>{p}</option>)}</Select></Field>
          <Field label="Occupation"><Input value={f.occupation || ""} onChange={set("occupation")} disabled={readOnly} /></Field>
          <Field label="Annual income (CAD)"><Input type="number" value={f.annual_income || ""} onChange={set("annual_income")} disabled={readOnly} data-testid="profile-income" /></Field>
          <Field label="Pension type"><Select value={f.pension_type || ""} onChange={set("pension_type")} disabled={readOnly}>{PENSIONS.map((p) => <option key={p} value={p}>{p || "—"}</option>)}</Select></Field>
          <Field label="Retirement age"><Input type="number" value={f.retirement_age || ""} onChange={set("retirement_age")} disabled={readOnly} /></Field>
          <Field label="Desired retirement income"><Input type="number" value={f.desired_income || ""} onChange={set("desired_income")} disabled={readOnly} /></Field>
        </div>

        <h4 className="font-heading font-bold text-compass-navy mt-8 mb-3">Spouse / Partner</h4>
        <div className="grid sm:grid-cols-3 gap-4">
          <Field label="Spouse name"><Input value={f.spouse_name || ""} onChange={set("spouse_name")} disabled={readOnly} /></Field>
          <Field label="Spouse DOB"><Input type="date" value={(f.spouse_dob || "").slice(0,10)} onChange={set("spouse_dob")} disabled={readOnly} /></Field>
          <Field label="Spouse income"><Input type="number" value={f.spouse_income || ""} onChange={set("spouse_income")} disabled={readOnly} /></Field>
        </div>

        {!readOnly && (
          <div className="flex justify-end mt-6">
            <Button onClick={() => save.mutate()} disabled={save.isPending} data-testid="profile-save"><Save size={16} /> Save profile</Button>
          </div>
        )}
      </Card>
    </div>
  );
}
