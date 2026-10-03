import React from "react";

// Compass / clock mark — blue→green gradient ring, tick marks and a two-tone needle.
export function CompassMark({ size = 36 }) {
  return (
    <svg width={size} height={size} viewBox="0 0 100 100" fill="none" data-testid="compass-mark">
      <defs>
        <linearGradient id="cpGrad" x1="0" y1="100" x2="100" y2="0" gradientUnits="userSpaceOnUse">
          <stop stopColor="#0052FF" />
          <stop offset="1" stopColor="#00DF89" />
        </linearGradient>
      </defs>
      {/* ring */}
      <circle cx="50" cy="50" r="38" stroke="url(#cpGrad)" strokeWidth="7" />
      {/* tick marks at 12 / 3 / 6 / 9 */}
      <g stroke="#C9CEDC" strokeWidth="2.6" strokeLinecap="round">
        <line x1="50" y1="18" x2="50" y2="24" />
        <line x1="50" y1="76" x2="50" y2="82" />
        <line x1="76" y1="50" x2="82" y2="50" />
        <line x1="18" y1="50" x2="24" y2="50" />
      </g>
      {/* south needle (light grey) */}
      <path d="M39 69 L56.1 53.5 L43.9 46.5 Z" fill="#C9CEDC" />
      {/* north needle (teal) */}
      <path d="M65 24 L56.1 53.5 L43.9 46.5 Z" fill="#17B7A6" />
      {/* hub */}
      <circle cx="50" cy="50" r="3.6" fill="#0052FF" />
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
