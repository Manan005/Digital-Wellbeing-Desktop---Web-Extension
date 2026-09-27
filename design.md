# Digital Wellbeing Tracker — Design System & Theme Specifications

This document outlines the visual system, user experience philosophy, typography, colors, animations, and component styling blueprints of the **Digital Wellbeing Tracker** Chrome Extension. It bridges the Gap between the original Android mobile aesthetic and a premium desktop browser extension environment.

---

## 🎨 Theme & Color Palettes

The extension UI (popup, full dashboard and the insights chat) shares one **light** and one **dark** theme. The user picks *System / Light / Dark* in the dashboard's Appearance card (default: follow the OS) or flips it with the sun/moon button in the popup header; the choice is stored in `settings.theme`. The in-page notch and blocker keep their own fixed dark styling (sections 3 and 4).

### Semantic colour tokens
Colours are never written as Tailwind palette classes in components. Every colour is a **semantic token** defined once in `src/index.css` as an RGB triplet — light values on `:root`, dark values on `:root[data-theme="dark"]` — and exposed by `tailwind.config.js` as `bg-<token>` / `text-<token>` / `border-<token>` (opacity modifiers work: `bg-overlay/50`). `src/main.tsx` applies the cached theme to `<html data-theme>` before the first paint, so neither view flashes.

| Token | Role | Light | Dark |
| :--- | :--- | :--- | :--- |
| `canvas` | Page background | `#f6f8ff` | `#030712` (`gray-950`) |
| `card` / `card-hover` | Cards, bubbles, header / hover | `#ffffff` / `slate-50` | `gray-900` / `gray-800` |
| `subtle` / `subtle-2` | Picker band, toggle-off track, disabled | `slate-100` / `slate-200` | `gray-800` / `gray-700` |
| `tile` | Favicon well (stays light so dark logos remain visible) | `#f8f9ff` | `slate-200` |
| `line` / `line-strong` | Borders | `slate-100` / `slate-200` | `gray-800` / `gray-700` |
| `ink` / `ink-2` / `ink-3` / `ink-4` | Primary → most muted text | `slate-800` / `600` / `400` / `300` | `slate-100` / `slate-300` / `gray-400` / `gray-600` |
| `ink-inverse` | Text on accent and tooltip | `#ffffff` | `#030712` |
| `accent` / `accent-hover` | Selected bar/pill, buttons, accent text | `indigo-600` / `700` | `indigo-400` / `300` |
| `accent-soft` / `accent-line` / `accent-idle` | Washes, accent borders, idle chart bar | `indigo-50` / `100` / `100` | `indigo-950` / `900` / `900` |
| `tooltip` | Chart tooltip (inverts) | `slate-800` | `slate-100` |
| `overlay` | Backdrops (`/25` chat, `/50` modal) | `slate-900` | `#000000` |
| `danger` / `danger-soft` / `danger-line` | Time-limit states | `rose-600` / `50` / `100` | `rose-400` / `950` / `900` |
| `success` | On-device AI status dot | `emerald-500` | `emerald-400` |

### 1. Full Dashboard (Tab View) — light
*Light, clean, clinical aesthetic matching Android 14's Digital Wellbeing details page.* Uses the light column above: `#f6f8ff` canvas, white cards with `slate-100` borders, `slate-800` headings, `indigo-600` accents, rose for limits.

### 2. Compact Popup View
The popup uses the **same tokens and theme setting** as the dashboard (it is the same React bundle, laid out for 360×480). In dark mode it renders the palette this section originally specified: `#030712` canvas, `gray-900` cards, `#1f2937` borders, `#f1f5f9` text and luminous `#818cf8` accents.

### 3. Dynamic Island Notch Alert
*Deep forest green notification pill sliding down to announce screen-time thresholds, designed to look intentional and native.*

| Element | Color Role / Description | Hex / Tailwind |
| :--- | :--- | :--- |
| **Pill Background** | Forest Green | `#004d40` |
| **Icon Background** | White opacity overlay | `rgba(255, 255, 255, 0.1)` |
| **Text** | Clean white | `#ffffff` |
| **Shadow** | Diffused float shadow | `rgba(0, 0, 0, 0.3)` |

### 4. App Blocker Screen
*High z-index full-screen screen lockout featuring soft warning tones and Android Material-like dialogue.*

| Element | Color Role / Description | Hex / Tailwind |
| :--- | :--- | :--- |
| **Backdrop Blur** | Translucent slate wash | `rgba(15, 23, 42, 0.95)` |
| **Overlay Dialog** | Dark ash card container | `#2d2d2d` |
| **Accent Elements** | Warm periwinkle for buttons, key SVGs | `#c1d3ff` |
| **Message text** | Clean light grey | `#e2e8f0` |

---

## 🔤 Typography & Grid Scale

The UI uses **DM Sans** as the primary typeface — an open-source geometric sans-serif that closely mirrors Google Sans (the font used in Android's Digital Wellbeing UI). DM Sans is loaded from Google Fonts and applied globally across all views.

**Why DM Sans:** Rounded terminals, optically-correct letter-spacing, and clean numeric rendering make it the ideal match for the Android Digital Wellbeing reference aesthetic. It replaces the previous `Inter` stack.

### Font Load
```html
<link rel="preconnect" href="https://fonts.googleapis.com">
<link rel="preconnect" href="https://fonts.gstatic.com" crossorigin>
<link href="https://fonts.googleapis.com/css2?family=DM+Sans:ital,opsz,wght@0,9..40,300;0,9..40,400;0,9..40,500;0,9..40,600;0,9..40,700&display=swap" rel="stylesheet">
```

### Type Scale
```
Header Large (Times/Totals)  ─── 48px / 3rem       (Weight: 400  — matches Android's light large numerals)
Header Medium (Page Titles)  ─── 30px / 1.875rem   (Weight: 400  — matches Android's page title weight)
Card Headers / Site Names    ─── 18px / 1.125rem   (Weight: 500  — medium, readable)
Body Text                    ─── 14px / 0.875rem   (Weight: 400  — default body)
Labels / Badges / Tooltips   ─── 11px / 0.6875rem  (Weight: 600  — semi-bold small caps)
Mono / Time Fills            ─── 12px / 0.75rem    (Weight: 600  — tabular-nums, time values)
```

### CSS Custom Property
```css
:root {
  --font-sans: 'DM Sans', 'Google Sans', system-ui, sans-serif;
  font-family: var(--font-sans);
}
```

---

## 📊 Component Specifications

### 1. 7-Day Screen Time Bar Chart
A key visual anchor of the dashboard, styled to resemble the native Android bar charts.
*   **Aesthetics:** Flat, soft bars that light up with a vibrant indigo fill (`#4f46e5`) when selected, and sit on a muted indigo wash (`#e0e7ff`) when idle.
*   **Micro-interactions:** 
    *   Hovering over any bar expands/highlights the bar slightly and triggers a floating tooltip directly above it showing the exact hours and minutes.
    *   Clicking a bar transitions the dashboard view state to that calendar day.
*   **Scaling System:** Scales heights dynamically. The highest screen-time duration within the 7-day range becomes the chart's 100% height limit, with intermediate gridlines dynamically marked accordingly.

### 2. Timer dialog with drum-roll wheel picker
Used for per-site daily limits and the global daily goal. The wheel is the one bold element; everything around it stays quiet.
```
  ┌────────────────────────────────────────┐
  │ [⏱]  Daily limit for github.com        │  icon tile (accent-soft) + title
  │       Resets every day at midnight.    │  helper (ink-3)
  │  ┌──────────────────────────────────┐  │
  │  │          22            13        │  │  rows fade out towards the edges
  │  │          23            14        │  │
  │  │ ▌   01  hr    :    15  min     ▐ │  │  band: accent-soft fill, accent-line border
  │  │          02            16        │  │  units live inside the band
  │  │          03            17        │  │
  │  └──────────────────────────────────┘  │  recessed well: canvas on card, line border
  │     (15 min) (30 min) (1 hr) (2 hr)    │  quick picks (aria-pressed chips)
  │     Or type  [ 1 ] hr  [ 15 ] min       │  typed entry, same state as the wheel
  ├────────────────────────────────────────┤
  │ [🗑 Remove]        Cancel  [Set 1 hr 15 min] │  primary button states the outcome
  └────────────────────────────────────────┘
```
*   **Wheel:** hours 0–23 and minutes 0–59 in 1-minute steps, `tabular-nums`; the selected row is `text-ink` 28px semibold, neighbours `text-ink-3`. A CSS mask (`transparent → black 32% … 68% → transparent`) fades the top and bottom rows so the empty rows before "00" read as the wheel's edge.
*   **Band:** `bg-accent-soft` with `border-accent-line`, spanning both drums inside the well; the unit labels ("hr", "min") sit in the band to the right of the digits.
*   **Quick picks:** 15 min / 30 min / 1 hr / 2 hr for sites, 1–4 hr for the daily goal. The chip matching the current value is highlighted.
*   **Typed entry:** two number inputs (hours, minutes) bound to the same state; the wheel scrolls to match.
*   **Actions:** "Remove" (danger, only when a limit exists), "Cancel", and a filled `bg-accent` primary button labelled with the result ("Set 1 hr 15 min"), disabled at 00:00 with a one-line hint underneath.
*   **Interaction:** mouse dragging, touch flicking, scroll wheel, row clicking, Escape and backdrop click to close; `scroll-snap-type: y mandatory` keeps rows centred on release. The scale-in animation is skipped under `prefers-reduced-motion`.

---

## 🎬 Animations & Transition Design

To make the extension feel organic, UI changes use fluid animations rather than hard transitions.

### 1. Notch Alert Dropdown (`dw-slide-down`)
A bounce-back dropdown notch inspired by modern notch dynamic islands.
```css
@keyframes dw-slide-down {
  0% {
    transform: translate(-50%, -120%);
    opacity: 0;
  }
  100% {
    transform: translate(-50%, 0);
    opacity: 1;
  }
}
```
*   **Easing:** `cubic-bezier(0.34, 1.56, 0.64, 1)` (custom spring back behavior).
*   **Duration:** `600ms` slide-in, auto-held for 4 seconds, and transitioned out.

### 2. Timer Picker Modal Scale-In (`timerModalIn`)
```css
@keyframes timerModalIn {
  from {
    opacity: 0;
    transform: scale(0.85);
  }
  to {
    opacity: 1;
    transform: scale(1);
  }
}
```
*   **Easing:** Smooth scale spring-in over `220ms`.

### 3. Screen Blocker Fade-In
```css
@keyframes dw-fade-in {
  from { opacity: 0; }
  to { opacity: 1; }
}
```
*   **Easing:** Simple linear transition over `400ms` to avoid visual jarring on lockouts.
