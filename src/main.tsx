import React from "react";
import ReactDOM from "react-dom/client";
import App from "./App";
import { ScreenshotEditor } from "./components/ScreenshotEditor";
import "./styles/theme.css";
import "./styles/app.css";

const isScreenshotWindow = window.location.search.includes("image=");

ReactDOM.createRoot(document.getElementById("root") as HTMLElement).render(
  <React.StrictMode>
    {isScreenshotWindow ? <ScreenshotEditor /> : <App />}
  </React.StrictMode>,
);
