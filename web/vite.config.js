import { dirname, resolve } from 'node:path'
import { fileURLToPath } from 'node:url'
import { defineConfig, loadEnv } from 'vite'
import react from '@vitejs/plugin-react'
import tailwindcss from '@tailwindcss/vite'

const webDir = dirname(fileURLToPath(import.meta.url));
const repoRoot = resolve(webDir, '..');

// https://vite.dev/config/
export default defineConfig(({ mode }) => {
  const env = loadEnv(mode, repoRoot, '');
  const apiProxyTarget =
    env.VITE_API_PROXY_TARGET || process.env.VITE_API_PROXY_TARGET || 'http://localhost:3000';

  return {
    root: webDir,
    envDir: '..',
    plugins: [
      react(),
      tailwindcss(),
    ],
    server: {
      proxy: {
        '/api': {
          target: apiProxyTarget,
          changeOrigin: true,
          secure: true,
        },
      },
    },
    test: {
      dir: resolve(repoRoot, 'tests'),
      environment: 'jsdom',
      globals: true,
      setupFiles: [resolve(repoRoot, 'tests/setup.js')],
    },
    build: {
      outDir: 'dist',
      emptyOutDir: true,
      rollupOptions: {
        output: {
          manualChunks(id) {
            if (id.includes('node_modules')) {
              if (id.includes('react-dom') || id.includes('/react/') || id.includes('\\react\\') || id.includes('scheduler')) {
                return 'react-vendor';
              }
              if (id.includes('firebase/firestore') || id.includes('@firebase/firestore')) {
                return 'firebase-firestore';
              }
              if (id.includes('firebase') || id.includes('@firebase')) {
                return 'firebase';
              }
              if (id.includes('lucide-react')) {
                return 'icons-vendor';
              }
              if (id.includes('qrcode') || id.includes('html5-qrcode')) {
                return 'qr-vendor';
              }
            }
          },
        },
      },
    },
  };
})
