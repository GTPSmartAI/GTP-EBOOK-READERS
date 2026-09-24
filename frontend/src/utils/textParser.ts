/**
 * Splits text into sentences cleanly, handling abbreviations and punctuation.
 */
export function splitIntoSentences(text: string): string[] {
  if (!text) return [];

  // Normalize line breaks
  const clean = text
    .replace(/\r\n/g, '\n')
    .replace(/\t/g, ' ')
    .replace(/[ ]{2,}/g, ' ')
    .trim();

  // Regex split on punctuation followed by space or newline, while keeping punctuation
  const rawSegments = clean.split(/(?<=[.!?…])\s+/);

  const sentences: string[] = [];
  for (const seg of rawSegments) {
    const s = seg.trim();
    if (s.length > 0) {
      sentences.push(s);
    }
  }

  return sentences.length > 0 ? sentences : [clean];
}

/**
 * Calculates estimated listening duration in minutes based on total words and speech rate.
 */
export function estimateDurationMinutes(words: number, speed: number = 1.0): number {
  // Average speaking speed: 140 words per minute
  const wpm = 140 * speed;
  const minutes = Math.ceil(words / wpm);
  return Math.max(1, minutes);
}

/**
 * Counts words in a string.
 */
export function countWords(text: string): number {
  if (!text) return 0;
  return text.trim().split(/\s+/).filter(Boolean).length;
}
