/// <reference types="vitest/config" />
import { readFileSync } from 'node:fs';
import { defineConfig, type Plugin } from 'vite';
import react from '@vitejs/plugin-react';

// One id per build: the commit in CI (GitHub Actions / Netlify), else the build time. It versions
// the data URLs and the service-worker caches, so a deploy is picked up as a whole.
const BUILD_ID = (process.env.GITHUB_SHA || process.env.COMMIT_REF || new Date().toISOString().replace(/\D/g, '')).slice(0, 14);

/** Emits sw.js with this build's id and the list of files to precache (see src/pwa/sw-template.js). */
function serviceWorker(): Plugin {
  return {
    name: 'worldstat-service-worker',
    apply: 'build',
    generateBundle(_, bundle) {
      const files = Object.keys(bundle).filter((f) => !f.endsWith('.map') && f !== 'index.html');
      const precache = ['./', ...files, 'manifest.webmanifest', 'favicon.svg', 'icons/icon-192.png', 'icons/icon-512.png'];
      const source = readFileSync(new URL('./src/pwa/sw-template.js', import.meta.url), 'utf8')
        .replace('__BUILD_ID__', JSON.stringify(BUILD_ID))
        .replace('__PRECACHE__', JSON.stringify(precache));
      this.emitFile({ type: 'asset', fileName: 'sw.js', source });
    },
  };
}

// Static snapshot lives in /public/data and is served as-is (gzip/brotli by the host).
export default defineConfig({
  plugins: [react(), serviceWorker()],
  base: process.env.VITE_BASE ?? '/',
  define: { __BUILD_ID__: JSON.stringify(BUILD_ID) },
  build: {
    target: 'es2022',
    sourcemap: true,
    chunkSizeWarningLimit: 1600,
    rollupOptions: {
      output: {
        manualChunks: {
          maplibre: ['maplibre-gl'],
          echarts: ['echarts/core', 'echarts/charts', 'echarts/components', 'echarts/renderers'],
          export: ['jspdf', 'jspdf-autotable', 'write-excel-file'],
        },
      },
    },
  },
  test: {
    environment: 'node',
    include: ['src/**/*.test.ts'],
  },
});
