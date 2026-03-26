// brava-tailwind-preset.js
// Usage: add `presets: [require('./brava-tailwind-preset')]` to tailwind.config.js

module.exports = {
  theme: {
    extend: {
      colors: {
        brava: {
          crimson:      '#BF4646',
          'crimson-dark': '#9A3030',
          'crimson-light': '#D96B6B',
          beige:        '#EDDCC6',
          cream:        '#FFF4EA',
          teal:         '#7EACB5',
          'teal-dark':  '#5A8E99',
          'teal-light': '#A4C8CF',
          ink:          '#2C1E1E',
          'ink-mid':    '#5C4040',
          'ink-soft':   '#9A7A7A',
        },
      },
      fontFamily: {
        display: ["'Playfair Display'", 'Georgia', 'serif'],
        sans:    ["'DM Sans'", 'Inter', 'system-ui', 'sans-serif'],
        mono:    ["'JetBrains Mono'", "'Fira Code'", 'monospace'],
      },
      fontSize: {
        'xs':  ['11px', { lineHeight: '1.4' }],
        'sm':  ['13px', { lineHeight: '1.5' }],
        'base':['15px', { lineHeight: '1.6' }],
        'md':  ['17px', { lineHeight: '1.55' }],
        'lg':  ['22px', { lineHeight: '1.35' }],
        'xl':  ['28px', { lineHeight: '1.25' }],
        '2xl': ['36px', { lineHeight: '1.15' }],
        '3xl': ['48px', { lineHeight: '1.1'  }],
        '4xl': ['64px', { lineHeight: '1.0'  }],
      },
      spacing: {
        '18': '72px',
        '22': '88px',
        '26': '104px',
        '30': '120px',
      },
      borderRadius: {
        'sm': '4px',
        DEFAULT: '6px',
        'md': '6px',
        'lg': '10px',
        'xl': '14px',
        '2xl': '20px',
      },
      boxShadow: {
        'brava-sm': '0 1px 3px rgba(44,30,30,0.08)',
        'brava':    '0 4px 12px rgba(44,30,30,0.10)',
        'brava-lg': '0 10px 30px rgba(44,30,30,0.12)',
        'brava-xl': '0 20px 50px rgba(44,30,30,0.14)',
      },
      backgroundImage: {
        'brava-gradient': 'linear-gradient(135deg, #BF4646 0%, #9A3030 100%)',
        'teal-gradient':  'linear-gradient(135deg, #7EACB5 0%, #5A8E99 100%)',
        'warm-gradient':  'linear-gradient(135deg, #FFF4EA 0%, #EDDCC6 100%)',
      },
    },
  },
};
