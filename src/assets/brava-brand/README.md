# Brava Brand Asset Package v1.0

## Directory Structure

```
brava-brand/
├── favicons/                    ← Drop into public/ root of every project
│   ├── favicon.ico              Web browser fallback (16+32+48px)
│   ├── favicon.svg              SVG favicon (modern browsers)
│   ├── favicon-16x16.png
│   ├── favicon-32x32.png
│   ├── favicon-48x48.png
│   ├── favicon-64x64.png
│   ├── favicon-96x96.png
│   ├── favicon-128x128.png
│   ├── favicon-180x180.png
│   ├── favicon-192x192.png
│   ├── favicon-256x256.png
│   ├── favicon-512x512.png
│   ├── apple-touch-icon.png     iOS home screen (180×180, rounded)
│   ├── android-chrome-192x192.png
│   ├── android-chrome-512x512.png
│   ├── mstile-150x150.png       Windows tile
│   ├── og-image.png             Open Graph / social share (1200×630)
│   ├── site.webmanifest         PWA / Android manifest
│   └── browserconfig.xml        Windows IE/Edge tile config
│
├── icons/                       ← App store submission + social
│   ├── app-icon-20x20.png
│   ├── app-icon-29x29.png
│   ├── app-icon-40x40.png
│   ├── app-icon-57x57.png
│   ├── app-icon-58x58.png
│   ├── app-icon-60x60.png
│   ├── app-icon-76x76.png
│   ├── app-icon-80x80.png
│   ├── app-icon-87x87.png
│   ├── app-icon-114x114.png
│   ├── app-icon-120x120.png
│   ├── app-icon-152x152.png
│   ├── app-icon-167x167.png
│   ├── app-icon-180x180.png
│   ├── app-icon-1024x1024.png   App Store submission
│   ├── logo-mark-400.png        Social avatar / profile pic
│   ├── logo-mark-800.png
│   ├── logo-mark-1024.png
│   ├── logo-wordmark-300w.png
│   ├── logo-wordmark-600w.png
│   ├── logo-wordmark-1200w.png
│   ├── logo-wordmark-white-300w.png
│   ├── logo-wordmark-white-600w.png
│   └── logo-wordmark-white-1200w.png
│
├── logos/                       ← Master SVG files (infinitely scalable)
│   ├── logo-mark.svg            B mark, transparent bg
│   ├── logo-mark-crimson-bg.svg B mark on crimson square
│   ├── logo-mark-rounded.svg    B mark on crimson, rounded corners
│   ├── logo-wordmark.svg        Full horizontal lockup (dark)
│   └── logo-wordmark-white.svg  Full horizontal lockup (white)
│
├── assets/                      ← Dev tokens + project config
│   ├── tokens.css               CSS custom properties (drop into any project)
│   ├── brava-tailwind-preset.js Tailwind config preset
│   └── head-snippet.html        Copy-paste HTML <head> block
│
└── guidelines/
    └── brava-brand-guidelines.html  Full brand guidelines (open in browser)
```

## Quick Start (Web Project)

1. Copy `favicons/` folder to your `public/` directory
2. Copy `assets/tokens.css` to your styles
3. Paste `assets/head-snippet.html` content into your `<head>`
4. Update `og:url`, `og:description`, and `<title>` values

## Quick Start (Tailwind Project)

```js
// tailwind.config.js
module.exports = {
  presets: [require('./brava-brand/assets/brava-tailwind-preset')],
  // your config...
}
```

## Quick Start (Flutter / Mobile)

Use icons from `icons/` directory:
- App icon: `app-icon-1024x1024.png` (iOS App Store)
- Notification icon: `app-icon-96x96.png`
- Adaptive icon: `logo-mark-crimson-bg.svg` as foreground

## Colors (Quick Reference)

| Token              | Hex       | Use |
|--------------------|-----------|-----|
| Crimson            | #BF4646   | Primary, CTA, logo |
| Crimson Dark       | #9A3030   | Hover states |
| Warm Beige         | #EDDCC6   | Borders, cards |
| Cream              | #FFF4EA   | Background |
| Slate Teal         | #7EACB5   | Accent, secondary actions |
| Ink                | #2C1E1E   | Body text |

## Fonts

Google Fonts (free):
- **Display/Headings**: Playfair Display (400, 700, 400 italic)
- **Body/UI**: DM Sans (300, 400, 500)

```html
<link href="https://fonts.googleapis.com/css2?family=Playfair+Display:ital,
  wght@0,400;0,700;1,400&family=DM+Sans:wght@300;400;500&display=swap"
  rel="stylesheet"/>
```

---
Brava Brand System v1.0 · Internal use only
