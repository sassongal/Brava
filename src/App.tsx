import { useState, useEffect } from "react";
import { ClipboardHistory } from "./components/ClipboardHistory";
import { SnippetManager } from "./components/SnippetManager";
import { AITools } from "./components/AITools";
import { LayoutConverter } from "./components/LayoutConverter";
import { Settings } from "./components/Settings";
import { Onboarding } from "./components/Onboarding";

type Tab = "clipboard" | "converter" | "snippets" | "ai" | "settings";

const TABS: { id: Tab; label: string; icon: string }[] = [
  { id: "clipboard", label: "Clipboard", icon: "\u{1F4CB}" },
  { id: "converter", label: "Converter", icon: "\u{1F504}" },
  { id: "snippets", label: "Snippets", icon: "\u{26A1}" },
  { id: "ai", label: "AI Tools", icon: "\u{1F916}" },
  { id: "settings", label: "Settings", icon: "\u{2699}\u{FE0F}" },
];

function App() {
  const [activeTab, setActiveTab] = useState<Tab>("clipboard");
  const [showOnboarding, setShowOnboarding] = useState(false);

  useEffect(() => {
    const hasOnboarded = localStorage.getItem("brava_onboarded");
    if (!hasOnboarded) {
      setShowOnboarding(true);
    }
  }, []);

  const completeOnboarding = () => {
    localStorage.setItem("brava_onboarded", "true");
    setShowOnboarding(false);
  };

  if (showOnboarding) {
    return <Onboarding onComplete={completeOnboarding} />;
  }

  return (
    <div className="app">
      <nav className="nav-tabs">
        {TABS.map((tab) => (
          <button
            key={tab.id}
            className={`nav-tab ${activeTab === tab.id ? "active" : ""}`}
            onClick={() => setActiveTab(tab.id)}
          >
            <span className="nav-tab-icon">{tab.icon}</span>
            {tab.label}
          </button>
        ))}
      </nav>

      <main className="content">
        {activeTab === "clipboard" && <ClipboardHistory />}
        {activeTab === "converter" && <LayoutConverter />}
        {activeTab === "snippets" && <SnippetManager />}
        {activeTab === "ai" && <AITools />}
        {activeTab === "settings" && <Settings />}
      </main>
    </div>
  );
}

export default App;
