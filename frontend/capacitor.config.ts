import type { CapacitorConfig } from '@capacitor/cli';

// App Android (APK). Empacota o build do Vite (pasta dist) dentro do app.
// O build para o APK usa o modo "android" (arquivo .env.android), que aponta para a API de produção.
const config: CapacitorConfig = {
  appId: 'br.com.iagtp.ebook',
  appName: 'Aedolia',
  webDir: 'dist',
  android: {
    // A API é HTTPS; não precisa liberar tráfego sem criptografia.
    allowMixedContent: false,
  },
  plugins: {
    // Login com Google nativo (Credential Manager). Os outros provedores ficam fora do APK.
    SocialLogin: {
      providers: { google: true, facebook: false, apple: false, twitter: false },
      logLevel: 1,
    },
  },
};

export default config;
