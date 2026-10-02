import React from "react";
import { useQuery, useMutation, useQueryClient } from "@tanstack/react-query";
import { toast } from "sonner";
import { ListChecks, Plus } from "lucide-react";
import { actionItemsApi } from "@/lib/planning";
import api from "@/lib/api";
import { useAuth } from "@/context/AuthContext";
import { useHousehold } from "@/context/HouseholdContext";
import { Card, Badge, Button } from "@/components/ui-kit";

const SEV = {
  danger: { color: "#EE5D50", bg: "rgba(238,93,80,0.12)" },
  warn: { color: "#FFB800", bg: "rgba(255,184,0,0.14)" },
  info: { color: "#0052FF", bg: "rgba(0,82,255,0.08)" },
};

export default function ActionItems() {
  const { user } = useAuth();
  const household = useHousehold();
  const qc = useQueryClient();
  const canConvert = user.tier === "advisor" && !!household?.active;
  const q = useQuery({ queryKey: ["action-items", household?.active], queryFn: actionItemsApi.list });

  const convert = useMutation({
    mutationFn: (it) => api.post("/advisor/tasks", { client_id: household?.active, title: it.action || it.title }),
    onSuccess: () => {
      qc.invalidateQueries({ queryKey: ["tasks"] });
      qc.invalidateQueries({ queryKey: ["advisor-today"] });
      qc.invalidateQueries({ queryKey: ["action-items"] });
      toast.success("Added to your task board");
    },
    onError: () => toast.error("Could not create task"),
  });

  const items = q.data || [];

  return (
    <Card className="p-6" data-testid="action-items-panel">
      <div className="flex items-center justify-between mb-4">
        <h3 className="font-heading font-bold text-compass-navy flex items-center gap-2">
          <ListChecks size={18} className="text-compass-blue" /> Action items
        </h3>
        <Badge color={items.length ? "#FFB800" : "#00A36C"} bg={items.length ? "rgba(255,184,0,0.14)" : "rgba(0,163,108,0.12)"} data-testid="action-items-count">
          {items.length}
        </Badge>
      </div>
      {items.length === 0 ? (
        <div className="text-sm text-compass-muted py-6 text-center" data-testid="action-items-empty">
          No open action items — this household is in great shape. 🎯
        </div>
      ) : (
        <div className="space-y-2">
          {items.map((it) => {
            const s = SEV[it.severity] || SEV.info;
            return (
              <div key={it.id} className="flex items-start gap-3 rounded-xl bg-compass-bg px-4 py-3" data-testid={`action-item-${it.type}`}>
                <span className="h-2 w-2 rounded-full mt-1.5 shrink-0" style={{ background: s.color }} />
                <div className="min-w-0 flex-1">
                  <div className="text-sm font-semibold text-compass-navy">{it.title}</div>
                  <div className="text-xs text-compass-muted">{it.detail}</div>
                  <div className="text-xs font-semibold mt-0.5" style={{ color: s.color }}>Next: {it.action}</div>
                </div>
                {canConvert && (
                  <Button size="sm" variant="outline" onClick={() => convert.mutate(it)} disabled={convert.isPending} data-testid={`action-item-convert-${it.type}`}>
                    <Plus size={13} /> Task
                  </Button>
                )}
              </div>
            );
          })}
        </div>
      )}
    </Card>
  );
}
