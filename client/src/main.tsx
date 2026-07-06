import { StrictMode } from "react";
import { createRoot } from "react-dom/client";
import App from "./App";
import "./index.css";
import { initThemeFromStorage } from "@/lib/useUserPrefs";

// Apply saved theme before first paint — prevents dark/light flash
initThemeFromStorage();

createRoot(document.getElementById("root")!).render(
  <StrictMode>
    <App />
  </StrictMode>
);

// Service Worker Registration
if ("serviceWorker" in navigator) {
  window.addEventListener("load", () => {
    navigator.serviceWorker
      .register("/sw.js", { scope: "/" })
      .catch(() => {
        // SW registration failed — app continues without offline support
      });
  });
}
