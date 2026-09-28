export interface Chapter {
  id: string;
  title: string;
  startIndex: number; // sentence index where this chapter begins
}

export interface Book {
  id: string;
  title: string;
  author: string;
  coverGradient: string;
  coverImage?: string;
  type: 'pdf' | 'epub' | 'txt' | 'article' | 'docx' | 'doc' | 'md' | 'mobi' | string;
  content: string; // full raw text
  sentences: string[]; // unidades faladas: frases, e dentro delas os trechos de fala e de narração separados
  // Estrutura gerada pelo backend (text_pipeline). Ausente em livros processados antes da versão 2.
  paragraphStarts?: number[]; // índice da primeira unidade de cada parágrafo
  sentenceKinds?: string; // um caractere por unidade: 'n' narração, 'd' fala, 's' texto entre [colchetes], 'h' título
  structureVersion?: number; // versão do text_pipeline que gerou a estrutura
  chapters: Chapter[];
  totalWords: number;
  readingProgress: number; // percentage 0-100
  lastReadSentenceIndex: number;
  durationMinutes: number;
  uploadedAt: string;
  fileUrl?: string;
  isUploading?: boolean;
  uploadProgress?: number;
  userId?: string;
  folderId?: string | null; // pasta da estante (BookFolder.id); null = sem pasta
  contentRev?: number; // sobe quando o servidor reprocessa o texto; cópia local com outro valor é baixada de novo
}

/** Pasta criada pelo usuário para organizar a estante */
export interface BookFolder {
  id: string;
  name: string;
}

export interface VoiceOption {
  id: string;
  name: string;
  gender: 'female' | 'male';
  lang: string;
  accent: string;
  tag: string;
  category?: 'grave' | 'espacosa' | 'cinema' | 'classica' | 'storyteller';
  description: string;
  avatarColor: string;
  samplePhrase: string;
  stability: number; // 0 to 1
  clarity: number; // 0 to 1
  speed: number;
  cadence?: 'espacosa' | 'dramatica' | 'natural';
  pitch?: string;
  rate?: string;
  sampleAudioUrl?: string;
  tier?: 'premium' | 'basic'; // basic = plano grátis (Piper); premium = só PRO (Edge TTS)
  engine?: 'edge' | 'piper';
  isCloned?: boolean;
  userId?: string;
  createdAt?: number;
}

export type ThemeMode = 'dark' | 'sepia' | 'light' | 'oled';
export type FontFamily = 'sans' | 'serif' | 'mono';

export interface ReaderSettings {
  theme: ThemeMode;
  fontFamily: FontFamily;
  fontSize: number; // 14 to 26
  lineHeight: number; // 1.4 to 2.2
  readingWidth: 'narrow' | 'medium' | 'wide' | 'full';
  autoScroll: boolean;
  selectedVoiceId: string;
  speechRate: number; // 0.75, 1, 1.25, etc
  speechPitch: number;
  highlightColor: string;
}

export interface ChatMessage {
  id: string;
  sender: 'user' | 'assistant';
  text: string;
  timestamp: string;
}

export type AppPage = 'painel' | 'leitor' | 'vozes' | 'configuracoes';

