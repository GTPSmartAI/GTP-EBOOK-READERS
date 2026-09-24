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
  type: 'pdf' | 'epub' | 'txt' | 'article';
  content: string; // full raw text
  sentences: string[]; // parsed array of sentences for synced speech
  chapters: Chapter[];
  totalWords: number;
  readingProgress: number; // percentage 0-100
  lastReadSentenceIndex: number;
  durationMinutes: number;
  uploadedAt: string;
  fileUrl?: string;
}

export interface VoiceOption {
  id: string;
  name: string;
  gender: 'female' | 'male';
  lang: string;
  accent: string;
  tag: string;
  description: string;
  avatarColor: string;
  samplePhrase: string;
  stability: number; // 0 to 1
  clarity: number; // 0 to 1
  speed: number;
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

