// Ritmo médio de leitura em voz alta a 1x (palavras por minuto). O tempo mostrado é estimado por ele.
export const WORDS_PER_MINUTE = 145;

export const wordsPerSecond = (rate: number) => Math.max(0.1, (WORDS_PER_MINUTE * rate) / 60);

/** Palavras acumuladas antes de cada trecho (prefix[i] = palavras dos trechos 0..i-1) */
export function buildWordsPrefix(sentences: string[] | undefined): Float64Array {
  const list = sentences || [];
  const prefix = new Float64Array(list.length + 1);
  for (let i = 0; i < list.length; i++) {
    prefix[i + 1] = prefix[i] + (list[i] || '').trim().split(/\s+/).filter(Boolean).length;
  }
  return prefix;
}

/** Primeiro trecho cujo início já passou de `words` palavras (busca binária no prefixo) */
export function sentenceAtWords(prefix: Float64Array, words: number): number {
  let lo = 0;
  let hi = prefix.length - 2;
  while (lo < hi) {
    const mid = (lo + hi + 1) >> 1;
    if (prefix[mid] <= words) lo = mid;
    else hi = mid - 1;
  }
  return Math.max(0, lo);
}
