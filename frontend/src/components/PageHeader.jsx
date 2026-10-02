import React from "react";
import { useTr } from "@/lib/i18n";

export function PageHeader({ title, subtitle, children }) {
  const tr = useTr();
  return (
    <div className="flex flex-col sm:flex-row sm:items-end sm:justify-between gap-4 mb-6">
      <div>
        <h1 className="font-heading text-2xl sm:text-3xl font-extrabold text-compass-navy tracking-tight">{tr(title)}</h1>
        {subtitle && <p className="text-sm text-compass-muted mt-1 max-w-2xl">{tr(subtitle)}</p>}
      </div>
      {children && <div className="flex items-center gap-2 shrink-0">{children}</div>}
    </div>
  );
}
