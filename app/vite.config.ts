import { defineConfig } from 'vitest/config';
import react from '@vitejs/plugin-react';
import tailwindcss from '@tailwindcss/vite';

export default defineConfig({
  plugins: [react(), tailwindcss()],
  server: {
    proxy: {
      '/m.js': {
        target: 'https://cloud.umami.is',
        changeOrigin: true,
        rewrite: () => '/script.js',
      },
      '/m/api/send': {
        target: 'https://cloud.umami.is',
        changeOrigin: true,
        rewrite: () => '/api/send',
      },
    },
  },
  test: {
    environment: 'jsdom',
    globals: true,
    setupFiles: './src/test/setup.ts',
    include: ['src/**/*.{test,spec}.{ts,tsx}'],
    css: false,
  },
});
