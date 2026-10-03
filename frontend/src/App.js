import React from "react";
import { BrowserRouter, Routes, Route, Navigate } from "react-router-dom";
import { Toaster } from "sonner";
import "@/App.css";
import { AuthProvider, useAuth } from "@/context/AuthContext";
import { HouseholdProvider, useHousehold } from "@/context/HouseholdContext";
import { LanguageProvider } from "@/lib/i18n";
import ProtectedRoute from "@/components/ProtectedRoute";
import Shell from "@/components/Shell";
import Login from "@/pages/Login";
import Landing from "@/pages/Landing";
import Register from "@/pages/Register";
import Dashboard from "@/pages/Dashboard";
import Owners from "@/pages/Owners";
import Goals from "@/pages/Goals";
import AdvisorClients from "@/pages/AdvisorClients";
import CrmSync from "@/pages/CrmSync";
import Privacy from "@/pages/Privacy";
import AuditLog from "@/pages/AuditLog";
import Promotion from "@/pages/Promotion";
import PlanningPage from "@/components/PlanningPage";
import Documents from "@/pages/Documents";
import ClientReport from "@/pages/ClientReport";
import Activate from "@/pages/Activate";
import Retirement from "@/pages/Retirement";
import AIInsights from "@/pages/AIInsights";
import FinancialPlan from "@/pages/FinancialPlan";
import InsightDashboard from "@/pages/InsightDashboard";
import ClientProfile from "@/pages/ClientProfile";
import NetWorth from "@/pages/NetWorth";
import Debt from "@/pages/Debt";
import CashFlow from "@/pages/CashFlow";
import Insurance from "@/pages/Insurance";
import Tax from "@/pages/Tax";
import MyPlan from "@/pages/MyPlan";
import TaskBoard from "@/pages/TaskBoard";
import Education from "@/pages/Education";
import CrossBorder from "@/pages/CrossBorder";
import SecuritySettings from "@/pages/SecuritySettings";
import BillingSelfService from "@/pages/BillingSelfService";
import Support from "@/pages/Support";
import AdminLayout from "@/components/AdminLayout";
import AdminOverview from "@/pages/admin/AdminOverview";
import AdminAccounts from "@/pages/admin/AdminAccounts";
import AdminBilling from "@/pages/admin/AdminBilling";
import AdminAnnouncements from "@/pages/admin/AdminAnnouncements";
import AdminTickets from "@/pages/admin/AdminTickets";
import AdminStatus from "@/pages/admin/AdminStatus";
import AdminAudit from "@/pages/admin/AdminAudit";
import AdminLeads from "@/pages/admin/AdminLeads";
import Legal from "@/pages/Legal";

function TierRoute({ tiers, children }) {
  const { user } = useAuth();
  if (!tiers.includes(user.tier)) return <Navigate to="/dashboard" replace />;
  return children;
}

function RequireHousehold({ children }) {
  const { user } = useAuth();
  const { active } = useHousehold();
  if (user.tier !== "solo" && !active) return <Navigate to={user.tier === "enterprise" ? "/owners" : "/clients"} replace />;
  return children;
}

function App() {
  return (
    <AuthProvider>
      <HouseholdProvider>
        <LanguageProvider>
        <Toaster position="top-right" richColors />
        <BrowserRouter>
          <Routes>
            <Route path="/" element={<Landing />} />
            <Route path="/privacy-policy" element={<Legal doc="privacy" />} />
            <Route path="/pipeda" element={<Legal doc="pipeda" />} />
            <Route path="/terms" element={<Legal doc="terms" />} />
            <Route path="/login" element={<Login />} />
            <Route path="/register" element={<Register />} />
            <Route path="/activate" element={<Activate />} />
            <Route
              element={
                <ProtectedRoute>
                  <Shell />
                </ProtectedRoute>
              }
            >
              <Route path="/dashboard" element={<Dashboard />} />
              <Route path="/my-plan" element={<MyPlan />} />
              <Route path="/tasks" element={<TierRoute tiers={["advisor"]}><TaskBoard /></TierRoute>} />
              <Route path="/owners" element={<TierRoute tiers={["enterprise", "solo"]}><Owners /></TierRoute>} />
              <Route path="/clients" element={<TierRoute tiers={["advisor"]}><AdvisorClients /></TierRoute>} />
              <Route path="/crm" element={<TierRoute tiers={["enterprise"]}><CrmSync /></TierRoute>} />
              <Route path="/promotion" element={<TierRoute tiers={["solo"]}><Promotion /></TierRoute>} />
              <Route path="/insights" element={<RequireHousehold><InsightDashboard /></RequireHousehold>} />
              <Route path="/profile" element={<RequireHousehold><ClientProfile /></RequireHousehold>} />
              <Route path="/networth" element={<RequireHousehold><NetWorth /></RequireHousehold>} />
              <Route path="/goals" element={<RequireHousehold><Goals /></RequireHousehold>} />
              <Route path="/debt" element={<RequireHousehold><Debt /></RequireHousehold>} />
              <Route path="/cashflow" element={<RequireHousehold><CashFlow /></RequireHousehold>} />
              <Route path="/insurance" element={<RequireHousehold><Insurance /></RequireHousehold>} />
              <Route path="/tax" element={<RequireHousehold><Tax /></RequireHousehold>} />
              <Route path="/documents" element={<RequireHousehold><Documents /></RequireHousehold>} />
              <Route path="/retirement" element={<RequireHousehold><Retirement /></RequireHousehold>} />
              <Route path="/education" element={<RequireHousehold><Education /></RequireHousehold>} />
              <Route path="/crossborder" element={<RequireHousehold><CrossBorder /></RequireHousehold>} />
              <Route path="/ai" element={<RequireHousehold><AIInsights /></RequireHousehold>} />
              <Route path="/plan" element={<RequireHousehold><FinancialPlan /></RequireHousehold>} />
              <Route path="/report" element={<RequireHousehold><ClientReport /></RequireHousehold>} />
              <Route path="/privacy" element={<Privacy />} />
              <Route path="/audit" element={<AuditLog />} />
              <Route path="/security" element={<SecuritySettings />} />
              <Route path="/billing" element={<BillingSelfService />} />
              <Route path="/support" element={<Support />} />
            </Route>
            <Route
              element={
                <ProtectedRoute>
                  <AdminLayout />
                </ProtectedRoute>
              }
            >
              <Route path="/admin" element={<AdminOverview />} />
              <Route path="/admin/accounts" element={<AdminAccounts />} />
              <Route path="/admin/billing" element={<AdminBilling />} />
              <Route path="/admin/announcements" element={<AdminAnnouncements />} />
              <Route path="/admin/tickets" element={<AdminTickets />} />
              <Route path="/admin/status" element={<AdminStatus />} />
              <Route path="/admin/audit" element={<AdminAudit />} />
              <Route path="/admin/leads" element={<AdminLeads />} />
            </Route>
            <Route path="*" element={<Navigate to="/dashboard" replace />} />
          </Routes>
        </BrowserRouter>
        </LanguageProvider>
      </HouseholdProvider>
    </AuthProvider>
  );
}

export default App;
