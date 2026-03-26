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
            min_detection_length: 3,
        }
    }

    /// Add a character to the detection buffer
    pub fn push_char(&mut self, c: char) {
        self.buffer.push(c);
        if self.buffer.len() > self.max_buffer_size {
            // Remove oldest characters
            let drain_count = self.buffer.len() - self.max_buffer_size;
            self.buffer.drain(..drain_count);
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
        if self.buffer.len() < self.min_detection_length {
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

        // If the dominant language is not English, it might be wrong-layout typing
        // We return the alert but the UI decides whether to show it based on
        // the user's active keyboard layout (which we get from the OS)
        if *dominant_lang != "en" {
            Some(DetectionAlert {
                wrong_text: self.buffer.clone(),
                suggested_text: String::new(), // Filled in by the caller with LayoutEngine
                source_layout: dominant_lang.to_string(),
                target_layout: "en".to_string(),
                confidence: ratio,
            })
        } else {
            // Buffer is English - might be wrong if user intended another language
            // This case is handled when we know the user's active OS layout
            None
        }
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
