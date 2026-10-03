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

const LOGO_SRC = `${process.env.PUBLIC_URL || ""}/compass-logo.png`;

export function Logo({ compact = false, dark = false, large = false }) {
  if (dark) {
    // Coloured clock mark + white wordmark — for dark / purple backgrounds (mirrors compassplanning.app).
    return (
      <div className="flex items-center gap-4" data-testid="brand-logo">
        <CompassMark size={large ? 74 : 48} />
        {!compact && (
          <div className="leading-none">
            <div className="font-heading font-extrabold uppercase tracking-tight text-white" style={{ fontSize: large ? 30 : 22 }}>Compass</div>
            <div className="font-bold uppercase tracking-[0.3em] text-compass-green" style={{ fontSize: large ? 14 : 11, marginTop: 4 }}>Planning</div>
            <div className="font-bold uppercase tracking-[0.22em] text-white/70 mt-1.5" style={{ fontSize: 9 }}>Canadian Retirement Intelligence</div>
          </div>
        )}
      </div>
    );
  }
  const h = compact ? "h-10" : large ? "h-28" : "h-14";
  return (
    <div className="inline-flex flex-col items-start" data-testid="brand-logo">
      <img src={LOGO_SRC} alt="Compass Planning" className={`${h} w-auto`} />
      {!compact && (
        <span className="mt-1 ml-1 text-[10px] font-bold tracking-[0.22em] uppercase text-compass-green">
          Canadian Retirement Intelligence
        </span>
      )}
    </div>
  );
}
