import { defineConfig } from 'vite'
import react from '@vitejs/plugin-react'
import path from 'path'

// https://vitejs.dev/config/
export default defineConfig({
  plugins: [react()],
  // 1. Base path for Vercel
  base: '/', 
  resolve: {
    alias: {
      "@": path.resolve(__dirname, "./src"),
    },
  },
  server: {
    port: 5173,
    strictPort: false,
  },
  build: {
    outDir: 'dist',
    sourcemap: false,
    // Increase limit to avoid warnings about the larger vendor file
    chunkSizeWarningLimit: 1600, 
    rollupOptions: {
      output: {
        manualChunks: {
          // Core React — loaded on every page (small, cached forever)
          'vendor-react': ['react', 'react-dom', 'react-router-dom'],
          // Data layer — loaded once auth completes
          'vendor-data': ['@tanstack/react-query', '@supabase/supabase-js'],
          // Charts — only loaded on Reports/Dashboard
          'vendor-charts': ['recharts'],
          // UI animation — loaded after first paint
          'vendor-ui': ['framer-motion'],
          // Utilities — small, shared
          'vendor-utils': ['date-fns', 'zod', 'lucide-react'],
        },
        entryFileNames: 'assets/[name]-[hash].js',
        chunkFileNames: 'assets/[name]-[hash].js',
        assetFileNames: 'assets/[name]-[hash].[ext]',
      },
    },
  },
  define: {
    __APP_VERSION__: JSON.stringify(process.env.npm_package_version || `build-${Date.now()}`),
    __BUILD_TIME__: JSON.stringify(new Date().toISOString()),
  },
})