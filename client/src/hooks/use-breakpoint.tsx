import * as React from "react";

/**
 * Tracks whether the viewport is at or above a Tailwind breakpoint.
 * Use this (not CSS-only hidden/sm:hidden wrappers) to gate the mounting of
 * components that render via a portal (Radix Dialog/Sheet/Drawer, etc.) —
 * CSS display:none on a wrapper does NOT hide portaled content, since it
 * mounts directly under document.body regardless of its React parent's
 * class names.
 */
const BREAKPOINTS = {
  sm: 640,
  md: 768,
  lg: 1024,
  xl: 1280,
} as const;

export function useBreakpoint(breakpoint: keyof typeof BREAKPOINTS) {
  const px = BREAKPOINTS[breakpoint];
  const [matches, setMatches] = React.useState<boolean>(
    typeof window === "undefined" ? false : window.innerWidth >= px
  );

  React.useEffect(() => {
    const mql = window.matchMedia(`(min-width: ${px}px)`);
    const onChange = () => setMatches(mql.matches);
    onChange();
    mql.addEventListener("change", onChange);
    return () => mql.removeEventListener("change", onChange);
  }, [px]);

  return matches;
}
