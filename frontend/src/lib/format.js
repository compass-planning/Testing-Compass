export const money = (n, decimals = 0) =>
  new Intl.NumberFormat("en-CA", {
    style: "currency",
    currency: "CAD",
    maximumFractionDigits: decimals,
    minimumFractionDigits: decimals,
  }).format(Number(n || 0));

export const compact = (n) =>
  new Intl.NumberFormat("en-CA", { notation: "compact", maximumFractionDigits: 1 }).format(Number(n || 0));

export const dateFmt = (iso) => {
  if (!iso) return "—";
  try {
    return new Date(iso).toLocaleString("en-CA", { dateStyle: "medium", timeStyle: "short" });
  } catch {
    return iso;
  }
};

export const TIER_META = {
  enterprise: { label: "Enterprise", sub: "CRM-driven" },
  advisor: { label: "Advisor", sub: "Multi-tenant" },
  solo: { label: "Solo", sub: "Self-serve" },
};

export const STATUS_META = {
  on_track: { label: "On Track", color: "#00DF89", bg: "rgba(0,223,137,0.12)" },
  achieved: { label: "Achieved", color: "#0052FF", bg: "rgba(0,82,255,0.10)" },
  at_risk: { label: "At Risk", color: "#FFB800", bg: "rgba(255,184,0,0.14)" },
  behind: { label: "Behind", color: "#EE5D50", bg: "rgba(238,93,80,0.12)" },
};
