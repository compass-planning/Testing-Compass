import React, { useState } from "react";
import { toast } from "sonner";
import { ShieldCheck, ArrowRight, Building2, UserCog, User as UserIcon, ArrowLeft, KeyRound, QrCode, Check, X, TrendingUp, Calculator, Wallet, Sparkles } from "lucide-react";
import { useNavigate } from "react-router-dom";
import { useAuth } from "@/context/AuthContext";
import { Logo } from "@/components/Logo";
import { Button, Input, Field, Select, Toggle } from "@/components/ui-kit";
import api, { formatApiError } from "@/lib/api";

const DEMOS = [
  { email: "scott@sweston.ca", label: "Enterprise Admin", icon: Building2, desc: "CRM-driven, corp-scoped" },
  { email: "advisor@compass.ca", label: "Advisor", icon: UserCog, desc: "Client roster & households" },
  { email: "solo@compass.ca", label: "Solo Planner", icon: UserIcon, desc: "Self-serve retirement" },
];

const FEATURES = [
  { icon: TrendingUp, title: "Retirement projections", desc: "Monte Carlo + guardrails engine" },
  { icon: Calculator, title: "Tax optimization", desc: "Canada & United States" },
  { icon: Wallet, title: "Net worth & goals", desc: "Full balance sheet tracking" },
  { icon: Sparkles, title: "AI financial reports", desc: "Plain-language plan summaries" },
];

const tabCls = (active) =>
  `py-3.5 text-sm font-bold text-center transition-colors border-b-2 ${
    active
      ? "text-compass-blue bg-white border-compass-blue"
      : "text-compass-muted bg-compass-bg hover:text-compass-navy border-transparent"
  }`;

const err = (e, fb) => toast.error(formatApiError(e.response?.data?.detail) || fb);

export default function Login() {
  const { login, applySession } = useAuth();
  const nav = useNavigate();
  const [mode, setMode] = useState("signin"); // signin | register
  const [step, setStep] = useState("password");
  const [loading, setLoading] = useState(false);
  const [email, setEmail] = useState("");
  const [password, setPassword] = useState("");
  const [code, setCode] = useState("");
  const [ctx, setCtx] = useState({}); // challenge, setup_token, qr, secret, questions, resetQuestion

  const finish = (data) => { applySession(data.token, data.user); toast.success("Signed in"); nav(data.user?.is_client ? "/my-plan" : "/dashboard", { replace: true }); };

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

  const showTabs = mode === "register" || step === "password";

  return (
    <div className="min-h-screen grid lg:grid-cols-2">
      {/* Hero */}
      <div className="relative hidden lg:flex flex-col justify-between p-12 overflow-hidden" style={{ background: "linear-gradient(135deg, #2E1B6A 0%, #3B1F80 55%, #4B1D93 100%)" }}>
        <div className="relative z-10"><Logo dark large /></div>
        <div className="relative z-10 text-white max-w-md">
          <h2 className="font-heading text-4xl xl:text-5xl font-extrabold leading-[1.1]">Your financial future,<br />clearly mapped.</h2>
          <p className="mt-5 text-white/70 leading-relaxed">
            Retirement projections, tax planning, net worth tracking, and AI-powered insights — built for Canadians and Americans planning their own financial future.
          </p>
        </div>
        <div className="relative z-10 grid grid-cols-2 gap-x-6 gap-y-5 max-w-md">
          {FEATURES.map((f) => (
            <div key={f.title} className="flex items-start gap-3">
              <div className="mt-0.5 h-7 w-7 shrink-0 rounded-full flex items-center justify-center" style={{ background: "rgba(0,223,137,0.16)" }}>
                <Check size={15} className="text-compass-green" />
              </div>
              <div>
                <div className="text-sm font-bold text-white">{f.title}</div>
                <div className="text-xs text-white/55">{f.desc}</div>
              </div>
            </div>
          ))}
        </div>
        <div className="absolute -right-32 -top-24 h-96 w-96 rounded-full blur-3xl" style={{ background: "radial-gradient(circle, rgba(255,255,255,0.10), transparent 70%)" }} />
        <div className="absolute -left-24 bottom-6 h-72 w-72 rounded-full blur-3xl" style={{ background: "radial-gradient(circle, rgba(123,97,255,0.45), transparent 70%)" }} />
      </div>

      {/* Form */}
      <div className="flex flex-col items-center justify-center p-6 sm:p-12 bg-compass-bg">
        <div className="w-full max-w-md">
          <div className="lg:hidden mb-6 flex justify-center"><Logo /></div>

          <div className="compass-card overflow-hidden">
            {showTabs && (
              <div className="grid grid-cols-2">
                <button onClick={() => { setMode("signin"); setStep("password"); }} data-testid="tab-signin" className={tabCls(mode === "signin")}>Sign In</button>
                <button onClick={() => setMode("register")} data-testid="tab-register" className={tabCls(mode === "register")}>Register</button>
              </div>
            )}

            <div className="p-8">
              {mode === "register" ? (
                <RegisterInline onDone={() => { setMode("signin"); setStep("password"); }} />
              ) : (
                <>
                  {step === "password" && (
                    <>
                      <h1 className="font-heading text-2xl font-extrabold text-compass-navy">Welcome back</h1>
                      <p className="text-sm text-compass-muted mt-1 mb-6">Sign in to your Compass Planning account.</p>
                      <form onSubmit={submitPassword} className="space-y-4" data-testid="login-form">
                        <Field label="Email"><Input type="email" required value={email} onChange={(e) => setEmail(e.target.value)} placeholder="you@firm.ca" data-testid="login-email" /></Field>
                        <Field label="Password"><Input type="password" required value={password} onChange={(e) => setPassword(e.target.value)} placeholder="••••••••" data-testid="login-password" /></Field>
                        <Button type="submit" className="w-full" disabled={loading} data-testid="login-submit">{loading ? "Checking…" : "Sign In"} <ArrowRight size={16} /></Button>
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
                </>
              )}
            </div>
          </div>

          <p className="text-xs text-compass-muted text-center mt-6">© 2026 Compass Planning. All rights reserved.</p>
        </div>
      </div>
    </div>
  );
}

function RegisterInline({ onDone }) {
  const { register } = useAuth();
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
      toast.success("Account created — sign in and set up two-factor authentication");
      onDone();
    } catch (er) { err(er, "Registration failed"); } finally { setLoading(false); }
  };

  return (
    <>
      <h1 className="font-heading text-2xl font-extrabold text-compass-navy">Create your account</h1>
      <p className="text-sm text-compass-muted mt-1 mb-6">Self-serve retirement planning. Upgrade to an advisor anytime.</p>
      <form onSubmit={submit} className="space-y-4" data-testid="register-form">
        <Field label="Full name"><Input required value={form.name} onChange={set("name")} placeholder="Jordan Blake" data-testid="register-name" /></Field>
        <Field label="Email"><Input type="email" required value={form.email} onChange={set("email")} placeholder="you@email.ca" data-testid="register-email" /></Field>
        <Field label="Password" hint="At least 6 characters"><Input type="password" required minLength={6} value={form.password} onChange={set("password")} placeholder="••••••••" data-testid="register-password" /></Field>
        <div className="flex items-start gap-3 rounded-xl bg-compass-bg p-3">
          <Toggle checked={consent} onChange={setConsent} testid="register-consent" />
          <div className="text-xs text-compass-navy">
            I consent to Compass Planning processing my personal data to provide retirement planning services, in accordance with <span className="font-semibold">PIPEDA</span>. You can export or erase your data at any time.
          </div>
        </div>
        <Button type="submit" className="w-full" disabled={loading} data-testid="register-submit">{loading ? "Creating…" : "Create account"} <ArrowRight size={16} /></Button>
      </form>
    </>
  );
}

const PW_RULES = [
  { key: "length", label: "At least 8 characters", test: (p) => p.length >= 8 },
  { key: "upper", label: "An uppercase letter", test: (p) => /[A-Z]/.test(p) },
  { key: "lower", label: "A lowercase letter", test: (p) => /[a-z]/.test(p) },
  { key: "number", label: "A number", test: (p) => /\d/.test(p) },
  { key: "special", label: "A symbol (!@#…)", test: (p) => /[^A-Za-z0-9]/.test(p) },
];
const STRENGTH = [
  { label: "Too weak", color: "#EE5D50", width: "20%" },
  { label: "Weak", color: "#EE5D50", width: "40%" },
  { label: "Fair", color: "#FFB800", width: "60%" },
  { label: "Good", color: "#0052FF", width: "80%" },
  { label: "Strong", color: "#00DF89", width: "100%" },
];

function ChangeStep({ changeToken, onDone }) {
  const [pw, setPw] = useState("");
  const [confirm, setConfirm] = useState("");
  const [loading, setLoading] = useState(false);

  const passed = PW_RULES.filter((r) => r.test(pw));
  const lengthOk = PW_RULES[0].test(pw);
  const categories = PW_RULES.slice(1).filter((r) => r.test(pw)).length;
  const strong = lengthOk && categories >= 3;
  const rawIdx = Math.max(0, passed.length - 1);
  const strength = STRENGTH[strong ? rawIdx : Math.min(2, rawIdx)] || STRENGTH[0];
  const match = pw.length > 0 && pw === confirm;

  const submit = async (e) => {
    e.preventDefault();
    if (!strong) { toast.error("Please choose a stronger password"); return; }
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
        <Field label="New password"><Input type="password" required value={pw} onChange={(e) => setPw(e.target.value)} placeholder="At least 8 characters" data-testid="change-new-password" /></Field>

        {pw.length > 0 && (
          <div data-testid="pw-strength">
            <div className="h-1.5 w-full rounded-full bg-compass-border overflow-hidden">
              <div className="h-full rounded-full transition-all duration-300" style={{ width: strength.width, backgroundColor: strength.color }} />
            </div>
            <div className="flex items-center justify-between mt-1.5">
              <span className="text-xs font-semibold" style={{ color: strength.color }} data-testid="pw-strength-label">{strength.label}</span>
            </div>
            <ul className="mt-2 grid grid-cols-1 gap-1">
              {PW_RULES.map((r) => {
                const ok = r.test(pw);
                return (
                  <li key={r.key} className={`flex items-center gap-1.5 text-xs ${ok ? "text-compass-green" : "text-compass-muted"}`} data-testid={`pw-rule-${r.key}`}>
                    {ok ? <Check size={13} /> : <X size={13} />} {r.label}
                  </li>
                );
              })}
            </ul>
          </div>
        )}

        <Field label="Confirm new password"><Input type="password" required value={confirm} onChange={(e) => setConfirm(e.target.value)} placeholder="Re-enter password" data-testid="change-confirm-password" /></Field>
        {confirm.length > 0 && !match && <p className="text-xs text-compass-red font-semibold -mt-2" data-testid="pw-mismatch">Passwords do not match</p>}

        <Button type="submit" className="w-full" disabled={loading || !strong || !match} data-testid="change-submit">{loading ? "Updating…" : "Update & continue"} <ArrowRight size={16} /></Button>
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
