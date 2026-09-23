import { StrictMode } from "react";
import { createRoot } from "react-dom/client";
import { App } from "@/App";
import { recoverSession } from "@/features/auth/sign-in";
import "@/index.css";

const root = document.getElementById("root");
if (!root) throw new Error("No #root element in index.html");

// Once per page load, and here rather than in an effect for that reason: StrictMode runs
// effects twice in development, and a second refresh would present a cookie the first one
// already spent, which the API treats as a stolen session and revokes (ADR-0023).
void recoverSession();

createRoot(root).render(
  <StrictMode>
    <App />
  </StrictMode>,
);
