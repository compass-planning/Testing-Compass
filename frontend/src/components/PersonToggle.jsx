import React from "react";

// Primary / Spouse / Combined switch. Spouse shown only when a spouse exists.
export function PersonToggle({ owners = [], value, onChange, testid = "person-toggle" }) {
  const primary = owners.find((o) => o.relationship === "self") || owners[0];
  const spouse = owners.find((o) => o.relationship === "spouse");
  const opts = [
    { key: "primary", label: primary ? primary.full_name.split(" ")[0] : "Primary" },
    spouse ? { key: "spouse", label: spouse.full_name.split(" ")[0] } : null,
    { key: "combined", label: "Combined" },
  ].filter(Boolean);

  if (opts.length <= 1) return null;

  return (
    <div className="inline-flex rounded-xl border border-compass-border bg-white p-1" data-testid={testid}>
      {opts.map((o) => (
        <button key={o.key} onClick={() => onChange(o.key)} data-testid={`${testid}-${o.key}`}
          className={`px-3.5 py-1.5 text-xs font-semibold rounded-lg transition-colors ${
            value === o.key ? "gradient-bg text-white shadow-[0_2px_8px_rgba(0,82,255,0.25)]" : "text-compass-muted hover:text-compass-navy"}`}>
          {o.label}
        </button>
      ))}
    </div>
  );
}

// Filter helper: an entry's `owner` tag ("Primary"|"Spouse"|"Joint") against the view.
export function matchPerson(ownerTag, view) {
  const tag = ownerTag || "Joint";
  if (view === "combined") return true;
  if (view === "primary") return tag === "Primary" || tag === "Joint";
  if (view === "spouse") return tag === "Spouse" || tag === "Joint";
  return true;
}

export const OWNER_TAGS = ["Primary", "Spouse", "Joint"];
