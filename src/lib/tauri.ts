import { invoke } from "@tauri-apps/api/core";

// Layout commands
export const convertText = (text: string, source?: string, target?: string) =>
  invoke<ConversionResult>("convert_text", { text, source, target });

export const autoConvert = (text: string) =>
  invoke<ConversionResult>("auto_convert", { text });

export const detectLayout = (text: string) =>
  invoke<DetectionResult>("detect_layout", { text });

export const detectWrongLayoutAlert = (text: string) =>
  invoke<WrongLayoutAlert | null>("detect_wrong_layout_alert", { text });

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

export const addSnippet = (
  trigger: string,
  content: string,
  description?: string,
  folder?: string,
  isRegex?: boolean,
) =>
  invoke<Snippet>("add_snippet", { trigger, content, description, folder, isRegex });

export const updateSnippet = (
  id: string,
  trigger?: string,
  content?: string,
  description?: string | null,
  folder?: string | null,
  isRegex?: boolean,
) =>
  invoke<Snippet>("update_snippet", { id, trigger, content, description, folder, isRegex });

export const deleteSnippet = (id: string) =>
  invoke<boolean>("delete_snippet", { id });

export const expandSnippetVariables = (content: string) =>
  invoke<string>("expand_snippet_variables", { content });

// AI commands
export const aiComplete = (prompt: string, systemPrompt?: string, provider?: string, model?: string) =>
  invoke<AIResponse>("ai_complete", { prompt, systemPrompt, provider, model });

export const aiCompleteStream = (
  prompt: string,
  systemPrompt?: string,
  provider?: string,
  model?: string,
  requestId?: string,
) => invoke<string>("ai_complete_stream", { prompt, systemPrompt, provider, model, requestId });

export const aiEnhancePrompt = (text: string, provider?: string) =>
  invoke<AIResponse>("ai_enhance_prompt", { text, provider });

export const aiTranslate = (text: string, sourceLang: string, targetLang: string, provider?: string) =>
  invoke<AIResponse>("ai_translate", { text, sourceLang, targetLang, provider });

export const aiFixGrammar = (text: string, provider?: string) =>
  invoke<AIResponse>("ai_fix_grammar", { text, provider });

export const setAiProvider = (provider: string) =>
  invoke<void>("set_ai_provider", { provider });

export const setApiKey = (provider: string, key: string) =>
  invoke<void>("set_api_key", { provider, key });

export const getAiModels = () =>
  invoke<AIModel[]>("get_ai_models");

export const getAiProviders = () =>
  invoke<AIProviderInfo[]>("get_ai_providers");

export const checkApiKeyHealth = (provider: string, key?: string) =>
  invoke<ApiKeyHealth>("check_api_key_health", { provider, key });

// Prompt library commands
export interface SavedPrompt {
  id: string;
  title: string;
  prompt: string;
  category: string | null;
  use_count: number;
}

export const getSavedPrompts = () =>
  invoke<SavedPrompt[]>("get_saved_prompts");

export const savePromptToLibrary = (title: string, prompt: string, category?: string) =>
  invoke<string>("save_prompt", { title, prompt, category });

export const deleteSavedPrompt = (id: string) =>
  invoke<void>("delete_saved_prompt", { id });

export const useSavedPrompt = (id: string) =>
  invoke<void>("use_saved_prompt", { id });

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
  screen_recording: boolean;
  microphone: boolean;
  automation: boolean;
  platform: string;
  arch: string;
  os_version: string;
  app_version: string;
}

export const startGlobalTypingMonitor = () =>
  invoke<boolean>("start_global_typing_monitor");

// Settings persistence commands
export const saveSettingsToDb = () =>
  invoke<void>("save_settings_to_db");

export const exportSettings = () =>
  invoke<string>("export_settings");

export const importSettings = (json: string) =>
  invoke<void>("import_settings", { json });

export const createFullBackup = (targetDir: string) =>
  invoke<string>("create_full_backup", { targetDir });

export const restoreFullBackup = (backupDir: string) =>
  invoke<void>("restore_full_backup", { backupDir });

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

// Screenshot editor commands
export const captureFullScreen = () =>
  invoke<string>("capture_full_screen");

export const openScreenshotEditor = (imagePath: string) =>
  invoke<void>("open_screenshot_editor", { imagePath });

export interface ScreenshotRegion {
  x: number;
  y: number;
  width: number;
  height: number;
}

export const saveScreenshotRegion = (sourcePath: string, region: ScreenshotRegion, annotatedDataUrl?: string) =>
  invoke<string>("save_screenshot_region", { sourcePath, region, annotatedDataUrl });

export const cancelScreenshot = (sourcePath?: string) =>
  invoke<void>("cancel_screenshot", { sourcePath });

export const copyScreenshotToClipboard = (imagePath: string) =>
  invoke<void>("copy_screenshot_to_clipboard", { imagePath });

// Transcription
export interface TranscriptionResult {
  text: string;
  language: string;
  duration_seconds: number | null;
}

export const transcribeMedia = (filePath: string) =>
  invoke<TranscriptionResult>("transcribe_media", { filePath });

export interface TranscriptionJobRecord {
  id: string;
  file_name: string;
  file_path: string;
  status: "queued" | "processing" | "completed" | "failed";
  text: string | null;
  language: string | null;
  duration_seconds: number | null;
  error_message: string | null;
  created_at: string;
  completed_at: string | null;
}

export interface TranscriptionJobEvent {
  id: string;
  status: "queued" | "processing" | "completed" | "failed";
  file_name: string;
  message: string | null;
}

export const enqueueTranscription = (filePath: string) =>
  invoke<{ job_id: string; status: string }>("enqueue_transcription", { filePath });

export const enqueueTranscriptionBlob = (dataBase64: string, mimeType?: string, fileName?: string) =>
  invoke<{ job_id: string; status: string }>("enqueue_transcription_blob", { dataBase64, mimeType, fileName });

export const listTranscriptions = (limit?: number, offset?: number) =>
  invoke<TranscriptionJobRecord[]>("list_transcriptions", { limit, offset });

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

export interface WrongLayoutAlert {
  wrong_text: string;
  suggested_text: string;
  source_layout: string;
  target_layout: string;
  confidence: number;
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
  folder: string | null;
  is_regex: boolean;
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

export interface ApiKeyHealth {
  status: "missing" | "checking" | "valid" | "invalid" | "unreachable" | "check_failed";
  message: string;
}

export interface AppSettings {
  launch_at_login: boolean;
  start_minimized_to_tray: boolean;
  theme: string;
  language: string;
  ui_scale: number;
  default_source_layout: string;
  default_target_layout: string;
  auto_detect_layout: boolean;
  realtime_detection: boolean;
  global_typing_detection: boolean;
  wrong_layout_mode: string;
  clipboard_enabled: boolean;
  max_clipboard_items: number;
  clipboard_preview_length: number;
  clipboard_retention_days: number | null;
  auto_categorize: boolean;
  snippets_enabled: boolean;
  snippet_expansion_delay_ms: number;
  ai_provider: string;
  ai_model: string | null;
  ollama_endpoint: string;
  ai_output_language: string;
  keyboard_lock_timer: number | null;
  caffeine_enabled: boolean;
  grammar_enabled: boolean;
  sounds_enabled: boolean;
  notification_transcription_complete: boolean;
}

export interface AppInfo {
  name: string;
  version: string;
  description: string;
  platform: string;
  arch: string;
}
