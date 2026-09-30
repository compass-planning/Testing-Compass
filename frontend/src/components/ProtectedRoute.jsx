import React from "react";
import { Navigate, useLocation } from "react-router-dom";
import { useAuth } from "@/context/AuthContext";
import { CompassMark } from "@/components/Logo";

export default function ProtectedRoute({ children }) {
  const { user } = useAuth();
  const location = useLocation();

  if (user === undefined) {
    return (
      <div className="min-h-screen flex flex-col items-center justify-center gap-4">
        <div className="animate-spin"><CompassMark size={44} /></div>
        <div className="text-sm text-compass-muted">Loading your workspace…</div>
      </div>
    );
  }
  if (user === null) return <Navigate to="/login" state={{ from: location }} replace />;
  return children;
}
