import { defineConfig, loadEnv, type Plugin } from 'vite'
import react from '@vitejs/plugin-react'
import path from 'path'
import { nodePolyfills } from 'vite-plugin-node-polyfills'

/** Serves /api/chat in development with the same handler Vercel runs in production. Keys stay server-side. */
function aiChatDev(): Plugin {
  let env: Record<string, string> = {}
  return {
    name: 'arclance-ai-chat-dev',
    configResolved(config) {
      env = loadEnv(config.mode, config.root, '')
    },
    configureServer(server) {
      // StableFX proxy: the key (STABLEFX_API_KEY) is read here on the server only
      server.middlewares.use('/api/stablefx', (req, res) => {
        void server
          .ssrLoadModule('/api/stablefx.js')
          .then((mod) => (mod.default as (a: unknown, b: unknown, c: unknown) => Promise<void>)(req, res, env))
          .catch(() => {
            res.statusCode = 500
            res.end()
          })
      })
      server.middlewares.use('/api/chat', (req, res) => {
        void server.ssrLoadModule('/api/chat.js').then((mod) => (mod.default as (a: unknown, b: unknown, c: unknown) => Promise<void>)(req, res, env)).catch(() => {
          res.statusCode = 500
          res.end()
        })
      })
    },
  }
}

export default defineConfig({
  plugins: [react(), nodePolyfills(), aiChatDev()],
  resolve: {
    alias: {
      '@': path.resolve(__dirname, './src'),
    },
    dedupe: ['react', 'react-dom'],
  },
  optimizeDeps: {
    include: [
      'react',
      'react-dom',
      'react-dom/client',
      'react/jsx-runtime',
      '@tanstack/react-query',
      'wagmi',
      'wagmi/chains',
      'wagmi/connectors',
      'viem',
      'viem/chains',
      'connectkit',
      'framer-motion',
      'lucide-react',
      'sonner',
      'clsx',
      'tailwind-merge',
      'vite-plugin-node-polyfills/shims/buffer',
      'vite-plugin-node-polyfills/shims/global',
      'vite-plugin-node-polyfills/shims/process',
    ],
  },
  server: {
    allowedHosts: true,
    cors: true,
  },
})
