# Digital Wellbeing Tracker — Chrome Extension

A beautiful, responsive, and feature-rich Chrome Extension inspired by Android's Digital Wellbeing. It helps you monitor your daily screen time, manage website usage, and stay productive through custom daily limits and periodic alerts.

---

## 🚀 Key Features

* **Real-time Screen Time Tracking:** Monitors active browsing time down to the second using smart visibility sensors and focus-state heartbeats.
* **Dual-Mode Visual Dashboard:**
  * **Compact Popup View:** Click the extension icon in the toolbar to see today's overall screen time and your top-used domains. Fits perfectly on a `360px` mobile layout.
  * **Full-Page Tab View:** Click the dashboard link to view a wide-screen details page containing a responsive 7-day custom bar graph, interactive date selection pills, and granular site settings.
* **Custom App Limits & Site Blocking:** Set daily time limits in minutes for any website. Once your limit is reached, a custom warning overlay pauses the page and restricts access until the next day.
* **Periodic Alert Notches:** An unobtrusive, animated drop-down notification slides into view every 5 minutes of continuous domain usage, keeping you conscious of your time.
* **Reliable Date-Based Metrics:** Saves metrics grouped by local calendar date (`YYYY-MM-DD`), preventing system clock shifts from corrupting your tracking history. Includes an auto-migration script for legacy schemas.
* **Local Developer Fallback:** Includes a full mock fallback for `chrome.storage` and `chrome.runtime` namespaces. Run the project in any standard browser to preview the interface with gorgeous pre-populated mock data.

---

## 🛠️ Built With

* **Frontend:** React 18, TypeScript, Tailwind CSS 3
* **Icons:** Lucide React
* **Build System:** Vite 5, PostCSS, Autoprefixer
* **Extension Platform:** Chrome Extension Manifest V3, Background Service Workers, and injected Content Scripts

---

## 📦 Getting Started

### Prerequisites

Ensure you have [Node.js](https://nodejs.org/) installed on your computer.

### Installation

1. **Clone the repository:**
   ```bash
   git clone https://github.com/Manan005/Digital-Wellbeing-Desktop---Web-Extension.git
   cd Digital-Wellbeing-Desktop---Web-Extension
   ```

2. **Install dependencies:**
   ```bash
   npm install
   ```

3. **Build the extension:**
   ```bash
   npm run build
   ```
   This generates a production-ready extension package in the `dist/` directory.

### Loading the Extension into Google Chrome

1. Open Google Chrome and go to `chrome://extensions/`.
2. Turn on **Developer mode** using the toggle switch in the top-right corner.
3. Click the **Load unpacked** button in the top-left corner.
4. Select the built `dist` folder inside your project directory.
5. Pin the **Digital Wellbeing Tracker** to your extensions toolbar for easy access!

---

## 💻 Development Workflow

* **Start local development server:**
  ```bash
  npm run dev
  ```
  Open the displayed localhost URL. The application automatically detects that it is running outside of an extension context and injects simulated storage/metrics APIs to populate the charts.
* **Compile and validate production build:**
  ```bash
  npm run build
  ```
