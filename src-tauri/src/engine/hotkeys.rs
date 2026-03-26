use serde::{Deserialize, Serialize};
use std::collections::HashMap;

/// Represents a keyboard shortcut combination
#[derive(Debug, Clone, Serialize, Deserialize, Hash, Eq, PartialEq)]
pub struct Hotkey {
    pub key: String,
    pub ctrl: bool,
    pub shift: bool,
    pub alt: bool,
    pub meta: bool, // Cmd on macOS, Win on Windows
}

impl Hotkey {
    pub fn new(key: &str, ctrl: bool, shift: bool, alt: bool, meta: bool) -> Self {
        Hotkey {
            key: key.to_lowercase(),
            ctrl,
            shift,
            alt,
            meta,
        }
    }

    /// Format the hotkey for display (platform-aware)
    pub fn display_string(&self) -> String {
        let mut parts = Vec::new();

        if cfg!(target_os = "macos") {
            if self.ctrl { parts.push("^"); }
            if self.alt { parts.push("\u{2325}"); } // Option symbol
            if self.shift { parts.push("\u{21E7}"); } // Shift symbol
            if self.meta { parts.push("\u{2318}"); } // Command symbol
        } else {
            if self.ctrl { parts.push("Ctrl"); }
            if self.alt { parts.push("Alt"); }
            if self.shift { parts.push("Shift"); }
            if self.meta { parts.push("Win"); }
        }

        parts.push(&self.key);

        parts.join(if cfg!(target_os = "macos") { "" } else { "+" })
    }

    /// Convert to tauri_plugin_global_shortcut format string
    pub fn to_shortcut_string(&self) -> String {
        let mut parts = Vec::new();
        if self.ctrl || self.meta {
            parts.push("CmdOrCtrl".to_string());
        }
        if self.shift {
            parts.push("Shift".to_string());
        }
        if self.alt {
            parts.push("Alt".to_string());
        }
        parts.push(self.key.to_uppercase());
        parts.join("+")
    }
}

/// Actions that can be triggered by hotkeys
#[derive(Debug, Clone, Serialize, Deserialize, Hash, Eq, PartialEq)]
#[serde(rename_all = "snake_case")]
pub enum HotkeyAction {
    ConvertLayout,
    ShowClipboard,
    QuickPaste,
    EnhancePrompt,
    TranslateSelection,
    VoiceInput,
    KeyboardLock,
    Screenshot,
}

impl HotkeyAction {
    pub fn display_name(&self) -> &str {
        match self {
            HotkeyAction::ConvertLayout => "Convert Layout",
            HotkeyAction::ShowClipboard => "Clipboard History",
            HotkeyAction::QuickPaste => "Quick Paste",
            HotkeyAction::EnhancePrompt => "Enhance Prompt",
            HotkeyAction::TranslateSelection => "Translate Selection",
            HotkeyAction::VoiceInput => "Voice Input",
            HotkeyAction::KeyboardLock => "Keyboard Lock",
            HotkeyAction::Screenshot => "Screenshot",
        }
    }

    pub fn to_event_name(&self) -> &str {
        match self {
            HotkeyAction::ConvertLayout => "hotkey-convert",
            HotkeyAction::ShowClipboard => "hotkey-clipboard",
            HotkeyAction::QuickPaste => "hotkey-quick-paste",
            HotkeyAction::EnhancePrompt => "hotkey-enhance",
            HotkeyAction::TranslateSelection => "hotkey-translate",
            HotkeyAction::VoiceInput => "hotkey-voice",
            HotkeyAction::KeyboardLock => "hotkey-lock",
            HotkeyAction::Screenshot => "hotkey-screenshot",
        }
    }

    pub fn all() -> Vec<HotkeyAction> {
        vec![
            HotkeyAction::ConvertLayout,
            HotkeyAction::ShowClipboard,
            HotkeyAction::EnhancePrompt,
            HotkeyAction::TranslateSelection,
            HotkeyAction::QuickPaste,
            HotkeyAction::Screenshot,
            HotkeyAction::KeyboardLock,
            HotkeyAction::VoiceInput,
        ]
    }
}

/// Manages hotkey registrations and their associated actions
pub struct HotkeyManager {
    bindings: HashMap<HotkeyAction, Hotkey>,
}

impl HotkeyManager {
    pub fn new() -> Self {
        let mut manager = HotkeyManager {
            bindings: HashMap::new(),
        };
        manager.register_defaults();
        manager
    }

    /// Register default hotkey bindings (platform-aware)
    fn register_defaults(&mut self) {
        let use_meta = cfg!(target_os = "macos");
        let use_ctrl = !use_meta;

        self.bindings.insert(
            HotkeyAction::ConvertLayout,
            Hotkey::new("t", use_ctrl, true, false, use_meta),
        );
        self.bindings.insert(
            HotkeyAction::ShowClipboard,
            Hotkey::new("h", use_ctrl, true, false, use_meta),
        );
        self.bindings.insert(
            HotkeyAction::QuickPaste,
            Hotkey::new("q", use_ctrl, true, false, use_meta),
        );
        self.bindings.insert(
            HotkeyAction::EnhancePrompt,
            Hotkey::new("p", use_ctrl, true, false, use_meta),
        );
        self.bindings.insert(
            HotkeyAction::TranslateSelection,
            Hotkey::new("l", use_ctrl, true, false, use_meta),
        );
        self.bindings.insert(
            HotkeyAction::VoiceInput,
            Hotkey::new("m", use_ctrl, true, false, use_meta),
        );
        self.bindings.insert(
            HotkeyAction::KeyboardLock,
            Hotkey::new("k", use_ctrl, true, false, use_meta),
        );
        self.bindings.insert(
            HotkeyAction::Screenshot,
            Hotkey::new("s", use_ctrl, true, false, use_meta),
        );
    }

    /// Get the hotkey for a given action
    pub fn get_binding(&self, action: &HotkeyAction) -> Option<&Hotkey> {
        self.bindings.get(action)
    }

    /// Set a custom hotkey binding
    pub fn set_binding(&mut self, action: HotkeyAction, hotkey: Hotkey) {
        self.bindings.insert(action, hotkey);
    }

    /// Get all bindings for serialization/display
    pub fn get_all_bindings(&self) -> Vec<(HotkeyAction, Hotkey)> {
        HotkeyAction::all()
            .into_iter()
            .filter_map(|action| self.bindings.get(&action).cloned().map(|hotkey| (action, hotkey)))
            .collect()
    }

    /// Load bindings from stored data
    pub fn load_bindings(&mut self, bindings: Vec<(HotkeyAction, Hotkey)>) {
        for (action, hotkey) in bindings {
            self.bindings.insert(action, hotkey);
        }
    }
}

impl Default for HotkeyManager {
    fn default() -> Self {
        Self::new()
    }
}
