import React, { useState, useEffect, useMemo, useRef } from 'react';
import { Capacitor } from '@capacitor/core';
import { App as CapApp } from '@capacitor/app';
import { VOICES, DEFAULT_VOICE_ID, findVoiceById, isFreeVoice } from './data/voices';
import type { Book, BookFolder, ReaderSettings, VoiceOption, AppPage } from './types';
import { speechEngine } from './services/speechEngine';
import type { PlaybackStatus } from './services/speechEngine';
import {
  fetchCloudBooks, deleteBookReal, uploadBookReal, fetchBookFullContent, syncReadingProgressToCloud, fetchReadingStats,
  fetchFolders, createFolder, renameFolder, deleteFolder, moveBookToFolder,
} from './services/api';
import type { FolderResult } from './services/api';
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

type ProgressFields = Pick<Book, 'lastReadSentenceIndex' | 'readingProgress' | 'progressReadAt'>;

/**
 * Ponto de leitura que vale entre duas cópias do livro (aparelho x servidor): o mais recente.
 * Cópias de antes do horário existir (progressReadAt 0) ficam com o maior progresso, como antes.
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

/**
 * Combina o livro vindo do servidor (metadados atualizados) com o que já existe neste navegador:
 * conteúdo já carregado não pode ser perdido por uma listagem que não o traz, e o ponto de leitura
 * que vale é o mais recente dos dois.
 */
function mergeLocalBookState(base: Book, local: Book): Book {
  const hasLocalContent = Boolean(local.sentences?.length) && (local.contentRev ?? 0) === (base.contentRev ?? 0);

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
    ...newestProgress(local, base),
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

// O servidor reprocessou o texto (ex.: capítulos corrigidos): a cópia guardada no aparelho ficou velha
const sameContentRev = (a: Book, b: Book) => (a.contentRev ?? 0) === (b.contentRev ?? 0);

/**
 * Carrega o conteúdo completo do livro: IndexedDB primeiro, backend quando o cache local
 * não existe ou está no formato antigo (sem parágrafos/falas).
 */
async function loadFullBook(book: Book, onProgress?: (fraction: number) => void): Promise<Book | null> {
  const local = await getBookFull(book.id);
  // A cópia completa guardada no aparelho tem o ponto de leitura de quando foi gravada:
  // vale o da estante (que já passou pelo servidor), se for mais recente
  const progress = local ? newestProgress(book, local) : newestProgress(book, book);
  if (local && hasStructuredContent(local) && sameContentRev(local, book)) {
    return { ...local, ...progress, lastReadSentenceIndex: Math.min(progress.lastReadSentenceIndex, local.sentences.length - 1) };
  }

  const lastIndex = progress.lastReadSentenceIndex;
  const readingProgress = progress.readingProgress;

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
      progressReadAt: progress.progressReadAt,
    };
    // Gravar um livro de dezenas de MB no IndexedDB demora no celular: a leitura não espera por isso
    saveBookFull(merged).catch((err) => console.warn('Falha ao salvar o livro neste aparelho:', err));
    return merged;
  }

  // Backend indisponível: usa a cópia antiga, com o progresso mais recente
  return local && local.sentences?.length
    ? { ...local, ...progress, lastReadSentenceIndex: Math.min(lastIndex, local.sentences.length - 1) }
    : null;
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

  // Pastas da estante e a que está aberta no Painel ('all' = todos os livros, 'none' = sem pasta)
  const [folders, setFolders] = useState<BookFolder[]>([]);
  const [activeFolderId, setActiveFolderId] = useState<string>('all');

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

  // ------------------------------------------------------------------ ponto de leitura entre aparelhos
  // Refs: os ouvintes abaixo são registrados uma vez só e precisam dos valores atuais
  const booksRef = useRef(books);
  booksRef.current = books;
  const currentBookIdRef = useRef(currentBookId);
  currentBookIdRef.current = currentBookId;

  // Ponto de leitura ainda não enviado ao servidor (envio agrupado a cada 1,5 s durante a leitura)
  const pendingProgressRef = useRef<{ bookId: string; index: number; progress: number; readAt: number } | null>(null);
  const progressTimerRef = useRef<ReturnType<typeof setTimeout> | null>(null);
  const flushProgress = () => {
    if (progressTimerRef.current) clearTimeout(progressTimerRef.current);
    progressTimerRef.current = null;
    const pending = pendingProgressRef.current;
    pendingProgressRef.current = null;
    if (pending) syncReadingProgressToCloud(pending.bookId, pending.index, pending.progress, pending.readAt);
  };

  const isEnginePlaying = () => {
    const status = speechEngine.getStatus();
    return status === 'playing' || status === 'buffering';
  };

  /**
   * Busca a estante e os pontos de leitura no servidor (todo livro é privado): ao abrir, ao voltar para o app
   * e a cada 30 s com a tela aberta. Em cada livro vale o ponto lido por último, em qualquer aparelho.
   * Se foi em outro aparelho e a leitura aqui está parada, o livro aberto vai para lá.
   */
  const syncWithCloud = async () => {
    const cloudBooks = await fetchCloudBooks();
    if (cloudBooks === null) {
      // Servidor/banco fora do ar: mantém a estante local em vez de apagar tudo
      console.warn('Não foi possível atualizar a estante pelo servidor; usando os livros salvos neste navegador.');
      return;
    }
    const openId = currentBookIdRef.current;
    const before = booksRef.current;
    const playingHere = isEnginePlaying();

    setBooks((prev) => {
      const localById = new Map(prev.map((b) => [b.id, b]));
      const merged = cloudBooks.map((cloud) => {
        const local = localById.get(cloud.id);
        if (!local) return cloud;
        const book = mergeLocalBookState(cloud, local);
        // Tocando aqui: o ponto deste aparelho continua valendo até a leitura parar
        return playingHere && cloud.id === openId ? { ...book, ...newestProgress(local, local) } : book;
      });
      // Uploads em andamento ainda não existem no servidor
      const uploading = prev.filter((b) => b.isUploading && !cloudBooks.some((c) => c.id === b.id));
      return [...uploading, ...merged];
    });
    if (cloudBooks.length > 0 && (!openId || !cloudBooks.some((b) => b.id === openId))) {
      setCurrentBookId(cloudBooks[0].id);
    }

    for (const cloud of cloudBooks) {
      const local = before.find((b) => b.id === cloud.id);
      if (!local) continue;
      if ((local.progressReadAt || 0) > (cloud.progressReadAt || 0)) {
        // Lido aqui depois (ex.: sem internet): o servidor recebe este ponto
        syncReadingProgressToCloud(cloud.id, local.lastReadSentenceIndex || 0, local.readingProgress || 0, local.progressReadAt || 0);
      } else if (
        cloud.id === openId &&
        !playingHere &&
        (cloud.progressReadAt || 0) > (local.progressReadAt || 0) &&
        speechEngine.getBookId() === cloud.id &&
        local.sentences?.length
      ) {
        const index = Math.min(cloud.lastReadSentenceIndex || 0, local.sentences.length - 1);
        if (index !== speechEngine.getCurrentIndex()) {
          speechEngine.setPosition(index);
          setCurrentSentenceIndex(index);
        }
      }
    }
  };
  const syncWithCloudRef = useRef(syncWithCloud);
  syncWithCloudRef.current = syncWithCloud;
  const flushProgressRef = useRef(flushProgress);
  flushProgressRef.current = flushProgress;

  useEffect(() => {
    const sync = () => {
      syncWithCloudRef.current().catch((err) => console.warn('Erro ao carregar livros da nuvem:', err));
    };
    sync();
    // Saiu do app: envia já o ponto de leitura; voltou: busca o que foi lido nos outros aparelhos
    const onVisibility = () => {
      if (document.visibilityState === 'visible') sync();
      else flushProgressRef.current();
    };
    document.addEventListener('visibilitychange', onVisibility);
    const timer = setInterval(() => {
      if (document.visibilityState === 'visible' && !isEnginePlaying()) sync();
    }, 30000);
    const nativeSubs = Capacitor.isNativePlatform()
      ? [CapApp.addListener('resume', sync), CapApp.addListener('pause', () => flushProgressRef.current())]
      : [];
    return () => {
      document.removeEventListener('visibilitychange', onVisibility);
      clearInterval(timer);
      nativeSubs.forEach((sub) => sub.then((h) => h.remove()));
      flushProgressRef.current();
    };
  }, [user?.id]);

  // Pastas: cópia neste aparelho (para abrir sem internet) e a versão do servidor em seguida
  const foldersCacheKey = user?.id ? `gtp_folders_${user.id}` : '';
  useEffect(() => {
    if (!foldersCacheKey) return;
    try {
      const cached = JSON.parse(localStorage.getItem(foldersCacheKey) || '[]');
      setFolders(Array.isArray(cached) ? cached : []);
    } catch {
      setFolders([]); // cópia ilegível: espera o servidor
    }
    setActiveFolderId('all');
    let isMounted = true;
    fetchFolders().then((list) => {
      if (isMounted && list) setFolders(list);
    });
    return () => {
      isMounted = false;
    };
  }, [foldersCacheKey]);
  const foldersCacheOwnerRef = useRef('');
  useEffect(() => {
    // Logo depois de trocar de conta a lista ainda é a da conta anterior: não grava
    if (foldersCacheOwnerRef.current !== foldersCacheKey) {
      foldersCacheOwnerRef.current = foldersCacheKey;
      return;
    }
    if (!foldersCacheKey) return;
    try {
      localStorage.setItem(foldersCacheKey, JSON.stringify(folders));
    } catch {
      // sem espaço: as pastas continuam vindo do servidor
    }
  }, [folders, foldersCacheKey]);
  // Pasta aberta que deixou de existir (apagada em outro aparelho): volta para "Todos"
  useEffect(() => {
    if (activeFolderId !== 'all' && activeFolderId !== 'none' && !folders.some((f) => f.id === activeFolderId)) {
      setActiveFolderId('all');
    }
  }, [folders, activeFolderId]);

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
    saveBooksMetadataSafe(books, user?.id);
  }, [books, user?.id]);

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
          const readAt = Date.now();
          setBooks((prev) =>
            prev.map((b) => {
              if (b.id === currentBook.id) {
                return { ...b, lastReadSentenceIndex: idx, readingProgress: progress, progressReadAt: readAt };
              }
              return b;
            })
          );

          // Envia ao servidor agrupado (a cada 1,5 s durante a leitura); outro livro pendente vai na hora
          if (pendingProgressRef.current && pendingProgressRef.current.bookId !== currentBook.id) flushProgressRef.current();
          pendingProgressRef.current = { bookId: currentBook.id, index: idx, progress, readAt };
          if (!progressTimerRef.current) {
            progressTimerRef.current = setTimeout(() => flushProgressRef.current(), 1500);
          }
        }
      },
      onStatusChange: (status) => {
        setPlaybackStatus(status);
        // Pausou: o ponto de leitura vai já, para aparecer nos outros aparelhos
        if (status !== 'playing' && status !== 'buffering') flushProgressRef.current();
      },
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
      // Enquanto o texto baixava, o servidor pode ter trazido um ponto de leitura mais novo
      const shelf = booksRef.current.find((b) => b.id === book.id);
      const position = shelf ? newestProgress(book, shelf) : book;
      const startIndex = Math.min(position.lastReadSentenceIndex || 0, Math.max(0, book.sentences.length - 1));
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
        // A cópia do aparelho pode ter a pasta antiga: vale a da estante
        setBooks((prev) =>
          prev.map((b) => (b.id === fullBook.id ? { ...fullBook, folderId: b.folderId, ...newestProgress(fullBook, b) } : b))
        );
        startEngine(fullBook);
      })
      .catch((err) => {
        console.warn('Falha ao carregar o conteúdo completo do livro:', err);
        if (isCurrent) setContentLoad({ bookId, progress: 0, failed: true });
      });

    return () => {
      isCurrent = false;
    };
  }, [currentBook?.id, currentBook?.contentRev ?? 0, contentRetry]);

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

  // Navegador (computador ou celular): teclas de mídia e fones controlam a leitura pelo Media Session.
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

  // ---- Pastas. As funções devolvem a mensagem de erro para a tela mostrar, ou null se deu certo.
  // Esta devolve a pasta criada, para a janela "Mover para pasta" já colocar o livro nela
  const handleCreateFolder = async (name: string, openIt = true): Promise<FolderResult<BookFolder>> => {
    const r = await createFolder(name);
    if (!r.ok) return r;
    setFolders((prev) => [...prev, r.data].sort((a, b) => a.name.localeCompare(b.name, 'pt-BR')));
    if (openIt) setActiveFolderId(r.data.id);
    return r;
  };

  const handleRenameFolder = async (folderId: string, name: string): Promise<string | null> => {
    const r = await renameFolder(folderId, name);
    if (!r.ok) return r.error;
    setFolders((prev) =>
      prev.map((f) => (f.id === folderId ? r.data : f)).sort((a, b) => a.name.localeCompare(b.name, 'pt-BR'))
    );
    return null;
  };

  const handleDeleteFolder = async (folderId: string): Promise<string | null> => {
    const r = await deleteFolder(folderId);
    if (!r.ok) return r.error;
    setFolders((prev) => prev.filter((f) => f.id !== folderId));
    setBooks((prev) => prev.map((b) => (b.folderId === folderId ? { ...b, folderId: null } : b)));
    setActiveFolderId('all');
    return null;
  };

  const handleMoveBookToFolder = async (bookId: string, folderId: string | null): Promise<string | null> => {
    const previous = books.find((b) => b.id === bookId)?.folderId ?? null;
    if (previous === folderId) return null;
    setBooks((prev) => prev.map((b) => (b.id === bookId ? { ...b, folderId } : b)));
    const r = await moveBookToFolder(bookId, folderId);
    if (!r.ok) {
      setBooks((prev) => prev.map((b) => (b.id === bookId ? { ...b, folderId: previous } : b)));
      return r.error;
    }
    return null;
  };

  // Livro enviado com uma pasta aberta entra nela
  const uploadFolderId = activeFolderId !== 'all' && activeFolderId !== 'none' ? activeFolderId : null;

  const handleBookCreated = (created: Book) => {
    const newBook = created.isUploading ? { ...created, folderId: created.folderId ?? uploadFolderId } : created;
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
        coverBase64,
        uploadFolderId
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
            folders={folders}
            activeFolderId={activeFolderId}
            onSelectFolder={setActiveFolderId}
            onCreateFolder={handleCreateFolder}
            onRenameFolder={handleRenameFolder}
            onDeleteFolder={handleDeleteFolder}
            onMoveBookToFolder={handleMoveBookToFolder}
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
