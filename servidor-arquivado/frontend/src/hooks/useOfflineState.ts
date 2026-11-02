import { useEffect, useState } from 'react';
import { getOfflineState, subscribeOffline, type OfflineState } from '../services/offlineAudio';
import { isNativeApp } from '../services/googleAuth';

/** Downloads para ouvir sem internet: só no APK (no navegador o espaço pode ser apagado sem aviso). */
export const OFFLINE_ENABLED = isNativeApp() || import.meta.env.DEV;

export function useOfflineState(): OfflineState {
  const [state, setState] = useState<OfflineState>(getOfflineState);
  useEffect(() => subscribeOffline(setState), []);
  return state;
}
