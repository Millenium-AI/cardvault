import { useEffect, useState } from "react";

const DESKTOP_BREAKPOINT = 640;

export function useIsDesktop() {
  const [isDesktop, setIsDesktop] = useState<boolean>(() => {
    if (typeof window === "undefined") return true;
    return window.matchMedia(`(min-width: ${DESKTOP_BREAKPOINT}px)`).matches;
  });

  useEffect(() => {
    if (typeof window === "undefined") return;

    const media = window.matchMedia(`(min-width: ${DESKTOP_BREAKPOINT}px)`);
    const handler = (event: MediaQueryListEvent) => setIsDesktop(event.matches);

    if (typeof media.addEventListener === "function") {
      media.addEventListener("change", handler);
      return () => media.removeEventListener("change", handler);
    }

    media.addListener(handler);
    return () => media.removeListener(handler);
  }, []);

  return isDesktop;
}
