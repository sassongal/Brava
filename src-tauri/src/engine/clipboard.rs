use chrono::{DateTime, Utc};
use once_cell::sync::Lazy;
use regex::Regex;
use serde::{Deserialize, Serialize};
use sha2::{Digest, Sha256};
use std::sync::Mutex;
use uuid::Uuid;

static RE_EMAIL: Lazy<Regex> = Lazy::new(|| Regex::new(r"^[a-zA-Z0-9._%+-]+@[a-zA-Z0-9.-]+\.[a-zA-Z]{2,}$").unwrap());
static RE_PHONE: Lazy<Regex> = Lazy::new(|| Regex::new(r"^[\+]?[(]?[0-9]{1,4}[)]?[-\s\./0-9]{6,15}$").unwrap());
static RE_COLOR: Lazy<Regex> = Lazy::new(|| Regex::new(r"^#([0-9a-fA-F]{3}|[0-9a-fA-F]{6}|[0-9a-fA-F]{8})$").unwrap());

/// Categories for auto-classification of clipboard content
#[derive(Debug, Clone, Serialize, Deserialize, PartialEq)]
#[serde(rename_all = "lowercase")]
pub enum ClipboardCategory {
    Text,
    Url,
    Email,
    Phone,
    Code,
    Color,
    Number,
    Path,
    Image,
}

/// A single clipboard history entry
#[derive(Debug, Clone, Serialize, Deserialize)]
pub struct ClipboardItem {
    pub id: String,
    pub content: String,
    pub preview: String,
    pub category: ClipboardCategory,
    pub hash: String,
    pub pinned: bool,
    pub favorite: bool,
    pub created_at: DateTime<Utc>,
    pub accessed_at: DateTime<Utc>,
    pub access_count: u32,
    pub source_app: Option<String>,
    pub image_path: Option<String>,
}

impl ClipboardItem {
    pub fn new(content: String) -> Self {
        let hash = Self::compute_hash(&content);
        let preview = content.chars().take(200).collect();
        let category = Self::categorize(&content);

        ClipboardItem {
            id: Uuid::new_v4().to_string(),
            content,
            preview,
            category,
            hash,
            pinned: false,
            favorite: false,
            created_at: Utc::now(),
            accessed_at: Utc::now(),
            access_count: 0,
            source_app: None,
            image_path: None,
        }
    }

    pub fn new_image(image_path: String) -> Self {
        let hash = Self::compute_hash(&image_path);
        let filename = std::path::Path::new(&image_path)
            .file_name()
            .map(|f| f.to_string_lossy().to_string())
            .unwrap_or_else(|| "image".to_string());

        ClipboardItem {
            id: Uuid::new_v4().to_string(),
            content: filename,
            preview: "[Image]".to_string(),
            category: ClipboardCategory::Image,
            hash,
            pinned: false,
            favorite: false,
            created_at: Utc::now(),
            accessed_at: Utc::now(),
            access_count: 0,
            source_app: None,
            image_path: Some(image_path),
        }
    }

    pub fn compute_hash(content: &str) -> String {
        let mut hasher = Sha256::new();
        hasher.update(content.as_bytes());
        hex::encode(hasher.finalize())
    }

    /// Auto-categorize clipboard content based on patterns
    fn categorize(content: &str) -> ClipboardCategory {
        let trimmed = content.trim();

        // URL detection
        if trimmed.starts_with("http://") || trimmed.starts_with("https://")
            || trimmed.starts_with("ftp://") || trimmed.starts_with("www.")
        {
            return ClipboardCategory::Url;
        }

        // Email detection
        if RE_EMAIL.is_match(trimmed) {
            return ClipboardCategory::Email;
        }

        // Phone number detection (international formats)
        if RE_PHONE.is_match(trimmed) {
            return ClipboardCategory::Phone;
        }

        // Color hex code
        if RE_COLOR.is_match(trimmed) {
            return ClipboardCategory::Color;
        }

        // File path detection
        if trimmed.starts_with('/') || trimmed.starts_with("C:\\")
            || trimmed.starts_with("~") || trimmed.contains("\\\\")
        {
            return ClipboardCategory::Path;
        }

        // Code detection (contains common programming patterns)
        if trimmed.contains("function ") || trimmed.contains("const ")
            || trimmed.contains("def ") || trimmed.contains("class ")
            || trimmed.contains("import ") || trimmed.contains("fn ")
            || trimmed.contains("pub ") || trimmed.contains("var ")
            || (trimmed.contains('{') && trimmed.contains('}'))
        {
            return ClipboardCategory::Code;
        }

        // Pure number
        if trimmed.parse::<f64>().is_ok() {
            return ClipboardCategory::Number;
        }

        ClipboardCategory::Text
    }
}

/// Manages clipboard history with deduplication, search, and persistence
pub struct ClipboardManager {
    items: Mutex<Vec<ClipboardItem>>,
    max_items: usize,
    last_hash: Mutex<String>,
    /// Hash of content we wrote to the system clipboard ourselves.
    /// The monitor thread checks this to avoid re-capturing our own writes.
    skip_hash: Mutex<Option<String>>,
}

impl ClipboardManager {
    pub fn new(max_items: usize) -> Self {
        ClipboardManager {
            items: Mutex::new(Vec::new()),
            max_items,
            last_hash: Mutex::new(String::new()),
            skip_hash: Mutex::new(None),
        }
    }

    /// Mark content we're about to write to the system clipboard so the monitor skips it.
    pub fn set_skip(&self, content: &str) {
        let hash = ClipboardItem::compute_hash(content);
        *self.skip_hash.lock().unwrap_or_else(|e| e.into_inner()) = Some(hash);
    }

    /// Check if content should be skipped (was written by us), and clear the flag.
    pub fn should_skip(&self, content: &str) -> bool {
        let hash = ClipboardItem::compute_hash(content);
        let mut skip = self.skip_hash.lock().unwrap_or_else(|e| e.into_inner());
        if skip.as_deref() == Some(&hash) {
            *skip = None;
            true
        } else {
            false
        }
    }

    /// Add a new item to clipboard history. Returns None if duplicate.
    pub fn add(&self, content: String) -> Option<ClipboardItem> {
        // Skip content larger than 1MB
        if content.len() > 1_048_576 {
            return None;
        }
        let item = ClipboardItem::new(content);

        let mut last_hash = self.last_hash.lock().unwrap_or_else(|e| e.into_inner());
        if *last_hash == item.hash {
            return None; // Duplicate of last item
        }
        *last_hash = item.hash.clone();
        drop(last_hash);

        let mut items = self.items.lock().unwrap_or_else(|e| e.into_inner());

        // Remove any existing item with the same hash (dedup)
        items.retain(|existing| existing.hash != item.hash || existing.pinned);

        // Insert at front
        let result = item.clone();
        items.insert(0, item);

        // Trim to max, keeping pinned items
        while items.len() > self.max_items {
            if let Some(pos) = items.iter().rposition(|i| !i.pinned) {
                if pos > 0 {
                    items.remove(pos);
                } else {
                    break;
                }
            } else {
                break;
            }
        }

        Some(result)
    }

    /// Add an image item to clipboard history. Returns None if duplicate.
    pub fn add_image(&self, image_path: String) -> Option<ClipboardItem> {
        let item = ClipboardItem::new_image(image_path);

        let mut last_hash = self.last_hash.lock().unwrap_or_else(|e| e.into_inner());
        if *last_hash == item.hash {
            return None;
        }
        *last_hash = item.hash.clone();
        drop(last_hash);

        let mut items = self.items.lock().unwrap_or_else(|e| e.into_inner());
        let result = item.clone();
        items.insert(0, item);

        while items.len() > self.max_items {
            if let Some(pos) = items.iter().rposition(|i| !i.pinned) {
                if pos > 0 { items.remove(pos); } else { break; }
            } else { break; }
        }

        Some(result)
    }

    /// Get all items, optionally filtered by search query
    pub fn get_items(&self, query: Option<&str>, category: Option<&ClipboardCategory>, limit: usize, offset: usize) -> Vec<ClipboardItem> {
        let items = self.items.lock().unwrap_or_else(|e| e.into_inner());

        items.iter()
            .filter(|item| {
                if let Some(q) = query {
                    let q_lower = q.to_lowercase();
                    item.content.to_lowercase().contains(&q_lower)
                        || item.preview.to_lowercase().contains(&q_lower)
                } else {
                    true
                }
            })
            .filter(|item| {
                if let Some(cat) = category {
                    &item.category == cat
                } else {
                    true
                }
            })
            .skip(offset)
            .take(limit)
            .cloned()
            .collect()
    }

    /// Toggle pin status of an item
    pub fn toggle_pin(&self, id: &str) -> bool {
        let mut items = self.items.lock().unwrap_or_else(|e| e.into_inner());
        let idx = match items.iter().position(|i| i.id == id) {
            Some(idx) => idx,
            None => return false,
        };
        if !items[idx].pinned {
            // Cap at 50 pinned items
            let pinned_count = items.iter().filter(|i| i.pinned).count();
            if pinned_count >= 50 {
                return false;
            }
        }
        items[idx].pinned = !items[idx].pinned;
        items[idx].pinned
    }

    /// Toggle favorite status
    pub fn toggle_favorite(&self, id: &str) -> bool {
        let mut items = self.items.lock().unwrap_or_else(|e| e.into_inner());
        if let Some(item) = items.iter_mut().find(|i| i.id == id) {
            item.favorite = !item.favorite;
            return item.favorite;
        }
        false
    }

    /// Delete a specific item
    pub fn delete(&self, id: &str) -> bool {
        let mut items = self.items.lock().unwrap_or_else(|e| e.into_inner());
        let len_before = items.len();
        items.retain(|i| i.id != id);
        items.len() < len_before
    }

    /// Clear all non-pinned items
    pub fn clear(&self) {
        let mut items = self.items.lock().unwrap_or_else(|e| e.into_inner());
        items.retain(|i| i.pinned);
    }

    /// Get total item count
    pub fn count(&self) -> usize {
        self.items.lock().unwrap_or_else(|e| e.into_inner()).len()
    }

    /// Load items from a stored vector (for persistence recovery)
    pub fn load(&self, stored_items: Vec<ClipboardItem>) {
        let mut items = self.items.lock().unwrap_or_else(|e| e.into_inner());
        *items = stored_items;
    }

    /// Get all items for persistence
    pub fn get_all(&self) -> Vec<ClipboardItem> {
        self.items.lock().unwrap_or_else(|e| e.into_inner()).clone()
    }
}

impl Default for ClipboardManager {
    fn default() -> Self {
        Self::new(500)
    }
}
