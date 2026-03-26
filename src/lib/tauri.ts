import { invoke } from "@tauri-apps/api/core";

// Layout commands
export const convertText = (text: string, source?: string, target?: string) =>
  invoke<ConversionResult>("convert_text", { text, source, target });

export const autoConvert = (text: string) =>
  invoke<ConversionResult>("auto_convert", { text });

export const detectLayout = (text: string) =>
  invoke<DetectionResult>("detect_layout", { text });

export const getLayouts = () =>
  invoke<LayoutInfo[]>("get_layouts");

export const convertClipboardText = () =>
  invoke<string>("convert_clipboard_text");

// Clipboard commands
export const getClipboardItems = (query?: string, category?: string, limit?: number, offset?: number) =>
  invoke<ClipboardItem[]>("get_clipboard_items", { query, category, limit, offset });

export const addClipboardItem = (content: string) =>
  invoke<ClipboardItem | null>("add_clipboard_item", { content });

export const toggleClipboardPin = (id: string) =>
  invoke<boolean>("toggle_clipboard_pin", { id });

export const toggleClipboardFavorite = (id: string) =>
  invoke<boolean>("toggle_clipboard_favorite", { id });

export const deleteClipboardItem = (id: string) =>
  invoke<boolean>("delete_clipboard_item", { id });

export const clearClipboardHistory = () =>
  invoke<void>("clear_clipboard_history");

export const readSystemClipboard = () =>
  invoke<string>("read_system_clipboard");

export const writeSystemClipboard = (text: string) =>
  invoke<void>("write_system_clipboard", { text });

export const writeImageToClipboard = (imagePath: string) =>
  invoke<void>("write_image_to_clipboard", { imagePath });

// Snippet commands
export const getSnippets = () =>
  invoke<Snippet[]>("get_snippets");

export const addSnippet = (trigger: string, content: string, description?: string) =>
  invoke<Snippet>("add_snippet", { trigger, content, description });

export const updateSnippet = (id: string, trigger?: string, content?: string, description?: string | null) =>
  invoke<Snippet>("update_snippet", { id, trigger, content, description });

export const deleteSnippet = (id: string) =>
  invoke<boolean>("delete_snippet", { id });

export const expandSnippetVariables = (content: string) =>
  invoke<string>("expand_snippet_variables", { content });

// AI commands
export const aiComplete = (prompt: string, systemPrompt?: string, provider?: string, model?: string) =>
  invoke<AIResponse>("ai_complete", { prompt, systemPrompt, provider, model });

export const aiEnhancePrompt = (text: string) =>
  invoke<AIResponse>("ai_enhance_prompt", { text });

export const aiTranslate = (text: string, sourceLang: string, targetLang: string) =>
  invoke<AIResponse>("ai_translate", { text, sourceLang, targetLang });

export const setAiProvider = (provider: string) =>
  invoke<void>("set_ai_provider", { provider });

export const setApiKey = (provider: string, key: string) =>
  invoke<void>("set_api_key", { provider, key });

export const getAiModels = () =>
  invoke<AIModel[]>("get_ai_models");

export const getAiProviders = () =>
  invoke<AIProviderInfo[]>("get_ai_providers");

// Settings commands
export const getSettings = () =>
  invoke<AppSettings>("get_settings");

export const updateSettings = (settings: AppSettings) =>
  invoke<void>("update_settings", { settings });

export const getAppVersion = () =>
  invoke<string>("get_app_version");

export const getAppInfo = () =>
  invoke<AppInfo>("get_app_info");

// Permission checking
export const checkPermissions = () =>
  invoke<PermissionStatus>("check_permissions");

export interface PermissionStatus {
  accessibility: boolean;
}

// Settings persistence commands
export const saveSettingsToDb = () =>
  invoke<void>("save_settings_to_db");

export const exportSettings = () =>
  invoke<string>("export_settings");

export const importSettings = (json: string) =>
  invoke<void>("import_settings", { json });

// Caffeine commands
export const toggleCaffeine = () =>
  invoke<boolean>("toggle_caffeine");

export const getCaffeineStatus = () =>
  invoke<boolean>("get_caffeine_status");

// Keyboard lock commands
export const toggleKeyboardLock = () =>
  invoke<boolean>("toggle_keyboard_lock");

export const getKeyboardLockStatus = () =>
  invoke<boolean>("get_keyboard_lock_status");

// Hotkey commands
export interface HotkeyBinding {
  action: string;
  action_display: string;
  event_name: string;
  key: string;
  ctrl: boolean;
  shift: boolean;
  alt: boolean;
  meta: boolean;
  display_string: string;
}

export const getHotkeyBindings = () =>
  invoke<HotkeyBinding[]>("get_hotkey_bindings");

export const updateHotkey = (action: string, key: string, ctrl: boolean, shift: boolean, alt: boolean, meta: boolean) =>
  invoke<void>("update_hotkey", { action, key, ctrl, shift, alt, meta });

export const resetHotkeyDefaults = () =>
  invoke<void>("reset_hotkey_defaults");

export const takeScreenshot = () =>
  invoke<string>("take_screenshot");

// Types
export interface ConversionResult {
  converted: string;
  source_layout: string;
  target_layout: string;
}

export interface DetectionResult {
  detected_code: string;
  detected_name: string;
  confidence: number;
  char_counts: [string, number][];
}

export interface LayoutInfo {
  code: string;
  name: string;
}

export interface ClipboardItem {
  id: string;
  content: string;
  preview: string;
  category: string;
  hash: string;
  pinned: boolean;
  favorite: boolean;
  created_at: string;
  accessed_at: string;
  access_count: number;
  source_app: string | null;
  image_path: string | null;
}

export interface Snippet {
  id: string;
  trigger: string;
  content: string;
  description: string | null;
  enabled: boolean;
  use_count: number;
  created_at: string;
  updated_at: string;
}

export interface AIResponse {
  content: string;
  model: string;
  provider: string;
  tokens_used: number | null;
}

export interface AIModel {
  id: string;
  name: string;
  provider: string;
  is_free: boolean;
  supports_vision: boolean;
}

export interface AIProviderInfo {
  id: string;
  name: string;
  has_free_tier: boolean;
}

export interface AppSettings {
  launch_at_login: boolean;
  theme: string;
  language: string;
  default_source_layout: string;
  default_target_layout: string;
  auto_detect_layout: boolean;
  realtime_detection: boolean;
  clipboard_enabled: boolean;
  max_clipboard_items: number;
  auto_categorize: boolean;
  snippets_enabled: boolean;
  ai_provider: string;
  ai_model: string | null;
  ollama_endpoint: string;
  keyboard_lock_timer: number | null;
  caffeine_enabled: boolean;
}

export interface AppInfo {
  name: string;
  version: string;
  description: string;
  platform: string;
  arch: string;
}
