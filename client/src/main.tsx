import { StrictMode } from "react";
import { createRoot } from "react-dom/client";
import App from "./App";
import "./index.css";

/*
  NOTE: The previous window.innerHeight approach was removed.
  WebKit Bug #210009 means window.innerHeight also returns incorrect values
  in standalone PWA mode with viewport-fit=cover — it subtracts safe-area
  insets from the reported height, so writing it to --app-height made things
  worse, not better. The correct fix is purely CSS via display-mode:standalone
  + 100vh (see index.css).
*/

createRoot(document.getElementById("root")!).render(
  <StrictMode>
    <App />
  </StrictMode>
);
