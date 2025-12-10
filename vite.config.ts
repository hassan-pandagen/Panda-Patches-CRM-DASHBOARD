import { defineConfig } from 'vite'
import react from '@vitejs/plugin-react'
import path from 'path'

// https://vitejs.dev/config/
export default defineConfig({
  plugins: [react()],
  resolve: {
    alias: {
      "@": path.resolve(__dirname, "./src"),
    },
    dedupe: ['react', 'react-dom'],
  },
  optimizeDeps: {
    include: ['react', 'react-dom'],
  },
  server: {
    port: 5173,
    strictPort: false,
  },
  build: {
    // Better chunk splitting to reduce errors
    rollupOptions: {
      output: {
        // Organize chunks by type
        manualChunks: (id) => {
          // React core
          if (id.includes('node_modules/react') || id.includes('node_modules/react-dom')) {
            return 'react-vendor';
          }
          // Router
          if (id.includes('node_modules/react-router')) {
            return 'router-vendor';
          }
          // Sentry
          if (id.includes('node_modules/@sentry')) {
            return 'sentry-vendor';
          }
          // Icons
          if (id.includes('node_modules/lucide-react')) {
            return 'icons-vendor';
          }
          // Supabase
          if (id.includes('node_modules/@supabase')) {
            return 'supabase-vendor';
          }
          // Other vendors
          if (id.includes('node_modules')) {
            return 'vendor';
          }
        },
        // Use shorter, more stable hashes
        chunkFileNames: 'assets/[name]-[hash:8].js',
        entryFileNames: 'assets/[name]-[hash:8].js',
        assetFileNames: 'assets/[name]-[hash:8].[ext]',
      },
    },
    // Increase size warning limit
    chunkSizeWarningLimit: 1000,
    // Disable source maps in production for smaller builds
    sourcemap: false,
  },
  // Define global constants
  define: {
    // Version from package.json, fallback to timestamp
    __APP_VERSION__: JSON.stringify(
      process.env.npm_package_version || `build-${Date.now()}`
    ),
    // Build timestamp for tracking
    __BUILD_TIME__: JSON.stringify(new Date().toISOString()),
  },
})
