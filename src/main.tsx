import { createRoot } from "react-dom/client";
import { BrowserRouter } from "react-router";
import "./styles.generated.css";
import { App } from "./components/app-shell";
import { TooltipProvider } from "./components/ui/tooltip";

const root = document.getElementById("app");

if (!root) {
  throw new Error("Plinth app root is missing.");
}

createRoot(root).render(
  <BrowserRouter>
    <TooltipProvider>
      <App />
    </TooltipProvider>
  </BrowserRouter>,
);
