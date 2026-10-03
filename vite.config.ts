/// <reference types="vitest/config" />
import { defineConfig } from 'vite';
import react from '@vitejs/plugin-react';

// Static snapshot lives in /public/data and is served as-is (gzip/brotli by the host).
export default defineConfig({
  plugins: [react()],
  base: process.env.VITE_BASE ?? '/',
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
