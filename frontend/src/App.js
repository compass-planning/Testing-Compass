import React from "react";
import { BrowserRouter, Routes, Route, Navigate } from "react-router-dom";
import { Toaster } from "sonner";
import "@/App.css";
import { AuthProvider, useAuth } from "@/context/AuthContext";
import { HouseholdProvider, useHousehold } from "@/context/HouseholdContext";
import ProtectedRoute from "@/components/ProtectedRoute";
import Shell from "@/components/Shell";
import Login from "@/pages/Login";
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
import Retirement from "@/pages/Retirement";
import AIInsights from "@/pages/AIInsights";
import FinancialPlan from "@/pages/FinancialPlan";
import InsightDashboard from "@/pages/InsightDashboard";
import ClientProfile from "@/pages/ClientProfile";
import NetWorth from "@/pages/NetWorth";

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
        <Toaster position="top-right" richColors />
        <BrowserRouter>
          <Routes>
            <Route path="/login" element={<Login />} />
            <Route path="/register" element={<Register />} />
            <Route
              element={
                <ProtectedRoute>
                  <Shell />
                </ProtectedRoute>
              }
            >
              <Route path="/dashboard" element={<Dashboard />} />
              <Route path="/owners" element={<TierRoute tiers={["enterprise", "solo"]}><Owners /></TierRoute>} />
              <Route path="/clients" element={<TierRoute tiers={["advisor"]}><AdvisorClients /></TierRoute>} />
              <Route path="/crm" element={<TierRoute tiers={["enterprise"]}><CrmSync /></TierRoute>} />
              <Route path="/promotion" element={<TierRoute tiers={["solo"]}><Promotion /></TierRoute>} />
              <Route path="/insights" element={<RequireHousehold><InsightDashboard /></RequireHousehold>} />
              <Route path="/profile" element={<RequireHousehold><ClientProfile /></RequireHousehold>} />
              <Route path="/networth" element={<RequireHousehold><NetWorth /></RequireHousehold>} />
              <Route path="/goals" element={<RequireHousehold><Goals /></RequireHousehold>} />
              <Route path="/debt" element={<RequireHousehold><PlanningPage kind="debts" /></RequireHousehold>} />
              <Route path="/cashflow" element={<RequireHousehold><PlanningPage kind="expenses" /></RequireHousehold>} />
              <Route path="/insurance" element={<RequireHousehold><PlanningPage kind="insurance" /></RequireHousehold>} />
              <Route path="/tax" element={<RequireHousehold><PlanningPage kind="tax_notes" /></RequireHousehold>} />
              <Route path="/documents" element={<RequireHousehold><PlanningPage kind="documents" /></RequireHousehold>} />
              <Route path="/retirement" element={<RequireHousehold><Retirement /></RequireHousehold>} />
              <Route path="/ai" element={<RequireHousehold><AIInsights /></RequireHousehold>} />
              <Route path="/plan" element={<RequireHousehold><FinancialPlan /></RequireHousehold>} />
              <Route path="/privacy" element={<Privacy />} />
              <Route path="/audit" element={<AuditLog />} />
            </Route>
            <Route path="*" element={<Navigate to="/dashboard" replace />} />
          </Routes>
        </BrowserRouter>
      </HouseholdProvider>
    </AuthProvider>
  );
}

export default App;
