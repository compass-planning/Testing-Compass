import React from "react";
import { motion } from "framer-motion";
import { useTr } from "@/lib/i18n";

export function PageHeader({ title, subtitle, icon: Icon, meta, children }) {
  const tr = useTr();
  return (
    <motion.div
      initial={{ opacity: 0, y: 12 }}
      animate={{ opacity: 1, y: 0 }}
      transition={{ duration: 0.4, ease: "easeOut" }}
      className="flex flex-col sm:flex-row sm:items-center sm:justify-between gap-4 mb-6"
    >
      <div className="flex items-start gap-4">
        {Icon && (
          <div className="hidden sm:flex h-14 w-14 shrink-0 items-center justify-center rounded-2xl bg-white border border-compass-border shadow-[0_4px_14px_rgba(27,37,89,0.06)]">
            <Icon size={26} className="text-compass-blue" strokeWidth={1.75} />
          </div>
        )}
        <div className="min-w-0">
          <h1 className="font-heading text-2xl sm:text-3xl font-extrabold text-compass-navy tracking-tight">{tr(title)}</h1>
          {meta && meta.length > 0 ? (
            <div className="mt-1.5 flex flex-wrap items-center gap-x-2 gap-y-1 text-sm">
              {meta.map((m, i) => (
                <React.Fragment key={i}>
                  {i > 0 && <span className="text-compass-muted/40">·</span>}
                  <span className="text-compass-muted">
                    {tr(m.label)} <span className="font-bold" style={{ color: m.color || "#1B2559" }}>{m.value}</span>
                  </span>
                </React.Fragment>
              ))}
            </div>
          ) : subtitle ? (
            <p className="text-sm text-compass-muted mt-1 max-w-2xl">{tr(subtitle)}</p>
          ) : null}
        </div>
      </div>
      {children && <div className="flex items-center gap-2 shrink-0">{children}</div>}
    </motion.div>
  );
}
