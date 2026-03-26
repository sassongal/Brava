use crate::layouts::LayoutRegistry;

/// Core layout conversion engine.
/// Detects the source language of text and converts it to the target layout.
pub struct LayoutEngine {
    registry: LayoutRegistry,
}

/// Result of language detection on a text sample
#[derive(Debug, Clone, serde::Serialize)]
pub struct DetectionResult {
    pub detected_code: String,
    pub detected_name: String,
    pub confidence: f64,
    pub char_counts: Vec<(String, usize)>,
}

impl LayoutEngine {
    pub fn new() -> Self {
        LayoutEngine {
            registry: LayoutRegistry::new(),
        }
    }

    /// Detect the most likely keyboard layout that produced this text.
    /// Returns the layout code and confidence score.
    pub fn detect_layout(&self, text: &str) -> DetectionResult {
        if text.is_empty() {
            return DetectionResult {
                detected_code: "en".to_string(),
                detected_name: "English".to_string(),
                confidence: 0.0,
                char_counts: vec![],
            };
        }

        // Sample first 1000 chars for performance on large text
        let sample: String = text.chars().take(1000).collect();

        let mut hebrew_count = 0usize;
        let mut arabic_count = 0usize;
        let mut russian_count = 0usize;
        let mut english_count = 0usize;
        let mut other_count = 0usize;

        for c in sample.chars() {
            match c as u32 {
                0x0590..=0x05FF => hebrew_count += 1,   // Hebrew block
                0x0600..=0x06FF => arabic_count += 1,    // Arabic block
                0x0400..=0x04FF => russian_count += 1,   // Cyrillic block
                0x0041..=0x005A | 0x0061..=0x007A => english_count += 1, // ASCII letters
                _ => other_count += 1,
            }
        }

        let total_letters = hebrew_count + arabic_count + russian_count + english_count;
        if total_letters == 0 {
            return DetectionResult {
                detected_code: "en".to_string(),
                detected_name: "English".to_string(),
                confidence: 0.0,
                char_counts: vec![
                    ("en".to_string(), english_count),
                    ("he".to_string(), hebrew_count),
                    ("ar".to_string(), arabic_count),
                    ("ru".to_string(), russian_count),
                ],
            };
        }

        // Find the dominant language
        let counts = [
            ("he", "עברית", hebrew_count),
            ("ar", "عربي", arabic_count),
            ("ru", "Русский", russian_count),
            ("en", "English", english_count),
        ];

        let (code, name, max_count) = counts
            .iter()
            .max_by_key(|(_, _, count)| *count)
            .unwrap();

        let confidence = *max_count as f64 / total_letters as f64;

        DetectionResult {
            detected_code: code.to_string(),
            detected_name: name.to_string(),
            confidence,
            char_counts: vec![
                ("en".to_string(), english_count),
                ("he".to_string(), hebrew_count),
                ("ar".to_string(), arabic_count),
                ("ru".to_string(), russian_count),
            ],
        }
    }

    /// Convert text from one layout to another.
    /// If `source` is None, auto-detect the source layout.
    /// If `target` is None, default to English (or the opposite of detected).
    pub fn convert(&self, text: &str, source: Option<&str>, target: Option<&str>) -> Result<ConversionResult, String> {
        if text.is_empty() {
            return Ok(ConversionResult {
                converted: String::new(),
                source_layout: "unknown".to_string(),
                target_layout: "unknown".to_string(),
            });
        }

        // Detect source layout if not specified
        let source_code = match source {
            Some(s) => s.to_string(),
            None => {
                let detection = self.detect_layout(text);
                detection.detected_code
            }
        };

        // Determine target layout
        let target_code = match target {
            Some(t) => t.to_string(),
            None => {
                // Default: if source is English, try Hebrew; otherwise, English
                if source_code == "en" { "he".to_string() } else { "en".to_string() }
            }
        };

        if source_code == target_code {
            return Ok(ConversionResult {
                converted: text.to_string(),
                source_layout: source_code,
                target_layout: target_code,
            });
        }

        // Convert: source -> english -> target
        // (English is our intermediate/base representation)
        let source_layout = self.registry.get(&source_code)
            .ok_or_else(|| format!("Unknown source layout: {}", source_code))?;
        let target_layout = self.registry.get(&target_code)
            .ok_or_else(|| format!("Unknown target layout: {}", target_code))?;

        let mut result = String::with_capacity(text.len());

        for c in text.chars() {
            // Step 1: Convert from source layout to QWERTY position
            let english_char = if source_code == "en" { c } else { source_layout.char_to_english(c) };
            // Step 2: Convert from QWERTY position to target layout
            let target_char = if target_code == "en" { english_char } else { target_layout.char_from_english(english_char) };
            result.push(target_char);
        }

        Ok(ConversionResult {
            converted: result,
            source_layout: source_code,
            target_layout: target_code,
        })
    }

    /// Auto-convert: detect source and convert to the most likely intended layout
    pub fn auto_convert(&self, text: &str) -> Result<ConversionResult, String> {
        self.convert(text, None, None)
    }

    /// Get list of available layout codes
    pub fn available_layouts(&self) -> Vec<LayoutInfo> {
        self.registry.list().into_iter().map(|(code, name)| {
            LayoutInfo {
                code: code.clone(),
                name: name.clone(),
            }
        }).collect()
    }
}

impl Default for LayoutEngine {
    fn default() -> Self {
        Self::new()
    }
}

#[derive(Debug, Clone, serde::Serialize)]
pub struct ConversionResult {
    pub converted: String,
    pub source_layout: String,
    pub target_layout: String,
}

#[derive(Debug, Clone, serde::Serialize)]
pub struct LayoutInfo {
    pub code: String,
    pub name: String,
}

#[cfg(test)]
mod tests {
    use super::*;

    #[test]
    fn test_detect_hebrew() {
        let engine = LayoutEngine::new();
        let det = engine.detect_layout("שלום עולם");
        assert_eq!(det.detected_code, "he");
        assert!(det.confidence > 0.0);
    }

    #[test]
    fn test_detect_english() {
        let engine = LayoutEngine::new();
        let det = engine.detect_layout("hello world");
        assert_eq!(det.detected_code, "en");
        assert!(det.confidence > 0.0);
    }

    #[test]
    fn test_available_layouts() {
        let engine = LayoutEngine::new();
        let layouts = engine.available_layouts();
        assert!(layouts.len() >= 4);
        assert!(layouts.iter().any(|l| l.code == "en"));
        assert!(layouts.iter().any(|l| l.code == "he"));
    }

    #[test]
    fn test_convert() {
        let engine = LayoutEngine::new();
        let result = engine.convert("שדג", Some("he"), Some("en"));
        assert!(result.is_ok());
    }

    #[test]
    fn test_auto_convert() {
        let engine = LayoutEngine::new();
        let result = engine.auto_convert("שדגכ");
        assert!(result.is_ok());
    }
}
