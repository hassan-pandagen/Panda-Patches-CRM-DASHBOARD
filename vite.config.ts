// vite.config.ts

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
  },
  // ✅ UPGRADE 5: Manual chunk configuration for optimal caching
  build: {
    rollupOptions: {
      output: {
        manualChunks: {
          // Vendor chunks (split major dependencies)
          'vendor-react': ['react', 'react-dom', 'react-router-dom'],
          'vendor-query': ['@tanstack/react-query'],
          'vendor-ui': ['recharts', 'framer-motion', 'lucide-react'],
          'vendor-forms': ['react-hook-form'],
          
          // Feature chunks (group pages by feature)
          'orders': [
            'src/pages/AllOrdersPage.tsx',
            'src/pages/OrderPage.tsx',
            'src/pages/NewOrderPage.tsx',
            'src/pages/EditOrderPage.tsx',
          ],
          'reports': ['src/pages/ReportsPage.tsx'],
          'admin': ['src/pages/UserManagementPage.tsx'],
          'settings': ['src/pages/SettingsPage.tsx'],
        },
      },
    },
  },
})