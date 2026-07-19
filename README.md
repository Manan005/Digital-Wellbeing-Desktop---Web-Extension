# Digital Wellbeing Tracker — Browser Extension

A beautiful, responsive, and feature-rich browser extension inspired by Android's Digital Wellbeing. It helps you monitor your daily screen time, manage website usage, and stay productive through custom daily limits and periodic alerts.

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

## 🛠️ Changes in progress

This extension utilizes Chrome's native **Prompt API** (stable for extensions as of Chrome 138) to act as a local Retrieval-Augmented Generation (RAG) agent. 

* **Zero Cloud Costs & Privacy First:** All AI inference runs entirely on your device using the Gemini Nano model. Your sensitive screen-time data and browsing habits never leave your computer.
* **The RAG Pipeline:** The extension retrieves your weekly usage JSON from `chrome.storage.local` and feeds it directly into a local session via `LanguageModel.create()`.
* **Actionable Insights:** The AI acts as a personalized productivity coach. It analyzes your context to identify trends and provides custom insights, such as: *"You spent an extra 45 minutes on LeetCode solving problems in C and Java today, but your scrolling time on social media also spiked. Let's lock in for tomorrow!"*

---

## 🛠️ Built With

* **Frontend:** React 18, TypeScript, Tailwind CSS 3
* **Icons:** Lucide React
* **Build System:** Vite 5, PostCSS, Autoprefixer
* **Extension Platform:** Web Extension Manifest V3 (compatible with Chrome, Edge, Brave, Opera, etc.), Background Service Workers, and injected Content Scripts

---

## 📦 Getting Started & Local Installation

Follow these steps to set up the project locally and add the extension to your browser.

### 1. Build the Extension Locally

1. **Prerequisites:** Ensure you have [Node.js](https://nodejs.org/) (v16 or higher recommended) installed.
2. **Clone the repository:**
   ```bash
   git clone https://github.com/Manan005/Digital-Wellbeing-Desktop---Web-Extension.git
   cd Digital-Wellbeing-Desktop---Web-Extension
   ```
3. **Install packages:**
   ```bash
   npm install
   ```
4. **Build the extension:**
   ```bash
   npm run build
   ```
   *Note: This command compiles TypeScript/JSX and uses Vite to bundle the files into a new `dist/` directory at the project root.*

---

### 2. Load the Extension into Your Browser

Once the `dist/` folder is generated, load it into your preferred web browser:

1. Open any Chromium-based web browser (such as **Google Chrome, Microsoft Edge, Brave, Opera, or Vivaldi**).
2. Go to the extensions management screen by typing the appropriate URL in the address bar:
   * **Chrome / Brave:** `chrome://extensions`
   * **Edge:** `edge://extensions`
   * **Opera:** `opera://extensions`
3. Turn on **Developer mode** (typically a toggle switch in the top-right corner or sidebar).
4. Click the **Load unpacked** button (sometimes called **Load unpacked extension**).
5. Select the **`dist`** folder in your project directory.
6. Pin the **Digital Wellbeing Tracker** to your toolbar for quick access (via the extensions puzzle piece icon in your toolbar).

---

### 3. Applying Code Updates

If you modify any source files (in `src/`):
1. Run `npm run build` again to recompile the changes.
2. Go back to your browser's extensions page and click the **Reload icon** (circular arrow button) on the **Digital Wellbeing Tracker** extension card.

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
