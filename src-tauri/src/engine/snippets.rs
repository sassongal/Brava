use chrono::{Local, Utc};
use serde::{Deserialize, Serialize};
use regex::Regex;
use std::collections::HashMap;

/// A text snippet with trigger and expansion content
#[derive(Debug, Clone, Serialize, Deserialize)]
pub struct Snippet {
    pub id: String,
    pub trigger: String,
    pub content: String,
    pub description: Option<String>,
    pub folder: Option<String>,
    #[serde(default)]
    pub is_regex: bool,
    pub enabled: bool,
    pub use_count: u32,
    pub created_at: String,
    pub updated_at: String,
}

impl Snippet {
    pub fn new(
        trigger: String,
        content: String,
        description: Option<String>,
        folder: Option<String>,
        is_regex: bool,
    ) -> Self {
        let now = Utc::now().to_rfc3339();
        Snippet {
            id: uuid::Uuid::new_v4().to_string(),
            trigger,
            content,
            description,
            folder,
            is_regex,
            enabled: true,
            use_count: 0,
            created_at: now.clone(),
            updated_at: now,
        }
    }
}

/// Trie node for efficient prefix matching of snippet triggers
#[derive(Debug, Default)]
struct TrieNode {
    children: HashMap<char, TrieNode>,
    snippet_id: Option<String>,
}

/// Trie-based snippet engine for O(k) trigger matching
pub struct SnippetEngine {
    root: TrieNode,
    snippets: HashMap<String, Snippet>,
}

impl SnippetEngine {
    pub fn new() -> Self {
        SnippetEngine {
            root: TrieNode::default(),
            snippets: HashMap::new(),
        }
    }

    /// Insert a snippet into the trie
    pub fn add(&mut self, snippet: Snippet) {
        let trigger = snippet.trigger.clone();
        let id = snippet.id.clone();
        self.snippets.insert(id.clone(), snippet);

        let mut node = &mut self.root;
        for c in trigger.chars() {
            node = node.children.entry(c).or_default();
        }
        node.snippet_id = Some(id);
    }

    /// Remove a snippet by ID
    pub fn remove(&mut self, id: &str) -> Option<Snippet> {
        if let Some(snippet) = self.snippets.remove(id) {
            // Rebuild trie (simpler than selective removal for correctness)
            self.rebuild_trie();
            Some(snippet)
        } else {
            None
        }
    }

    /// Update an existing snippet
    pub fn update(
        &mut self,
        id: &str,
        trigger: Option<String>,
        content: Option<String>,
        description: Option<Option<String>>,
        folder: Option<Option<String>>,
        is_regex: Option<bool>,
    ) -> Option<&Snippet> {
        if let Some(snippet) = self.snippets.get_mut(id) {
            if let Some(t) = trigger {
                snippet.trigger = t;
            }
            if let Some(c) = content {
                snippet.content = c;
            }
            if let Some(d) = description {
                snippet.description = d;
            }
            if let Some(f) = folder {
                snippet.folder = f;
            }
            if let Some(v) = is_regex {
                snippet.is_regex = v;
            }
            snippet.updated_at = Utc::now().to_rfc3339();
            self.rebuild_trie();
            self.snippets.get(id)
        } else {
            None
        }
    }

    /// Look up a snippet by matching the end of a buffer against triggers.
    /// Returns the matched snippet if the buffer ends with a trigger.
    pub fn match_buffer(&self, buffer: &str) -> Option<&Snippet> {
        // First pass: exact trigger match from buffer suffix (highest priority)
        let chars: Vec<char> = buffer.chars().collect();
        let mut best_match: Option<(&str, usize)> = None;

        for start in 0..chars.len() {
            let mut node = &self.root;
            let mut consumed = 0usize;
            for &c in &chars[start..] {
                if let Some(child) = node.children.get(&c) {
                    node = child;
                    consumed += 1;
                } else {
                    break;
                }
            }
            if let Some(ref id) = node.snippet_id {
                match best_match {
                    Some((_, best_len)) if best_len >= consumed => {}
                    _ => best_match = Some((id.as_str(), consumed)),
                }
            }
        }

        if let Some((id, _)) = best_match {
            return self.snippets.get(id);
        }

        // Second pass: regex match against suffix only; choose longest trigger.
        let mut regex_match: Option<(&Snippet, usize)> = None;
        for s in self.snippets.values().filter(|s| s.enabled && s.is_regex) {
            let anchored = format!("(?:{})$", s.trigger);
            if let Ok(re) = Regex::new(&anchored) {
                if re.is_match(buffer) {
                    let score = s.trigger.len();
                    match regex_match {
                        Some((_, best_score)) if best_score >= score => {}
                        _ => regex_match = Some((s, score)),
                    }
                }
            }
        }
        regex_match.map(|(snippet, _)| snippet)
    }

    /// Expand dynamic variables in snippet content
    pub fn expand_variables(content: &str, clipboard: &str) -> String {
        let now = Local::now();

        content
            .replace("{date}", &now.format("%Y-%m-%d").to_string())
            .replace("{time}", &now.format("%H:%M:%S").to_string())
            .replace("{datetime}", &now.format("%Y-%m-%d %H:%M:%S").to_string())
            .replace("{day}", &now.format("%A").to_string())
            .replace("{month}", &now.format("%B").to_string())
            .replace("{year}", &now.format("%Y").to_string())
            .replace("{clipboard}", clipboard)
            .replace("{timestamp}", &now.timestamp().to_string())
            // {cursor} is handled by the frontend (sets cursor position after expansion)
    }

    /// Get all snippets
    pub fn list(&self) -> Vec<&Snippet> {
        self.snippets.values().collect()
    }

    /// Get a snippet by ID
    pub fn get(&self, id: &str) -> Option<&Snippet> {
        self.snippets.get(id)
    }

    /// Load snippets from a stored vector
    pub fn load(&mut self, snippets: Vec<Snippet>) {
        self.snippets.clear();
        self.root = TrieNode::default();
        for snippet in snippets {
            self.add(snippet);
        }
    }

    /// Get all snippets for persistence
    pub fn get_all(&self) -> Vec<Snippet> {
        self.snippets.values().cloned().collect()
    }

    fn rebuild_trie(&mut self) {
        self.root = TrieNode::default();
        let snippets: Vec<(String, String)> = self.snippets.iter()
            .filter(|(_, s)| s.enabled)
            .map(|(id, s)| (id.clone(), s.trigger.clone()))
            .collect();

        for (id, trigger) in snippets {
            let mut node = &mut self.root;
            for c in trigger.chars() {
                node = node.children.entry(c).or_default();
            }
            node.snippet_id = Some(id);
        }
    }
}

impl Default for SnippetEngine {
    fn default() -> Self {
        Self::new()
    }
}

#[cfg(test)]
mod tests {
    use super::*;

    #[test]
    fn test_snippet_creation() {
        let s = Snippet::new("/sig".to_string(), "Best regards".to_string(), Some("Sig".to_string()), None, false);
        assert_eq!(s.trigger, "/sig");
        assert_eq!(s.content, "Best regards");
        assert!(s.enabled);
    }

    #[test]
    fn test_add_and_match() {
        let mut engine = SnippetEngine::new();
        engine.add(Snippet::new("/hello".to_string(), "Hello World!".to_string(), None, None, false));
        let matched = engine.match_buffer("/hello");
        assert!(matched.is_some());
        assert_eq!(matched.unwrap().content, "Hello World!");
    }

    #[test]
    fn test_no_match() {
        let mut engine = SnippetEngine::new();
        engine.add(Snippet::new("/hello".to_string(), "Hello".to_string(), None, None, false));
        assert!(engine.match_buffer("/goodbye").is_none());
        assert!(engine.match_buffer("/hell").is_none());
    }

    #[test]
    fn test_remove() {
        let mut engine = SnippetEngine::new();
        let s = Snippet::new("/test".to_string(), "test".to_string(), None, None, false);
        let id = s.id.clone();
        engine.add(s);
        assert!(engine.remove(&id).is_some());
        assert!(engine.match_buffer("/test").is_none());
    }

    #[test]
    fn test_get_all() {
        let mut engine = SnippetEngine::new();
        engine.add(Snippet::new("/a".to_string(), "aaa".to_string(), None, None, false));
        engine.add(Snippet::new("/b".to_string(), "bbb".to_string(), None, None, false));
        assert_eq!(engine.get_all().len(), 2);
    }

    #[test]
    fn test_load() {
        let mut engine = SnippetEngine::new();
        engine.load(vec![
            Snippet::new("/x".to_string(), "xxx".to_string(), None, None, false),
            Snippet::new("/y".to_string(), "yyy".to_string(), None, None, false),
        ]);
        assert_eq!(engine.get_all().len(), 2);
        assert!(engine.match_buffer("/x").is_some());
    }

    #[test]
    fn test_variable_expansion() {
        let expanded = SnippetEngine::expand_variables("Pasted: {clipboard}", "hello");
        assert_eq!(expanded, "Pasted: hello");
    }

    #[test]
    fn test_date_variable() {
        let expanded = SnippetEngine::expand_variables("Today is {date}", "");
        assert!(!expanded.contains("{date}"));
    }
}
