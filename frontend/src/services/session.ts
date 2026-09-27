import { BACKEND_URL } from '../config';

/**
 * Sessão do usuário logado.
 * O backend devolve um token aleatório no login; ele vai em toda chamada à API no cabeçalho
 * Authorization. A senha nunca fica guardada no aparelho.
 */
export interface SessionUser {
  id: string;
  email: string;
  username: string;
  full_name: string;
  subscription_tier: 'free' | 'pro' | 'unlimited';
  subscription_status: string;
  words_read_total?: number;
  created_at?: string;
  has_password?: boolean;
  has_google?: boolean;
}

const TOKEN_KEY = 'gtp_session_token';
const USER_KEY = 'gtp_session_user';

type Listener = (user: SessionUser | null) => void;
const listeners = new Set<Listener>();

function read<T>(key: string): T | null {
  try {
    const raw = localStorage.getItem(key);
    return raw ? (JSON.parse(raw) as T) : null;
  } catch {
    return null;
  }
}

export function getToken(): string | null {
  return read<string>(TOKEN_KEY);
}

export function getSessionUser(): SessionUser | null {
  return getToken() ? read<SessionUser>(USER_KEY) : null;
}

function saveSession(token: string, user: SessionUser) {
  localStorage.setItem(TOKEN_KEY, JSON.stringify(token));
  localStorage.setItem(USER_KEY, JSON.stringify(user));
  listeners.forEach((l) => l(user));
}

function clearSession() {
  localStorage.removeItem(TOKEN_KEY);
  localStorage.removeItem(USER_KEY);
  listeners.forEach((l) => l(null));
}

export function onSessionChange(listener: Listener): () => void {
  listeners.add(listener);
  return () => listeners.delete(listener);
}

/** fetch para a API com o login. Resposta 401 (sessão expirada ou revogada) desconecta o app. */
export async function apiFetch(path: string, init: RequestInit = {}): Promise<Response> {
  const headers = new Headers(init.headers);
  const token = getToken();
  if (token) headers.set('Authorization', `Bearer ${token}`);
  const res = await fetch(path.startsWith('http') ? path : `${BACKEND_URL}${path}`, { ...init, headers });
  if (res.status === 401 && token && getToken() === token) clearSession();
  return res;
}

async function authRequest(path: string, body: Record<string, unknown>): Promise<SessionUser> {
  let res: Response;
  try {
    res = await fetch(`${BACKEND_URL}${path}`, {
      method: 'POST',
      headers: { 'Content-Type': 'application/json' },
      body: JSON.stringify(body),
    });
  } catch {
    throw new Error('Sem conexão com o servidor. Verifique a internet.');
  }
  const data = await res.json().catch(() => ({}));
  if (!res.ok || !data.token || !data.user) {
    throw new Error(data.error || 'Não foi possível entrar. Tente de novo.');
  }
  saveSession(data.token, data.user);
  return data.user;
}

export function login(email: string, password: string) {
  return authRequest('/api/auth/login', { email: email.trim().toLowerCase(), password });
}

/** Entra (ou cria a conta) com o ID token que o Google entregou ao app. */
export function loginWithGoogle(idToken: string) {
  return authRequest('/api/auth/google', { id_token: idToken });
}

export function register(data: { email: string; password: string; fullName: string; username: string }) {
  return authRequest('/api/auth/register', {
    email: data.email.trim().toLowerCase(),
    password: data.password,
    full_name: data.fullName.trim(),
    username: data.username.trim().toLowerCase(),
  });
}

export async function logout() {
  try {
    await apiFetch('/api/auth/logout', { method: 'POST' });
  } catch {
    // sem internet: a sessão local some mesmo assim
  }
  clearSession();
}

/** Confere a sessão no servidor e atualiza os dados do usuário. false = sessão inválida. */
export async function refreshSession(): Promise<boolean> {
  const token = getToken();
  if (!token) return false;
  try {
    const res = await apiFetch('/api/auth/me');
    if (res.status === 401) return false;
    if (!res.ok) return true; // servidor fora do ar: continua com a sessão guardada
    const data = await res.json();
    if (data.user) saveSession(token, data.user);
    return true;
  } catch {
    return true;
  }
}

export async function changePassword(currentPassword: string, newPassword: string): Promise<void> {
  const res = await apiFetch('/api/auth/change-password', {
    method: 'POST',
    headers: { 'Content-Type': 'application/json' },
    body: JSON.stringify({ current_password: currentPassword, new_password: newPassword }),
  });
  const data = await res.json().catch(() => ({}));
  if (!res.ok || !data.token) throw new Error(data.error || 'Não foi possível trocar a senha.');
  saveSession(data.token, data.user);
}
