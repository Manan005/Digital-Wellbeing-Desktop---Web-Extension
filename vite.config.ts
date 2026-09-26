import { defineConfig, type Plugin } from 'vite'
import react from '@vitejs/plugin-react'
import { crx } from '@crxjs/vite-plugin'
import { copyFileSync, mkdirSync } from 'node:fs'
import { resolve } from 'node:path'
import manifest from './manifest.json'

// Chrome Web Store forbids remotely hosted code, so the ONNX runtime (JS + WASM)
// that powers the chat's on-device classifier must ship inside the package.
// Only the plain single-file build is copied; model weights download at runtime.
const ORT_FILES = ['ort-wasm-simd-threaded.wasm', 'ort-wasm-simd-threaded.mjs']

const copyOnnxRuntime = (): Plugin => ({
  name: 'copy-onnx-runtime',
  apply: 'build',
  writeBundle(options) {
    const outDir = options.dir ?? 'dist'
    const dest = resolve(outDir, 'ort')
    mkdirSync(dest, { recursive: true })
    for (const file of ORT_FILES) {
      copyFileSync(resolve('node_modules/onnxruntime-web/dist', file), resolve(dest, file))
    }
  },
})

export default defineConfig({
  plugins: [
    react(),
    crx({ manifest }),
    copyOnnxRuntime(),
  ],
  worker: {
    format: 'es',
  },
  resolve: {
    // Pick onnxruntime-web's build that dynamic-imports the JS glue from
    // `wasmPaths.mjs` (our bundled copy) instead of embedding a CDN-bound one.
    conditions: ['onnxruntime-web-use-extern-wasm'],
  },
})
