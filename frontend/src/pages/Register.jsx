import React, { useState } from "react";
import { useNavigate, Link } from "react-router-dom";
import { toast } from "sonner";
import { ArrowRight } from "lucide-react";
import { useAuth } from "@/context/AuthContext";
import { Logo } from "@/components/Logo";
import { Button, Input, Field, Toggle } from "@/components/ui-kit";
import { formatApiError } from "@/lib/api";

export default function Register() {
  const { register } = useAuth();
  const nav = useNavigate();
  const [form, setForm] = useState({ name: "", email: "", password: "" });
  const [consent, setConsent] = useState(true);
  const [loading, setLoading] = useState(false);

  const set = (k) => (e) => setForm({ ...form, [k]: e.target.value });

  const submit = async (e) => {
    e.preventDefault();
    if (!consent) return toast.error("Data-processing consent is required to create an account");
    setLoading(true);
    try {
      await register({ ...form, consent_data_processing: consent });
      toast.success("Welcome to Compass Planning");
      nav("/dashboard", { replace: true });
    } catch (err) {
      toast.error(formatApiError(err.response?.data?.detail) || "Registration failed");
    } finally {
      setLoading(false);
    }
  };

  return (
    <div className="min-h-screen flex items-center justify-center p-6 bg-compass-bg">
      <div className="w-full max-w-md compass-card p-8">
        <Logo />
        <h1 className="font-heading text-2xl font-extrabold text-compass-navy mt-6">Create your Solo account</h1>
        <p className="text-sm text-compass-muted mt-1 mb-6">Self-serve retirement planning. Upgrade to an advisor anytime.</p>

        <form onSubmit={submit} className="space-y-4" data-testid="register-form">
          <Field label="Full name">
            <Input required value={form.name} onChange={set("name")} placeholder="Jordan Blake" data-testid="register-name" />
          </Field>
          <Field label="Email">
            <Input type="email" required value={form.email} onChange={set("email")} placeholder="you@email.ca" data-testid="register-email" />
          </Field>
          <Field label="Password" hint="At least 6 characters">
            <Input type="password" required minLength={6} value={form.password} onChange={set("password")} placeholder="••••••••" data-testid="register-password" />
          </Field>

          <div className="flex items-start gap-3 rounded-xl bg-compass-bg p-3">
            <Toggle checked={consent} onChange={setConsent} testid="register-consent" />
            <div className="text-xs text-compass-navy">
              I consent to Compass Planning processing my personal data to provide retirement planning services, in
              accordance with <span className="font-semibold">PIPEDA</span>. You can export or erase your data at any time.
            </div>
          </div>

          <Button type="submit" className="w-full" disabled={loading} data-testid="register-submit">
            {loading ? "Creating…" : "Create account"} <ArrowRight size={16} />
          </Button>
        </form>

        <p className="text-sm text-compass-muted mt-6 text-center">
          Already have an account?{" "}
          <Link to="/login" className="font-semibold text-compass-blue" data-testid="go-login">Sign in</Link>
        </p>
      </div>
    </div>
  );
}
