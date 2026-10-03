import React from "react";
import { NavLink, Outlet, useNavigate, Navigate } from "react-router-dom";
import { LayoutDashboard, Users, CreditCard, Megaphone, LifeBuoy, Activity, LogOut, ShieldCheck, ScrollText, Inbox } from "lucide-react";
import { useAuth } from "@/context/AuthContext";
import { Logo } from "@/components/Logo";

const NAV = [
  { to: "/admin", label: "Overview", icon: LayoutDashboard, end: true },
  { to: "/admin/accounts", label: "Accounts", icon: Users },
  { to: "/admin/billing", label: "Billing", icon: CreditCard },
  { to: "/admin/announcements", label: "Announcements", icon: Megaphone },
  { to: "/admin/tickets", label: "Tickets", icon: LifeBuoy },
  { to: "/admin/leads", label: "Leads", icon: Inbox },
  { to: "/admin/status", label: "Status & Health", icon: Activity },
  { to: "/admin/audit", label: "Audit Trail", icon: ScrollText },
];

const linkCls = ({ isActive }) =>
  `flex items-center gap-3 rounded-xl px-4 py-2.5 text-sm font-semibold transition-colors ${
    isActive ? "gradient-bg text-white shadow-[0_4px_14px_rgba(0,82,255,0.25)]" : "text-compass-navy hover:bg-compass-bg"
  }`;

export default function AdminLayout() {
  const { user, logout } = useAuth();
  const nav = useNavigate();
  if (user === undefined) return null;
  if (!user || user.tier !== "admin") return <Navigate to="/dashboard" replace />;
  const doLogout = () => { logout(); nav("/login"); };
  return (
    <div className="min-h-screen bg-compass-bg">
      <aside className="hidden lg:flex fixed inset-y-0 left-0 w-64 bg-white border-r border-compass-border z-30 flex-col">
        <div className="px-5 py-5 border-b border-compass-border"><Logo /></div>
        <div className="px-4 pt-4 pb-1 flex items-center gap-2 text-compass-blue">
          <ShieldCheck size={16} /><span className="text-[11px] font-bold uppercase tracking-widest">Platform Admin</span>
        </div>
        <nav className="flex-1 px-3 space-y-1 mt-1">
          {NAV.map((it) => (
            <NavLink key={it.to} to={it.to} end={it.end} data-testid={`admin-nav-${it.label.toLowerCase().split(" ")[0]}`} className={linkCls}>
              <it.icon size={18} /> {it.label}
            </NavLink>
          ))}
        </nav>
        <div className="p-4 border-t border-compass-border">
          <div className="text-sm font-semibold text-compass-navy truncate">{user.name}</div>
          <div className="text-xs text-compass-muted truncate mb-3">{user.email}</div>
          <button onClick={doLogout} data-testid="admin-logout" className="flex w-full items-center gap-2 rounded-xl px-4 py-2.5 text-sm font-semibold text-compass-red hover:bg-compass-red/10">
            <LogOut size={16} /> Sign out
          </button>
        </div>
      </aside>

      {/* Mobile top nav */}
      <div className="lg:hidden sticky top-0 z-20 bg-white border-b border-compass-border">
        <div className="px-4 py-3 flex items-center justify-between">
          <Logo compact />
          <button onClick={doLogout} data-testid="admin-logout-mobile" className="text-compass-red"><LogOut size={18} /></button>
        </div>
        <nav className="flex gap-1 overflow-x-auto px-3 pb-2">
          {NAV.map((it) => (
            <NavLink key={it.to} to={it.to} end={it.end} className={({ isActive }) => `whitespace-nowrap rounded-lg px-3 py-1.5 text-xs font-semibold ${isActive ? "gradient-bg text-white" : "text-compass-navy bg-compass-bg"}`}>
              {it.label}
            </NavLink>
          ))}
        </nav>
      </div>

      <div className="lg:pl-64">
        <main className="px-4 sm:px-8 py-6 max-w-[1200px] mx-auto animate-fade-up" data-testid="admin-main"><Outlet /></main>
      </div>
    </div>
  );
}
