import React from "react";
import ReactDOM from "react-dom/client";
import { installOfficialStyleSheet } from "@auraone/aura-ide-kit";
import { App } from "./App";
import "./App.css";

installOfficialStyleSheet(import.meta.env.VITE_AURAONE_OFFICIAL_STYLE_URL);

ReactDOM.createRoot(document.getElementById("root") as HTMLElement).render(
  <React.StrictMode>
    <App />
  </React.StrictMode>,
);
