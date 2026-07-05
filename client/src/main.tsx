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
