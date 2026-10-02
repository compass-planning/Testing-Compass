import React, { useEffect, useState } from "react";
import { useNavigate } from "react-router-dom";
import { useQuery } from "@tanstack/react-query";
import {
  Users, LayoutDashboard, ScrollText, Scale, Target, CreditCard, PiggyBank,
  GraduationCap, Shield, Globe, Receipt, Building2, FileText, FileBarChart, Brain,
} from "lucide-react";
import api from "@/lib/api";
import { useHousehold } from "@/context/HouseholdContext";
import {
  CommandDialog, CommandInput, CommandList, CommandEmpty, CommandGroup, CommandItem, CommandShortcut,
} from "@/components/ui/command";

const PAGES = [
  { to: "/dashboard", label: "Dashboard", icon: LayoutDashboard },
  { to: "/clients", label: "Clients", icon: Users },
  { to: "/tasks", label: "Tasks", icon: ScrollText },
  { to: "/profile", label: "Client Profile", icon: Users },
  { to: "/networth", label: "Net Worth", icon: Scale },
  { to: "/goals", label: "Goals", icon: Target },
  { to: "/debt", label: "Debt", icon: CreditCard },
  { to: "/retirement", label: "Retirement", icon: PiggyBank },
  { to: "/education", label: "Education", icon: GraduationCap },
  { to: "/insurance", label: "Insurance", icon: Shield },
  { to: "/crossborder", label: "Cross-Border", icon: Globe },
  { to: "/cashflow", label: "Cash Flow", icon: Receipt },
  { to: "/tax", label: "Tax & Estate", icon: Building2 },
  { to: "/documents", label: "Documents", icon: FileText },
  { to: "/ai", label: "AI Insights", icon: Brain },
  { to: "/report", label: "Client Report", icon: FileBarChart },
];

export default function CommandPalette() {
  const [open, setOpen] = useState(false);
  const nav = useNavigate();
  const { setActive } = useHousehold();
  const clients = useQuery({
    queryKey: ["command-clients"],
    queryFn: async () => (await api.get("/advisor/clients")).data,
    enabled: open,
  });

  useEffect(() => {
    const onKey = (e) => {
      if ((e.metaKey || e.ctrlKey) && e.key.toLowerCase() === "k") {
        e.preventDefault();
        setOpen((o) => !o);
      }
    };
    const onOpen = () => setOpen(true);
    document.addEventListener("keydown", onKey);
    window.addEventListener("open-command", onOpen);
    return () => { document.removeEventListener("keydown", onKey); window.removeEventListener("open-command", onOpen); };
  }, []);

  const go = (to) => { setOpen(false); nav(to); };
  const openClient = (c) => { setActive(c.client_id, c.primary || c.client_id); setOpen(false); nav("/profile"); };

  return (
    <CommandDialog open={open} onOpenChange={setOpen}>
      <CommandInput placeholder="Search clients or jump to a page…" data-testid="command-input" />
      <CommandList>
        <CommandEmpty>No results found.</CommandEmpty>
        <CommandGroup heading="Clients">
          {(clients.data || []).map((c) => (
            <CommandItem
              key={c.client_id}
              value={`client ${c.primary || ""} ${(c.members || []).join(" ")}`}
              onSelect={() => openClient(c)}
              data-testid={`cmd-client-${c.client_id}`}
            >
              <Users /> <span>{c.primary || c.client_id}</span>
              {c.status && <CommandShortcut>{c.status}</CommandShortcut>}
            </CommandItem>
          ))}
        </CommandGroup>
        <CommandGroup heading="Navigate">
          {PAGES.map((p) => (
            <CommandItem
              key={p.to}
              value={`go ${p.label}`}
              onSelect={() => go(p.to)}
              data-testid={`cmd-nav-${p.to.slice(1)}`}
            >
              <p.icon /> <span>{p.label}</span>
            </CommandItem>
          ))}
        </CommandGroup>
      </CommandList>
    </CommandDialog>
  );
}
