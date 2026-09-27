# Firefox support — plan

**Status:** planned, not implemented. The current build (`dist/`) targets Chrome and other Chromium browsers (Edge, Brave).

## Why the current build doesn't load in Firefox
Loading `dist/manifest.json` through `about:debugging` → *Load Temporary Add-on* fails or misbehaves because the build is Chrome-only:

- **Background script (the load failure).** `dist/manifest.json` declares `"background": { "service_worker": "service-worker-loader.js", "type": "module" }`. Firefox MV3 does not support background service workers; it needs `"background": { "scripts": [...] }` (an event page).
- **Chrome-only favicon API.** The `"favicon"` permission and the `_favicon/*` web-accessible resource exist only in Chrome. Firefox warns about them; icon URLs 404 and the existing `onError` fallback (Google's favicon service) takes over.
- **No Gecko ID.** Firefox recommends `browser_specific_settings.gecko.id` for MV3 add-ons; it is required for signing on addons.mozilla.org and gives storage a stable identity.
- **The dashboard's own URL.** Several places recognise the extension's own page by the `chrome-extension://` prefix. In Firefox it is `moz-extension://<uuid>/index.html`, so the dashboard would be tracked under its random UUID, listed in "Usage by app" as that UUID with a timer button, and counted by the chat.

Everything else already works in Firefox MV3: the promise-based `chrome.*` APIs used (storage, tabs, windows, runtime, scripting), content scripts, the `'wasm-unsafe-eval'` CSP, module Web Workers (Firefox 114+) and WebAssembly, so the insights chat's on-device classifier runs. Gemini Nano (`LanguageModel`) doesn't exist in Firefox and is already feature-detected, so the chat falls back as it does on machines without Nano.

## Approach: a separate `dist-firefox/` derived from the Chrome build
The Chrome build stays untouched. A post-build step produces a Firefox package, so neither browser has to tolerate the other's manifest keys.

1. **`scripts/build-firefox.mjs`** (Node, no dependencies) copies `dist/` to `dist-firefox/` and patches `dist-firefox/manifest.json`:
   - `background` becomes `{ "scripts": ["service-worker-loader.js"], "type": "module" }`. The crxjs loader is a tiny ES module that imports the background chunk, so it works as a module event page.
   - Remove `"favicon"` from `permissions`, `"_favicon/*"` from `web_accessible_resources[].resources`, and the Chrome-only `use_dynamic_url` key.
   - Add `"browser_specific_settings": { "gecko": { "id": "digital-wellbeing@manan005", "strict_min_version": "128.0" } }`.
2. **`package.json`** gets `"build:firefox": "npm run build && node scripts/build-firefox.mjs"`; `dist-firefox/` goes into `.gitignore`.
3. **Recognise the extension's own page in both browsers** with one shared helper in `src/utils/storage.ts`, `isExtensionUrl(url) = /^(chrome|moz)-extension:\/\//.test(url)`, used in:
   - `src/background.ts` `getDomain`, so the dashboard is keyed as `runtime.getURL('index.html')` in Firefox too;
   - `src/utils/stats.ts` `isTrackableDomain` (also excluding `about:` pages);
   - `src/ActivityDetails.tsx` `isInternalPage`;
   - `src/utils/favicon.ts` (the dashboard's own SVG icon).
4. **README** gets a short Firefox section: run `npm run build:firefox`, then `about:debugging` → *This Firefox* → *Load Temporary Add-on* → `dist-firefox/manifest.json`. Note that temporary add-ons are removed when Firefox restarts, and that users may need to allow *Access your data for all websites* (about:addons → the extension → Permissions) so the content script (time tracking, notch, blocker) runs on sites.

## Verification
1. `npm test`, `npx tsc --noEmit`, `npm run build:firefox`.
2. `npx web-ext lint -s dist-firefox` reports no errors.
3. `npx web-ext run -s dist-firefox`: browse two sites, open the popup and dashboard, and confirm that time accrues, the dashboard row reads "Digital Wellbeing (this dashboard)" (not a UUID), the chat answers and reaches "Smart offline", the theme toggle works, and a site limit shows the blocker.
4. Load `dist/` in Chrome or Edge again and confirm nothing changed there.
