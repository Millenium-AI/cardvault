import { StrictMode } from "react";
import { createRoot } from "react-dom/client";
import App from "./App";
import "./index.css";

/**
 * iOS PWA viewport height fix.
 * window.innerHeight gives the true visible height in standalone mode,
 * unlike 100dvh which can still include the phantom address-bar gap.
 * We write it to --app-height and re-measure on resize/orientation change.
 */
function setAppHeight() {
  document.documentElement.style.setProperty(
    "--app-height",
    `${window.innerHeight}px`
  );
}

setAppHeight();
window.addEventListener("resize", setAppHeight);
window.addEventListener("orientationchange", () => {
  // Small delay lets iOS finish the rotation animation before re-measuring
  setTimeout(setAppHeight, 150);
});

createRoot(document.getElementById("root")!).render(
  <StrictMode>
    <App />
  </StrictMode>
);
