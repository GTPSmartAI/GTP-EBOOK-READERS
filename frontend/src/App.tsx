import React, { useState, useEffect, useMemo, useRef } from 'react';
import { Capacitor } from '@capacitor/core';
import { App as CapApp } from '@capacitor/app';
import { VOICES, DEFAULT_VOICE_ID, findVoiceById, isFreeVoice } from './data/voices';
import type { Book, ReaderSettings, VoiceOption, AppPage } from './types';
import { speechEngine } from './services/speechEngine';
import type { PlaybackStatus } from './services/speechEngine';
import { fetchCloudBooks, deleteBookReal, uploadBookReal, fetchBookFullContent, syncReadingProgressToCloud, fetchReadingStats } from './services/api';
import { getSessionUser, onSessionChange, refreshSession, logout } from './services/session';
import type { SessionUser } from './services/session';
import { readingTracker } from './services/readingTracker';
import { Login } from './pages/Login';
import { 
  saveBookFull, 
  getBookFull, 
  saveBooksMetadataSafe, 
  loadInitialBooks 
} from './services/bookStorage';

// Pages
import { Painel } from './pages/Painel';
import { Leitor } from './pages/Leitor';
import { Vozes } from './pages/Vozes';
import { Configuracoes } from './pages/Configuracoes';

// Layout & Components
import { AppHeader } from './components/layout/AppHeader';
import { MobileBottomNav } from './components/layout/MobileBottomNav';
import { useIsMobile } from './hooks/useIsMobile';
import { initOffline, purgeExpired } from './services/offlineAudio';
import { AudioPlayer } from './components/AudioPlayer';
import { VoicePickerModal } from './components/VoicePickerModal';
import { SettingsModal } from './components/SettingsModal';
import { UploadModal } from './components/UploadModal';
import { AIChatDrawer } from './components/AIChatDrawer';
import { ChapterDrawer } from './components/ChapterDrawer';
import { SubscriptionModal } from './components/SubscriptionModal';
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

/**
 * Combina o livro vindo do servidor (metadados atualizados) com o que já existe neste navegador:
 * conteúdo já carregado e progresso de leitura não podem ser perdidos por uma listagem que não os traz.
 */
function mergeLocalBookState(base: Book, local: Book): Book {
  const hasLocalContent = Boolean(local.sentences?.length);
  const localProg = local.readingProgress || 0;
  const baseProg = base.readingProgress || 0;
  const bestProg = Math.max(localProg, baseProg);
  const bestSentenceIndex = localProg >= baseProg
    ? (local.lastReadSentenceIndex ?? base.lastReadSentenceIndex ?? 0)
    : (base.lastReadSentenceIndex ?? 0);

  return {
    ...base,
    coverImage: base.coverImage || local.coverImage,
    // Texto, trechos, estrutura e capítulos andam juntos (os índices dos capítulos apontam para os trechos)
    content: hasLocalContent ? local.content : base.content,
    sentences: hasLocalContent ? local.sentences : base.sentences,
    paragraphStarts: hasLocalContent ? local.paragraphStarts : base.paragraphStarts,
    sentenceKinds: hasLocalContent ? local.sentenceKinds : base.sentenceKinds,
    structureVersion: hasLocalContent ? local.structureVersion : base.structureVersion,
    chapters: hasLocalContent ? local.chapters : base.chapters,
    lastReadSentenceIndex: bestSentenceIndex,
    readingProgress: bestProg,
  };
}

// Versão mínima da estrutura gerada pelo backend (text_pipeline.STRUCTURE_VERSION)
const REQUIRED_STRUCTURE_VERSION = 4;

// Livro pronto para leitura: tem as unidades faladas e a estrutura atual (parágrafos, falas, colchetes)
const hasStructuredContent = (book: Book) =>
  Boolean(
    book.sentences?.length &&
      book.paragraphStarts?.length &&
      (book.structureVersion || 0) >= REQUIRED_STRUCTURE_VERSION
  );

/**
 * Carrega o conteúdo completo do livro: IndexedDB primeiro, backend quando o cache local
 * não existe ou está no formato antigo (sem parágrafos/falas).
 */
async function loadFullBook(book: Book, onProgress?: (fraction: number) => void): Promise<Book | null> {
  const local = await getBookFull(book.id);
  if (local && hasStructuredContent(local)) return local;

  const lastIndex = book.lastReadSentenceIndex || local?.lastReadSentenceIndex || 0;
  const readingProgress = book.readingProgress || local?.readingProgress || 0;

  const cloud = await fetchBookFullContent(book.id, onProgress);
  if (cloud && cloud.sentences.length > 0) {
    // Do servidor vem o conteúdo; título, autor e capa ficam os da estante (o cache do servidor pode não trazê-los)
    const merged: Book = {
      ...book,
      content: cloud.content,
      sentences: cloud.sentences,
      paragraphStarts: cloud.paragraphStarts,
      sentenceKinds: cloud.sentenceKinds,
      structureVersion: cloud.structureVersion,
      chapters: cloud.chapters,
      totalWords: cloud.totalWords || book.totalWords,
      durationMinutes: cloud.durationMinutes || book.durationMinutes,
      coverImage: book.coverImage || cloud.coverImage,
      lastReadSentenceIndex: Math.min(lastIndex, cloud.sentences.length - 1),
      readingProgress,
    };
    // Gravar um livro de dezenas de MB no IndexedDB demora no celular: a leitura não espera por isso
    saveBookFull(merged).catch((err) => console.warn('Falha ao salvar o livro neste aparelho:', err));
    return merged;
  }

  // Backend indisponível: usa a cópia antiga, com o progresso mais recente
  return local && local.sentences?.length ? { ...local, lastReadSentenceIndex: lastIndex, readingProgress } : null;
}

/**
 * Porta de entrada: sem sessão mostra o login; com sessão, o app do usuário.
 * O app é recriado (key) ao trocar de conta, para não sobrar nada do usuário anterior na tela.
 */
export const App: React.FC = () => {
  const [user, setUser] = useState<SessionUser | null>(getSessionUser);

  useEffect(() => onSessionChange(setUser), []);
  // Confere no servidor se a sessão guardada ainda vale (senha trocada, sessão expirada)
  useEffect(() => {
    refreshSession();
  }, []);
  useEffect(() => {
    readingTracker.setUser(user?.id ?? null);
    if (!user) speechEngine.stop();
  }, [user?.id]);

  if (!user) return <Login />;
  return <ReaderApp key={user.id} user={user} />;
};

const ReaderApp: React.FC<{ user: SessionUser }> = ({ user }) => {
  const userProfile = user;
  const handleLogout = async () => {
    speechEngine.stop();
    await readingTracker.flush();
    await logout();
  };

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

  // Books list state (carregado exclusivamente do MariaDB/MinIO e IndexedDB)
  const [books, setBooks] = useState<Book[]>([]);

  const [currentBookId, setCurrentBookId] = useState<string>('');

  // Current active book (seguro e sem mock)
  const currentBook = useMemo(() => {
    if (books.length === 0) return null;
    return books.find((b) => b.id === currentBookId) || books[0] || null;
  }, [books, currentBookId]);

  // Audio Playback state
  const [currentSentenceIndex, setCurrentSentenceIndex] = useState<number>(0);
  const [playbackStatus, setPlaybackStatus] = useState<PlaybackStatus>('idle');

  // Voice state & Favorites
  const [favoriteVoiceIds, setFavoriteVoiceIds] = useState<string[]>(() => {
    const saved = localStorage.getItem('gtp_favorite_voices');
    if (saved) {
      try {
        return JSON.parse(saved);
      } catch (e) {
        console.error(e);
      }
    }
    return [DEFAULT_VOICE_ID, 'cadu'];
  });

  // Voz do narrador: restaura a última escolhida (inclusive vozes clonadas)
  const [selectedVoice, setSelectedVoice] = useState<VoiceOption>(() => {
    let savedVoiceId: string | undefined;
    try {
      savedVoiceId = JSON.parse(localStorage.getItem('gtp_reader_settings') || '{}').selectedVoiceId;
    } catch {}
    return findVoiceById(savedVoiceId) || findVoiceById(DEFAULT_VOICE_ID) || VOICES[0];
  });

  // Plano grátis usa só as vozes grátis: uma voz PRO salva de antes volta para a padrão
  const isProUser = user.subscription_tier === 'pro' || user.subscription_tier === 'unlimited';
  useEffect(() => {
    if (!isProUser && !isFreeVoice(selectedVoice)) {
      const fallback = findVoiceById(DEFAULT_VOICE_ID) || VOICES[0];
      setSelectedVoice(fallback);
      speechEngine.setVoice(fallback);
    }
  }, [isProUser, selectedVoice]);

  // Settings state
  const [settings, setSettings] = useState<ReaderSettings>(() => {
    const saved = localStorage.getItem('gtp_reader_settings');
    if (saved) {
      try {
        return { ...DEFAULT_SETTINGS, ...JSON.parse(saved) };
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
  const [isAIChatOpen, setIsAIChatOpen] = useState(false);
  const [isChaptersOpen, setIsChaptersOpen] = useState(false);
  const [isSubscriptionOpen, setIsSubscriptionOpen] = useState(false);
  const [isCastModalOpen, setIsCastModalOpen] = useState(false);

  // Janelas abertas por cima da tela, na ordem em que abriram (o "voltar" fecha a última)
  const overlays: Record<string, [boolean, () => void]> = {
    voicePicker: [isVoicePickerOpen, () => setIsVoicePickerOpen(false)],
    settings: [isSettingsOpen, () => setIsSettingsOpen(false)],
    upload: [isUploadOpen, () => setIsUploadOpen(false)],
    aiChat: [isAIChatOpen, () => setIsAIChatOpen(false)],
    chapters: [isChaptersOpen, () => setIsChaptersOpen(false)],
    subscription: [isSubscriptionOpen, () => setIsSubscriptionOpen(false)],
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
  }, [isVoicePickerOpen, isSettingsOpen, isUploadOpen, isAIChatOpen, isChaptersOpen, isSubscriptionOpen, isCastModalOpen]);

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
      speechEngine.setVoiceResolver((sentenceIndex) => resolveVoiceForSentence(sentenceIndex, bookCast, currentKinds, !isProUser));
    } else {
      speechEngine.setVoiceResolver(null);
    }
  }, [bookCast, currentKinds, isProUser]);

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
    const voiceName = resolveVoiceForSentence(currentSentenceIndex, bookCast, currentKinds, !isProUser).name.split(' (')[0];
    return `${label} · ${voiceName}`;
  }, [bookCast, currentKinds, currentSentenceIndex, isProUser]);

  // Estatísticas de leitura real: livro atual e se a voz está tocando
  useEffect(() => {
    readingTracker.setBook(currentBook?.id ?? null);
  }, [currentBook?.id]);
  useEffect(() => {
    readingTracker.setPlaying(playbackStatus === 'playing');
  }, [playbackStatus]);
  useEffect(() => {
    if (activePage !== 'painel') return;
    fetchReadingStats('day').then((stats) => {
      if (stats) setWordsReadTotal(stats.lifetime.words);
    });
  }, [activePage]);

  // Busca os livros do usuário no servidor (todo livro é privado)
  useEffect(() => {
    let isMounted = true;
    async function loadUserBooks() {
      try {
        const cloudBooks = await fetchCloudBooks();
        if (!isMounted) return;
        if (cloudBooks === null) {
          // Servidor/banco fora do ar: mantém a estante local em vez de apagar tudo
          console.warn('Não foi possível atualizar a estante pelo servidor; usando os livros salvos neste navegador.');
          return;
        }
        setBooks((prev) => {
          const localById = new Map(prev.map((b) => [b.id, b]));
          const merged = cloudBooks.map((cloud) => {
            const local = localById.get(cloud.id);
            return local ? mergeLocalBookState(cloud, local) : cloud;
          });
          // Uploads em andamento ainda não existem no servidor
          const uploading = prev.filter((b) => b.isUploading && !cloudBooks.some((c) => c.id === b.id));
          return [...uploading, ...merged];
        });
        if (cloudBooks.length > 0) {
          if (!currentBookId || !cloudBooks.some((b) => b.id === currentBookId)) {
            setCurrentBookId(cloudBooks[0].id);
          }
        }
      } catch (err) {
        console.warn('Erro ao carregar livros da nuvem:', err);
      }
    }

    loadUserBooks();
    return () => {
      isMounted = false;
    };
  }, [user?.id]);

  // Sync theme attribute to HTML tag
  useEffect(() => {
    document.documentElement.setAttribute('data-theme', settings.theme);
    localStorage.setItem('gtp_reader_settings', JSON.stringify(settings));
  }, [settings]);

  // Salva metadados leves (inclui o progresso de leitura) no localStorage.
  // Só depois de ler o que já estava salvo: senão a lista vazia do início apagaria o progresso anterior.
  const localBooksLoadedRef = useRef(false);
  const cloudSyncTimeoutRef = useRef<Record<string, any>>({});

  useEffect(() => {
    if (!localBooksLoadedRef.current) return;
    saveBooksMetadataSafe(books, user?.id);
  }, [books, user?.id]);

  // Se houver progresso salvo localmente (ex: 97%), sincroniza com a nuvem no MariaDB para refletir em outros navegadores
  useEffect(() => {
    if (!user?.id || books.length === 0) return;
    books.forEach((b) => {
      if (b.readingProgress && b.readingProgress > 0) {
        syncReadingProgressToCloud(b.id, b.lastReadSentenceIndex || 0, b.readingProgress);
      }
    });
  }, [user?.id, books.length > 0]);

  // Carrega livros persistidos locais filtrando pelo usuário
  useEffect(() => {
    loadInitialBooks(user?.id).finally(() => {
      localBooksLoadedRef.current = true;
    }).then((initBooks) => {
      if (initBooks && initBooks.length > 0) {
        setBooks((prev) => {
          const localById = new Map(initBooks.map((b) => [b.id, b]));
          const ids = new Set(prev.map((p) => p.id));
          // Livros que já vieram do servidor recebem o conteúdo e o progresso salvos neste navegador
          const updated = prev.map((b) => {
            const local = localById.get(b.id);
            return local ? mergeLocalBookState(b, local) : b;
          });
          const toAdd = initBooks.filter((b) => !ids.has(b.id));
          return [...updated, ...toAdd];
        });
      }
    });
  }, [user?.id]);

  // Persist favorites
  useEffect(() => {
    localStorage.setItem('gtp_favorite_voices', JSON.stringify(favoriteVoiceIds));
  }, [favoriteVoiceIds]);

  // Connect speech engine callbacks (incluindo status de buffer de 10 parágrafos)
  useEffect(() => {
    speechEngine.setCallbacks({
      onSentenceChange: (idx) => {
        setCurrentSentenceIndex(idx);
        if (currentBook?.id) {
          const totalSentences = Math.max(1, (currentBook.sentences?.length || 1) - 1);
          const progress = Math.round((idx / totalSentences) * 100);
          setBooks((prev) =>
            prev.map((b) => {
              if (b.id === currentBook.id) {
                return { ...b, lastReadSentenceIndex: idx, readingProgress: progress };
              }
              return b;
            })
          );

          // Sincroniza com a nuvem (debounced a cada 1.5s durante a leitura)
          if (user?.id) {
            if (cloudSyncTimeoutRef.current[currentBook.id]) {
              clearTimeout(cloudSyncTimeoutRef.current[currentBook.id]);
            }
            cloudSyncTimeoutRef.current[currentBook.id] = setTimeout(() => {
              syncReadingProgressToCloud(currentBook.id, idx, progress);
              delete cloudSyncTimeoutRef.current[currentBook.id];
            }, 1500);
          }
        }
      },
      onStatusChange: (status) => setPlaybackStatus(status),
      onComplete: () => setPlaybackStatus('idle'),
      onWordsRead: (words) => readingTracker.addWords(words),
      onNotice: (message) => showNotice(message),
    });
  }, [currentBook?.id, user?.id]);

  // Aviso curto no topo da tela (ex.: sem internet num trecho não baixado)
  const [notice, setNotice] = useState<string | null>(null);
  const noticeTimerRef = useRef<ReturnType<typeof setTimeout> | null>(null);
  const showNotice = (message: string) => {
    setNotice(message);
    if (noticeTimerRef.current) clearTimeout(noticeTimerRef.current);
    noticeTimerRef.current = setTimeout(() => setNotice(null), 6000);
  };

  // Capítulos baixados: apaga os vencidos (7 dias) ao abrir e a cada hora
  useEffect(() => {
    if (!user?.id) return;
    initOffline(user.id);
    const timer = setInterval(() => purgeExpired(), 60 * 60 * 1000);
    return () => clearInterval(timer);
  }, [user?.id]);

  // Download do texto do livro aberto: progresso (0 a 1) ou erro, mostrados no leitor
  const [contentLoad, setContentLoad] = useState<{ bookId: string; progress: number; failed: boolean } | null>(null);
  const [contentRetry, setContentRetry] = useState(0);

  // When current book changes, load sentences into speech engine (com carregamento assíncrono se necessário)
  useEffect(() => {
    if (!currentBook) {
      setCurrentSentenceIndex(0);
      speechEngine.setSentences([], 0);
      return;
    }

    const startEngine = (book: Book) => {
      const startIndex = Math.min(book.lastReadSentenceIndex || 0, Math.max(0, book.sentences.length - 1));
      setCurrentSentenceIndex(startIndex);
      speechEngine.setBook(book.id);
      speechEngine.setSentences(book.sentences, startIndex, book.paragraphStarts);
      speechEngine.setVoice(selectedVoice);
      speechEngine.setRate(settings.speechRate);
    };

    // Livro recém-enviado ou já completo em memória
    if (hasStructuredContent(currentBook)) {
      startEngine(currentBook);
      return;
    }
    if (currentBook.isUploading) {
      return;
    }

    // Metadados apenas, ou cache local no formato antigo: carrega a versão completa
    let isCurrent = true;
    const bookId = currentBook.id;
    setContentLoad({ bookId, progress: 0, failed: false });
    loadFullBook(currentBook, (progress) => {
      if (isCurrent) setContentLoad({ bookId, progress, failed: false });
    })
      .then((fullBook) => {
        if (!isCurrent) return;
        if (!fullBook) {
          setContentLoad({ bookId, progress: 0, failed: true });
          return;
        }
        setContentLoad(null);
        setBooks((prev) => prev.map((b) => (b.id === fullBook.id ? fullBook : b)));
        startEngine(fullBook);
      })
      .catch((err) => {
        console.warn('Falha ao carregar o conteúdo completo do livro:', err);
        if (isCurrent) setContentLoad({ bookId, progress: 0, failed: true });
      });

    return () => {
      isCurrent = false;
    };
  }, [currentBook?.id, contentRetry]);

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
    const isPlaying = playbackStatus === 'playing' || playbackStatus === 'buffering';
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

  // Audio Handlers
  const handleTogglePlay = () => {
    if (!currentBook) return;
    speechEngine.togglePlayPause();
  };

  const handlePrevSentence = () => {
    if (currentSentenceIndex > 0) {
      const newIdx = currentSentenceIndex - 1;
      setCurrentSentenceIndex(newIdx);
      speechEngine.prevSentence();
      setTimeout(() => {
        const sentEl = document.getElementById(`sentence-anchor-${newIdx}`);
        sentEl?.scrollIntoView({ behavior: 'smooth', block: 'center' });
      }, 40);
    }
  };

  const handleNextSentence = () => {
    if (!currentBook || !currentBook.sentences) return;
    if (currentSentenceIndex < currentBook.sentences.length - 1) {
      const newIdx = currentSentenceIndex + 1;
      setCurrentSentenceIndex(newIdx);
      speechEngine.nextSentence();
      setTimeout(() => {
        const sentEl = document.getElementById(`sentence-anchor-${newIdx}`);
        sentEl?.scrollIntoView({ behavior: 'smooth', block: 'center' });
      }, 40);
    }
  };

  // Volta aproximadamente 15 segundos de leitura
  const handleSkipBack = () => {
    if (!currentBook || !currentBook.sentences) return;
    const targetWords = Math.max(18, Math.round(((145 * settings.speechRate) / 60) * 15));
    let accumulated = 0;
    let targetIdx = currentSentenceIndex;
    while (targetIdx > 0 && accumulated < targetWords) {
      targetIdx--;
      accumulated += (currentBook.sentences[targetIdx] || '').split(/\s+/).filter(Boolean).length;
    }
    const newIdx = Math.max(0, targetIdx);
    setCurrentSentenceIndex(newIdx);
    speechEngine.jumpToSentence(newIdx);
    setTimeout(() => {
      const sentEl = document.getElementById(`sentence-anchor-${newIdx}`);
      sentEl?.scrollIntoView({ behavior: 'smooth', block: 'center' });
    }, 40);
  };

  // Avança aproximadamente 15 segundos de leitura
  const handleSkipForward = () => {
    if (!currentBook || !currentBook.sentences) return;
    const targetWords = Math.max(18, Math.round(((145 * settings.speechRate) / 60) * 15));
    let accumulated = 0;
    let targetIdx = currentSentenceIndex;
    const maxIdx = currentBook.sentences.length - 1;
    while (targetIdx < maxIdx && accumulated < targetWords) {
      targetIdx++;
      accumulated += (currentBook.sentences[targetIdx] || '').split(/\s+/).filter(Boolean).length;
    }
    const newIdx = Math.min(maxIdx, targetIdx);
    setCurrentSentenceIndex(newIdx);
    speechEngine.jumpToSentence(newIdx);
    setTimeout(() => {
      const sentEl = document.getElementById(`sentence-anchor-${newIdx}`);
      sentEl?.scrollIntoView({ behavior: 'smooth', block: 'center' });
    }, 40);
  };

  const handleSeek = (index: number) => {
    setCurrentSentenceIndex(index);
    speechEngine.jumpToSentence(index);
    setTimeout(() => {
      const sentEl = document.getElementById(`sentence-anchor-${index}`);
      sentEl?.scrollIntoView({ behavior: 'smooth', block: 'center' });
    }, 40);
  };

  const handleChangeSpeed = (speed: number) => {
    setSettings((prev) => ({ ...prev, speechRate: speed }));
    speechEngine.setRate(speed);
  };

  // A voz escolhida no player é a voz do narrador (também no modo teatro) e fica salva para este livro
  const handleSelectVoice = (voice: VoiceOption) => {
    // Vozes PRO (e vozes personalizadas) pedem assinatura; a amostra continua tocando para ouvir antes
    if (!isProUser && !isFreeVoice(voice)) {
      showNotice(`A voz ${voice.name} é do plano PRO. No plano grátis você tem Faber, Cadu e Jeff.`);
      setIsSubscriptionOpen(true);
      return;
    }
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
    setTimeout(() => {
      const sentEl = document.getElementById(`sentence-anchor-${index}`);
      sentEl?.scrollIntoView({ behavior: 'smooth', block: 'center' });
    }, 40);
  };

  const handleWordClick = (sentenceIndex: number, wordIndex: number, _word: string) => {
    setCurrentSentenceIndex(sentenceIndex);
    // Começa a ler a partir da palavra clicada, esteja tocando ou pausado
    speechEngine.jumpToSentenceFromWord(sentenceIndex, wordIndex);
    setTimeout(() => {
      const wordEl = document.getElementById(`word-anchor-${sentenceIndex}-${wordIndex}`);
      if (wordEl) {
        wordEl.scrollIntoView({ behavior: 'smooth', block: 'center' });
      } else {
        const sentEl = document.getElementById(`sentence-anchor-${sentenceIndex}`);
        sentEl?.scrollIntoView({ behavior: 'smooth', block: 'center' });
      }
    }, 40);
  };

  const handlePlayChapter = (startIndex: number) => {
    setCurrentSentenceIndex(startIndex);
    speechEngine.play(startIndex);
    setTimeout(() => {
      const chapterEl = document.getElementById(`chapter-anchor-${startIndex}`) ||
                        document.getElementById(`sentence-anchor-${startIndex}`);
      chapterEl?.scrollIntoView({ behavior: 'smooth', block: 'start' });
    }, 40);
  };

  // O conteúdo completo é carregado pelo efeito que observa currentBook
  const handleOpenBookInReader = (book: Book) => {
    setCurrentBookId(book.id);
    setActivePage('leitor');
  };

  const handleDeleteBook = async (bookId: string) => {
    setBooks((prev) => {
      const remaining = prev.filter((b) => b.id !== bookId);
      if (currentBookId === bookId) {
        setCurrentBookId(remaining[0]?.id || '');
      }
      return remaining;
    });

    try {
      await deleteBookReal(bookId);
    } catch (e) {
      console.warn('Erro ao deletar livro:', e);
    }
  };

  const handleBookCreated = (newBook: Book) => {
    setBooks((prev) => [newBook, ...prev.filter((b) => b.id !== newBook.id)]);
    setCurrentBookId(newBook.id);
    // Se o livro ainda estiver subindo em background, permanece no painel para ver o progresso
    if (!newBook.isUploading) {
      setActivePage('leitor');
    }
  };

  const handleStartBackgroundUpload = async (file: File, optimisticBook: Book, coverBase64?: string) => {
    try {
      // 1. Tenta upload real via backend Flask (MinIO S3 + MariaDB na nuvem)
      const realBook = await uploadBookReal(
        file,
        optimisticBook.title,
        optimisticBook.author,
        coverBase64
      );

      const readyBook: Book = {
        ...realBook,
        // Preserva a capa real identificada como imagem inicial
        coverImage: realBook.coverImage || optimisticBook.coverImage,
        isUploading: false,
      };
      setBooks((prev) => prev.map((b) => (b.id === optimisticBook.id ? readyBook : b)));
      setCurrentBookId((prevId) => (prevId === optimisticBook.id ? readyBook.id : prevId));

      // Salva no IndexedDB de alta capacidade para acesso instantâneo
      await saveBookFull(readyBook);
    } catch (err: any) {
      // A extração acontece só no backend (mesmo pipeline para todos os formatos); sem ele não há leitura com voz
      console.error('Falha no processamento do documento:', err);
      setBooks((prev) => prev.filter((b) => b.id !== optimisticBook.id));
      alert(`Não foi possível processar "${optimisticBook.title}".\n\n${err?.message || 'Verifique se o servidor está no ar.'}`);
    }
  };

  const handleToggleFavoriteVoice = (voiceId: string) => {
    setFavoriteVoiceIds((prev) =>
      prev.includes(voiceId) ? prev.filter((id) => id !== voiceId) : [...prev, voiceId]
    );
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
        user={user}
        userProfile={userProfile}
        onOpenUpload={() => setIsUploadOpen(true)}
        onOpenSubscription={() => setIsSubscriptionOpen(true)}
        onOpenAuth={() => {}}
        onSignOut={handleLogout}
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
            userName={user.full_name || user.username}
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
            onOpenAIChat={() => setIsAIChatOpen(true)}
            onBackToPainel={() => setActivePage('painel')}
            onOpenUpload={() => setIsUploadOpen(true)}
            contentLoad={contentLoad && contentLoad.bookId === currentBook?.id ? contentLoad : null}
            onRetryContent={() => setContentRetry((n) => n + 1)}
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
            onVoiceCloned={(cloned) => {
              setSelectedVoice(cloned);
            }}
            isProUser={isProUser}
          />
        )}

        {activePage === 'configuracoes' && (
          <Configuracoes
            settings={settings}
            onUpdateSettings={(newSettings) => setSettings((prev) => ({ ...prev, ...newSettings }))}
            user={user}
            userProfile={userProfile}
            onOpenSubscription={() => setIsSubscriptionOpen(true)}
            onSignOut={handleLogout}
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
        onNavigateToCloner={() => setActivePage('vozes')}
        isProUser={isProUser}
      />

      <SettingsModal
        isOpen={isSettingsOpen}
        onClose={() => setIsSettingsOpen(false)}
        settings={settings}
        onUpdateSettings={(newSettings) => setSettings((prev) => ({ ...prev, ...newSettings }))}
      />

      <UploadModal
        isOpen={isUploadOpen}
        onClose={() => setIsUploadOpen(false)}
        onBookCreated={handleBookCreated}
        onStartUpload={handleStartBackgroundUpload}
        userId={user?.id}
      />

      {currentBook && (
        <AIChatDrawer
          isOpen={isAIChatOpen}
          onClose={() => setIsAIChatOpen(false)}
          book={currentBook}
          currentSentenceIndex={currentSentenceIndex}
        />
      )}

      {currentBook && (
        <ChapterDrawer
          isOpen={isChaptersOpen}
          onClose={() => setIsChaptersOpen(false)}
          book={currentBook}
          currentSentenceIndex={currentSentenceIndex}
          onJumpToSentence={handleSeek}
          voiceName={selectedVoice.name}
          onNotice={showNotice}
        />
      )}

      <SubscriptionModal
        isOpen={isSubscriptionOpen}
        onClose={() => setIsSubscriptionOpen(false)}
        userProfile={userProfile}
        onPlanUpgraded={() => {
          refreshSession();
        }}
        onOpenAuth={() => {}}
      />

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
