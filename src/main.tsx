import { StrictMode } from "react";
import { createRoot } from "react-dom/client";
import "./styles.generated.css";
import { App } from "./components/app-shell";

const root = document.getElementById("app");

if (!root) {
  throw new Error("Plinth app root is missing.");
}

createRoot(root).render(
  <StrictMode>
    <App />
  </StrictMode>,
);
