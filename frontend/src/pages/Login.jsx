import React, { useState } from "react";
import { useNavigate, Link, useLocation } from "react-router-dom";
import { toast } from "sonner";
import { ShieldCheck, ArrowRight, Building2, UserCog, User as UserIcon } from "lucide-react";
import { useAuth } from "@/context/AuthContext";
import { Logo } from "@/components/Logo";
import { Button, Input, Field } from "@/components/ui-kit";
import { formatApiError } from "@/lib/api";

const DEMOS = [
  { email: "scott@sweston.ca", label: "Enterprise Admin", icon: Building2, desc: "CRM-driven, corp-scoped" },
  { email: "advisor@compass.ca", label: "Advisor", icon: UserCog, desc: "Client roster & households" },
  { email: "solo@compass.ca", label: "Solo Planner", icon: UserIcon, desc: "Self-serve retirement" },
];

export default function Login() {
  const { login } = useAuth();
  const nav = useNavigate();
  const loc = useLocation();
  const [email, setEmail] = useState("");
  const [password, setPassword] = useState("");
  const [loading, setLoading] = useState(false);

  const submit = async (e) => {
    e.preventDefault();
    setLoading(true);
    try {
      await login(email, password);
      toast.success("Signed in");
      nav("/dashboard", { replace: true });
    } catch (err) {
      toast.error(formatApiError(err.response?.data?.detail) || "Login failed");
    } finally {
      setLoading(false);
    }
  };

  const quick = (em) => {
    setEmail(em);
    setPassword("Compass2026!");
  };

  return (
    <div className="min-h-screen grid lg:grid-cols-2">
      {/* Brand panel */}
      <div className="relative hidden lg:flex flex-col justify-between p-12 overflow-hidden gradient-bg">
        <div className="relative z-10"><Logo dark /></div>
        <div className="relative z-10 text-white max-w-md">
          <h2 className="font-heading text-4xl font-extrabold leading-tight">
            Retirement planning built on trust and isolation.
          </h2>
          <p className="mt-4 text-white/80">
            Three tiers, one locked design system. Enterprise, Advisor, and Solo — each with
            server-enforced tenant isolation and PIPEDA-compliant governance.
          </p>
          <div className="mt-8 flex items-center gap-2 text-sm font-semibold">
            <ShieldCheck size={18} /> PIPEDA compliant · Canadian-resident
          </div>
        </div>
        <div className="absolute -right-24 -bottom-24 h-96 w-96 rounded-full bg-white/10" />
        <div className="absolute right-20 top-20 h-40 w-40 rounded-full bg-white/10" />
      </div>

      {/* Form panel */}
      <div className="flex items-center justify-center p-6 sm:p-12 bg-white">
        <div className="w-full max-w-sm">
          <div className="lg:hidden mb-8"><Logo /></div>
          <h1 className="font-heading text-2xl font-extrabold text-compass-navy">Sign in</h1>
          <p className="text-sm text-compass-muted mt-1 mb-6">Access your Compass Planning workspace.</p>

          <form onSubmit={submit} className="space-y-4" data-testid="login-form">
            <Field label="Email">
              <Input type="email" required value={email} onChange={(e) => setEmail(e.target.value)}
                placeholder="you@firm.ca" data-testid="login-email" />
            </Field>
            <Field label="Password">
              <Input type="password" required value={password} onChange={(e) => setPassword(e.target.value)}
                placeholder="••••••••" data-testid="login-password" />
            </Field>
            <Button type="submit" className="w-full" disabled={loading} data-testid="login-submit">
              {loading ? "Signing in…" : "Sign in"} <ArrowRight size={16} />
            </Button>
          </form>

          <div className="mt-6">
            <div className="muted-label mb-2">Try a demo workspace</div>
            <div className="space-y-2">
              {DEMOS.map((d) => (
                <button key={d.email} onClick={() => quick(d.email)} data-testid={`demo-${d.label.split(" ")[0].toLowerCase()}`}
                  className="flex w-full items-center gap-3 rounded-xl border border-compass-border px-3 py-2.5 text-left hover:border-compass-blue transition-colors">
                  <d.icon size={18} className="text-compass-blue" />
                  <div className="flex-1">
                    <div className="text-sm font-semibold text-compass-navy">{d.label}</div>
                    <div className="text-xs text-compass-muted">{d.desc}</div>
                  </div>
                  <span className="text-xs text-compass-muted">use</span>
                </button>
              ))}
            </div>
          </div>

          <p className="text-sm text-compass-muted mt-6 text-center">
            New here?{" "}
            <Link to="/register" className="font-semibold text-compass-blue" data-testid="go-register">
              Create a Solo account
            </Link>
          </p>
        </div>
      </div>
    </div>
  );
}
