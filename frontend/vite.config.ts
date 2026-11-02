import react from '@vitejs/plugin-react'
import { defineConfig } from 'vite'

// Porta do ajudante de voz do PC (deploy/voz_pc.py). O Aedolia-PC.bat abre o app direto nele;
// no `npm run dev` o Vite repassa /local-tts para lá.
const PC_VOICE_PORT = 5180

// https://vite.dev/config/
export default defineConfig({
  plugins: [react()],
  server: {
    proxy: {
      '/local-tts': `http://127.0.0.1:${PC_VOICE_PORT}`,
    },
  },
})
