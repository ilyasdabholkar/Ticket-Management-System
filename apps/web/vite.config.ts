import path from 'node:path'
import tailwindcss from '@tailwindcss/vite'
import react from '@vitejs/plugin-react'
import { defineConfig, loadEnv } from 'vite'

// https://vite.dev/config/
export default defineConfig(({ mode }) => {
  // Single .env at the repo root; only VITE_* reaches the browser.
  const envDir = path.resolve(import.meta.dirname, '../..')
  const env = loadEnv(mode, envDir, 'VITE_')
  return {
    // Supports hosting under an IIS virtual directory (VITE_BASE_PATH=/tms/)
    envDir,
    base: env.VITE_BASE_PATH || '/',
    plugins: [react(), tailwindcss()],
    build: {
      // Split stable vendor code into cacheable chunks (keeps the app chunk small).
      rollupOptions: {
        output: {
          manualChunks(id: string) {
            if (!id.includes('node_modules')) return undefined
            if (/node_modules[\/](react|react-dom|scheduler|react-router)[\/]/.test(id)) return 'vendor-react'
            if (id.includes('@supabase')) return 'vendor-supabase'
            if (id.includes('@tanstack')) return 'vendor-query'
            if (/radix-ui|@radix-ui|cmdk|vaul|sonner/.test(id)) return 'vendor-ui'
            if (/zod|react-hook-form|@hookform/.test(id)) return 'vendor-forms'
            return undefined
          },
        },
      },
    },
    resolve: {
      alias: { '@': path.resolve(import.meta.dirname, './src') },
    },
  }
})
