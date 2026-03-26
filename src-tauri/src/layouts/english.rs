use super::KeyboardLayout;

/// QWERTY English layout - identity mapping (serves as the base reference)
pub fn layout() -> KeyboardLayout {
    // English is the base layout, so mappings are identity for letters
    // We still register it so it appears in the layout list
    let mappings: Vec<(char, char)> = vec![
        // Lowercase
        ('q', 'q'), ('w', 'w'), ('e', 'e'), ('r', 'r'), ('t', 't'),
        ('y', 'y'), ('u', 'u'), ('i', 'i'), ('o', 'o'), ('p', 'p'),
        ('a', 'a'), ('s', 's'), ('d', 'd'), ('f', 'f'), ('g', 'g'),
        ('h', 'h'), ('j', 'j'), ('k', 'k'), ('l', 'l'),
        ('z', 'z'), ('x', 'x'), ('c', 'c'), ('v', 'v'),
        ('b', 'b'), ('n', 'n'), ('m', 'm'),
        // Uppercase
        ('Q', 'Q'), ('W', 'W'), ('E', 'E'), ('R', 'R'), ('T', 'T'),
        ('Y', 'Y'), ('U', 'U'), ('I', 'I'), ('O', 'O'), ('P', 'P'),
        ('A', 'A'), ('S', 'S'), ('D', 'D'), ('F', 'F'), ('G', 'G'),
        ('H', 'H'), ('J', 'J'), ('K', 'K'), ('L', 'L'),
        ('Z', 'Z'), ('X', 'X'), ('C', 'C'), ('V', 'V'),
        ('B', 'B'), ('N', 'N'), ('M', 'M'),
    ];

    KeyboardLayout::new("English", "en", mappings)
}
