import type { VoiceOption } from '../types';
import catalog from './voice_catalog.json';

// Catálogo das vozes geradas no celular (voice_catalog.json). Cada voz é um modelo Piper dentro do APK.

// Voz padrão
export const DEFAULT_VOICE_ID = 'faber';

/** Selo na lista de vozes */
export const ENGINE_BADGE: Record<string, { label: string; color: string }> = {
  piper: { label: 'NO CELULAR', color: '#38bdf8' },
};

export const LANGUAGE_LABELS: Record<string, string> = {
  'pt-BR': 'Português (Brasil)',
};

export const VOICES: VoiceOption[] = catalog.voices.map((v) => ({
  id: v.id,
  name: v.name,
  gender: v.gender as VoiceOption['gender'],
  lang: v.lang,
  accent: v.accent,
  tag: v.tag,
  category: v.category as VoiceOption['category'],
  description: v.description,
  avatarColor: v.avatarColor,
  samplePhrase: v.samplePhrase,
  cadence: v.cadence as VoiceOption['cadence'],
  engine: 'piper',
  model: v.model,
  lengthScale: v.length_scale,
  stability: 0.95,
  clarity: 0.97,
  speed: 1.0,
}));

// IDs de vozes antigas (removidas) -> voz equivalente, para preferências já salvas no aparelho
const LEGACY_IDS: Record<string, string> = Object.fromEntries(
  Object.entries(catalog.legacy_ids).filter(([key]) => !key.startsWith('_'))
);

/** Procura a voz no catálogo (aceita IDs antigos) */
export function findVoiceById(id: string | undefined | null): VoiceOption | undefined {
  if (!id) return undefined;
  // ID antigo pode apontar para outro ID antigo: segue a corrente
  let resolved = id;
  for (let i = 0; i < 3 && LEGACY_IDS[resolved]; i++) resolved = LEGACY_IDS[resolved];
  return VOICES.find((v) => v.id === resolved);
}

/** Vozes agrupadas por idioma (para listas e seletores) */
export function groupVoicesByLanguage(voices: VoiceOption[] = VOICES): { lang: string; label: string; voices: VoiceOption[] }[] {
  const groups = new Map<string, VoiceOption[]>();
  for (const v of voices) {
    if (!groups.has(v.lang)) groups.set(v.lang, []);
    groups.get(v.lang)!.push(v);
  }
  return Array.from(groups.entries()).map(([lang, list]) => ({
    lang,
    label: LANGUAGE_LABELS[lang] || lang,
    voices: list,
  }));
}
