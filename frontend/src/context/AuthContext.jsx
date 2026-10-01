import React, { createContext, useContext, useEffect, useState } from "react";
import { useQueryClient } from "@tanstack/react-query";
import api, { setToken } from "@/lib/api";

const AuthCtx = createContext(null);
export const useAuth = () => useContext(AuthCtx);

export function AuthProvider({ children }) {
  const [user, setUser] = useState(undefined); // undefined=loading, null=unauth
  const qc = useQueryClient();

  useEffect(() => {
    (async () => {
      try {
        const { data } = await api.get("/auth/me");
        localStorage.setItem("compass_tier", data.tier);
        setUser(data);
      } catch {
        setUser(null);
      }
    })();
  }, []);

  const login = async (email, password) => {
    qc.clear();
    const { data } = await api.post("/auth/login", { email, password });
    setToken(data.token);
    localStorage.setItem("compass_tier", data.user.tier);
    setUser(data.user);
    return data.user;
  };

  const register = async (payload) => {
    qc.clear();
    const { data } = await api.post("/auth/register", payload);
    setToken(data.token);
    localStorage.setItem("compass_tier", data.user.tier);
    setUser(data.user);
    return data.user;
  };

  const logout = () => {
    setToken(null);
    localStorage.removeItem("compass_tier");
    localStorage.removeItem("compass_active_household");
    localStorage.removeItem("compass_active_household_name");
    qc.clear();
    setUser(null);
  };

  const refresh = async () => {
    const { data } = await api.get("/auth/me");
    setUser(data);
    return data;
  };

  return (
    <AuthCtx.Provider value={{ user, login, register, logout, refresh, setUser }}>
      {children}
    </AuthCtx.Provider>
  );
}
