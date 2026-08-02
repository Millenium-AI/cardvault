import { useState, useEffect } from "react";

// Tailwind's `sm` breakpoint. Kept in sync with the `sm:hidden` / `hidden
// sm:block` responsive classes used to switch between desktop and mobile
// layouts — this hook must match that breakpoint exactly, or there's a
// window where the CSS shows one layout while JS-driven logic (like which
// modal to mount) thinks it's the other.
const DESKTOP_BREAKPOINT = 640;

/**
 * Tracks whether the viewport is at/above the desktop breakpoint (640px).
 *
 * Use this (not useIsMobile, which is keyed to a different 768px
 * breakpoint) for any logic that needs to match the sm: responsive classes
 * already used across the app — e.g. deciding which single modal/drawer
 * component to mount, rather than mounting both and hiding one with CSS.
 */
export function useIsDesktop() {
  const [isDesktop, setIsDesktop] = useState(() =>
    typeof window !== "undefined"
      ? window.matchMedia(`(min-width: ${DESKTOP_BREAKPOINT}px)`).matches
      : true
  );

  useEffect(() => {
    const mql = window.matchMedia(`(min-width: ${DESKTOP_BREAKPOINT}px)`);
    const handleChange = (e: MediaQueryListEvent) => setIsDesktop(e.matches);
    mql.addEventListener("change", handleChange);
    return () => mql.removeEventListener("change", handleChange);
  }, []);

  return isDesktop;
}
