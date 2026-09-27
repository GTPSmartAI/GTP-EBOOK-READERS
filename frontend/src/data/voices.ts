import type { VoiceOption } from '../types';
import catalog from '../../../backend/components/SinteseVoz/voice_catalog.json';

// Catálogo único compartilhado com o backend (backend/components/SinteseVoz/voice_catalog.json).
// Sem vozes multilíngues: cada voz fala um idioma só (as multilíngues trocavam para espanhol em frases curtas).

const CLONED_VOICES_KEY = 'gtp_cloned_voices';

// Voz padrão: a principal do plano grátis (Piper, rodando no nosso servidor)
export const DEFAULT_VOICE_ID = 'faber';

/** Voz liberada no plano grátis. Vozes premium (Edge) e personalizadas são do PRO; o backend confere de novo. */
export function isFreeVoice(voice: VoiceOption | undefined | null): boolean {
  return Boolean(voice) && voice!.engine === 'piper' && voice!.tier !== 'premium' && !voice!.isCloned;
}

export const LANGUAGE_LABELS: Record<string, string> = {
  'pt-BR': 'Português (Brasil)',
  'pt-PT': 'Português (Portugal)',
  'en-US': 'Inglês (EUA)',
  'en-GB': 'Inglês (Reino Unido)',
  'es-ES': 'Espanhol',
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
  tier: v.tier as VoiceOption['tier'],
  engine: v.engine as VoiceOption['engine'],
  // Tom e velocidade de cada variação (só vozes Edge; as Piper ajustam o ritmo no servidor)
  pitch: 'pitch' in v ? (v.pitch as string) : undefined,
  rate: 'rate' in v ? (v.rate as string) : undefined,
  stability: 0.95,
  clarity: 0.97,
  speed: 'speed' in v ? Number(v.speed) : 1.0,
}));

// IDs de vozes antigas (removidas) -> voz nova equivalente, para preferências já salvas no navegador
const LEGACY_IDS: Record<string, string> = Object.fromEntries(
  Object.entries(catalog.legacy_ids).filter(([key]) => !key.startsWith('_'))
);

/** Vozes clonadas/personalizadas salvas pelo usuário (tela Vozes) */
export function getClonedVoices(): VoiceOption[] {
  try {
    const saved = localStorage.getItem(CLONED_VOICES_KEY);
    const parsed = saved ? JSON.parse(saved) : [];
    return Array.isArray(parsed) ? parsed : [];
  } catch {
    return [];
  }
}

/** Todas as vozes disponíveis: clonadas primeiro, depois o catálogo */
export function getAllVoices(): VoiceOption[] {
  return [...getClonedVoices(), ...VOICES];
}

/** Procura a voz no catálogo (aceita IDs antigos) e entre as clonadas */
export function findVoiceById(id: string | undefined | null): VoiceOption | undefined {
  if (!id) return undefined;
  const resolved = LEGACY_IDS[id] || id;
  return VOICES.find((v) => v.id === resolved) || getClonedVoices().find((v) => v.id === resolved);
}

/** Vozes agrupadas por idioma, premium antes das básicas (para listas e seletores) */
export function groupVoicesByLanguage(voices: VoiceOption[] = getAllVoices()): { lang: string; label: string; voices: VoiceOption[] }[] {
  const groups = new Map<string, VoiceOption[]>();
  for (const v of voices) {
    const key = v.isCloned ? 'cloned' : v.lang;
    if (!groups.has(key)) groups.set(key, []);
    groups.get(key)!.push(v);
  }
  const order = ['cloned', ...Object.keys(LANGUAGE_LABELS)];
  return Array.from(groups.entries())
    .sort(([a], [b]) => (order.indexOf(a) === -1 ? 99 : order.indexOf(a)) - (order.indexOf(b) === -1 ? 99 : order.indexOf(b)))
    .map(([lang, list]) => ({
      lang,
      label: lang === 'cloned' ? 'Minhas vozes' : LANGUAGE_LABELS[lang] || lang,
      voices: [...list].sort((a, b) => (a.tier === b.tier ? 0 : a.tier === 'premium' ? -1 : 1)),
    }));
}
