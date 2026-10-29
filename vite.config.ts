import { cloudflare } from '@cloudflare/vite-plugin'
import tailwindcss from '@tailwindcss/vite'
import { defineConfig } from 'vite'
import VueJsxVapor from 'vue-jsx-vapor/vite'

export default defineConfig({
  esbuild: {
    jsx: 'automatic',
    jsxImportSource: 'hono/jsx',
  },
  plugins: [
    tailwindcss(),
    VueJsxVapor({
      macros: true,
      include: [/src\/client\/.*\.[tj]sx?$/],
    }),
    cloudflare(),
  ],
  environments: {
    client: {
      build: {
        rollupOptions: {
          input: {
            client: 'src/client/main.tsx',
          },
          output: {
            entryFileNames: 'static/client.js',
            assetFileNames: 'static/[name].[ext]',
          },
        },
      },
    },
  },
  resolve: {
    alias: {
      '@': '/src',
      vue:
        process.env.NODE_ENV === 'production'
          ? 'vue/dist/vue.runtime-with-vapor.esm-browser.prod.js'
          : 'vue/dist/vue.runtime-with-vapor.esm-browser.js',
    },
  },
})
