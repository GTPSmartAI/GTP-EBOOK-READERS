import React, { useState, useEffect, useMemo, useRef } from 'react';
import { Capacitor } from '@capacitor/core';
import { App as CapApp } from '@capacitor/app';
import { VOICES, DEFAULT_VOICE_ID, findVoiceById } from './data/voices';
import type { Book, BookFolder, ReaderSettings, VoiceOption, AppPage } from './types';
import { speechEngine } from './services/speechEngine';
import type { PlaybackStatus } from './services/speechEngine';
import {
  computeReadingStats, getLocalOwner, loadFolders, newFolderId, saveFolders, validateFolderName,
} from './services/library';
import type { FolderResult } from './services/library';
import { readingTracker } from './services/readingTracker';
import { importBookFile } from './services/bookImport';
import { STRUCTURE_VERSION } from './services/bookImport/textPipeline';
import { saveBookFull, getBookFull, deleteBookFull, saveBooksMetadataSafe, loadInitialBooks } from './services/bookStorage';

// Pages
import { Painel } from './pages/Painel';
import { Leitor } from './pages/Leitor';
import { Vozes } from './pages/Vozes';
import { Configuracoes } from './pages/Configuracoes';

// Layout & Components
import { AppHeader } from './components/layout/AppHeader';
import { MobileBottomNav } from './components/layout/MobileBottomNav';
import { useIsMobile } from './hooks/useIsMobile';
import { AudioPlayer } from './components/AudioPlayer';
import { VoicePickerModal } from './components/VoicePickerModal';
import { SettingsModal } from './components/SettingsModal';
import { UploadModal } from './components/UploadModal';
import { ChapterDrawer } from './components/ChapterDrawer';
import { BookCastModal } from './components/BookCastModal';
import { loadBookCast, resolveVoiceForSentence, roleForKind, saveBookCast, withNarratorVoice, VOICE_ROLES } from './services/bookCast';
import type { BookCast } from './services/bookCast';
import { isNativeApp, onPlayerCommand, stopNowPlaying, updateNowPlaying } from './services/nativePlayback';
import { buildWordsPrefix, sentenceAtWords, wordsPerSecond } from './utils/readingTime';

const DEFAULT_SETTINGS: ReaderSettings = {
  theme: 'dark',
  fontFamily: 'serif',
  fontSize: 18,
  lineHeight: 1.8,
  readingWidth: 'medium',
  autoScroll: true,
  selectedVoiceId: DEFAULT_VOICE_ID,
  speechRate: 1.0,
  speechPitch: 1.0,
  highlightColor: '#10b981',
};

// Purga dados legados gigantes do localStorage para garantir velocidade instantânea
try {
  localStorage.removeItem('gtp_reader_books');
} catch {}

type ProgressFields = Pick<Book, 'lastReadSentenceIndex' | 'readingProgress' | 'progressReadAt'>;

/**
 * Ponto de leitura que vale entre duas cópias do livro (metadados x cópia completa): o mais recente.
 * Cópias sem horário (progressReadAt 0) ficam com o maior progresso.
 */
function newestProgress(a: ProgressFields, b: ProgressFields): ProgressFields {
  const pick = (x: ProgressFields) => ({
    lastReadSentenceIndex: x.lastReadSentenceIndex || 0,
    readingProgress: x.readingProgress || 0,
    progressReadAt: x.progressReadAt || 0,
  });
  const aAt = a.progressReadAt || 0;
  const bAt = b.progressReadAt || 0;
  if (aAt || bAt) return pick(aAt >= bAt ? a : b);
  return pick((a.readingProgress || 0) >= (b.readingProgress || 0) ? a : b);
}

// Versão mínima da estrutura do livro (bookImport/textPipeline.ts, STRUCTURE_VERSION)
const REQUIRED_STRUCTURE_VERSION = 4;

// Livro pronto para leitura: tem as unidades faladas e a estrutura atual (parágrafos, falas, colchetes)
const hasStructuredContent = (book: Book) =>
  Boolean(
    book.sentences?.length &&
      book.paragraphStarts?.length &&
      (book.structureVersion || 0) >= REQUIRED_STRUCTURE_VERSION
  );

/**
 * Conteúdo completo do livro, guardado no aparelho (IndexedDB). null = o texto não está aqui
 * (livro que só tinha metadados neste aparelho; o texto ficava no servidor antigo).
 */
async function loadFullBook(book: Book): Promise<Book | null> {
  const local = await getBookFull(book.id);
  if (!local || !local.sentences?.length) return null;
  // A cópia completa tem o ponto de leitura de quando foi gravada: vale o da estante, se for mais recente
  const progress = newestProgress(book, local);
  return { ...local, ...progress, lastReadSentenceIndex: Math.min(progress.lastReadSentenceIndex, local.sentences.length - 1) };
}

/** Título para comparar livros (reimportar um livro que já está na estante) */
const titleKey = (title: string) =>
  title.normalize('NFD').replace(/[̀-ͯ]/g, '').toLowerCase().replace(/[^a-z0-9]+/g, ' ').trim();

export const App: React.FC = () => {
  // Sem contas: o dono dos dados é o usuário que já estava salvo no aparelho (ou "local").
  // O contador de leitura é ligado já aqui (não num efeito): os efeitos das telas rodam antes e já leem as estatísticas.
  const [owner] = useState(() => {
    const found = getLocalOwner();
    readingTracker.setOwner(found.id);
    return found;
  });
  return <ReaderApp ownerId={owner.id} ownerName={owner.name} />;
};

const ReaderApp: React.FC<{ ownerId: string; ownerName: string }> = ({ ownerId, ownerName }) => {
  // Palavras que a voz leu de verdade (Painel)
  const [wordsReadTotal, setWordsReadTotal] = useState<number | null>(null);

  // Active Navigation Page ('painel' | 'leitor' | 'vozes' | 'configuracoes')
  const [activePage, setActivePageRaw] = useState<AppPage>('painel');
  const isMobile = useIsMobile();

  // Histórico de telas para o botão "voltar" do Android: cada troca guarda a tela de onde saiu
  const activePageRef = useRef(activePage);
  activePageRef.current = activePage;
  const pageHistoryRef = useRef<AppPage[]>([]);
  const setActivePage = (page: AppPage) => {
    const from = activePageRef.current;
    if (page === from) return;
    pageHistoryRef.current.push(from);
    if (pageHistoryRef.current.length > 50) pageHistoryRef.current.shift();
    activePageRef.current = page;
    setActivePageRaw(page);
  };

  // Estante: tudo guardado no aparelho (IndexedDB + metadados no localStorage)
  const [books, setBooks] = useState<Book[]>([]);

  // Pastas da estante e a que está aberta no Painel ('all' = todos os livros, 'none' = sem pasta)
  const [folders, setFolders] = useState<BookFolder[]>(() => loadFolders(ownerId));
  const [activeFolderId, setActiveFolderId] = useState<string>('all');

  const [currentBookId, setCurrentBookId] = useState<string>('');

  const currentBook = useMemo(() => {
    if (books.length === 0) return null;
    return books.find((b) => b.id === currentBookId) || books[0] || null;
  }, [books, currentBookId]);

  // Audio Playback state
  const [currentSentenceIndex, setCurrentSentenceIndex] = useState<number>(0);
  const [playbackStatus, setPlaybackStatus] = useState<PlaybackStatus>('idle');

  // Voice state & Favorites
  const [favoriteVoiceIds, setFavoriteVoiceIds] = useState<string[]>(() => {
    try {
      const saved = JSON.parse(localStorage.getItem('gtp_favorite_voices') || 'null');
      if (Array.isArray(saved)) return saved.map((id: string) => findVoiceById(id)?.id).filter(Boolean) as string[];
    } catch (e) {
      console.error(e);
    }
    return [DEFAULT_VOICE_ID, 'dii'];
  });

  // Voz do narrador: restaura a última escolhida (IDs de vozes antigas viram a equivalente)
  const [selectedVoice, setSelectedVoice] = useState<VoiceOption>(() => {
    let savedVoiceId: string | undefined;
    try {
      savedVoiceId = JSON.parse(localStorage.getItem('gtp_reader_settings') || '{}').selectedVoiceId;
    } catch {}
    return findVoiceById(savedVoiceId) || findVoiceById(DEFAULT_VOICE_ID) || VOICES[0];
  });

  // Settings state
  const [settings, setSettings] = useState<ReaderSettings>(() => {
    const saved = localStorage.getItem('gtp_reader_settings');
    if (saved) {
      try {
        const parsed = { ...DEFAULT_SETTINGS, ...JSON.parse(saved) };
        return { ...parsed, selectedVoiceId: findVoiceById(parsed.selectedVoiceId)?.id || DEFAULT_VOICE_ID };
      } catch (e) {
        console.error(e);
      }
    }
    return DEFAULT_SETTINGS;
  });

  // Modals state
  const [isVoicePickerOpen, setIsVoicePickerOpen] = useState(false);
  const [isSettingsOpen, setIsSettingsOpen] = useState(false);
  const [isUploadOpen, setIsUploadOpen] = useState(false);
  const [isChaptersOpen, setIsChaptersOpen] = useState(false);
  const [isCastModalOpen, setIsCastModalOpen] = useState(false);
  // Livro sem texto neste aparelho que o usuário pediu para reimportar (o arquivo escolhido entra nele)
  const reimportTargetRef = useRef<string | null>(null);

  // Janelas abertas por cima da tela, na ordem em que abriram (o "voltar" fecha a última)
  const overlays: Record<string, [boolean, () => void]> = {
    voicePicker: [isVoicePickerOpen, () => setIsVoicePickerOpen(false)],
    settings: [isSettingsOpen, () => setIsSettingsOpen(false)],
    upload: [isUploadOpen, () => setIsUploadOpen(false)],
    chapters: [isChaptersOpen, () => setIsChaptersOpen(false)],
    cast: [isCastModalOpen, () => setIsCastModalOpen(false)],
  };
  const overlaysRef = useRef(overlays);
  overlaysRef.current = overlays;
  const overlayOrderRef = useRef<string[]>([]);
  useEffect(() => {
    const order = overlayOrderRef.current.filter((id) => overlays[id]?.[0]);
    for (const [id, [open]] of Object.entries(overlays)) {
      if (open && !order.includes(id)) order.push(id);
    }
    overlayOrderRef.current = order;
  }, [isVoicePickerOpen, isSettingsOpen, isUploadOpen, isChaptersOpen, isCastModalOpen]);

  // Botão "voltar" do Android: fecha a janela de cima; sem janela, volta para a tela anterior;
  // sem tela anterior, minimiza (fechar o app pararia a leitura que está tocando)
  useEffect(() => {
    const handleBack = () => {
      const openId = [...overlayOrderRef.current].reverse().find((id) => overlaysRef.current[id]?.[0]);
      if (openId) {
        overlaysRef.current[openId][1]();
        return;
      }
      const previous = pageHistoryRef.current.pop();
      if (previous && previous !== activePageRef.current) {
        activePageRef.current = previous;
        setActivePageRaw(previous);
      } else if (activePageRef.current !== 'painel') {
        activePageRef.current = 'painel';
        setActivePageRaw('painel');
      } else if (Capacitor.isNativePlatform()) {
        CapApp.minimizeApp();
      }
    };
    // Em desenvolvimento, o mesmo "voltar" fica disponível para testes automáticos no navegador
    if (import.meta.env.DEV) (window as any).__aedoliaBack = handleBack;
    if (!Capacitor.isNativePlatform()) return;
    const sub = CapApp.addListener('backButton', handleBack);
    return () => {
      sub.then((h) => h.remove());
    };
  }, []);

  // Vozes do livro: narração, falas e [colchetes]
  const [bookCast, setBookCast] = useState<BookCast | null>(null);

  // Carrega as vozes salvas para o livro ativo
  useEffect(() => {
    if (!currentBook?.id) {
      setBookCast(null);
      return;
    }
    const cast = loadBookCast(currentBook.id, selectedVoice.id);
    setBookCast(cast);
    // Livro com narração própria salva: o player passa a mostrar essa voz
    if (cast.narratorVoiceId !== selectedVoice.id) {
      const narrator = findVoiceById(cast.narratorVoiceId);
      if (narrator) {
        setSelectedVoice(narrator);
        speechEngine.setVoice(narrator);
      }
    }
  }, [currentBook?.id]);

  // O motor escolhe a voz de cada trecho pelo tipo dele (narração, fala ou colchetes)
  const currentKinds = currentBook?.sentenceKinds;
  useEffect(() => {
    if (bookCast) {
      speechEngine.setVoiceResolver((sentenceIndex) => resolveVoiceForSentence(sentenceIndex, bookCast, currentKinds));
    } else {
      speechEngine.setVoiceResolver(null);
    }
  }, [bookCast, currentKinds]);

  const handleUpdateCast = (updatedCast: BookCast) => {
    setBookCast(updatedCast);
    if (updatedCast.narratorVoiceId !== selectedVoice.id) {
      const narrator = findVoiceById(updatedCast.narratorVoiceId);
      if (narrator) {
        setSelectedVoice(narrator);
        setSettings((prev) => ({ ...prev, selectedVoiceId: narrator.id }));
        speechEngine.setVoice(narrator);
      }
    }
  };

  // Qual das três vozes está lendo o trecho atual (mostrado no player)
  const activeSpeakerName = useMemo(() => {
    if (!bookCast || !bookCast.theatreModeEnabled || !currentKinds) return undefined;
    const role = roleForKind(currentKinds[currentSentenceIndex]);
    const label = VOICE_ROLES.find((r) => r.role === role)?.label;
    const voiceName = resolveVoiceForSentence(currentSentenceIndex, bookCast, currentKinds).name.split(' (')[0];
    return `${label} · ${voiceName}`;
  }, [bookCast, currentKinds, currentSentenceIndex]);

  // Estatísticas de leitura real: livro atual e se a voz está tocando
  useEffect(() => {
    readingTracker.setBook(currentBook?.id ?? null);
  }, [currentBook?.id]);
  useEffect(() => {
    readingTracker.setPlaying(playbackStatus === 'playing');
  }, [playbackStatus]);
  useEffect(() => {
    if (activePage !== 'painel') return;
    readingTracker.flush();
    setWordsReadTotal(computeReadingStats(ownerId, 'day').lifetime.words);
  }, [activePage, ownerId]);

  // Refs: ouvintes registrados uma vez só precisam dos valores atuais
  const booksRef = useRef(books);
  booksRef.current = books;

  const isEnginePlaying = () => {
    const status = speechEngine.getStatus();
    return status === 'playing' || status === 'buffering';
  };

  // Pastas: gravadas no aparelho a cada mudança
  useEffect(() => {
    saveFolders(ownerId, folders);
  }, [folders, ownerId]);

  // Sync theme attribute to HTML tag
  useEffect(() => {
    document.documentElement.setAttribute('data-theme', settings.theme);
    localStorage.setItem('gtp_reader_settings', JSON.stringify(settings));
  }, [settings]);

  // Salva metadados leves (inclui o progresso de leitura) no localStorage.
  // Só depois de ler o que já estava salvo: senão a lista vazia do início apagaria o progresso anterior.
  const localBooksLoadedRef = useRef(false);

  useEffect(() => {
    if (!localBooksLoadedRef.current) return;
    saveBooksMetadataSafe(books, ownerId);
  }, [books, ownerId]);

  // Carrega a estante guardada no aparelho
  useEffect(() => {
    loadInitialBooks(ownerId)
      .then((initBooks) => {
        setBooks((prev) => {
          const ids = new Set(prev.map((p) => p.id));
          return [...prev, ...initBooks.filter((b) => !ids.has(b.id))];
        });
      })
      .finally(() => {
        localBooksLoadedRef.current = true;
      });
  }, [ownerId]);

  // Persist favorites
  useEffect(() => {
    localStorage.setItem('gtp_favorite_voices', JSON.stringify(favoriteVoiceIds));
  }, [favoriteVoiceIds]);

  // Connect speech engine callbacks
  useEffect(() => {
    speechEngine.setCallbacks({
      onSentenceChange: (idx) => {
        setCurrentSentenceIndex(idx);
        if (currentBook?.id) {
          const totalSentences = Math.max(1, (currentBook.sentences?.length || 1) - 1);
          const progress = Math.round((idx / totalSentences) * 100);
          const readAt = Date.now();
          setBooks((prev) =>
            prev.map((b) => (b.id === currentBook.id ? { ...b, lastReadSentenceIndex: idx, readingProgress: progress, progressReadAt: readAt } : b))
          );
        }
      },
      onStatusChange: (status) => setPlaybackStatus(status),
      onComplete: () => setPlaybackStatus('idle'),
      onWordsRead: (words) => readingTracker.addWords(words),
      onNotice: (message) => showNotice(message),
    });
  }, [currentBook?.id]);

  // Aviso curto no topo da tela (ex.: a voz falhou)
  const [notice, setNotice] = useState<string | null>(null);
  const noticeTimerRef = useRef<ReturnType<typeof setTimeout> | null>(null);
  const showNotice = (message: string) => {
    setNotice(message);
    if (noticeTimerRef.current) clearTimeout(noticeTimerRef.current);
    noticeTimerRef.current = setTimeout(() => setNotice(null), 6000);
  };

  // Abrir o texto do livro: falhou = o texto não está neste aparelho
  const [contentLoad, setContentLoad] = useState<{ bookId: string; progress: number; failed: boolean } | null>(null);

  // When current book changes, load sentences into speech engine
  useEffect(() => {
    if (!currentBook) {
      setCurrentSentenceIndex(0);
      speechEngine.setSentences([], 0);
      return;
    }

    const startEngine = (book: Book) => {
      const shelf = booksRef.current.find((b) => b.id === book.id);
      const position = shelf ? newestProgress(book, shelf) : book;
      const startIndex = Math.min(position.lastReadSentenceIndex || 0, Math.max(0, book.sentences.length - 1));
      setCurrentSentenceIndex(startIndex);
      speechEngine.setBook(book.id);
      speechEngine.setSentences(book.sentences, startIndex, book.paragraphStarts);
      speechEngine.setVoice(selectedVoice);
      speechEngine.setRate(settings.speechRate);
    };

    // Livro recém-importado ou já completo em memória
    if (hasStructuredContent(currentBook)) {
      setContentLoad(null);
      startEngine(currentBook);
      return;
    }
    if (currentBook.isUploading) {
      return;
    }

    let isCurrent = true;
    const bookId = currentBook.id;
    setContentLoad({ bookId, progress: 0, failed: false });
    loadFullBook(currentBook)
      .then((fullBook) => {
        if (!isCurrent) return;
        if (!fullBook) {
          setContentLoad({ bookId, progress: 0, failed: true });
          return;
        }
        setContentLoad(null);
        // A cópia completa pode ter a pasta antiga: vale a da estante
        setBooks((prev) =>
          prev.map((b) => (b.id === fullBook.id ? { ...fullBook, folderId: b.folderId, ...newestProgress(fullBook, b) } : b))
        );
        startEngine(fullBook);
      })
      .catch((err) => {
        console.warn('Falha ao abrir o livro:', err);
        if (isCurrent) setContentLoad({ bookId, progress: 0, failed: true });
      });

    return () => {
      isCurrent = false;
    };
  }, [currentBook?.id, Boolean(currentBook?.sentences?.length)]);

  // ------------------------------------------------------------------ player do Android
  // Notificação / tela de bloqueio com "Livro – Capítulo" e a barra do capítulo.
  // Também mantém a leitura com a tela apagada (serviço em primeiro plano).
  const nativeSentences = isNativeApp ? currentBook?.sentences : undefined;
  const wordsPrefix = useMemo(() => buildWordsPrefix(nativeSentences), [nativeSentences]);

  const chapterSpan = useMemo(() => {
    const chapters = currentBook?.chapters || [];
    const total = currentBook?.sentences?.length || 0;
    let i = chapters.length - 1;
    while (i > 0 && chapters[i].startIndex > currentSentenceIndex) i--;
    const chapter = chapters[i];
    if (!chapter) return { title: '', start: 0, end: total };
    const nextStart = chapters[i + 1]?.startIndex;
    return { title: chapter.title, start: chapter.startIndex, end: nextStart && nextStart > chapter.startIndex ? nextStart : total };
  }, [currentBook?.chapters, currentBook?.sentences, currentSentenceIndex]);

  useEffect(() => {
    if (!isNativeApp) return;
    if (!currentBook || playbackStatus === 'idle' || wordsPrefix.length < 2) {
      stopNowPlaying();
      return;
    }
    const wps = wordsPerSecond(settings.speechRate);
    const last = wordsPrefix.length - 1;
    const startWords = wordsPrefix[Math.min(chapterSpan.start, last)];
    const endWords = wordsPrefix[Math.min(chapterSpan.end, last)];
    const nowWords = wordsPrefix[Math.min(currentSentenceIndex, last)];
    updateNowPlaying({
      title: currentBook.title,
      chapter: chapterSpan.title,
      coverUrl: currentBook.coverImage,
      playing: playbackStatus === 'playing' || playbackStatus === 'buffering',
      positionMs: Math.round(((nowWords - startWords) / wps) * 1000),
      durationMs: Math.round(((endWords - startWords) / wps) * 1000),
    });
  }, [playbackStatus, currentSentenceIndex, chapterSpan, wordsPrefix, settings.speechRate, currentBook?.title, currentBook?.coverImage]);

  // Botões do player (notificação, tela de bloqueio, fones). Refs: o ouvinte é registrado uma vez só.
  const playerCommandRef = useRef<(command: string, positionMs: number) => void>(() => {});
  playerCommandRef.current = (command, positionMs) => {
    // O estado do motor, não o da tela: com o app em segundo plano a tela pode estar atrasada
    const isPlaying = isEnginePlaying();
    if (command === 'toggle') speechEngine.togglePlayPause();
    else if (command === 'play' && !isPlaying) speechEngine.togglePlayPause();
    else if (command === 'pause' && isPlaying) speechEngine.togglePlayPause();
    else if (command === 'back') handleSkipBack();
    else if (command === 'forward') handleSkipForward();
    else if (command === 'seek' && wordsPrefix.length > 1) {
      // Arrastou a barra do capítulo: vai para o trecho correspondente
      const target = wordsPrefix[chapterSpan.start] + (positionMs / 1000) * wordsPerSecond(settings.speechRate);
      const index = Math.min(Math.max(chapterSpan.start, sentenceAtWords(wordsPrefix, target)), chapterSpan.end - 1);
      handleSeek(index);
    }
  };
  useEffect(() => onPlayerCommand((command, positionMs) => playerCommandRef.current(command, positionMs)), []);

  // Navegador (teste no PC): teclas de mídia e fones controlam a leitura pelo Media Session.
  // No app Android quem faz isso é o PlaybackService.
  useEffect(() => {
    if (isNativeApp || !('mediaSession' in navigator)) return;
    const handlers: [MediaSessionAction, () => void][] = [
      ['play', () => playerCommandRef.current('play', 0)],
      ['pause', () => playerCommandRef.current('pause', 0)],
      ['stop', () => playerCommandRef.current('pause', 0)],
      ['seekbackward', () => playerCommandRef.current('back', 0)],
      ['seekforward', () => playerCommandRef.current('forward', 0)],
      ['previoustrack', () => playerCommandRef.current('back', 0)],
      ['nexttrack', () => playerCommandRef.current('forward', 0)],
    ];
    for (const [action, handler] of handlers) {
      try {
        navigator.mediaSession.setActionHandler(action, handler);
      } catch {
        // ação não suportada neste navegador
      }
    }
    return () => {
      for (const [action] of handlers) {
        try {
          navigator.mediaSession.setActionHandler(action, null);
        } catch {}
      }
    };
  }, []);
  useEffect(() => {
    if (isNativeApp || !('mediaSession' in navigator)) return;
    const playing = playbackStatus === 'playing' || playbackStatus === 'buffering';
    navigator.mediaSession.playbackState = playbackStatus === 'idle' ? 'none' : playing ? 'playing' : 'paused';
    if (currentBook && typeof MediaMetadata !== 'undefined') {
      navigator.mediaSession.metadata = new MediaMetadata({
        title: chapterSpan.title || currentBook.title,
        artist: currentBook.title,
        album: 'Aedolia',
        artwork: currentBook.coverImage ? [{ src: currentBook.coverImage }] : [],
      });
    }
  }, [playbackStatus, currentBook?.id, currentBook?.title, currentBook?.coverImage, chapterSpan.title]);

  // Audio Handlers
  const scrollToSentence = (index: number, block: ScrollLogicalPosition = 'center') => {
    setTimeout(() => {
      document.getElementById(`sentence-anchor-${index}`)?.scrollIntoView({ behavior: 'smooth', block });
    }, 40);
  };

  const handleTogglePlay = () => {
    if (!currentBook) return;
    speechEngine.togglePlayPause();
  };

  const handlePrevSentence = () => {
    if (currentSentenceIndex > 0) {
      const newIdx = currentSentenceIndex - 1;
      setCurrentSentenceIndex(newIdx);
      speechEngine.prevSentence();
      scrollToSentence(newIdx);
    }
  };

  const handleNextSentence = () => {
    if (!currentBook || !currentBook.sentences) return;
    if (currentSentenceIndex < currentBook.sentences.length - 1) {
      const newIdx = currentSentenceIndex + 1;
      setCurrentSentenceIndex(newIdx);
      speechEngine.nextSentence();
      scrollToSentence(newIdx);
    }
  };

  /** Anda aproximadamente 15 segundos de leitura (direction -1 volta, +1 avança) */
  const skipSeconds = (direction: -1 | 1) => {
    if (!currentBook || !currentBook.sentences) return;
    const targetWords = Math.max(18, Math.round(((145 * settings.speechRate) / 60) * 15));
    const maxIdx = currentBook.sentences.length - 1;
    let accumulated = 0;
    let targetIdx = currentSentenceIndex;
    while ((direction < 0 ? targetIdx > 0 : targetIdx < maxIdx) && accumulated < targetWords) {
      targetIdx += direction;
      accumulated += (currentBook.sentences[targetIdx] || '').split(/\s+/).filter(Boolean).length;
    }
    const newIdx = Math.max(0, Math.min(maxIdx, targetIdx));
    setCurrentSentenceIndex(newIdx);
    speechEngine.jumpToSentence(newIdx);
    scrollToSentence(newIdx);
  };
  const handleSkipBack = () => skipSeconds(-1);
  const handleSkipForward = () => skipSeconds(1);

  const handleSeek = (index: number) => {
    setCurrentSentenceIndex(index);
    speechEngine.jumpToSentence(index);
    scrollToSentence(index);
  };

  const handleChangeSpeed = (speed: number) => {
    setSettings((prev) => ({ ...prev, speechRate: speed }));
    speechEngine.setRate(speed);
  };

  // A voz escolhida no player é a voz do narrador (também no modo teatro) e fica salva para este livro
  const handleSelectVoice = (voice: VoiceOption) => {
    setSelectedVoice(voice);
    setSettings((prev) => ({ ...prev, selectedVoiceId: voice.id }));
    speechEngine.setVoice(voice);
    if (bookCast) {
      const updatedCast = withNarratorVoice(bookCast, voice.id);
      saveBookCast(updatedCast);
      setBookCast(updatedCast);
    }
  };

  // Clicar numa frase sempre começa a leitura dali
  const handleSentenceClick = (index: number) => {
    setCurrentSentenceIndex(index);
    speechEngine.play(index);
    scrollToSentence(index);
  };

  const handleWordClick = (sentenceIndex: number, wordIndex: number, _word: string) => {
    setCurrentSentenceIndex(sentenceIndex);
    // Começa a ler a partir da palavra clicada, esteja tocando ou pausado
    speechEngine.jumpToSentenceFromWord(sentenceIndex, wordIndex);
    setTimeout(() => {
      const wordEl = document.getElementById(`word-anchor-${sentenceIndex}-${wordIndex}`);
      if (wordEl) wordEl.scrollIntoView({ behavior: 'smooth', block: 'center' });
      else document.getElementById(`sentence-anchor-${sentenceIndex}`)?.scrollIntoView({ behavior: 'smooth', block: 'center' });
    }, 40);
  };

  const handlePlayChapter = (startIndex: number) => {
    setCurrentSentenceIndex(startIndex);
    speechEngine.play(startIndex);
    setTimeout(() => {
      const chapterEl = document.getElementById(`chapter-anchor-${startIndex}`) || document.getElementById(`sentence-anchor-${startIndex}`);
      chapterEl?.scrollIntoView({ behavior: 'smooth', block: 'start' });
    }, 40);
  };

  // O conteúdo completo é carregado pelo efeito que observa currentBook
  const handleOpenBookInReader = (book: Book) => {
    setCurrentBookId(book.id);
    setActivePage('leitor');
  };

  const handleDeleteBook = async (bookId: string) => {
    if (speechEngine.getBookId() === bookId) speechEngine.stopAll();
    setBooks((prev) => {
      const remaining = prev.filter((b) => b.id !== bookId);
      if (currentBookId === bookId) setCurrentBookId(remaining[0]?.id || '');
      return remaining;
    });
    await deleteBookFull(bookId);
    try {
      localStorage.removeItem(`gtp_book_cast_${bookId}`);
    } catch {}
  };

  // ---- Pastas. As funções devolvem a mensagem de erro para a tela mostrar, ou null se deu certo.
  // Esta devolve a pasta criada, para a janela "Mover para pasta" já colocar o livro nela
  const sortFolders = (list: BookFolder[]) => [...list].sort((a, b) => a.name.localeCompare(b.name, 'pt-BR'));

  const handleCreateFolder = async (name: string, openIt = true): Promise<FolderResult<BookFolder>> => {
    const valid = validateFolderName(name, folders);
    if (!valid.ok) return valid;
    const folder = { id: newFolderId(), name: valid.data };
    setFolders((prev) => sortFolders([...prev, folder]));
    if (openIt) setActiveFolderId(folder.id);
    return { ok: true, data: folder };
  };

  const handleRenameFolder = async (folderId: string, name: string): Promise<string | null> => {
    const valid = validateFolderName(name, folders, folderId);
    if (!valid.ok) return valid.error;
    setFolders((prev) => sortFolders(prev.map((f) => (f.id === folderId ? { ...f, name: valid.data } : f))));
    return null;
  };

  const handleDeleteFolder = async (folderId: string): Promise<string | null> => {
    setFolders((prev) => prev.filter((f) => f.id !== folderId));
    setBooks((prev) => prev.map((b) => (b.folderId === folderId ? { ...b, folderId: null } : b)));
    setActiveFolderId('all');
    return null;
  };

  const handleMoveBookToFolder = async (bookId: string, folderId: string | null): Promise<string | null> => {
    setBooks((prev) => prev.map((b) => (b.id === bookId ? { ...b, folderId } : b)));
    return null;
  };

  // Livro importado com uma pasta aberta entra nela
  const uploadFolderId = activeFolderId !== 'all' && activeFolderId !== 'none' ? activeFolderId : null;

  const handleBookCreated = (created: Book) => {
    const newBook = created.isUploading ? { ...created, folderId: created.folderId ?? uploadFolderId } : created;
    setBooks((prev) => [newBook, ...prev.filter((b) => b.id !== newBook.id)]);
    setCurrentBookId(newBook.id);
    // Se o livro ainda estiver sendo preparado, permanece no painel para ver o progresso
    if (!newBook.isUploading) {
      setActivePage('leitor');
    }
  };

  /**
   * Prepara o livro no aparelho (texto, frases, capítulos, capa) e guarda no IndexedDB.
   * Se for um livro que já está na estante sem o texto (mesmo id do .json, mesmo título, ou o escolhido em
   * "Importar o arquivo"), o texto entra nele: ponto de leitura, pasta e vozes continuam.
   */
  const handleStartBackgroundUpload = async (file: File, optimisticBook: Book) => {
    const reimportTarget = reimportTargetRef.current;
    reimportTargetRef.current = null;
    let lastShown = 0;
    try {
      const imported = await importBookFile(file, (fraction) => {
        const pct = Math.round(fraction * 100);
        if (pct - lastShown < 3 && pct < 100) return;
        lastShown = pct;
        setBooks((prev) => prev.map((b) => (b.id === optimisticBook.id ? { ...b, uploadProgress: pct } : b)));
      });

      const title = imported.title || optimisticBook.title;
      const shelf = booksRef.current.filter((b) => b.id !== optimisticBook.id);
      const existing =
        shelf.find((b) => b.id === reimportTarget) ||
        shelf.find((b) => imported.sourceId && b.id === imported.sourceId) ||
        shelf.find((b) => !b.sentences?.length && titleKey(b.title) === titleKey(title));

      const base: Book = existing ?? {
        ...optimisticBook,
        id: imported.sourceId || `book-${Date.now()}`,
        title,
        author: imported.author || optimisticBook.author,
        uploadedAt: new Date().toLocaleDateString('pt-BR'),
        readingProgress: 0,
        lastReadSentenceIndex: 0,
        progressReadAt: 0,
      };
      const readyBook: Book = {
        ...base,
        type: imported.docType,
        coverImage: imported.coverImage || base.coverImage || optimisticBook.coverImage,
        content: imported.content,
        sentences: imported.sentences,
        paragraphStarts: imported.structure.paragraphStarts,
        sentenceKinds: imported.structure.kinds,
        structureVersion: imported.structure.version || STRUCTURE_VERSION,
        chapters: imported.chapters,
        totalWords: imported.totalWords,
        durationMinutes: imported.durationMinutes,
        lastReadSentenceIndex: Math.min(base.lastReadSentenceIndex || 0, imported.sentences.length - 1),
        userId: ownerId,
        folderId: base.folderId ?? optimisticBook.folderId ?? null,
        isUploading: false,
        uploadProgress: undefined,
      };

      setBooks((prev) => [readyBook, ...prev.filter((b) => b.id !== optimisticBook.id && b.id !== readyBook.id)]);
      setCurrentBookId((prevId) => (prevId === optimisticBook.id || prevId === readyBook.id ? readyBook.id : prevId));
      if (existing) showNotice(`"${readyBook.title}" voltou para este aparelho. O ponto de leitura foi mantido.`);
      await saveBookFull(readyBook);
    } catch (err: any) {
      console.error('Falha ao preparar o livro:', err);
      setBooks((prev) => prev.filter((b) => b.id !== optimisticBook.id));
      alert(`Não foi possível preparar "${optimisticBook.title}".\n\n${err?.message || 'O arquivo não pôde ser lido.'}`);
    }
  };

  const handleToggleFavoriteVoice = (voiceId: string) => {
    setFavoriteVoiceIds((prev) => (prev.includes(voiceId) ? prev.filter((id) => id !== voiceId) : [...prev, voiceId]));
  };

  const handlePreviewVoice = (voice: VoiceOption) => {
    speechEngine.previewVoice(voice);
  };

  return (
    <div style={{
      display: 'flex',
      flexDirection: 'column',
      height: '100vh',
      width: '100vw',
      overflow: 'hidden',
      background: 'var(--bg-base)',
      color: 'var(--text-primary)',
      position: 'relative',
    }}>
      {/* Top Application Header */}
      <AppHeader
        activePage={activePage}
        onNavigate={(page) => setActivePage(page)}
        onOpenUpload={() => setIsUploadOpen(true)}
      />

      {/* Pages Viewport */}
      <div style={{ flex: 1, minHeight: 0, display: 'flex', flexDirection: 'column', overflow: 'hidden', position: 'relative' }}>
        {activePage === 'painel' && (
          <Painel
            books={books}
            currentBook={currentBook!}
            favoriteVoiceIds={favoriteVoiceIds}
            allVoices={VOICES}
            onOpenBookInReader={handleOpenBookInReader}
            onOpenUpload={() => setIsUploadOpen(true)}
            onNavigateToVoices={() => setActivePage('vozes')}
            onToggleFavoriteVoice={handleToggleFavoriteVoice}
            onPreviewVoice={handlePreviewVoice}
            onDeleteBook={handleDeleteBook}
            folders={folders}
            activeFolderId={activeFolderId}
            onSelectFolder={setActiveFolderId}
            onCreateFolder={handleCreateFolder}
            onRenameFolder={handleRenameFolder}
            onDeleteFolder={handleDeleteFolder}
            onMoveBookToFolder={handleMoveBookToFolder}
            userName={ownerName}
            wordsReadTotal={wordsReadTotal}
          />
        )}

        {activePage === 'leitor' && (
          <Leitor
            book={currentBook}
            currentSentenceIndex={currentSentenceIndex}
            settings={settings}
            isTheatreMode={bookCast?.theatreModeEnabled ?? false}
            onOpenCastModal={() => setIsCastModalOpen(true)}
            onSentenceClick={handleSentenceClick}
            onPlayChapter={handlePlayChapter}
            onWordClick={handleWordClick}
            onOpenChapters={() => setIsChaptersOpen(true)}
            onBackToPainel={() => setActivePage('painel')}
            onOpenUpload={() => setIsUploadOpen(true)}
            contentLoad={contentLoad && contentLoad.bookId === currentBook?.id ? contentLoad : null}
            onRetryContent={() => {
              // Livro sem o texto neste aparelho: o próximo arquivo importado entra nele
              reimportTargetRef.current = currentBook?.id ?? null;
              setIsUploadOpen(true);
            }}
          />
        )}

        {activePage === 'vozes' && (
          <Vozes
            voices={VOICES}
            selectedVoice={selectedVoice}
            favoriteVoiceIds={favoriteVoiceIds}
            onSelectVoice={handleSelectVoice}
            onToggleFavoriteVoice={handleToggleFavoriteVoice}
            onPreviewVoice={handlePreviewVoice}
          />
        )}

        {activePage === 'configuracoes' && (
          <Configuracoes
            settings={settings}
            onUpdateSettings={(newSettings) => setSettings((prev) => ({ ...prev, ...newSettings }))}
            ownerName={ownerName}
          />
        )}
      </div>

      {/* Celular: menu embaixo, só fora do livro (no computador a navegação fica no cabeçalho) */}
      {isMobile && activePage !== 'leitor' && (
        <MobileBottomNav
          activePage={activePage}
          onNavigate={(page) => setActivePage(page)}
          onOpenUpload={() => setIsUploadOpen(true)}
        />
      )}

      {/* Player: só dentro do livro (a leitura continua tocando nas outras telas) */}
      {activePage === 'leitor' && currentBook && currentBook.sentences && currentBook.sentences.length > 0 && (
        <AudioPlayer
          currentBook={currentBook}
          currentSentenceIndex={currentSentenceIndex}
          playbackStatus={playbackStatus}
          selectedVoice={selectedVoice}
          speed={settings.speechRate}
          isTheatreMode={bookCast?.theatreModeEnabled ?? false}
          activeSpeakerName={activeSpeakerName}
          onOpenCastModal={() => setIsCastModalOpen(true)}
          onTogglePlay={handleTogglePlay}
          onPrevSentence={handlePrevSentence}
          onNextSentence={handleNextSentence}
          onSkipBack={handleSkipBack}
          onSkipForward={handleSkipForward}
          onSeek={handleSeek}
          onChangeSpeed={handleChangeSpeed}
          onOpenVoicePicker={() => setIsVoicePickerOpen(true)}
        />
      )}

      {notice && (
        <div
          role="status"
          onClick={() => setNotice(null)}
          style={{
            position: 'fixed',
            top: 'calc(12px + env(safe-area-inset-top, 0px))',
            left: '50%',
            transform: 'translateX(-50%)',
            zIndex: 200,
            width: 'min(92vw, 460px)',
            padding: '12px 16px',
            borderRadius: '14px',
            background: 'rgba(15, 23, 42, 0.97)',
            border: '1px solid rgba(251, 191, 36, 0.45)',
            color: '#fde68a',
            fontSize: '13px',
            lineHeight: 1.45,
            boxShadow: '0 12px 30px rgba(0,0,0,0.5)',
          }}
        >
          {notice}
        </div>
      )}

      {/* Modals & Drawers */}
      <VoicePickerModal
        isOpen={isVoicePickerOpen}
        onClose={() => setIsVoicePickerOpen(false)}
        selectedVoice={selectedVoice}
        onSelectVoice={handleSelectVoice}
      />

      <SettingsModal
        isOpen={isSettingsOpen}
        onClose={() => setIsSettingsOpen(false)}
        settings={settings}
        onUpdateSettings={(newSettings) => setSettings((prev) => ({ ...prev, ...newSettings }))}
      />

      <UploadModal
        isOpen={isUploadOpen}
        onClose={() => {
          setIsUploadOpen(false);
        }}
        onBookCreated={handleBookCreated}
        onStartUpload={handleStartBackgroundUpload}
      />

      {currentBook && (
        <ChapterDrawer
          isOpen={isChaptersOpen}
          onClose={() => setIsChaptersOpen(false)}
          book={currentBook}
          currentSentenceIndex={currentSentenceIndex}
          onJumpToSentence={handleSeek}
        />
      )}

      {bookCast && (
        <BookCastModal
          isOpen={isCastModalOpen}
          onClose={() => setIsCastModalOpen(false)}
          bookCast={bookCast}
          onUpdateCast={handleUpdateCast}
          bookTitle={currentBook?.title || 'Livro'}
        />
      )}
    </div>
  );
};

export default App;
