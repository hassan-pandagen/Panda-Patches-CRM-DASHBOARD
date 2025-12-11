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
        // 🛑 SAFETY FIX: Group ALL dependencies into one file.
        // This ensures React is always loaded in the correct order.
        manualChunks(id) {
          if (id.includes('node_modules')) {
            return 'vendor';
          }
        },
        // Standard naming to prevent caching issues
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