import { StrictMode } from "react";
import { createRoot } from "react-dom/client";
import { App } from "./App";
import "./styles.css";

// Returning from an emailed sign-in link (?code=…): land on the family page.
if (new URLSearchParams(window.location.search).has("code") && !window.location.hash) {
  window.location.hash = "/family";
}

createRoot(document.getElementById("root")!).render(
  <StrictMode>
    <App />
  </StrictMode>,
);
