import { defineConfig } from 'vitest/config'
import react from '@vitejs/plugin-react'
import tailwindcss from '@tailwindcss/vite'
import path from 'path'
import { webdriverio } from '@vitest/browser-webdriverio'

// https://vitejs.dev/config/
export default defineConfig({
  plugins: [
    react(),
    tailwindcss(),
  ],
  resolve: {
    alias: {
      "@": path.resolve(__dirname, "./src")
    },
  },
  server: {
    sourcemapIgnoreList: false, // Ensure VS Code doesn't skip "internal" files
    watch: {
      ignored: [
        '**/node_modules/**', 
        '**/backend/**',      // Don't watch the backend from the frontend
        '**/dist/**', 
        '**/.turbo/**'        // Ignore Turborepo cache
      ]
    }
  },
  build: { sourcemap: true },
  test: {
    setupFiles: ['./src/vitest.setup.ts'],
    include: ['test/**/*.{test,spec}.{js,mjs,cjs,ts,mts,cts,jsx,tsx}'],
    browser: {
      enabled: true,
      provider: webdriverio(),
      instances: [
        { browser: 'chrome' }
      ]
    }
  }
})