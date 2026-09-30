import React from "react";

// Compass / clock geometric mark rendered as SVG (brand gradient).
export function CompassMark({ size = 36 }) {
  return (
    <svg width={size} height={size} viewBox="0 0 48 48" fill="none" data-testid="compass-mark">
      <defs>
        <linearGradient id="cpGrad" x1="0" y1="0" x2="48" y2="48" gradientUnits="userSpaceOnUse">
          <stop stopColor="#0052FF" />
          <stop offset="1" stopColor="#00DF89" />
        </linearGradient>
      </defs>
      <circle cx="24" cy="24" r="21" stroke="url(#cpGrad)" strokeWidth="3.5" />
      <path d="M24 8 L30 24 L24 40 L18 24 Z" fill="url(#cpGrad)" opacity="0.9" />
      <circle cx="24" cy="24" r="3.4" fill="#FFFFFF" stroke="#1B2559" strokeWidth="1.4" />
    </svg>
  );
}

export function Logo({ compact = false, dark = false }) {
  return (
    <div className="flex items-center gap-3" data-testid="brand-logo">
      <CompassMark size={compact ? 30 : 38} />
      {!compact && (
        <div className="leading-none">
          <div
            className="font-heading font-extrabold tracking-tight text-[20px]"
            style={{ color: dark ? "#FFFFFF" : "#1B2559", fontWeight: 800 }}
          >
            Compass Planning
          </div>
          <div className="text-[9px] font-bold tracking-[0.22em] text-compass-green uppercase mt-0.5">
            Canadian Retirement Intelligence
          </div>
        </div>
      )}
    </div>
  );
}
