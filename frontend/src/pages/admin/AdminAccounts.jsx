import React, { useState } from "react";
import { useQuery, useMutation, useQueryClient } from "@tanstack/react-query";
import { toast } from "sonner";
import { Search } from "lucide-react";
import api, { formatApiError } from "@/lib/api";
import { PageHeader } from "@/components/PageHeader";
import { Card, Input, Button, Badge } from "@/components/ui-kit";

const TIER_COLOR = { enterprise: "#0052FF", advisor: "#00DF89", solo: "#FFB800", admin: "#1B2559" };

export default function AdminAccounts() {
  const qc = useQueryClient();
  const [search, setSearch] = useState("");
  const [confirm, setConfirm] = useState(null);
  const { data } = useQuery({
    queryKey: ["admin-accounts", search],
    queryFn: () => api.get("/admin/accounts", { params: { search: search || undefined } }).then((r) => r.data),
  });
  const accounts = data?.accounts || [];

  const act = useMutation({
    mutationFn: ({ uid, action }) => api.post(`/admin/accounts/${uid}/${action}`).then((r) => r.data),
    onSuccess: () => { qc.invalidateQueries({ queryKey: ["admin-accounts"] }); toast.success("Account updated"); },
    onError: (e) => toast.error(formatApiError(e.response?.data?.detail)),
  });

  const del = useMutation({
    mutationFn: (uid) => api.delete(`/admin/accounts/${uid}`).then((r) => r.data),
    onSuccess: (d) => {
      qc.invalidateQueries({ queryKey: ["admin-accounts"] });
      setConfirm(null);
      toast.success(`Deleted ${d.deleted} — ${d.records_purged} personal records erased`);
    },
    onError: (e) => toast.error(formatApiError(e.response?.data?.detail)),
  });

  return (
    <div className="space-y-6" data-testid="admin-accounts">
      <PageHeader title="Accounts" subtitle="All accounts across every tier." />
      <div className="relative max-w-sm">
        <Search size={16} className="absolute left-3 top-1/2 -translate-y-1/2 text-compass-muted" />
        <Input className="pl-9" placeholder="Search name or email…" value={search} onChange={(e) => setSearch(e.target.value)} data-testid="account-search" />
      </div>
      <Card className="p-0 overflow-hidden">
        <table className="w-full text-sm">
          <thead className="bg-compass-bg text-compass-muted">
            <tr className="text-left">
              <th className="px-4 py-3 font-semibold">Name</th>
              <th className="px-4 py-3 font-semibold">Email</th>
              <th className="px-4 py-3 font-semibold">Tier</th>
              <th className="px-4 py-3 font-semibold">Status</th>
              <th className="px-4 py-3 font-semibold text-right">Action</th>
            </tr>
          </thead>
          <tbody>
            {accounts.map((a) => (
              <tr key={a.id} className="border-t border-compass-border" data-testid={`account-row-${a.id}`}>
                <td className="px-4 py-3 font-semibold text-compass-navy">{a.name}</td>
                <td className="px-4 py-3 text-compass-muted">{a.email}</td>
                <td className="px-4 py-3"><Badge color={TIER_COLOR[a.tier] || "#A3AED0"} bg="rgba(0,0,0,0.04)">{a.tier}</Badge></td>
                <td className="px-4 py-3">
                  {a.status === "suspended"
                    ? <Badge color="#EE5D50" bg="rgba(238,93,80,0.12)">suspended</Badge>
                    : <Badge color="#00DF89" bg="rgba(0,223,137,0.12)">active</Badge>}
                </td>
                <td className="px-4 py-3 text-right">
                  {a.tier !== "admin" && (
                    <div className="flex justify-end gap-2">
                      {a.status === "suspended" ? (
                        <Button size="sm" variant="outline" onClick={() => act.mutate({ uid: a.id, action: "reactivate" })} data-testid={`reactivate-${a.id}`}>Reactivate</Button>
                      ) : (
                        <Button size="sm" variant="outline" onClick={() => act.mutate({ uid: a.id, action: "suspend" })} data-testid={`suspend-${a.id}`}>Suspend</Button>
                      )}
                      <Button size="sm" variant="danger" onClick={() => setConfirm(a)} data-testid={`delete-${a.id}`}>Delete</Button>
                    </div>
                  )}
                </td>
              </tr>
            ))}
            {!accounts.length && <tr><td colSpan={5} className="px-4 py-8 text-center text-compass-muted">No accounts found</td></tr>}
          </tbody>
        </table>
      </Card>

      {confirm && (
        <div className="fixed inset-0 z-50 flex items-center justify-center bg-black/50 p-4" data-testid="delete-confirm" onClick={() => setConfirm(null)}>
          <div className="w-full max-w-md rounded-2xl bg-white p-6 shadow-2xl" onClick={(e) => e.stopPropagation()}>
            <h3 className="font-heading text-lg font-bold text-compass-navy">Delete account?</h3>
            <p className="mt-2 text-sm text-compass-muted">
              This permanently erases <b className="text-compass-navy">{confirm.email}</b> and all personal planning data linked to it (PIPEDA right-to-erasure). This cannot be undone.
            </p>
            <div className="mt-6 flex justify-end gap-3">
              <Button variant="outline" onClick={() => setConfirm(null)} data-testid="delete-cancel">Cancel</Button>
              <Button variant="danger" onClick={() => del.mutate(confirm.id)} disabled={del.isPending} data-testid="delete-confirm-btn">
                {del.isPending ? "Deleting…" : "Delete permanently"}
              </Button>
            </div>
          </div>
        </div>
      )}
    </div>
  );
}
