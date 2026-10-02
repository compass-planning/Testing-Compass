import { useEffect, useRef } from "react";

const EVENTS = ["mousemove", "mousedown", "keydown", "scroll", "touchstart", "click"];

// Idle session guard. Fires `onWarn` `warnMs` before the end, then `onIdle` at `timeoutMs`.
// While the warning is showing, user activity no longer auto-resets the timer — the user
// must explicitly call the returned `stay()` to continue the session.
export function useIdleLogout({ timeoutMs, warnMs = 60000, onWarn, onIdle, enabled = true }) {
  const warnTimer = useRef(null);
  const idleTimer = useRef(null);
  const warning = useRef(false);
  const startRef = useRef(() => {});
  const cbWarn = useRef(onWarn);
  const cbIdle = useRef(onIdle);
  cbWarn.current = onWarn;
  cbIdle.current = onIdle;

  useEffect(() => {
    if (!enabled || !timeoutMs) return undefined;
    const clear = () => {
      clearTimeout(warnTimer.current);
      clearTimeout(idleTimer.current);
    };
    const start = () => {
      clear();
      warning.current = false;
      warnTimer.current = setTimeout(() => {
        warning.current = true;
        if (cbWarn.current) cbWarn.current();
      }, Math.max(0, timeoutMs - warnMs));
      idleTimer.current = setTimeout(() => {
        if (cbIdle.current) cbIdle.current();
      }, timeoutMs);
    };
    startRef.current = start;
    const onActivity = () => {
      if (!warning.current) start();
    };
    EVENTS.forEach((e) => window.addEventListener(e, onActivity, { passive: true }));
    start();
    return () => {
      clear();
      EVENTS.forEach((e) => window.removeEventListener(e, onActivity));
    };
  }, [enabled, timeoutMs, warnMs]);

  return { stay: () => startRef.current && startRef.current() };
}
