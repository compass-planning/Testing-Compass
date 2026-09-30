import React from "react";
import { BrowserRouter, Routes, Route, Navigate } from "react-router-dom";
import { Toaster } from "sonner";
import "@/App.css";
import { AuthProvider, useAuth } from "@/context/AuthContext";
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

function TierRoute({ tiers, children }) {
  const { user } = useAuth();
  if (!tiers.includes(user.tier)) return <Navigate to="/dashboard" replace />;
  return children;
}

function App() {
  return (
    <AuthProvider>
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
            <Route path="/goals" element={<Goals />} />
            <Route path="/clients" element={<TierRoute tiers={["advisor"]}><AdvisorClients /></TierRoute>} />
            <Route path="/crm" element={<TierRoute tiers={["enterprise"]}><CrmSync /></TierRoute>} />
            <Route path="/promotion" element={<TierRoute tiers={["solo"]}><Promotion /></TierRoute>} />
            <Route path="/privacy" element={<Privacy />} />
            <Route path="/audit" element={<AuditLog />} />
          </Route>
          <Route path="*" element={<Navigate to="/dashboard" replace />} />
        </Routes>
      </BrowserRouter>
    </AuthProvider>
  );
}

export default App;
