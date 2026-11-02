import type { CapacitorConfig } from '@capacitor/cli';

// App Android (APK). Empacota o build do Vite (pasta dist) dentro do app.
// Não usa internet: livros, progresso e a voz ficam e são gerados no próprio celular.
// O appId não pode mudar: é ele que faz o APK novo instalar por cima do antigo, mantendo os dados.
const config: CapacitorConfig = {
  appId: 'br.com.iagtp.ebook',
  appName: 'Aedolia',
  webDir: 'dist',
  android: {
    allowMixedContent: false,
  },
};

export default config;
