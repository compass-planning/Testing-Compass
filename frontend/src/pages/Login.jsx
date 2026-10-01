import React, { useState } from "react";
import { useNavigate, Link } from "react-router-dom";
import { toast } from "sonner";
import { ShieldCheck, ArrowRight, Building2, UserCog, User as UserIcon, ArrowLeft, KeyRound, QrCode } from "lucide-react";
import { useAuth } from "@/context/AuthContext";
import { Logo } from "@/components/Logo";
import { Button, Input, Field, Select } from "@/components/ui-kit";
import api, { formatApiError } from "@/lib/api";

const DEMOS = [
  { email: "scott@sweston.ca", label: "Enterprise Admin", icon: Building2, desc: "CRM-driven, corp-scoped" },
  { email: "advisor@compass.ca", label: "Advisor", icon: UserCog, desc: "Client roster & households" },
  { email: "solo@compass.ca", label: "Solo Planner", icon: UserIcon, desc: "Self-serve retirement" },
];

const err = (e, fb) => toast.error(formatApiError(e.response?.data?.detail) || fb);

export default function Login() {
  const { login, applySession } = useAuth();
  const nav = useNavigate();
  const [step, setStep] = useState("password");
  const [loading, setLoading] = useState(false);
  const [email, setEmail] = useState("");
  const [password, setPassword] = useState("");
  const [code, setCode] = useState("");
  const [ctx, setCtx] = useState({}); // challenge, setup_token, qr, secret, questions, resetQuestion

  const finish = (data) => { applySession(data.token, data.user); toast.success("Signed in"); nav("/dashboard", { replace: true }); };

  const handleAuth = (d) => {
    if (d.status === "password_change_required") { setCtx((c) => ({ ...c, change_token: d.change_token })); setStep("change"); return; }
    finish(d);
  };

  const submitPassword = async (e) => {
    e.preventDefault(); setLoading(true);
    try {
      const d = await login(email, password);
      if (d.status === "mfa_required") { setCtx({ challenge: d.challenge }); setStep("mfa"); }
      else if (d.status === "mfa_setup") { setCtx({ challenge: d.challenge, qr: d.qr, secret: d.secret }); setStep("setup"); }
      setCode("");
    } catch (e) { err(e, "Login failed"); } finally { setLoading(false); }
  };

  const submitCode = async (e) => {
    e.preventDefault(); setLoading(true);
    try {
      const { data: d } = await api.post("/auth/mfa/verify", { challenge: ctx.challenge, code });
      if (d.status === "security_required") { setCtx((c) => ({ ...c, setup_token: d.setup_token, questions: d.questions })); setStep("security"); }
      else handleAuth(d);
    } catch (e) { err(e, "Invalid code"); } finally { setLoading(false); }
  };

  return (
    <div className="min-h-screen grid lg:grid-cols-2">
      <div className="relative hidden lg:flex flex-col justify-between p-12 overflow-hidden gradient-bg">
        <div className="relative z-10"><Logo dark /></div>
        <div className="relative z-10 text-white max-w-md">
          <h2 className="font-heading text-4xl font-extrabold leading-tight">Retirement planning built on trust and isolation.</h2>
          <p className="mt-4 text-white/80">Three tiers, one locked design system. Every account is protected with two-factor authentication.</p>
          <div className="mt-8 flex items-center gap-2 text-sm font-semibold"><ShieldCheck size={18} /> PIPEDA compliant · TOTP MFA · Canadian-resident</div>
        </div>
        <div className="absolute -right-24 -bottom-24 h-96 w-96 rounded-full bg-white/10" />
      </div>

      <div className="flex items-center justify-center p-6 sm:p-12 bg-white">
        <div className="w-full max-w-sm">
          <div className="lg:hidden mb-8"><Logo /></div>

          {step === "password" && (
            <>
              <h1 className="font-heading text-2xl font-extrabold text-compass-navy">Sign in</h1>
              <p className="text-sm text-compass-muted mt-1 mb-6">Access your Compass Planning workspace.</p>
              <form onSubmit={submitPassword} className="space-y-4" data-testid="login-form">
                <Field label="Email"><Input type="email" required value={email} onChange={(e) => setEmail(e.target.value)} placeholder="you@firm.ca" data-testid="login-email" /></Field>
                <Field label="Password"><Input type="password" required value={password} onChange={(e) => setPassword(e.target.value)} placeholder="••••••••" data-testid="login-password" /></Field>
                <Button type="submit" className="w-full" disabled={loading} data-testid="login-submit">{loading ? "Checking…" : "Continue"} <ArrowRight size={16} /></Button>
              </form>
              <button onClick={() => { setCtx({}); setStep("forgot"); }} className="mt-3 text-sm font-semibold text-compass-blue" data-testid="forgot-link">Forgot password?</button>
              <div className="mt-6">
                <div className="muted-label mb-2">Try a demo workspace</div>
                <div className="space-y-2">
                  {DEMOS.map((d) => (
                    <button key={d.email} onClick={() => { setEmail(d.email); setPassword("Compass2026!"); }} data-testid={`demo-${d.label.split(" ")[0].toLowerCase()}`}
                      className="flex w-full items-center gap-3 rounded-xl border border-compass-border px-3 py-2.5 text-left hover:border-compass-blue transition-colors">
                      <d.icon size={18} className="text-compass-blue" />
                      <div className="flex-1"><div className="text-sm font-semibold text-compass-navy">{d.label}</div><div className="text-xs text-compass-muted">{d.desc}</div></div>
                      <span className="text-xs text-compass-muted">use</span>
                    </button>
                  ))}
                </div>
              </div>
              <p className="text-sm text-compass-muted mt-6 text-center">New here? <Link to="/register" className="font-semibold text-compass-blue" data-testid="go-register">Create a Solo account</Link></p>
            </>
          )}

          {(step === "mfa" || step === "setup") && (
            <>
              <button onClick={() => setStep("password")} className="flex items-center gap-1 text-sm font-semibold text-compass-blue mb-4"><ArrowLeft size={14} /> Back</button>
              <div className="h-11 w-11 rounded-xl gradient-bg flex items-center justify-center text-white mb-4">{step === "setup" ? <QrCode size={22} /> : <KeyRound size={22} />}</div>
              <h1 className="font-heading text-2xl font-extrabold text-compass-navy">{step === "setup" ? "Set up two-factor auth" : "Enter your code"}</h1>
              {step === "setup" ? (
                <>
                  <p className="text-sm text-compass-muted mt-1 mb-4">Scan this QR code with Google Authenticator, Authy or 1Password, then enter the 6-digit code to finish enrollment.</p>
                  {ctx.qr && <img src={ctx.qr} alt="TOTP QR" className="h-44 w-44 rounded-xl border border-compass-border p-2 mb-3" data-testid="mfa-qr" />}
                  <div className="text-xs text-compass-muted mb-4">Can't scan? Enter this key manually: <span className="font-mono text-compass-navy break-all">{ctx.secret}</span></div>
                </>
              ) : (
                <p className="text-sm text-compass-muted mt-1 mb-4">Open your authenticator app and enter the current 6-digit code for Compass Planning.</p>
              )}
              <form onSubmit={submitCode} className="space-y-4" data-testid="mfa-form">
                <Field label="Authentication code"><Input inputMode="numeric" maxLength={6} required value={code} onChange={(e) => setCode(e.target.value.replace(/\D/g, ""))} placeholder="123456" className="tracking-[0.4em] text-center text-lg" data-testid="mfa-code" /></Field>
                <Button type="submit" className="w-full" disabled={loading || code.length < 6} data-testid="mfa-submit">{loading ? "Verifying…" : "Verify"} <ArrowRight size={16} /></Button>
              </form>
            </>
          )}

          {step === "security" && (
            <SecurityStep questions={ctx.questions} setupToken={ctx.setup_token} onDone={handleAuth} />
          )}

          {step === "change" && (
            <ChangeStep changeToken={ctx.change_token} onDone={finish} />
          )}

          {step === "forgot" && (
            <ForgotStep onBack={() => setStep("password")} onFound={(em, q, mfa) => { setEmail(em); setCtx({ resetQuestion: q, mfa }); setStep("reset"); }} />
          )}

          {step === "reset" && (
            <ResetStep email={email} question={ctx.resetQuestion} mfa={ctx.mfa} onDone={() => { setStep("password"); setPassword(""); }} />
          )}
        </div>
      </div>
    </div>
  );
}

function ChangeStep({ changeToken, onDone }) {
  const [pw, setPw] = useState("");
  const [confirm, setConfirm] = useState("");
  const [loading, setLoading] = useState(false);
  const submit = async (e) => {
    e.preventDefault();
    if (pw !== confirm) { toast.error("Passwords do not match"); return; }
    setLoading(true);
    try {
      const { data: d } = await api.post("/auth/change-password", { change_token: changeToken, new_password: pw });
      toast.success("Password updated");
      onDone(d);
    } catch (e) { err(e, "Could not update password"); } finally { setLoading(false); }
  };
  return (
    <>
      <div className="h-11 w-11 rounded-xl gradient-bg flex items-center justify-center text-white mb-4"><KeyRound size={22} /></div>
      <h1 className="font-heading text-2xl font-extrabold text-compass-navy">Set a new password</h1>
      <p className="text-sm text-compass-muted mt-1 mb-4">For your security, please choose a new password before continuing.</p>
      <form onSubmit={submit} className="space-y-4" data-testid="change-password-form">
        <Field label="New password"><Input type="password" required minLength={8} value={pw} onChange={(e) => setPw(e.target.value)} placeholder="At least 8 characters" data-testid="change-new-password" /></Field>
        <Field label="Confirm new password"><Input type="password" required minLength={8} value={confirm} onChange={(e) => setConfirm(e.target.value)} placeholder="Re-enter password" data-testid="change-confirm-password" /></Field>
        <Button type="submit" className="w-full" disabled={loading || pw.length < 8} data-testid="change-submit">{loading ? "Updating…" : "Update & continue"} <ArrowRight size={16} /></Button>
      </form>
    </>
  );
}

function SecurityStep({ questions, setupToken, onDone }) {
  const [question, setQuestion] = useState((questions && questions[0]) || "");
  const [answer, setAnswer] = useState("");
  const [loading, setLoading] = useState(false);
  const submit = async (e) => {
    e.preventDefault(); setLoading(true);
    try {
      const { data: d } = await api.post("/auth/security-question", { setup_token: setupToken, question, answer });
      onDone(d);
    } catch (e) { err(e, "Could not save"); } finally { setLoading(false); }
  };
  return (
    <>
      <div className="h-11 w-11 rounded-xl gradient-bg flex items-center justify-center text-white mb-4"><ShieldCheck size={22} /></div>
      <h1 className="font-heading text-2xl font-extrabold text-compass-navy">Set a recovery question</h1>
      <p className="text-sm text-compass-muted mt-1 mb-4">This is used to recover your account if you ever lose access to your authenticator.</p>
      <form onSubmit={submit} className="space-y-4" data-testid="security-form">
        <Field label="Security question"><Select value={question} onChange={(e) => setQuestion(e.target.value)} data-testid="security-question">{(questions || []).map((q) => <option key={q}>{q}</option>)}</Select></Field>
        <Field label="Your answer"><Input required value={answer} onChange={(e) => setAnswer(e.target.value)} data-testid="security-answer" /></Field>
        <Button type="submit" className="w-full" disabled={loading || !answer} data-testid="security-submit">{loading ? "Saving…" : "Finish & sign in"} <ArrowRight size={16} /></Button>
      </form>
    </>
  );
}

function ForgotStep({ onBack, onFound }) {
  const [email, setEmail] = useState("");
  const [loading, setLoading] = useState(false);
  const submit = async (e) => {
    e.preventDefault(); setLoading(true);
    try {
      const { data: d } = await api.post("/auth/forgot-password", { email });
      if (!d.question) { toast.error("No recovery question on file for that email"); return; }
      onFound(email, d.question, d.mfa);
    } catch (e) { err(e, "Something went wrong"); } finally { setLoading(false); }
  };
  return (
    <>
      <button onClick={onBack} className="flex items-center gap-1 text-sm font-semibold text-compass-blue mb-4"><ArrowLeft size={14} /> Back to sign in</button>
      <h1 className="font-heading text-2xl font-extrabold text-compass-navy">Reset password</h1>
      <p className="text-sm text-compass-muted mt-1 mb-4">Enter your email to retrieve your recovery question.</p>
      <form onSubmit={submit} className="space-y-4" data-testid="forgot-form">
        <Field label="Email"><Input type="email" required value={email} onChange={(e) => setEmail(e.target.value)} data-testid="forgot-email" /></Field>
        <Button type="submit" className="w-full" disabled={loading} data-testid="forgot-submit">{loading ? "Checking…" : "Continue"} <ArrowRight size={16} /></Button>
      </form>
    </>
  );
}

function ResetStep({ email, question, mfa, onDone }) {
  const [answer, setAnswer] = useState("");
  const [code, setCode] = useState("");
  const [pw, setPw] = useState("");
  const [loading, setLoading] = useState(false);
  const submit = async (e) => {
    e.preventDefault(); setLoading(true);
    try {
      await api.post("/auth/reset-password", { email, answer, code, new_password: pw });
      toast.success("Password updated — sign in with your new password");
      onDone();
    } catch (e) { err(e, "Reset failed"); } finally { setLoading(false); }
  };
  return (
    <>
      <h1 className="font-heading text-2xl font-extrabold text-compass-navy">Reset password</h1>
      <p className="text-sm text-compass-muted mt-1 mb-4">Verify your identity to set a new password.</p>
      <form onSubmit={submit} className="space-y-4" data-testid="reset-form">
        <Field label={question}><Input required value={answer} onChange={(e) => setAnswer(e.target.value)} data-testid="reset-answer" /></Field>
        {mfa && <Field label="Authentication code"><Input inputMode="numeric" maxLength={6} required value={code} onChange={(e) => setCode(e.target.value.replace(/\D/g, ""))} placeholder="123456" className="tracking-[0.3em] text-center" data-testid="reset-code" /></Field>}
        <Field label="New password"><Input type="password" required minLength={6} value={pw} onChange={(e) => setPw(e.target.value)} data-testid="reset-password" /></Field>
        <Button type="submit" className="w-full" disabled={loading} data-testid="reset-submit">{loading ? "Updating…" : "Update password"} <ArrowRight size={16} /></Button>
      </form>
    </>
  );
}
