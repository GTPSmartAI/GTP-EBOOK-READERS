/**
 * Normaliza o texto antes de enviar para o motor de voz (Piper TTS / Azure Edge-TTS).
 * Garante que pausas, vírgulas, reticências, travessões e pontuações especiais
 * sejam convertidos em estruturas que o fonemizador respeita como respirações e pausas naturais.
 */
export function normalizeTextForSpeech(text: string): string {
  if (!text) return '';
  let s = text.trim();

  // 1. Remove aspas que atrapalham fonética ou geram pausas artificiais
  s = s.replace(/["“"”«»]/g, '');

  // 2. Colchetes de mensagem de sistema [ ] 『 』 【 】 -> remove colchetes mantendo o texto interno
  s = s.replace(/[\[\]『』【】]/g, ' ');

  // 3. Colapsa pontuações repetidas (ex: "!!", "??", ",,")
  s = s.replace(/([.?!…])\s*([.?!…])+/g, '$1');

  // 4. Reticências (... ou …) no meio da frase:
  // O fonemizador (espeak-ng) ignora reticências no meio de frases.
  // Transformar em vírgula garante que o modelo faça a pausa reflexiva e respiração.
  s = s.replace(/(\w)\s*(\.{3,}|…)\s*(\w)/gu, '$1, $3');

  // Reticências no final da frase: vira ponto final para garantir a entonação correta
  s = s.replace(/(\.{3,}|…)\s*$/g, '.');

  // 5. Travessão no início do diálogo (ex: "— Olá") -> remove o travessão para a fala começar limpa
  s = s.replace(/^[—–-]\s*/g, '');

  // Travessão intercalado no meio da oração (ex: "Ela sabia — ou achava — a verdade")
  // Transforma em vírgula para produzir a pausa da oração intercalada
  s = s.replace(/\s*[—–]\s*/g, ', ');

  // Se ficou pontuação forte seguida de vírgula (ex: "Não vá!, disse ele") -> mantém só a pontuação forte
  s = s.replace(/([.?!;:])\s*,/g, '$1');

  // 6. Garante espaço após pontuações (vírgula, dois pontos, ponto e vírgula) se colado em letra
  s = s.replace(/([,;:])([^\s\d])/g, '$1 $2');

  // 7. Limpa vírgulas duplicadas ou vírgula no início da frase
  s = s.replace(/^,\s*/, '');
  s = s.replace(/,\s*,+/g, ',');

  // 8. Colapsa múltiplos espaços em um só
  s = s.replace(/\s+/g, ' ');

  return s.trim();
}

