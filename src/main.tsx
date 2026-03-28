import React from "react";
import ReactDOM from "react-dom/client";
import App from "./App";
import { ScreenshotEditor } from "./components/ScreenshotEditor";
import { WrongLayoutPopup } from "./components/WrongLayoutPopup";
import { ErrorBoundary } from "./components/ErrorBoundary";
import "./styles/theme.css";
import "./styles/app.css";

const isScreenshotWindow = window.location.search.includes("image=");
const isWrongLayoutPopup = window.location.search.includes("popup=wronglayout");

ReactDOM.createRoot(document.getElementById("root") as HTMLElement).render(
  <React.StrictMode>
    <ErrorBoundary>
      {isWrongLayoutPopup ? <WrongLayoutPopup /> :
       isScreenshotWindow ? <ScreenshotEditor /> : <App />}
    </ErrorBoundary>
  </React.StrictMode>,
);
