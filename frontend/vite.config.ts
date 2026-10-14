import { fileURLToPath, URL } from 'node:url'

import tailwindcss from '@tailwindcss/vite'
import { defineConfig, loadEnv } from 'vite'
import react from '@vitejs/plugin-react'
import type { Plugin } from 'vite'

const styleBridge: Plugin = {
  name: 'ripple-style-bridge',
  enforce: 'pre',
  transform(source, id) {
    const normalizedId = id.replaceAll('\\', '/')
    if (!normalizedId.endsWith('/src/styles.css')) {
      return undefined
    }
    return `@import "./styles/globals.css";\n${source}`
  },
}

export default defineConfig(({ mode }) => {
  const env = loadEnv(mode, process.cwd(), '')

  return {
    plugins: [styleBridge, react(), tailwindcss()],
    resolve: {
      alias: {
        '@': fileURLToPath(new URL('./src', import.meta.url)),
      },
    },
    server: {
      proxy: {
        '/api': {
          target: env.VITE_API_PROXY_TARGET || 'http://127.0.0.1:8000',
          changeOrigin: true,
        },
      },
    },
  }
})
