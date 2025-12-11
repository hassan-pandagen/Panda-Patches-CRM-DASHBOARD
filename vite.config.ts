import { defineConfig } from 'vite'
import react from '@vitejs/plugin-react'
import path from 'path'

// https://vitejs.dev/config/
export default defineConfig({
  plugins: [react()],
  base: '/', 
  resolve: {
    alias: {
      "@": path.resolve(__dirname, "./src"),
    },
    // ✅ FIX: Force single React instance in production
    dedupe: ['react', 'react-dom'],
  },
  optimizeDeps: {
    // ✅ FIX: Pre-bundle React for consistency
    include: ['react', 'react-dom', 'react/jsx-runtime'],
  },
  server: {
    port: 5173,
    strictPort: false,
  },
  build: {
    outDir: 'dist',
    sourcemap: false,
    chunkSizeWarningLimit: 1600,
    rollupOptions: {
      output: {
        // ✅ FIX: Better chunking strategy for production
        manualChunks(id) {
          // Keep React and React-DOM together
          if (id.includes('node_modules/react') || id.includes('node_modules/react-dom')) {
            return 'react-vendor';
          }
          // All other vendor code
          if (id.includes('node_modules')) {
            return 'vendor';
          }
        },
        entryFileNames: 'assets/[name]-[hash].js',
        chunkFileNames: 'assets/[name]-[hash].js',
        assetFileNames: 'assets/[name]-[hash].[ext]',
      },
    },
    // ✅ FIX: Ensure proper minification without breaking React
    minify: 'esbuild',
    target: 'es2015',
  },
  define: {
    __APP_VERSION__: JSON.stringify(process.env.npm_package_version || `build-${Date.now()}`),
    __BUILD_TIME__: JSON.stringify(new Date().toISOString()),
  },
})