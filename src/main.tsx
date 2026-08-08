import { createRoot } from "react-dom/client";
import "./styles.generated.css";
import { App } from "./components/app-shell";
import { TooltipProvider } from "./components/ui/tooltip";

const root = document.getElementById("app");

if (!root) {
  throw new Error("Plinth app root is missing.");
}

createRoot(root).render(
  <TooltipProvider>
    <App />
  </TooltipProvider>,
);
