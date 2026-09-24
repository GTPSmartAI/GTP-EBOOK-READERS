import React, { useState, useEffect, useMemo } from 'react';
import { ELEVEN_VOICES } from './data/voices';
import type { Book, ReaderSettings, VoiceOption, AppPage } from './types';
import { speechEngine } from './services/speechEngine';
import type { PlaybackStatus } from './services/speechEngine';
import { supabase, fetchUserProfile, fetchCloudBooks, deleteBookReal } from './services/supabase';
import type { UserProfile } from './services/supabase';
import { 
  saveBookFull, 
  getBookFull, 
  saveBooksMetadataSafe, 
  loadInitialBooks 
} from './services/bookStorage';

// Pages
import { Login } from './pages/Login';
import { Painel } from './pages/Painel';
import { Leitor } from './pages/Leitor';
import { Vozes } from './pages/Vozes';
import { Configuracoes } from './pages/Configuracoes';

// Layout & Components
import { AppHeader } from './components/layout/AppHeader';
import { AudioPlayer } from './components/AudioPlayer';
import { VoicePickerModal } from './components/VoicePickerModal';
import { SettingsModal } from './components/SettingsModal';
import { UploadModal } from './components/UploadModal';
import { AIChatDrawer } from './components/AIChatDrawer';
import { ChapterDrawer } from './components/ChapterDrawer';
import { SubscriptionModal } from './components/SubscriptionModal';

const DEFAULT_SETTINGS: ReaderSettings = {
  theme: 'dark',
  fontFamily: 'serif',
  fontSize: 18,
  lineHeight: 1.8,
  readingWidth: 'medium',
  autoScroll: true,
  selectedVoiceId: 'vitoria-pt',
  speechRate: 1.0,
  speechPitch: 1.0,
  highlightColor: '#10b981',
};

// IDs de livros fictícios que devem ser purgados
const MOCK_BOOK_IDS = ['pequeno-principe', 'arte-da-guerra', 'revolucao-ia', 'habitos-atomicos', 'ia-moderna'];

export const App: React.FC = () => {
  // Authentication State
  const [user, setUser] = useState<any>(() => {
    const saved = localStorage.getItem('gtp_user_session');
    if (saved) {
      try {
        return JSON.parse(saved);
      } catch (e) {
        console.error('Failed to parse user session', e);
      }
    }
    return null;
  });

  const [userProfile, setUserProfile] = useState<UserProfile | null>(null);

  // Active Navigation Page ('painel' | 'leitor' | 'vozes' | 'configuracoes')
  const [activePage, setActivePage] = useState<AppPage>('painel');

  // Books list state (sem dados fictícios; limpa dados mockados antigos)
  const [books, setBooks] = useState<Book[]>(() => {
    const saved = localStorage.getItem('gtp_reader_books');
    if (saved) {
      try {
        const parsed = JSON.parse(saved);
        if (Array.isArray(parsed)) {
          return parsed.filter((b: any) => b && !MOCK_BOOK_IDS.includes(b.id));
        }
      } catch (e) {
        console.error('Failed to parse saved books', e);
      }
    }
    return [];
  });

  const [currentBookId, setCurrentBookId] = useState<string>(() => {
    return books[0]?.id || '';
  });

  // Current active book (seguro e sem mock)
  const currentBook = useMemo(() => {
    if (books.length === 0) return null;
    return books.find((b) => b.id === currentBookId) || books[0] || null;
  }, [books, currentBookId]);

  // Audio Playback state
  const [currentSentenceIndex, setCurrentSentenceIndex] = useState<number>(0);
  const [playbackStatus, setPlaybackStatus] = useState<PlaybackStatus>('idle');
  const [waveformLevels, setWaveformLevels] = useState<number[]>(Array(16).fill(15));
  const [bufferingMessage, setBufferingMessage] = useState<string>('');

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
    return ['vitoria-pt', 'thiago-pt'];
  });

  const [selectedVoice, setSelectedVoice] = useState<VoiceOption>(() => {
    return ELEVEN_VOICES.find((v) => v.id === 'vitoria-pt') || ELEVEN_VOICES[0];
  });

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

  // Monitor Supabase session
  useEffect(() => {
    supabase.auth.getSession().then(({ data: { session } }) => {
      if (session?.user) {
        setUser(session.user);
        localStorage.setItem('gtp_user_session', JSON.stringify(session.user));
        loadProfile(session.user.id);
      }
    });

    const { data: { subscription } } = supabase.auth.onAuthStateChange((_event, session) => {
      if (session?.user) {
        setUser(session.user);
        localStorage.setItem('gtp_user_session', JSON.stringify(session.user));
        loadProfile(session.user.id);
      }
    });

    return () => subscription.unsubscribe();
  }, []);

  // Busca livros reais sincronizados no Supabase Storage / Database
  useEffect(() => {
    let isMounted = true;
    async function loadUserBooks() {
      try {
        const cloudBooks = await fetchCloudBooks(user?.id);
        if (isMounted && cloudBooks && cloudBooks.length > 0) {
          setBooks(cloudBooks);
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

  const loadProfile = async (userId: string) => {
    const prof = await fetchUserProfile(userId);
    if (prof) {
      setUserProfile(prof);
    }
  };

  const handleSignOut = async () => {
    await supabase.auth.signOut();
    setUser(null);
    setUserProfile(null);
    localStorage.removeItem('gtp_user_session');
  };

  // Sync theme attribute to HTML tag
  useEffect(() => {
    document.documentElement.setAttribute('data-theme', settings.theme);
    localStorage.setItem('gtp_reader_settings', JSON.stringify(settings));
  }, [settings]);

  // Persist books to IndexedDB e metadados leves ao localStorage (suporta de 1MB a 50MB+)
  useEffect(() => {
    saveBooksMetadataSafe(books);
    books.forEach((b) => {
      if (b.sentences && b.sentences.length > 0) {
        saveBookFull(b);
      }
    });
  }, [books]);

  // Carrega livros persistidos em IndexedDB ao inicializar
  useEffect(() => {
    loadInitialBooks().then((initBooks) => {
      if (initBooks && initBooks.length > 0) {
        setBooks((prev) => {
          const ids = new Set(prev.map((p) => p.id));
          const toAdd = initBooks.filter((b) => !ids.has(b.id));
          return [...prev, ...toAdd];
        });
      }
    });
  }, []);

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
          setBooks((prev) =>
            prev.map((b) => {
              if (b.id === currentBook.id) {
                const progress = Math.round((idx / Math.max(1, b.sentences.length - 1)) * 100);
                return { ...b, lastReadSentenceIndex: idx, readingProgress: progress };
              }
              return b;
            })
          );
        }
      },
      onStatusChange: (status) => setPlaybackStatus(status),
      onComplete: () => setPlaybackStatus('idle'),
      onWaveformTick: (levels) => setWaveformLevels(levels),
      onBufferProgress: (isBuffering, progressText) => {
        setBufferingMessage(isBuffering ? progressText : '');
      },
    });
  }, [currentBook?.id]);

  // When current book changes, load sentences into speech engine (com carregamento assíncrono se necessário)
  useEffect(() => {
    if (!currentBook) {
      setCurrentSentenceIndex(0);
      speechEngine.setSentences([], 0);
      return;
    }

    // Se o livro já tem sentenças em memória
    if (currentBook.sentences && currentBook.sentences.length > 0) {
      setCurrentSentenceIndex(currentBook.lastReadSentenceIndex || 0);
      speechEngine.setSentences(currentBook.sentences, currentBook.lastReadSentenceIndex || 0);
      speechEngine.setVoice(selectedVoice);
      speechEngine.setRate(settings.speechRate);
      return;
    }

    // Caso contrário (livro grande recuperado de metadados), busca dados completos do IndexedDB ou backend
    let isCurrent = true;
    getBookFull(currentBook.id).then(async (fullBook) => {
      if (!isCurrent) return;

      if (fullBook && fullBook.sentences && fullBook.sentences.length > 0) {
        setBooks((prev) => prev.map((b) => (b.id === fullBook.id ? fullBook : b)));
        setCurrentSentenceIndex(fullBook.lastReadSentenceIndex || 0);
        speechEngine.setSentences(fullBook.sentences, fullBook.lastReadSentenceIndex || 0);
        speechEngine.setVoice(selectedVoice);
        speechEngine.setRate(settings.speechRate);
      } else {
        // Tenta buscar da API do backend
        try {
          const res = await fetch(`http://localhost:4000/api/books/${currentBook.id}/content`);
          if (res.ok) {
            const data = await res.json();
            if (data.book && data.book.sentences && isCurrent) {
              const enriched: Book = {
                ...currentBook,
                sentences: data.book.sentences,
                content: data.book.content || currentBook.content,
                chapters: data.book.chapters || currentBook.chapters,
              };
              saveBookFull(enriched);
              setBooks((prev) => prev.map((b) => (b.id === enriched.id ? enriched : b)));
              speechEngine.setSentences(enriched.sentences, enriched.lastReadSentenceIndex || 0);
              speechEngine.setVoice(selectedVoice);
              speechEngine.setRate(settings.speechRate);
            }
          }
        } catch (fetchErr) {
          console.warn('Falha ao buscar dados completos do livro no backend:', fetchErr);
        }
      }
    });

    return () => {
      isCurrent = false;
    };
  }, [currentBook?.id]);

  // Audio Handlers
  const handleTogglePlay = () => {
    if (!currentBook) return;
    speechEngine.togglePlayPause();
  };

  const handlePrevSentence = () => {
    speechEngine.prevSentence();
  };

  const handleNextSentence = () => {
    speechEngine.nextSentence();
  };

  const handleSkipBack = () => {
    const newIdx = Math.max(0, currentSentenceIndex - 2);
    speechEngine.jumpToSentence(newIdx);
  };

  const handleSkipForward = () => {
    if (!currentBook) return;
    const newIdx = Math.min(currentBook.sentences.length - 1, currentSentenceIndex + 2);
    speechEngine.jumpToSentence(newIdx);
  };

  const handleSeek = (index: number) => {
    speechEngine.jumpToSentence(index);
  };

  const handleChangeSpeed = (speed: number) => {
    setSettings((prev) => ({ ...prev, speechRate: speed }));
    speechEngine.setRate(speed);
  };

  const handleSelectVoice = (voice: VoiceOption) => {
    setSelectedVoice(voice);
    setSettings((prev) => ({ ...prev, selectedVoiceId: voice.id }));
    speechEngine.setVoice(voice);
  };

  const handleSentenceClick = (index: number) => {
    speechEngine.jumpToSentence(index);
    if (playbackStatus !== 'playing') {
      speechEngine.play(index);
    }
  };

  const handlePlayChapter = (startIndex: number) => {
    speechEngine.jumpToSentence(startIndex);
    speechEngine.play(startIndex);
  };

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
    setActivePage('leitor');
  };

  const handleToggleFavoriteVoice = (voiceId: string) => {
    setFavoriteVoiceIds((prev) =>
      prev.includes(voiceId) ? prev.filter((id) => id !== voiceId) : [...prev, voiceId]
    );
  };

  const handlePreviewVoice = (voice: VoiceOption) => {
    speechEngine.previewVoice(voice);
  };

  // If user is not logged in, render the Login / Landing Page
  if (!user) {
    return (
      <Login
        onLoginSuccess={(loggedUser) => {
          setUser(loggedUser);
          localStorage.setItem('gtp_user_session', JSON.stringify(loggedUser));
          setActivePage('painel');
        }}
        onEnterGuest={() => {
          const guestUser = { id: 'guest', email: 'visitante@ebookreaders.gtp', user_metadata: { full_name: 'Leitor Convidado' } };
          setUser(guestUser);
          localStorage.setItem('gtp_user_session', JSON.stringify(guestUser));
          setActivePage('painel');
        }}
      />
    );
  }

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
        onSignOut={handleSignOut}
      />

      {/* Pages Viewport */}
      <div style={{ flex: 1, minHeight: 0, display: 'flex', flexDirection: 'column', overflow: 'hidden', position: 'relative' }}>
        {activePage === 'painel' && (
          <Painel
            books={books}
            currentBook={currentBook!}
            favoriteVoiceIds={favoriteVoiceIds}
            allVoices={ELEVEN_VOICES}
            onOpenBookInReader={handleOpenBookInReader}
            onOpenUpload={() => setIsUploadOpen(true)}
            onNavigateToVoices={() => setActivePage('vozes')}
            onToggleFavoriteVoice={handleToggleFavoriteVoice}
            onPreviewVoice={handlePreviewVoice}
            onDeleteBook={handleDeleteBook}
            userName={user.user_metadata?.full_name || user.email?.split('@')[0] || 'Usuário'}
          />
        )}

        {activePage === 'leitor' && (
          <Leitor
            book={currentBook}
            currentSentenceIndex={currentSentenceIndex}
            settings={settings}
            onSentenceClick={handleSentenceClick}
            onPlayChapter={handlePlayChapter}
            onOpenChapters={() => setIsChaptersOpen(true)}
            onOpenAIChat={() => setIsAIChatOpen(true)}
            onBackToPainel={() => setActivePage('painel')}
            onOpenUpload={() => setIsUploadOpen(true)}
          />
        )}

        {activePage === 'vozes' && (
          <Vozes
            voices={ELEVEN_VOICES}
            selectedVoice={selectedVoice}
            favoriteVoiceIds={favoriteVoiceIds}
            onSelectVoice={handleSelectVoice}
            onToggleFavoriteVoice={handleToggleFavoriteVoice}
            onPreviewVoice={handlePreviewVoice}
            onVoiceCloned={(cloned) => {
              setSelectedVoice(cloned);
            }}
            isProUser={userProfile?.subscription_tier === 'pro' || userProfile?.subscription_tier === 'unlimited'}
          />
        )}

        {activePage === 'configuracoes' && (
          <Configuracoes
            settings={settings}
            onUpdateSettings={(newSettings) => setSettings((prev) => ({ ...prev, ...newSettings }))}
            user={user}
            userProfile={userProfile}
            onOpenSubscription={() => setIsSubscriptionOpen(true)}
            onSignOut={handleSignOut}
          />
        )}
      </div>

      {/* Indicador Flutuante de Processamento / Buffer Inicial com Suspense */}
      {(bufferingMessage || playbackStatus === 'buffering') && (
        <div style={{
          position: 'fixed',
          top: '75px',
          left: '50%',
          transform: 'translateX(-50%)',
          zIndex: 80,
          background: 'rgba(15, 23, 42, 0.95)',
          backdropFilter: 'blur(16px)',
          border: '1px solid rgba(16, 185, 129, 0.4)',
          borderRadius: '9999px',
          padding: '8px 22px',
          boxShadow: '0 10px 25px -5px rgba(0, 0, 0, 0.5), 0 0 20px rgba(16, 185, 129, 0.25)',
          display: 'flex',
          alignItems: 'center',
          gap: '10px',
          color: '#ffffff',
          fontSize: '12px',
          fontWeight: 700,
          letterSpacing: '0.02em',
        }}>
          <span style={{
            display: 'inline-block',
            width: '8px',
            height: '8px',
            borderRadius: '50%',
            background: '#10b981',
            boxShadow: '0 0 10px #10b981',
          }} />
          <span>{bufferingMessage || '⚡ Preparando leitura neural com suspense & pontuação...'}</span>
        </div>
      )}

      {/* Bottom Floating Audio Player Dock (exibido apenas se houver livro e conteúdo) */}
      {currentBook && currentBook.sentences && currentBook.sentences.length > 0 && (
        <AudioPlayer
          currentBook={currentBook}
          currentSentenceIndex={currentSentenceIndex}
          playbackStatus={playbackStatus}
          selectedVoice={selectedVoice}
          speed={settings.speechRate}
          waveformLevels={waveformLevels}
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

      {/* Modals & Drawers */}
      <VoicePickerModal
        isOpen={isVoicePickerOpen}
        onClose={() => setIsVoicePickerOpen(false)}
        selectedVoice={selectedVoice}
        onSelectVoice={handleSelectVoice}
        onNavigateToCloner={() => setActivePage('vozes')}
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
        />
      )}

      <SubscriptionModal
        isOpen={isSubscriptionOpen}
        onClose={() => setIsSubscriptionOpen(false)}
        userProfile={userProfile}
        onPlanUpgraded={() => {
          if (user) loadProfile(user.id);
        }}
        onOpenAuth={() => {}}
      />
    </div>
  );
};

export default App;
