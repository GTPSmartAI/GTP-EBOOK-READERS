// Endereço do backend. No navegador de desenvolvimento é o localhost; no APK (Android) precisa ser
// um endereço acessível pelo celular, definido em frontend/.env: VITE_API_URL=https://api.seudominio.com
export const BACKEND_URL: string = (import.meta.env.VITE_API_URL || 'http://localhost:4000').replace(/\/+$/, '');
