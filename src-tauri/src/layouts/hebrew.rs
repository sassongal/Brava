use super::KeyboardLayout;

/// Hebrew standard keyboard layout mapping from QWERTY positions
pub fn layout() -> KeyboardLayout {
    let mappings: Vec<(char, char)> = vec![
        // Lowercase QWERTY -> Hebrew
        ('q', '/'), ('w', '\''), ('e', '\u{05E7}'), ('r', '\u{05E8}'), ('t', '\u{05D0}'),
        ('y', '\u{05D8}'), ('u', '\u{05D5}'), ('i', '\u{05DF}'), ('o', '\u{05DD}'), ('p', '\u{05E4}'),
        ('a', '\u{05E9}'), ('s', '\u{05D3}'), ('d', '\u{05D2}'), ('f', '\u{05DB}'), ('g', '\u{05E2}'),
        ('h', '\u{05D9}'), ('j', '\u{05D7}'), ('k', '\u{05DC}'), ('l', '\u{05DA}'),
        ('z', '\u{05D6}'), ('x', '\u{05E1}'), ('c', '\u{05D1}'), ('v', '\u{05D4}'),
        ('b', '\u{05E0}'), ('n', '\u{05DE}'), ('m', '\u{05E6}'),
        // Uppercase (same Hebrew chars since Hebrew has no case)
        ('Q', '/'), ('W', '\''), ('E', '\u{05E7}'), ('R', '\u{05E8}'), ('T', '\u{05D0}'),
        ('Y', '\u{05D8}'), ('U', '\u{05D5}'), ('I', '\u{05DF}'), ('O', '\u{05DD}'), ('P', '\u{05E4}'),
        ('A', '\u{05E9}'), ('S', '\u{05D3}'), ('D', '\u{05D2}'), ('F', '\u{05DB}'), ('G', '\u{05E2}'),
        ('H', '\u{05D9}'), ('J', '\u{05D7}'), ('K', '\u{05DC}'), ('L', '\u{05DA}'),
        ('Z', '\u{05D6}'), ('X', '\u{05E1}'), ('C', '\u{05D1}'), ('V', '\u{05D4}'),
        ('B', '\u{05E0}'), ('N', '\u{05DE}'), ('M', '\u{05E6}'),
        // Punctuation mappings
        (',', '\u{05EA}'), // comma -> tav
        ('.', '\u{05E5}'), // period -> final tsadi
        (';', '\u{05E3}'), // semicolon -> final pe
        ('\'', ','),       // apostrophe -> comma
        ('[', ']'), (']', '['),
        ('/', '.'),
    ];

    KeyboardLayout::new("\u{05E2}\u{05D1}\u{05E8}\u{05D9}\u{05EA}", "he", mappings)
}
