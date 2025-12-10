import { defineConfig } from 'vite'
import react from '@vitejs/plugin-react'
import path from 'path'

// https://vitejs.dev/config/
export default defineConfig({
  plugins: [react()],
  // 👇 CRITICAL FIX: Forces absolute paths
  base: '/', 
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
    // 👇 CRITICAL FIX: Explicitly set output directory
    outDir: 'dist',
    // Better chunk splitting to reduce errors
    rollupOptions: {
      output: {
        // Organize chunks by type
        manualChunks: (id) => {
          if (id.includes('node_modules/react') || id.includes('node_modules/react-dom')) {
            return 'react-vendor';
          }
          if (id.includes('node_modules/react-router')) {
            return 'router-vendor';
          }
          if (id.includes('node_modules/@sentry')) {
            return 'sentry-vendor';
          }
          if (id.includes('node_modules/lucide-react')) {
            return 'icons-vendor';
          }
          if (id.includes('node_modules/@supabase')) {
            return 'supabase-vendor';
          }
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
    chunkSizeWarningLimit: 1000,
    sourcemap: false,
  },
  define: {
    __APP_VERSION__: JSON.stringify(process.env.npm_package_version || `build-${Date.now()}`),
    __BUILD_TIME__: JSON.stringify(new Date().toISOString()),
  },
})