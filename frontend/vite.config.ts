import react from '@vitejs/plugin-react'
import { defineConfig } from 'vite'

// https://vite.dev/config/
export default defineConfig({
  plugins: [react()],
  server: {
    fs: {
      // O catálogo de vozes é compartilhado com o backend (backend/components/SinteseVoz/voice_catalog.json)
      allow: ['..'],
    },
  },
})
