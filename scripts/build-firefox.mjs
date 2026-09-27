/**
 * build-firefox.mjs
 * Derives a Firefox package (dist-firefox/) from the Chrome build in dist/.
 * Firefox MV3 has no background service workers and no _favicon API, so only
 * the manifest differs; the code is shared.
 *
 * Run: npm run build:firefox
 */

import { cpSync, existsSync, readFileSync, rmSync, writeFileSync } from 'node:fs';
import { dirname, resolve } from 'node:path';
import { fileURLToPath } from 'node:url';

const root = resolve(dirname(fileURLToPath(import.meta.url)), '..');
const src = resolve(root, 'dist');
const out = resolve(root, 'dist-firefox');

if (!existsSync(resolve(src, 'manifest.json'))) {
  console.error('dist/manifest.json not found. Run `npm run build` first.');
  process.exit(1);
}

rmSync(out, { recursive: true, force: true });
cpSync(src, out, { recursive: true });

const manifestPath = resolve(out, 'manifest.json');
const manifest = JSON.parse(readFileSync(manifestPath, 'utf8'));

// Firefox runs the background as an event page: same loader file, as a module script
const bg = manifest.background ?? {};
manifest.background = { scripts: [bg.service_worker], type: 'module' };

// Chrome-only favicon API (icons fall back to the Google favicon service in Firefox)
manifest.permissions = (manifest.permissions ?? []).filter((p) => p !== 'favicon');
manifest.web_accessible_resources = (manifest.web_accessible_resources ?? []).map((entry) => {
  const { use_dynamic_url: _chromeOnly, ...rest } = entry;
  return { ...rest, resources: rest.resources.filter((r) => r !== '_favicon/*') };
});

manifest.browser_specific_settings = {
  gecko: {
    id: 'digital-wellbeing@manan005',
    strict_min_version: '142.0',
    // All usage data stays in the browser; nothing is transmitted
    data_collection_permissions: { required: ['none'] },
  },
};

writeFileSync(manifestPath, JSON.stringify(manifest, null, 2));
console.log(`Firefox build written to ${out}`);
