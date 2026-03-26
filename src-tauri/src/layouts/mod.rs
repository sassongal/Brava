pub mod english;
pub mod hebrew;
pub mod arabic;
pub mod russian;

use std::collections::HashMap;

/// A keyboard layout definition: maps physical key positions to characters.
/// Each layout provides a mapping from its characters to the QWERTY physical positions,
/// and from QWERTY positions to its characters.
#[derive(Debug, Clone)]
pub struct KeyboardLayout {
    pub name: String,
    pub code: String,
    /// Maps characters from this layout to QWERTY English characters
    pub to_english: HashMap<char, char>,
    /// Maps QWERTY English characters to this layout's characters
    pub from_english: HashMap<char, char>,
}

impl KeyboardLayout {
    pub fn new(name: &str, code: &str, from_english_map: Vec<(char, char)>) -> Self {
        let mut from_english = HashMap::new();
        let mut to_english = HashMap::new();

        for (eng, local) in from_english_map {
            from_english.insert(eng, local);
            to_english.insert(local, eng);
        }

        KeyboardLayout {
            name: name.to_string(),
            code: code.to_string(),
            to_english,
            from_english,
        }
    }

    /// Convert a character from this layout to English
    pub fn char_to_english(&self, c: char) -> char {
        *self.to_english.get(&c).unwrap_or(&c)
    }

    /// Convert a character from English to this layout
    pub fn char_from_english(&self, c: char) -> char {
        *self.from_english.get(&c).unwrap_or(&c)
    }
}

/// Registry of all available keyboard layouts
pub struct LayoutRegistry {
    layouts: HashMap<String, KeyboardLayout>,
}

impl LayoutRegistry {
    pub fn new() -> Self {
        let mut registry = LayoutRegistry {
            layouts: HashMap::new(),
        };

        // Register built-in layouts
        let hebrew = hebrew::layout();
        let arabic = arabic::layout();
        let russian = russian::layout();
        let english = english::layout();

        registry.layouts.insert(hebrew.code.clone(), hebrew);
        registry.layouts.insert(arabic.code.clone(), arabic);
        registry.layouts.insert(russian.code.clone(), russian);
        registry.layouts.insert(english.code.clone(), english);

        registry
    }

    pub fn get(&self, code: &str) -> Option<&KeyboardLayout> {
        self.layouts.get(code)
    }

    pub fn list(&self) -> Vec<(&String, &String)> {
        self.layouts.iter().map(|(code, layout)| (code, &layout.name)).collect()
    }

    pub fn codes(&self) -> Vec<String> {
        self.layouts.keys().cloned().collect()
    }
}

impl Default for LayoutRegistry {
    fn default() -> Self {
        Self::new()
    }
}
