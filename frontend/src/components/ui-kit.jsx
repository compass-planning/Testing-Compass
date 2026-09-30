import React from "react";

export function Button({ variant = "primary", size = "md", className = "", children, ...props }) {
  const sizes = { sm: "px-3 py-1.5 text-sm", md: "px-5 py-2.5 text-sm", lg: "px-7 py-3 text-base" };
  const variants = {
    primary: "gradient-bg text-white shadow-[0_6px_18px_rgba(0,82,255,0.28)] hover:brightness-105",
    navy: "bg-compass-navy text-white hover:bg-[#141b45]",
    outline: "bg-white border border-compass-border text-compass-navy hover:border-compass-blue hover:text-compass-blue",
    ghost: "bg-transparent text-compass-navy hover:bg-compass-bg",
    danger: "bg-compass-red text-white hover:brightness-105",
    green: "bg-compass-green text-compass-navy font-semibold hover:brightness-105",
  };
  return (
    <button
      className={`inline-flex items-center justify-center gap-2 rounded-xl font-semibold transition-all duration-150 hover:-translate-y-0.5 active:translate-y-0 disabled:opacity-50 disabled:pointer-events-none ${sizes[size]} ${variants[variant]} ${className}`}
      {...props}
    >
      {children}
    </button>
  );
}

export function Card({ className = "", children, ...props }) {
  return (
    <div className={`compass-card ${className}`} {...props}>
      {children}
    </div>
  );
}

export function Field({ label, hint, children }) {
  return (
    <label className="block">
      {label && <span className="muted-label block mb-1.5">{label}</span>}
      {children}
      {hint && <span className="text-xs text-compass-muted mt-1 block">{hint}</span>}
    </label>
  );
}

export function Input({ className = "", ...props }) {
  return (
    <input
      className={`w-full rounded-xl border border-compass-border bg-white px-4 py-2.5 text-sm text-compass-navy placeholder:text-compass-muted outline-none transition-colors focus:border-compass-blue focus:ring-2 focus:ring-compass-blue/20 ${className}`}
      {...props}
    />
  );
}

export function Select({ className = "", children, ...props }) {
  return (
    <select
      className={`w-full rounded-xl border border-compass-border bg-white px-4 py-2.5 text-sm text-compass-navy outline-none transition-colors focus:border-compass-blue focus:ring-2 focus:ring-compass-blue/20 ${className}`}
      {...props}
    >
      {children}
    </select>
  );
}

export function Badge({ children, color = "#0052FF", bg = "rgba(0,82,255,0.10)", className = "", ...props }) {
  return (
    <span
      className={`inline-flex items-center gap-1 rounded-full px-2.5 py-1 text-xs font-semibold ${className}`}
      style={{ color, background: bg }}
      {...props}
    >
      {children}
    </span>
  );
}

export function Progress({ value = 0, color = "#00DF89" }) {
  const pct = Math.max(0, Math.min(100, value));
  return (
    <div className="h-2 w-full rounded-full bg-compass-bg overflow-hidden">
      <div className="h-full rounded-full transition-all duration-500" style={{ width: `${pct}%`, background: color }} />
    </div>
  );
}

export function Modal({ open, onClose, title, children, testid }) {
  if (!open) return null;
  return (
    <div
      className="fixed inset-0 z-50 flex items-center justify-center p-4 bg-compass-navy/40 backdrop-blur-sm animate-[fade-up_0.2s_ease-out]"
      onClick={onClose}
      data-testid={testid ? `${testid}-overlay` : undefined}
    >
      <div
        className="w-full max-w-lg compass-card p-6 max-h-[90vh] overflow-y-auto"
        onClick={(e) => e.stopPropagation()}
        data-testid={testid}
      >
        {title && <h3 className="font-heading text-xl font-bold text-compass-navy mb-4">{title}</h3>}
        {children}
      </div>
    </div>
  );
}

export function Stat({ label, value, sub, accent = false }) {
  return (
    <Card className="p-5">
      <div className="muted-label">{label}</div>
      <div className={`font-heading text-2xl font-extrabold mt-2 ${accent ? "gradient-text" : "text-compass-navy"}`}>
        {value}
      </div>
      {sub && <div className="text-xs text-compass-muted mt-1">{sub}</div>}
    </Card>
  );
}

export function Toggle({ checked, onChange, testid }) {
  return (
    <button
      type="button"
      onClick={() => onChange(!checked)}
      data-testid={testid}
      className={`relative h-6 w-11 rounded-full transition-colors duration-200 ${checked ? "gradient-bg" : "bg-compass-muted/40"}`}
    >
      <span
        className={`absolute top-0.5 h-5 w-5 rounded-full bg-white shadow transition-all duration-200 ${checked ? "left-[22px]" : "left-0.5"}`}
      />
    </button>
  );
}

export function Empty({ icon: Icon, title, children }) {
  return (
    <Card className="p-10 text-center">
      {Icon && <Icon className="mx-auto mb-3 text-compass-muted" size={40} strokeWidth={1.5} />}
      <div className="font-heading font-bold text-compass-navy">{title}</div>
      {children && <div className="text-sm text-compass-muted mt-1">{children}</div>}
    </Card>
  );
}
