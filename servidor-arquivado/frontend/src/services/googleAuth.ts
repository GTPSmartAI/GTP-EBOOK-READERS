import { Capacitor } from '@capacitor/core';
import { BACKEND_URL } from '../config';

/**
 * Login com Google.
 * - Navegador: botão oficial do Google (Google Identity Services), que devolve um ID token.
 * - APK: login nativo do Android (Credential Manager) pelo plugin @capgo/capacitor-social-login.
 *   O botão do Google não funciona dentro do WebView; o Google bloqueia.
 * O client ID vem do backend (/api/auth/google/config), então configurar ou trocar não exige APK novo.
 */

let configPromise: Promise<string | null> | null = null;

export function getGoogleClientId(): Promise<string | null> {
  if (!configPromise) {
    configPromise = fetch(`${BACKEND_URL}/api/auth/google/config`)
      .then((r) => (r.ok ? r.json() : null))
      .then((d) => (d?.enabled && d.client_id ? String(d.client_id) : null))
      .catch(() => {
        configPromise = null; // sem internet: tenta de novo na próxima abertura da tela
        return null;
      });
  }
  return configPromise;
}

export const isNativeApp = () => Capacitor.isNativePlatform();

// ------------------------------------------------------------------ navegador

declare global {
  interface Window {
    google?: any;
  }
}

let gisPromise: Promise<void> | null = null;

function loadGis(): Promise<void> {
  if (window.google?.accounts?.id) return Promise.resolve();
  if (!gisPromise) {
    gisPromise = new Promise((resolve, reject) => {
      const s = document.createElement('script');
      s.src = 'https://accounts.google.com/gsi/client';
      s.async = true;
      s.onload = () => resolve();
      s.onerror = () => {
        gisPromise = null;
        reject(new Error('Não foi possível carregar o login do Google.'));
      };
      document.head.appendChild(s);
    });
  }
  return gisPromise;
}

/** Desenha o botão oficial do Google em `el`. onToken recebe o ID token depois que a pessoa escolhe a conta. */
export async function renderGoogleButton(el: HTMLElement, clientId: string, onToken: (idToken: string) => void) {
  await loadGis();
  window.google.accounts.id.initialize({
    client_id: clientId,
    callback: (resp: { credential?: string }) => resp.credential && onToken(resp.credential),
    ux_mode: 'popup',
    auto_select: false,
    cancel_on_tap_outside: true,
  });
  el.innerHTML = '';
  window.google.accounts.id.renderButton(el, {
    type: 'standard',
    theme: 'filled_black',
    size: 'large',
    shape: 'pill',
    text: 'continue_with',
    logo_alignment: 'left',
    locale: 'pt-BR',
    width: Math.min(400, Math.max(200, Math.floor(el.clientWidth || 320))),
  });
}

// ------------------------------------------------------------------ APK

let nativeReady: string | null = null;

/** Abre a escolha de conta Google do Android e devolve o ID token. */
export async function nativeGoogleIdToken(clientId: string): Promise<string> {
  const { SocialLogin } = await import('@capgo/capacitor-social-login');
  if (nativeReady !== clientId) {
    await SocialLogin.initialize({ google: { webClientId: clientId, mode: 'online' } });
    nativeReady = clientId;
  }
  const res: any = await SocialLogin.login({ provider: 'google', options: { scopes: ['email', 'profile'] } });
  const idToken = res?.result?.idToken;
  if (!idToken) throw new Error('O Google não devolveu a confirmação da conta. Tente de novo.');
  return idToken;
}
