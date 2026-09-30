import React, { useState } from "react";
import { NavLink, Outlet, useNavigate } from "react-router-dom";
import {
  LayoutDashboard, Users, Target, ShieldCheck, ScrollText, RefreshCw,
  ArrowUpCircle, LogOut, Menu, X, Building2, UserCog, User as UserIcon,
} from "lucide-react";
import { useAuth } from "@/context/AuthContext";
import { Logo, CompassMark } from "@/components/Logo";
import { Badge } from "@/components/ui-kit";
import { TIER_META } from "@/lib/format";

const NAV = {
  enterprise: [
    { to: "/dashboard", label: "Dashboard", icon: LayoutDashboard },
    { to: "/owners", label: "Households", icon: Users },
    { to: "/goals", label: "Goals", icon: Target },
    { to: "/crm", label: "CRM Sync", icon: RefreshCw },
    { to: "/privacy", label: "Privacy & PIPEDA", icon: ShieldCheck },
    { to: "/audit", label: "Audit Log", icon: ScrollText },
  ],
  advisor: [
    { to: "/dashboard", label: "Dashboard", icon: LayoutDashboard },
    { to: "/clients", label: "Clients", icon: Users },
    { to: "/goals", label: "Goals", icon: Target },
    { to: "/privacy", label: "Privacy & PIPEDA", icon: ShieldCheck },
    { to: "/audit", label: "Audit Log", icon: ScrollText },
  ],
  solo: [
    { to: "/dashboard", label: "Dashboard", icon: LayoutDashboard },
    { to: "/owners", label: "My Household", icon: Users },
    { to: "/goals", label: "My Goals", icon: Target },
    { to: "/promotion", label: "Work with an Advisor", icon: ArrowUpCircle },
    { to: "/privacy", label: "Privacy & PIPEDA", icon: ShieldCheck },
    { to: "/audit", label: "Activity Log", icon: ScrollText },
  ],
};

const TIER_ICON = { enterprise: Building2, advisor: UserCog, solo: UserIcon };

export default function Shell() {
  const { user, logout } = useAuth();
  const nav = useNavigate();
  const [open, setOpen] = useState(false);
  const items = NAV[user.tier] || [];
  const TierIcon = TIER_ICON[user.tier];

  const doLogout = () => {
    logout();
    nav("/login");
  };

  const SidebarInner = (
    <div className="flex h-full flex-col">
      <div className="px-6 py-6 border-b border-compass-border">
        <Logo />
      </div>
      <div className="px-4 py-4">
        <div className="flex items-center gap-2 rounded-xl bg-compass-bg px-3 py-2.5">
          <TierIcon size={18} className="text-compass-blue" />
          <div className="leading-tight">
            <div className="text-sm font-bold text-compass-navy">{TIER_META[user.tier].label} Tier</div>
            <div className="text-[10px] text-compass-muted uppercase tracking-wide">{TIER_META[user.tier].sub}</div>
          </div>
        </div>
      </div>
      <nav className="flex-1 px-3 space-y-1 overflow-y-auto">
        {items.map((it) => (
          <NavLink
            key={it.to}
            to={it.to}
            onClick={() => setOpen(false)}
            data-testid={`nav-${it.to.slice(1)}`}
            className={({ isActive }) =>
              `flex items-center gap-3 rounded-xl px-4 py-2.5 text-sm font-semibold transition-colors duration-150 ${
                isActive ? "gradient-bg text-white shadow-[0_4px_14px_rgba(0,82,255,0.25)]" : "text-compass-navy hover:bg-compass-bg"
              }`
            }
          >
            <it.icon size={18} />
            {it.label}
          </NavLink>
        ))}
      </nav>
      <div className="p-4 border-t border-compass-border">
        <div className="flex items-center gap-3 mb-3">
          <div className="h-9 w-9 rounded-full gradient-bg flex items-center justify-center text-white text-sm font-bold">
            {user.name.slice(0, 1)}
          </div>
          <div className="min-w-0">
            <div className="text-sm font-semibold text-compass-navy truncate">{user.name}</div>
            <div className="text-xs text-compass-muted truncate">{user.email}</div>
          </div>
        </div>
        <button
          onClick={doLogout}
          data-testid="logout-button"
          className="flex w-full items-center gap-2 rounded-xl px-4 py-2.5 text-sm font-semibold text-compass-red hover:bg-compass-red/10 transition-colors"
        >
          <LogOut size={16} /> Sign out
        </button>
      </div>
    </div>
  );

  return (
    <div className="min-h-screen bg-compass-bg">
      {/* Desktop sidebar */}
      <aside className="hidden lg:flex fixed inset-y-0 left-0 w-72 bg-white border-r border-compass-border z-30">
        {SidebarInner}
      </aside>

      {/* Mobile drawer */}
      {open && (
        <div className="lg:hidden fixed inset-0 z-40 bg-compass-navy/40 backdrop-blur-sm" onClick={() => setOpen(false)}>
          <aside className="absolute inset-y-0 left-0 w-72 bg-white" onClick={(e) => e.stopPropagation()}>
            {SidebarInner}
          </aside>
        </div>
      )}

      <div className="lg:pl-72">
        {/* Topbar */}
        <header className="sticky top-0 z-20 flex items-center justify-between gap-4 bg-white/90 backdrop-blur-md border-b border-compass-border px-4 sm:px-8 py-3.5">
          <div className="flex items-center gap-3">
            <button className="lg:hidden" onClick={() => setOpen(true)} data-testid="menu-toggle">
              {open ? <X /> : <Menu />}
            </button>
            <div className="lg:hidden"><CompassMark size={28} /></div>
            <span className="hidden sm:inline text-sm text-compass-muted">
              Welcome back, <span className="font-semibold text-compass-navy">{user.name.split(" ")[0]}</span>
            </span>
          </div>
          <div className="flex items-center gap-2">
            {user.mfa_enabled ? (
              <Badge color="#00DF89" bg="rgba(0,223,137,0.12)" data-testid="mfa-badge">
                <ShieldCheck size={13} /> MFA On
              </Badge>
            ) : (
              <Badge color="#FFB800" bg="rgba(255,184,0,0.14)" data-testid="mfa-badge">
                <ShieldCheck size={13} /> MFA Off
              </Badge>
            )}
            <Badge color="#0052FF" bg="rgba(0,82,255,0.08)">{TIER_META[user.tier].label}</Badge>
          </div>
        </header>

        <main className="px-4 sm:px-8 py-6 sm:py-8 max-w-[1400px] mx-auto animate-fade-up" data-testid="app-main">
          <Outlet />
        </main>
      </div>
    </div>
  );
}
