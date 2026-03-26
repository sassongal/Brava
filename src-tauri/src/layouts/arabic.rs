use super::KeyboardLayout;

/// Arabic standard keyboard layout mapping from QWERTY positions
pub fn layout() -> KeyboardLayout {
    let mappings: Vec<(char, char)> = vec![
        // Lowercase QWERTY -> Arabic
        ('q', '\u{0636}'), // dad
        ('w', '\u{0635}'), // sad
        ('e', '\u{062B}'), // tha
        ('r', '\u{0642}'), // qaf
        ('t', '\u{0641}'), // fa
        ('y', '\u{063A}'), // ghain
        ('u', '\u{0639}'), // ain
        ('i', '\u{0647}'), // ha
        ('o', '\u{062E}'), // kha
        ('p', '\u{062D}'), // hah
        ('a', '\u{0634}'), // shin
        ('s', '\u{0633}'), // sin
        ('d', '\u{064A}'), // ya
        ('f', '\u{0628}'), // ba
        ('g', '\u{0644}'), // lam
        ('h', '\u{0627}'), // alef
        ('j', '\u{062A}'), // ta
        ('k', '\u{0646}'), // nun
        ('l', '\u{0645}'), // mim
        ('z', '\u{0626}'), // hamza on ya
        ('x', '\u{0621}'), // hamza
        ('c', '\u{0624}'), // hamza on waw
        ('v', '\u{0631}'), // ra
        ('b', '\u{0644}'), // lam-alef (reuse lam)
        ('n', '\u{0649}'), // alef maqsura
        ('m', '\u{0629}'), // ta marbuta
        // Uppercase -> Arabic with shift (diacritics and special chars)
        ('Q', '\u{0652}'), // sukun
        ('W', '\u{064C}'), // dammatan
        ('E', '\u{064D}'), // kasratan
        ('R', '\u{064B}'), // fathatan
        ('T', '\u{0644}'), // lam-alef ligature
        ('Y', '\u{0625}'), // alef with hamza below
        ('U', '\u{2018}'), // left single quote
        ('I', '\u{00F7}'), // division sign
        ('O', '\u{00D7}'), // multiplication sign
        ('P', '\u{061B}'), // arabic semicolon
        ('A', '\u{0650}'), // kasra
        ('S', '\u{064E}'), // fatha
        ('D', '\u{064F}'), // damma
        ('F', '\u{0651}'), // shadda
        ('G', '\u{0644}'), // lam-alef (reuse)
        ('H', '\u{0623}'), // alef with hamza above
        ('J', '\u{0640}'), // tatweel
        ('K', '\u{060C}'), // arabic comma
        ('L', '/'),
        ('Z', '~'),
        ('X', '\u{0652}'), // sukun
        ('C', '{'),
        ('V', '}'),
        ('B', '\u{0644}'), // lam-alef
        ('N', '\u{0622}'), // alef with madda
        ('M', '\''),
        // Punctuation
        (';', '\u{0643}'), // kaf
        (',', '\u{0648}'), // waw
        ('.', '\u{0632}'), // zain
        ('/', '\u{0638}'), // za
        ('[', '\u{062C}'), // jim
        (']', '\u{062F}'), // dal
    ];

    KeyboardLayout::new("\u{0639}\u{0631}\u{0628}\u{064A}", "ar", mappings)
}
