# Digital Wellbeing Tracker — Design System & Theme Specifications

This document outlines the visual system, user experience philosophy, typography, colors, animations, and component styling blueprints of the **Digital Wellbeing Tracker** Chrome Extension. It bridges the Gap between the original Android mobile aesthetic and a premium desktop browser extension environment.

---

## 🎨 Theme & Color Palettes

The extension utilizes four distinct theme environments to establish clear visual context depending on where the user is interacting:

### 1. Full Dashboard (Tab View)
*Light, clean, clinical aesthetic matching Android 14's Digital Wellbeing details page.*

| Element | Color Role / Description | Hex / Tailwind |
| :--- | :--- | :--- |
| **Canvas Background** | Ultra-soft blue-grey background | `#f6f8ff` |
| **Containers / Cards** | Clean white background with subtle border | `#ffffff` |
| **Borders** | Minimal contrast border dividers | `#f1f5f9` (`slate-100`) |
| **Primary Text** | Deep slate for high-readability headers | `#1e293b` (`slate-800`) |
| **Secondary Text** | Medium slate for labels, helper texts | `#64748b` (`slate-500`) |
| **Accent Primary** | Indigo-blue for selected days, primary tabs | `#4f46e5` (`indigo-600`) |
| **Accent Soft** | Light indigo wash for active badges and fills | `#eef2ff` (`indigo-50`) |
| **Alert / Warning** | Crimson-rose for deleted elements or time-limits | `#e11d48` (`rose-600`) |

### 2. Compact Popup View
*Dark, high-contrast dashboard card layout designed to fit seamlessly with default browser interfaces.*

| Element | Color Role / Description | Hex / Tailwind |
| :--- | :--- | :--- |
| **Canvas Background** | Deep midnight grey | `#030712` (`gray-950`) |
| **Containers / Cards** | Semi-translucent dark grey fill | `rgba(17, 24, 39, 0.6)` |
| **Borders / Dividers**| Thin charcoal lines | `#1f2937` (`gray-800`) |
| **Primary Text** | Off-white high-contrast typography | `#f1f5f9` (`slate-100`) |
| **Accent Text** | Luminous indigo for times and totals | `#818cf8` (`indigo-400`) |

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

The UI utilizes a modern typography scale centered on **Inter** and **Google Sans** or system-default geometric sans-serif typefaces.

```
Header Large (Times/Totals)  ─── 48px / 3rem (Font-Weight: 800/Black)
Header Medium (Titles)      ─── 30px / 1.875rem (Font-Weight: 700/Bold)
Card Headers                ─── 18px / 1.125rem (Font-Weight: 700/Bold)
Body Text                   ─── 14px / 0.875rem (Font-Weight: 500/Medium)
Labels / Badges / Tooltips  ─── 11px / 0.6875rem (Font-Weight: 600/Semi-bold)
Mono / Time Fills           ─── 12px / 0.75rem (Font-Weight: 600/Semi-bold, tabular-nums)
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

### 2. Drum-Roll Scroll Wheel Picker
A tactile selector used when setting app time limits or global daily goals.
```
         ┌─────────────────────────┐
         │         00  00          │
         │         01  05          │
      ───┼─────────────────────────┼─── Selection Highlight Band
         │   [ 02 ]  [ 15 ] mins   │
      ───┼─────────────────────────┼───
         │         03  20          │
         │         04  25          │
         └─────────────────────────┘
```
*   **Aesthetics:** Transparent tumbler container overlaying a centered light-grey highlight band (`bg-slate-100`). Selected index enlarges to `text-2xl font-bold` and transitions surrounding items down to a lighter grey opacity.
*   **Interaction:** Supports mouse dragging, touch flicking, scroll wheel increments, and individual index clicking. Standardized using CSS scroll-snapping (`scroll-snap-type: y mandatory`) to ensure perfect vertical center alignments on drag-release.

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
