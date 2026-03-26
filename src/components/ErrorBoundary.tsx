import React from "react";
import { t } from "../lib/i18n";

interface Props {
  children: React.ReactNode;
}

interface State {
  hasError: boolean;
  message: string;
}

export class ErrorBoundary extends React.Component<Props, State> {
  constructor(props: Props) {
    super(props);
    this.state = { hasError: false, message: "" };
  }

  static getDerivedStateFromError(error: Error): State {
    return { hasError: true, message: error.message };
  }

  componentDidCatch(error: Error, errorInfo: React.ErrorInfo): void {
    // Keep logging for diagnostics without crashing the entire app.
    console.error("UI crash caught by ErrorBoundary:", error, errorInfo);
  }

  render() {
    if (this.state.hasError) {
      return (
        <div className="empty-state" style={{ padding: 24 }}>
          <div className="empty-state-icon">{"\u26A0\uFE0F"}</div>
          <p>{t("err.screenCrash")}</p>
          <p style={{ fontSize: 12, color: "var(--text-tertiary)" }}>{this.state.message}</p>
        </div>
      );
    }
    return this.props.children;
  }
}
