import React, { useState } from "react";
import { useQuery, useMutation, useQueryClient } from "@tanstack/react-query";
import { toast } from "sonner";
import { Plus, Users, Lock, Trash2, ChevronDown, ChevronUp, Landmark } from "lucide-react";
import api, { formatApiError } from "@/lib/api";
import { useAuth } from "@/context/AuthContext";
import { Card, Button, Input, Field, Select, Badge, Modal, Empty } from "@/components/ui-kit";
import { PageHeader } from "@/components/PageHeader";
import { money } from "@/lib/format";

const ACCOUNT_TYPES = ["RRSP", "TFSA", "CPP", "OAS", "DB Pension", "DC Pension", "Non-registered"];

export default function Owners() {
  const { user } = useAuth();
  const qc = useQueryClient();
  const readOnly = user.tier === "enterprise" && !user.enterprise_write;
  const [ownerModal, setOwnerModal] = useState(false);
  const [acctFor, setAcctFor] = useState(null);
  const [expanded, setExpanded] = useState(null);

  const owners = useQuery({ queryKey: ["owners"], queryFn: async () => (await api.get("/owners")).data });
  const accounts = useQuery({ queryKey: ["accounts"], queryFn: async () => (await api.get("/accounts")).data });

  const invalidate = () => { qc.invalidateQueries({ queryKey: ["owners"] }); qc.invalidateQueries({ queryKey: ["accounts"] }); qc.invalidateQueries({ queryKey: ["dashboard"] }); };

  const createOwner = useMutation({
    mutationFn: (body) => api.post("/owners", body),
    onSuccess: () => { toast.success("Household member added"); setOwnerModal(false); invalidate(); },
    onError: (e) => toast.error(formatApiError(e.response?.data?.detail)),
  });
  const delOwner = useMutation({
    mutationFn: (id) => api.delete(`/owners/${id}`),
    onSuccess: () => { toast.success("Removed"); invalidate(); },
    onError: (e) => toast.error(formatApiError(e.response?.data?.detail)),
  });
  const createAcct = useMutation({
    mutationFn: (body) => api.post("/accounts", body),
    onSuccess: () => { toast.success("Account added"); setAcctFor(null); invalidate(); },
    onError: (e) => toast.error(formatApiError(e.response?.data?.detail)),
  });
  const delAcct = useMutation({
    mutationFn: (id) => api.delete(`/accounts/${id}`),
    onSuccess: () => { toast.success("Account removed"); invalidate(); },
    onError: (e) => toast.error(formatApiError(e.response?.data?.detail)),
  });

  const accountsFor = (oid) => (accounts.data || []).filter((a) => a.owner_id === oid);

  return (
    <div>
      <PageHeader
        title={user.tier === "solo" ? "My Household" : "Households"}
        subtitle={readOnly
          ? "Enterprise records are owned by your CRM. They are read-only here — edit in Salesforce and Compass syncs the change."
          : "Pension owners across your scope. Add members and their accounts."}
      >
        {readOnly ? (
          <Badge color="#A3AED0" bg="rgba(163,174,208,0.15)"><Lock size={13} /> CRM-managed</Badge>
        ) : (
          <Button onClick={() => setOwnerModal(true)} data-testid="add-owner-button"><Plus size={16} /> Add member</Button>
        )}
      </PageHeader>

      {owners.isLoading ? (
        <div className="text-compass-muted">Loading…</div>
      ) : (owners.data || []).length === 0 ? (
        <Empty icon={Users} title="No household members yet">Add your first owner to begin planning.</Empty>
      ) : (
        <div className="space-y-3">
          {owners.data.map((o) => {
            const accts = accountsFor(o.id);
            const total = accts.reduce((s, a) => s + a.balance, 0);
            const isOpen = expanded === o.id;
            return (
              <Card key={o.id} className="overflow-hidden" data-testid={`owner-${o.id}`}>
                <div className="flex items-center gap-4 p-5">
                  <div className="h-11 w-11 rounded-xl gradient-bg flex items-center justify-center text-white font-bold">
                    {o.full_name.slice(0, 1)}
                  </div>
                  <div className="flex-1 min-w-0">
                    <div className="flex items-center gap-2 flex-wrap">
                      <span className="font-heading font-bold text-compass-navy">{o.full_name}</span>
                      <Badge color="#0052FF" bg="rgba(0,82,255,0.08)">{o.relationship}</Badge>
                      {o.source === "crm" && <Badge color="#A3AED0" bg="rgba(163,174,208,0.15)">CRM · {o.crm_record_id}</Badge>}
                    </div>
                    <div className="text-xs text-compass-muted mt-0.5">{o.province} · {accts.length} account(s) · {money(total)}</div>
                  </div>
                  <button onClick={() => setExpanded(isOpen ? null : o.id)} className="text-compass-muted hover:text-compass-navy p-2" data-testid={`expand-${o.id}`}>
                    {isOpen ? <ChevronUp size={18} /> : <ChevronDown size={18} />}
                  </button>
                  {!readOnly && (
                    <button onClick={() => delOwner.mutate(o.id)} className="text-compass-red hover:bg-compass-red/10 rounded-lg p-2" data-testid={`delete-owner-${o.id}`}>
                      <Trash2 size={16} />
                    </button>
                  )}
                </div>

                {isOpen && (
                  <div className="border-t border-compass-border bg-compass-bg/40 p-5">
                    <div className="flex items-center justify-between mb-3">
                      <span className="muted-label">Accounts</span>
                      {!readOnly && (
                        <Button size="sm" variant="outline" onClick={() => setAcctFor(o)} data-testid={`add-account-${o.id}`}>
                          <Plus size={14} /> Add account
                        </Button>
                      )}
                    </div>
                    {accts.length === 0 ? (
                      <div className="text-sm text-compass-muted">No accounts recorded.</div>
                    ) : (
                      <div className="space-y-2">
                        {accts.map((a) => (
                          <div key={a.id} className="flex items-center gap-3 rounded-xl bg-white border border-compass-border px-4 py-3" data-testid={`account-${a.id}`}>
                            <Landmark size={16} className="text-compass-blue" />
                            <div className="flex-1">
                              <div className="text-sm font-semibold text-compass-navy">{a.account_type} <span className="text-compass-muted font-normal">· {a.institution || "—"}</span></div>
                              <div className="text-xs text-compass-muted">Contributes {money(a.annual_contribution)}/yr</div>
                            </div>
                            <div className="font-heading font-bold text-compass-navy">{money(a.balance)}</div>
                            {!readOnly && (
                              <button onClick={() => delAcct.mutate(a.id)} className="text-compass-red hover:bg-compass-red/10 rounded-lg p-1.5">
                                <Trash2 size={14} />
                              </button>
                            )}
                          </div>
                        ))}
                      </div>
                    )}
                  </div>
                )}
              </Card>
            );
          })}
        </div>
      )}

      <OwnerModal open={ownerModal} onClose={() => setOwnerModal(false)} onSubmit={(b) => createOwner.mutate(b)} loading={createOwner.isPending} />
      <AccountModal owner={acctFor} onClose={() => setAcctFor(null)} onSubmit={(b) => createAcct.mutate(b)} loading={createAcct.isPending} />
    </div>
  );
}

function OwnerModal({ open, onClose, onSubmit, loading }) {
  const [f, setF] = useState({ full_name: "", relationship: "self", province: "ON", date_of_birth: "" });
  const set = (k) => (e) => setF({ ...f, [k]: e.target.value });
  return (
    <Modal open={open} onClose={onClose} title="Add household member" testid="owner-modal">
      <div className="space-y-4">
        <Field label="Full name"><Input value={f.full_name} onChange={set("full_name")} data-testid="owner-name-input" /></Field>
        <div className="grid grid-cols-2 gap-3">
          <Field label="Relationship">
            <Select value={f.relationship} onChange={set("relationship")} data-testid="owner-relationship">
              <option value="self">Self</option><option value="spouse">Spouse</option><option value="dependent">Dependent</option>
            </Select>
          </Field>
          <Field label="Province">
            <Select value={f.province} onChange={set("province")}>
              {["ON","BC","AB","QC","MB","SK","NS","NB","NL","PE","NT","YT","NU"].map((p) => <option key={p}>{p}</option>)}
            </Select>
          </Field>
        </div>
        <Field label="Date of birth"><Input type="date" value={f.date_of_birth} onChange={set("date_of_birth")} /></Field>
        <div className="flex gap-2 justify-end pt-2">
          <Button variant="ghost" onClick={onClose}>Cancel</Button>
          <Button onClick={() => onSubmit(f)} disabled={!f.full_name || loading} data-testid="owner-save">Add member</Button>
        </div>
      </div>
    </Modal>
  );
}

function AccountModal({ owner, onClose, onSubmit, loading }) {
  const [f, setF] = useState({ account_type: "RRSP", institution: "", balance: "", annual_contribution: "" });
  const set = (k) => (e) => setF({ ...f, [k]: e.target.value });
  return (
    <Modal open={!!owner} onClose={onClose} title={owner ? `Add account · ${owner.full_name}` : ""} testid="account-modal">
      <div className="space-y-4">
        <Field label="Account type">
          <Select value={f.account_type} onChange={set("account_type")} data-testid="account-type">
            {ACCOUNT_TYPES.map((t) => <option key={t}>{t}</option>)}
          </Select>
        </Field>
        <Field label="Institution"><Input value={f.institution} onChange={set("institution")} placeholder="e.g. Wealthsimple" /></Field>
        <div className="grid grid-cols-2 gap-3">
          <Field label="Balance (CAD)"><Input type="number" value={f.balance} onChange={set("balance")} data-testid="account-balance" /></Field>
          <Field label="Annual contribution"><Input type="number" value={f.annual_contribution} onChange={set("annual_contribution")} /></Field>
        </div>
        <div className="flex gap-2 justify-end pt-2">
          <Button variant="ghost" onClick={onClose}>Cancel</Button>
          <Button onClick={() => onSubmit({ owner_id: owner.id, account_type: f.account_type, institution: f.institution, balance: Number(f.balance || 0), annual_contribution: Number(f.annual_contribution || 0) })} disabled={loading} data-testid="account-save">Add account</Button>
        </div>
      </div>
    </Modal>
  );
}
