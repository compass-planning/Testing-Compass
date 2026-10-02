import React, { useState } from "react";
import { useQuery, useMutation, useQueryClient } from "@tanstack/react-query";
import { toast } from "sonner";
import { UserCog, Pencil, Plus, Users, Wallet, Shield, PiggyBank } from "lucide-react";
import api, { formatApiError } from "@/lib/api";
import { planApi, actionItemsApi } from "@/lib/planning";
import { useHousehold } from "@/context/HouseholdContext";
import { Card, Button, Input, Field, Select, Badge, Modal, Stat } from "@/components/ui-kit";
import { PageHeader } from "@/components/PageHeader";
import { money } from "@/lib/format";
import ActionItems from "@/components/ActionItems";

const PROVINCES = ["ON", "BC", "AB", "QC", "MB", "SK", "NS", "NB", "NL", "PE", "NT", "YT", "NU"];
const PENSIONS = ["", "DBPP", "DCPP", "Group RRSP", "DPSP", "No Pension"];

const FIELDS = [
  { key: "email", label: "Email", type: "email" },
  { key: "phone", label: "Phone", type: "text" },
  { key: "date_of_birth", label: "Date of birth", type: "date" },
  { key: "province", label: "Province", type: "select", options: PROVINCES },
  { key: "occupation", label: "Occupation", type: "text" },
  { key: "annual_income", label: "Annual income (CAD)", type: "number" },
  { key: "pension_type", label: "Pension", type: "select", options: PENSIONS },
  { key: "retirement_age", label: "Retirement age", type: "number" },
  { key: "desired_income", label: "Desired retirement income", type: "number" },
];

export default function ClientProfile() {
  const qc = useQueryClient();
  const { active } = useHousehold() || {};
  const [edit, setEdit] = useState(null); // owner being edited
  const [adding, setAdding] = useState(false);

  const owners = useQuery({ queryKey: ["owners"], queryFn: async () => (await api.get("/owners")).data });
  const overview = useQuery({ queryKey: ["plan", "overview"], queryFn: planApi.overview });
  const actionItems = useQuery({ queryKey: ["action-items", active], queryFn: actionItemsApi.list });

  const list = owners.data || [];
  const primary = list.find((o) => o.relationship === "self") || list[0];
  const spouse = list.find((o) => o.relationship === "spouse");
  const dependants = list.filter((o) => o.relationship === "dependent" || o.relationship === "child");
  const o = overview.data;

  const save = useMutation({
    mutationFn: ({ id, body }) => api.put(`/owners/${id}`, body),
    onSuccess: () => { toast.success("Saved"); setEdit(null); qc.invalidateQueries({ queryKey: ["owners"] }); },
    onError: (e) => toast.error(formatApiError(e.response?.data?.detail)),
  });
  const addMember = useMutation({
    mutationFn: (body) => api.post("/owners", body),
    onSuccess: () => { toast.success("Member added"); setAdding(false); qc.invalidateQueries({ queryKey: ["owners"] }); },
    onError: (e) => toast.error(formatApiError(e.response?.data?.detail)),
  });

  return (
    <div>
      <PageHeader title={primary ? `The ${primary.full_name.split(" ").slice(-1)[0]} Household` : "Client Profile"}
        subtitle="Household members, income and retirement details that power the plan." />

      {o && (
        <div className="grid grid-cols-2 lg:grid-cols-4 gap-4 mb-6">
          <Stat label="Net worth" value={money(o.netWorth)} accent />
          <Stat label="Retirement plans" value={o.retirementProjections} />
          <Stat label="Insurance analyses" value={o.insuranceAnalyses} />
          <Stat label="Open action items" value={actionItems.data?.length ?? 0} />
        </div>
      )}

      <Card className="p-6">
        <div className="flex items-center justify-between mb-5">
          <h3 className="font-heading font-bold text-compass-navy flex items-center gap-2"><Users size={18} className="text-compass-blue" /> Household Profile</h3>
          {spouse ? <Badge color="#0052FF" bg="rgba(0,82,255,0.08)">Joint file</Badge> : <Badge color="#A3AED0" bg="rgba(163,174,208,0.15)">Single</Badge>}
        </div>
        <div className="grid md:grid-cols-2 gap-6">
          {primary && <PersonCard owner={primary} role="Primary Client" onEdit={() => setEdit(primary)} />}
          {spouse
            ? <PersonCard owner={spouse} role="Spouse / Partner" onEdit={() => setEdit(spouse)} />
            : <AddSpouse onAdd={() => setAdding("spouse")} />}
        </div>

        <div className="border-t border-compass-border mt-6 pt-5">
          <div className="flex items-center justify-between mb-3">
            <span className="muted-label">Children & Dependants</span>
            <Button size="sm" variant="outline" onClick={() => setAdding("dependent")} data-testid="add-dependant"><Plus size={14} /> Add dependant</Button>
          </div>
          {dependants.length === 0 ? (
            <div className="text-sm text-compass-muted">No dependants on file</div>
          ) : (
            <div className="flex flex-wrap gap-2">
              {dependants.map((d) => (
                <div key={d.id} className="flex items-center gap-2 rounded-xl border border-compass-border px-3 py-2" data-testid={`dependant-${d.id}`}>
                  <span className="text-sm font-semibold text-compass-navy">{d.full_name}</span>
                  <span className="text-xs text-compass-muted">{d.date_of_birth || "—"}</span>
                  <button onClick={() => setEdit(d)} className="text-compass-blue"><Pencil size={13} /></button>
                </div>
              ))}
            </div>
          )}
        </div>
      </Card>

      <div className="mt-6"><ActionItems /></div>

      <EditModal owner={edit} onClose={() => setEdit(null)} onSubmit={(body) => save.mutate({ id: edit.id, body })} loading={save.isPending} />
      <AddModal kind={adding} onClose={() => setAdding(false)} onSubmit={(body) => addMember.mutate(body)} loading={addMember.isPending} />
    </div>
  );
}

function PersonCard({ owner, role, onEdit }) {
  const row = (label, val) => (
    <div>
      <div className="muted-label">{label}</div>
      <div className={`text-sm mt-0.5 ${val ? "text-compass-navy font-medium" : "text-compass-muted italic"}`}>{val || "Not set"}</div>
    </div>
  );
  return (
    <div className="rounded-2xl border border-compass-border p-5" data-testid={`person-${owner.id}`}>
      <div className="flex items-center justify-between mb-4">
        <div className="flex items-center gap-3">
          <div className="h-11 w-11 rounded-xl gradient-bg flex items-center justify-center text-white font-bold">{owner.full_name.slice(0, 1)}</div>
          <div>
            <div className="text-[10px] text-compass-muted uppercase tracking-wide">{role}</div>
            <div className="font-heading font-bold text-compass-navy">{owner.full_name}</div>
          </div>
        </div>
        <Button size="sm" variant="ghost" onClick={onEdit} data-testid={`edit-person-${owner.id}`}><Pencil size={14} /> Edit</Button>
      </div>
      <div className="grid grid-cols-2 gap-4">
        {row("Email", owner.email)}
        {row("Phone", owner.phone)}
        {row("Date of birth", owner.date_of_birth)}
        {row("Province", owner.province)}
        {row("Occupation", owner.occupation)}
        {row("Annual income", owner.annual_income ? money(owner.annual_income) : null)}
        {row("Pension", owner.pension_type)}
        {row("Retirement age", owner.retirement_age)}
        {row("Desired income", owner.desired_income ? money(owner.desired_income) : null)}
      </div>
    </div>
  );
}

function AddSpouse({ onAdd }) {
  return (
    <div className="rounded-2xl border border-dashed border-compass-border p-5 flex flex-col items-center justify-center text-center gap-3">
      <UserCog size={28} className="text-compass-muted" />
      <div className="text-sm text-compass-muted">No spouse / partner on file</div>
      <Button size="sm" variant="outline" onClick={onAdd} data-testid="add-spouse"><Plus size={14} /> Add spouse</Button>
    </div>
  );
}

function fieldsToState(owner) {
  const s = { full_name: owner?.full_name || "" };
  FIELDS.forEach((f) => { s[f.key] = owner?.[f.key] ?? ""; });
  return s;
}

function normalize(s) {
  const out = { ...s };
  FIELDS.forEach((f) => { if (f.type === "number") out[f.key] = Number(out[f.key] || 0); });
  return out;
}

function EditModal({ owner, onClose, onSubmit, loading }) {
  const [s, setS] = useState({});
  React.useEffect(() => { if (owner) setS(fieldsToState(owner)); }, [owner]);
  const set = (k) => (e) => setS({ ...s, [k]: e.target.value });
  if (!owner) return null;
  return (
    <Modal open={!!owner} onClose={onClose} title={`Edit · ${owner.full_name}`} testid="profile-edit-modal">
      <div className="space-y-4 max-h-[60vh] overflow-y-auto pr-1">
        <Field label="Full name"><Input value={s.full_name || ""} onChange={set("full_name")} data-testid="edit-full-name" /></Field>
        <div className="grid grid-cols-2 gap-3">
          {FIELDS.map((f) => (
            <Field key={f.key} label={f.label}>
              {f.type === "select"
                ? <Select value={s[f.key] ?? ""} onChange={set(f.key)}>{f.options.map((o) => <option key={o} value={o}>{o || "—"}</option>)}</Select>
                : <Input type={f.type} value={s[f.key] ?? ""} onChange={set(f.key)} />}
            </Field>
          ))}
        </div>
      </div>
      <div className="flex gap-2 justify-end mt-4">
        <Button variant="ghost" onClick={onClose}>Cancel</Button>
        <Button onClick={() => onSubmit({ relationship: owner.relationship, ...normalize(s) })} disabled={loading} data-testid="profile-save">Save</Button>
      </div>
    </Modal>
  );
}

function AddModal({ kind, onClose, onSubmit, loading }) {
  const [s, setS] = useState({ full_name: "", date_of_birth: "", province: "ON" });
  React.useEffect(() => { if (kind) setS({ full_name: "", date_of_birth: "", province: "ON" }); }, [kind]);
  const set = (k) => (e) => setS({ ...s, [k]: e.target.value });
  if (!kind) return null;
  const rel = kind === "spouse" ? "spouse" : "dependent";
  return (
    <Modal open={!!kind} onClose={onClose} title={kind === "spouse" ? "Add spouse / partner" : "Add dependant"} testid="profile-add-modal">
      <div className="space-y-4">
        <Field label="Full name"><Input value={s.full_name} onChange={set("full_name")} data-testid="add-member-name" /></Field>
        <div className="grid grid-cols-2 gap-3">
          <Field label="Date of birth"><Input type="date" value={s.date_of_birth} onChange={set("date_of_birth")} /></Field>
          <Field label="Province"><Select value={s.province} onChange={set("province")}>{PROVINCES.map((p) => <option key={p}>{p}</option>)}</Select></Field>
        </div>
      </div>
      <div className="flex gap-2 justify-end mt-4">
        <Button variant="ghost" onClick={onClose}>Cancel</Button>
        <Button onClick={() => onSubmit({ full_name: s.full_name, relationship: rel, date_of_birth: s.date_of_birth, province: s.province })} disabled={!s.full_name || loading} data-testid="add-member-save">Add</Button>
      </div>
    </Modal>
  );
}
