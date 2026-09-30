import React from "react";

export function PageHeader({ title, subtitle, children }) {
  return (
    <div className="flex flex-col sm:flex-row sm:items-end sm:justify-between gap-4 mb-6">
      <div>
        <h1 className="font-heading text-2xl sm:text-3xl font-extrabold text-compass-navy tracking-tight">{title}</h1>
        {subtitle && <p className="text-sm text-compass-muted mt-1 max-w-2xl">{subtitle}</p>}
      </div>
      {children && <div className="flex items-center gap-2 shrink-0">{children}</div>}
    </div>
  );
}
