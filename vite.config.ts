import { defineConfig } from 'vite';
import react from '@vitejs/plugin-react';
import { fileURLToPath, URL } from 'node:url';

export default defineConfig({
  plugins: [react()],
  resolve: {
    alias: {
      '@': fileURLToPath(new URL('./src', import.meta.url)),
    },
  },
  server: {
    port: 3000,
    open: true,
    proxy: {
      '/api': {
        target:       'http://localhost:3001',
        changeOrigin: true,
      },
    },
    warmup: {
      // Pre-transform these on server start so the first page load is instant
      clientFiles: [
        './src/main.tsx',
        './src/App.tsx',
        './src/store/index.ts',
        './src/modules/dashboard/Dashboard.tsx',
        './src/modules/trips/Trips.tsx',
        './src/modules/analytics/Analytics.tsx',
      ],
    },
  },
  optimizeDeps: {
    // Force Vite to pre-bundle all heavy deps during startup, not on first request
    include: [
      'react', 'react-dom', 'react-router-dom',
      '@tanstack/react-query',
      'zustand', 'zustand/middleware',
      'framer-motion', 'lucide-react',
      'react-hook-form', '@hookform/resolvers/zod', 'zod',
      '@radix-ui/react-dialog', '@radix-ui/react-select',
      '@radix-ui/react-tabs', '@radix-ui/react-toast',
    ],
  },
  build: {
    chunkSizeWarningLimit: 800,
    rollupOptions: {
      output: {
        manualChunks: {
          // Vendor splits: keeps the main bundle lean
          'vendor-react':    ['react', 'react-dom', 'react-router-dom'],
          'vendor-query':    ['@tanstack/react-query'],
          'vendor-ui':       ['framer-motion', 'lucide-react'],
          'vendor-radix':    [
            '@radix-ui/react-dialog',
            '@radix-ui/react-dropdown-menu',
            '@radix-ui/react-select',
            '@radix-ui/react-tabs',
            '@radix-ui/react-toast',
            '@radix-ui/react-label',
            '@radix-ui/react-separator',
            '@radix-ui/react-slot',
            '@radix-ui/react-tooltip',
            '@radix-ui/react-scroll-area',
          ],
          'vendor-supabase': ['@supabase/supabase-js'],
          'vendor-forms':    ['react-hook-form', '@hookform/resolvers', 'zod'],
          'vendor-charts':   ['recharts'],
        },
      },
    },
  },
});
