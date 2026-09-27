import type { VoiceOption } from '../types';
import { VOICES, DEFAULT_VOICE_ID, findVoiceById, isFreeVoice } from '../data/voices';

/**
 * Elenco do livro: três vozes, escolhidas pelo usuário.
 * O tipo de cada trecho vem do backend (text_pipeline): 'n' narração, 'd' fala, 's' texto entre [colchetes], 'h' título.
 */
export type VoiceRole = 'narrator' | 'dialogue' | 'system';

export interface BookCast {
  bookId: string;
  theatreModeEnabled: boolean; // desligado: tudo com a voz da narração
  narratorVoiceId: string;
  dialogueVoiceId: string;
  systemVoiceId: string;
}

export const VOICE_ROLES: { role: VoiceRole; label: string; description: string; example: string }[] = [
  { role: 'narrator', label: 'Narração', description: 'Texto narrado e títulos', example: 'Era uma noite fria quando ele chegou à cidade.' },
  { role: 'dialogue', label: 'Falas', description: 'Tudo entre aspas ou após travessão', example: '— Quem está aí? Não tenha medo.' },
  { role: 'system', label: 'Colchetes [ ]', description: 'Mensagens de sistema e janelas', example: '[Cenário Principal nº 1 concluído!]' },
];

// Padrões com vozes do plano grátis (quem é PRO pode trocar no elenco)
const DEFAULT_DIALOGUE_VOICE = 'cadu';
const DEFAULT_SYSTEM_VOICE = 'jeff';

const storageKey = (bookId: string) => `gtp_book_cast_${bookId}`;

/** Carrega o elenco salvo do livro (ou o padrão, com a narração na voz ativa do player) */
export function loadBookCast(bookId: string, defaultNarratorVoiceId: string): BookCast {
  let saved: Partial<BookCast> = {};
  try {
    saved = JSON.parse(localStorage.getItem(storageKey(bookId)) || '{}') || {};
  } catch {
    saved = {};
  }
  // findVoiceById também converte IDs de vozes antigas para as novas
  const valid = (id?: string) => (id ? findVoiceById(id)?.id : undefined);
  return {
    bookId,
    theatreModeEnabled: saved.theatreModeEnabled ?? true,
    narratorVoiceId: valid(saved.narratorVoiceId) || defaultNarratorVoiceId,
    dialogueVoiceId: valid(saved.dialogueVoiceId) || DEFAULT_DIALOGUE_VOICE,
    systemVoiceId: valid(saved.systemVoiceId) || DEFAULT_SYSTEM_VOICE,
  };
}

export function saveBookCast(cast: BookCast): void {
  try {
    localStorage.setItem(storageKey(cast.bookId), JSON.stringify(cast));
  } catch (e) {
    console.error('[BookCast] Erro ao salvar elenco:', e);
  }
}

export function roleForKind(kind: string | undefined): VoiceRole {
  if (kind === 'd') return 'dialogue';
  if (kind === 's') return 'system';
  return 'narrator';
}

export function voiceIdForRole(cast: BookCast, role: VoiceRole): string {
  if (role === 'dialogue') return cast.dialogueVoiceId;
  if (role === 'system') return cast.systemVoiceId;
  return cast.narratorVoiceId;
}

/** Voz que deve ler o trecho, conforme o tipo dele e o elenco. freeOnly: plano grátis (troca vozes PRO pela padrão). */
export function resolveVoiceForSentence(sentenceIndex: number, cast: BookCast, kinds?: string, freeOnly = false): VoiceOption {
  const allowed = (v: VoiceOption | undefined) => (v && (!freeOnly || isFreeVoice(v)) ? v : undefined);
  const narrator = allowed(findVoiceById(cast.narratorVoiceId)) || findVoiceById(DEFAULT_VOICE_ID) || VOICES[0];
  if (!cast.theatreModeEnabled || !kinds) return narrator;
  const role = roleForKind(kinds[sentenceIndex]);
  return allowed(findVoiceById(voiceIdForRole(cast, role))) || narrator;
}

/** A voz escolhida no player é sempre a da narração */
export function withNarratorVoice(cast: BookCast, voiceId: string): BookCast {
  return { ...cast, narratorVoiceId: voiceId };
}
