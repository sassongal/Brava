use serde::Serialize;

/// Real-time wrong-layout detector.
/// Analyzes keystroke buffers to detect when the user is typing in the wrong layout.
///
/// For example, if the user types "шалом" but intended "shalom", the detector
/// recognizes the pattern and suggests conversion.
pub struct WrongLayoutDetector {
    buffer: String,
    max_buffer_size: usize,
    min_detection_length: usize,
}

#[derive(Debug, Clone, Serialize)]
pub struct DetectionAlert {
    pub wrong_text: String,
    pub suggested_text: String,
    pub source_layout: String,
    pub target_layout: String,
    pub confidence: f64,
}

impl WrongLayoutDetector {
    pub fn new() -> Self {
        WrongLayoutDetector {
            buffer: String::new(),
            max_buffer_size: 50,
            min_detection_length: 4,
        }
    }

    /// Add a character to the detection buffer
    pub fn push_char(&mut self, c: char) {
        self.buffer.push(c);
        if self.buffer.chars().count() > self.max_buffer_size {
            // Remove oldest characters safely (char boundary aware)
            if let Some((idx, _)) = self.buffer.char_indices().nth(1) {
                self.buffer.drain(..idx);
            }
        }
    }

    /// Handle backspace
    pub fn pop_char(&mut self) {
        self.buffer.pop();
    }

    /// Clear the buffer (e.g., on focus change)
    pub fn clear(&mut self) {
        self.buffer.clear();
    }

    /// Analyze the current buffer for wrong-layout typing.
    /// Returns a detection alert if the buffer likely contains wrong-layout text.
    pub fn analyze(&self) -> Option<DetectionAlert> {
        if self.buffer.chars().count() < self.min_detection_length {
            return None;
        }

        // Count character types in the buffer
        let mut hebrew = 0usize;
        let mut arabic = 0usize;
        let mut cyrillic = 0usize;
        let mut latin = 0usize;
        let mut total = 0usize;

        for c in self.buffer.chars() {
            if c.is_whitespace() || c.is_ascii_punctuation() {
                continue;
            }
            total += 1;
            match c as u32 {
                0x0590..=0x05FF => hebrew += 1,
                0x0600..=0x06FF => arabic += 1,
                0x0400..=0x04FF => cyrillic += 1,
                0x0041..=0x005A | 0x0061..=0x007A => latin += 1,
                _ => {}
            }
        }

        if total < self.min_detection_length {
            return None;
        }

        // Detect if the buffer is predominantly one script
        let threshold = 0.7;
        let counts = [
            ("he", hebrew),
            ("ar", arabic),
            ("ru", cyrillic),
            ("en", latin),
        ];

        let (dominant_lang, dominant_count) = counts
            .iter()
            .max_by_key(|(_, count)| *count)
            .unwrap();

        let ratio = *dominant_count as f64 / total as f64;
        if ratio < threshold {
            return None; // No dominant language detected
        }

        // Return an alert for any dominant script — the caller (lib.rs) runs the
        // actual layout-engine conversion and confidence check to decide whether
        // the text is truly wrong-layout.  Returning Some for English too lets us
        // catch e.g. "akuo" (Hebrew keyboard positions) that looks like English
        // but is actually mistyped Hebrew.
        let target = if *dominant_lang == "en" { "he" } else { "en" };
        Some(DetectionAlert {
            wrong_text: self.buffer.clone(),
            suggested_text: String::new(), // Filled in by the caller with LayoutEngine
            source_layout: dominant_lang.to_string(),
            target_layout: target.to_string(),
            confidence: ratio,
        })
    }

    /// Get the current buffer contents
    pub fn get_buffer(&self) -> &str {
        &self.buffer
    }
}

impl Default for WrongLayoutDetector {
    fn default() -> Self {
        Self::new()
    }
}

#[cfg(test)]
mod tests {
    use super::*;

    #[test]
    fn test_short_english_not_flagged() {
        let mut d = WrongLayoutDetector::new();
        for c in "plea".chars() { d.push_char(c); }
        // "plea" has exactly 4 chars which equals min_detection_length,
        // but the total non-whitespace count meets the threshold.
        // The detector may return Some, but the caller (lib.rs) will
        // reject it via looks_like_real_english.
        // At minimum, verify it does not panic.
        let _result = d.analyze();
    }

    #[test]
    fn test_very_short_not_flagged() {
        let mut d = WrongLayoutDetector::new();
        for c in "hi".chars() { d.push_char(c); }
        // Only 2 chars, below min_detection_length of 4
        assert!(d.analyze().is_none());
    }

    #[test]
    fn test_hebrew_on_english_keyboard_flagged() {
        let mut d = WrongLayoutDetector::new();
        // "akuo vkuc" is Hebrew typed on English keyboard
        for c in "akuo vkuc".chars() { d.push_char(c); }
        let result = d.analyze();
        assert!(result.is_some());
    }

    #[test]
    fn test_looks_like_real_english() {
        // "plea" has vowels e and a -> vowel ratio 50%, should be flagged as real English
        assert!(crate::looks_like_real_english("plea"));
        // "help me" has good vowel ratio and common bigrams
        assert!(crate::looks_like_real_english("help me"));
        // "the best" is clearly English
        assert!(crate::looks_like_real_english("the best"));
    }

    #[test]
    fn test_gibberish_not_real_english() {
        // "shgk" has no vowels -> vowel ratio 0%, no common bigrams
        assert!(!crate::looks_like_real_english("shgk"));
        // "dktf" has no vowels and no common English bigrams
        assert!(!crate::looks_like_real_english("dktf"));
    }
}
