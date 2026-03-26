use chrono::{DateTime, Utc};
use serde::{Deserialize, Serialize};
use sha2::{Digest, Sha256};
use std::sync::Mutex;
use uuid::Uuid;

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
        }
    }

    fn compute_hash(content: &str) -> String {
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
        if regex::Regex::new(r"^[a-zA-Z0-9._%+-]+@[a-zA-Z0-9.-]+\.[a-zA-Z]{2,}$")
            .map(|re| re.is_match(trimmed))
            .unwrap_or(false)
        {
            return ClipboardCategory::Email;
        }

        // Phone number detection (international formats)
        if regex::Regex::new(r"^[\+]?[(]?[0-9]{1,4}[)]?[-\s\./0-9]{6,15}$")
            .map(|re| re.is_match(trimmed))
            .unwrap_or(false)
        {
            return ClipboardCategory::Phone;
        }

        // Color hex code
        if regex::Regex::new(r"^#([0-9a-fA-F]{3}|[0-9a-fA-F]{6}|[0-9a-fA-F]{8})$")
            .map(|re| re.is_match(trimmed))
            .unwrap_or(false)
        {
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
}

impl ClipboardManager {
    pub fn new(max_items: usize) -> Self {
        ClipboardManager {
            items: Mutex::new(Vec::new()),
            max_items,
            last_hash: Mutex::new(String::new()),
        }
    }

    /// Add a new item to clipboard history. Returns None if duplicate.
    pub fn add(&self, content: String) -> Option<ClipboardItem> {
        let item = ClipboardItem::new(content);

        let mut last_hash = self.last_hash.lock().unwrap();
        if *last_hash == item.hash {
            return None; // Duplicate of last item
        }
        *last_hash = item.hash.clone();
        drop(last_hash);

        let mut items = self.items.lock().unwrap();

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

    /// Get all items, optionally filtered by search query
    pub fn get_items(&self, query: Option<&str>, category: Option<&ClipboardCategory>, limit: usize, offset: usize) -> Vec<ClipboardItem> {
        let items = self.items.lock().unwrap();

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
        let mut items = self.items.lock().unwrap();
        if let Some(item) = items.iter_mut().find(|i| i.id == id) {
            item.pinned = !item.pinned;
            return item.pinned;
        }
        false
    }

    /// Toggle favorite status
    pub fn toggle_favorite(&self, id: &str) -> bool {
        let mut items = self.items.lock().unwrap();
        if let Some(item) = items.iter_mut().find(|i| i.id == id) {
            item.favorite = !item.favorite;
            return item.favorite;
        }
        false
    }

    /// Delete a specific item
    pub fn delete(&self, id: &str) -> bool {
        let mut items = self.items.lock().unwrap();
        let len_before = items.len();
        items.retain(|i| i.id != id);
        items.len() < len_before
    }

    /// Clear all non-pinned items
    pub fn clear(&self) {
        let mut items = self.items.lock().unwrap();
        items.retain(|i| i.pinned);
    }

    /// Get total item count
    pub fn count(&self) -> usize {
        self.items.lock().unwrap().len()
    }

    /// Load items from a stored vector (for persistence recovery)
    pub fn load(&self, stored_items: Vec<ClipboardItem>) {
        let mut items = self.items.lock().unwrap();
        *items = stored_items;
    }

    /// Get all items for persistence
    pub fn get_all(&self) -> Vec<ClipboardItem> {
        self.items.lock().unwrap().clone()
    }
}

impl Default for ClipboardManager {
    fn default() -> Self {
        Self::new(500)
    }
}
