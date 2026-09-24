import React, { useEffect, useRef, useState, useCallback } from 'react';
import type { Book, ReaderSettings } from '../types';
import { Play, Sparkles, BookOpen, Clock, CheckCircle } from 'lucide-react';

interface ReaderViewProps {
  book: Book;
  currentSentenceIndex: number;
  settings: ReaderSettings;
  viewMode: 'flow' | 'pdf';
  onSentenceClick: (sentenceIndex: number) => void;
  onPlayChapter: (startIndex: number) => void;
}

export const ReaderView: React.FC<ReaderViewProps> = ({
  book,
  currentSentenceIndex,
  settings,
  viewMode,
  onSentenceClick,
  onPlayChapter,
}) => {
  const activeSentenceRef = useRef<HTMLSpanElement | null>(null);
  const [isDetachedFromVoice, setIsDetachedFromVoice] = useState(false);
  const detachTimeoutRef = useRef<any>(null);

  // Detecta quando o usuário rola manualmente para não forçar o scroll da IA
  const handleUserScroll = useCallback(() => {
    setIsDetachedFromVoice(true);
    if (detachTimeoutRef.current) {
      clearTimeout(detachTimeoutRef.current);
    }
    // Após 12 segundos sem rolar, permite resincronização suave
    detachTimeoutRef.current = setTimeout(() => {
      setIsDetachedFromVoice(false);
    }, 12000);
  }, []);

  useEffect(() => {
    window.addEventListener('wheel', handleUserScroll, { passive: true });
    window.addEventListener('touchmove', handleUserScroll, { passive: true });
    return () => {
      window.removeEventListener('wheel', handleUserScroll);
      window.removeEventListener('touchmove', handleUserScroll);
      if (detachTimeoutRef.current) clearTimeout(detachTimeoutRef.current);
    };
  }, [handleUserScroll]);

  // Sincroniza e centraliza na frase que a IA está lendo
  const handleSyncWithVoice = () => {
    setIsDetachedFromVoice(false);
    if (activeSentenceRef.current) {
      activeSentenceRef.current.scrollIntoView({
        behavior: 'smooth',
        block: 'center',
      });
    }
  };

  // Auto-scroll para sentença ativa apenas se o usuário não estiver rolando livremente
  useEffect(() => {
    if (!settings.autoScroll || isDetachedFromVoice || !activeSentenceRef.current) {
      return;
    }

    const rect = activeSentenceRef.current.getBoundingClientRect();
    const isVisibleInViewport = rect.top >= 100 && rect.bottom <= window.innerHeight - 140;

    // Se já estiver visível na janela, não força solavanco
    if (!isVisibleInViewport) {
      activeSentenceRef.current.scrollIntoView({
        behavior: 'smooth',
        block: 'center',
      });
    }
  }, [currentSentenceIndex, settings.autoScroll, isDetachedFromVoice]);

  // Width mapping
  const maxWidthMap = {
    narrow: '620px',
    medium: '760px',
    wide: '920px',
    full: '100%',
  };

  // Font family mapping
  const fontFamilyMap = {
    sans: 'var(--font-sans)',
    serif: 'var(--font-serif)',
    mono: 'var(--font-mono)',
  };

  // Group sentences into paragraphs (roughly every 3-5 sentences or chapter breaks)
  const renderParagraphs = () => {
    const chaptersByStart = new Map<number, string>();
    book.chapters.forEach((ch) => chaptersByStart.set(ch.startIndex, ch.title));

    const paragraphs: React.ReactNode[] = [];
    let currentParagraphSentences: { text: string; index: number }[] = [];

    book.sentences.forEach((sentence, idx) => {
      // If a chapter starts here, flush current paragraph and render Chapter Header
      if (chaptersByStart.has(idx)) {
        if (currentParagraphSentences.length > 0) {
          paragraphs.push(renderParagraphBlock(currentParagraphSentences, `p-${idx}`));
          currentParagraphSentences = [];
        }

        paragraphs.push(
          <div
            key={`chapter-${idx}`}
            style={{
              margin: '48px 0 24px 0',
              paddingBottom: '16px',
              borderBottom: '1px solid var(--border-subtle)',
              display: 'flex',
              alignItems: 'center',
              justifyContent: 'space-between',
            }}
          >
            <div>
              <span style={{
                fontSize: '11px',
                textTransform: 'uppercase',
                letterSpacing: '0.1em',
                fontWeight: 700,
                color: 'var(--accent-primary)',
              }}>
                SEÇÃO
              </span>
              <h2 style={{
                fontSize: `${settings.fontSize * 1.3}px`,
                fontWeight: 700,
                color: 'var(--text-primary)',
                marginTop: '4px',
              }}>
                {chaptersByStart.get(idx)}
              </h2>
            </div>

            <button
              onClick={() => onPlayChapter(idx)}
              style={{
                display: 'flex',
                alignItems: 'center',
                gap: '6px',
                padding: '6px 12px',
                borderRadius: 'var(--radius-full)',
                background: 'var(--bg-surface-elevated)',
                border: '1px solid var(--border-subtle)',
                color: 'var(--text-secondary)',
                fontSize: '12px',
                fontWeight: 500,
              }}
              title="Ouvir a partir deste capítulo"
            >
              <Play size={13} color="var(--accent-primary)" />
              <span>Ouvir Capítulo</span>
            </button>
          </div>
        );
      }

      currentParagraphSentences.push({ text: sentence, index: idx });

      // Paragraph split heuristic (every 3 to 4 sentences or punctuation triggers)
      if (currentParagraphSentences.length >= 4 || sentence.includes('\n')) {
        paragraphs.push(renderParagraphBlock(currentParagraphSentences, `p-${idx}`));
        currentParagraphSentences = [];
      }
    });

    if (currentParagraphSentences.length > 0) {
      paragraphs.push(renderParagraphBlock(currentParagraphSentences, 'p-last'));
    }

    return paragraphs;
  };

  const renderParagraphBlock = (items: { text: string; index: number }[], key: string) => {
    return (
      <p
        key={key}
        style={{
          marginBottom: '22px',
          lineHeight: settings.lineHeight,
          fontSize: `${settings.fontSize}px`,
          textAlign: 'justify',
        }}
      >
        {items.map(({ text, index }) => {
          const isActive = index === currentSentenceIndex;
          return (
            <span
              key={index}
              ref={isActive ? activeSentenceRef : null}
              onClick={() => onSentenceClick(index)}
              className={`reading-sentence ${isActive ? 'active' : ''}`}
            >
              {text}{' '}
            </span>
          );
        })}
      </p>
    );
  };

  return (
    <main
      style={{
        flex: 1,
        overflowY: 'auto',
        padding: '36px 20px 140px 20px', // Extra bottom space for floating dock
        display: 'flex',
        flexDirection: 'column',
        alignItems: 'center',
        fontFamily: fontFamilyMap[settings.fontFamily],
      }}
    >
      <div style={{
        width: '100%',
        maxWidth: maxWidthMap[settings.readingWidth],
        display: 'flex',
        flexDirection: 'column',
      }}>
        {/* Book Header Card */}
        <div style={{
          display: 'flex',
          flexDirection: 'column',
          alignItems: 'center',
          textAlign: 'center',
          padding: '40px 24px 32px 24px',
          marginBottom: '32px',
          borderRadius: 'var(--radius-lg)',
          background: 'var(--bg-surface)',
          border: '1px solid var(--border-subtle)',
          boxShadow: 'var(--shadow-sm)',
        }}>
          {/* Subtle Book Cover Banner */}
          <div style={{
            width: '64px',
            height: '84px',
            borderRadius: 'var(--radius-md)',
            background: book.coverGradient,
            boxShadow: 'var(--shadow-md)',
            marginBottom: '18px',
            display: 'flex',
            alignItems: 'center',
            justifyContent: 'center',
            color: '#fff',
            fontWeight: 700,
            fontSize: '12px',
          }}>
            {book.type.toUpperCase()}
          </div>

          <h1 style={{
            fontSize: `${settings.fontSize * 1.6}px`,
            fontWeight: 800,
            color: 'var(--text-primary)',
            letterSpacing: '-0.02em',
            marginBottom: '6px',
          }}>
            {book.title}
          </h1>

          <p style={{
            fontSize: '14px',
            color: 'var(--text-secondary)',
            marginBottom: '16px',
          }}>
            Por <strong>{book.author}</strong>
          </p>

          {/* Metadata badges */}
          <div style={{
            display: 'flex',
            alignItems: 'center',
            justifyContent: 'center',
            gap: '16px',
            flexWrap: 'wrap',
          }}>
            <span style={{
              display: 'flex',
              alignItems: 'center',
              gap: '6px',
              fontSize: '12px',
              color: 'var(--text-muted)',
              background: 'var(--bg-surface-elevated)',
              padding: '4px 10px',
              borderRadius: 'var(--radius-full)',
              border: '1px solid var(--border-subtle)',
            }}>
              <BookOpen size={13} />
              {book.totalWords.toLocaleString()} palavras
            </span>

            <span style={{
              display: 'flex',
              alignItems: 'center',
              gap: '6px',
              fontSize: '12px',
              color: 'var(--text-muted)',
              background: 'var(--bg-surface-elevated)',
              padding: '4px 10px',
              borderRadius: 'var(--radius-full)',
              border: '1px solid var(--border-subtle)',
            }}>
              <Clock size={13} />
              ~{book.durationMinutes} min de áudio
            </span>

            <span style={{
              display: 'flex',
              alignItems: 'center',
              gap: '6px',
              fontSize: '12px',
              color: 'var(--text-muted)',
              background: 'var(--bg-surface-elevated)',
              padding: '4px 10px',
              borderRadius: 'var(--radius-full)',
              border: '1px solid var(--border-subtle)',
            }}>
              <Sparkles size={13} color="#f59e0b" />
              Narração com destaque em tempo real
            </span>
          </div>
        </div>

        {/* View mode banner if PDF Document View */}
        {viewMode === 'pdf' && (
          <div style={{
            padding: '12px 18px',
            borderRadius: 'var(--radius-md)',
            background: 'var(--bg-surface-elevated)',
            border: '1px solid var(--border-subtle)',
            marginBottom: '24px',
            fontSize: '13px',
            color: 'var(--text-secondary)',
            display: 'flex',
            alignItems: 'center',
            justifyContent: 'space-between',
          }}>
            <span>📄 Exibindo o texto estruturado do documento com numeração e seções.</span>
            <span style={{ fontSize: '11px', color: 'var(--accent-primary)', fontWeight: 600 }}>
              Sincronizado com áudio
            </span>
          </div>
        )}

        {/* Body Paragraphs */}
        <div style={{ color: 'var(--text-primary)' }}>
          {renderParagraphs()}
        </div>

        {/* End of book celebration notice */}
        <div style={{
          marginTop: '60px',
          padding: '30px',
          borderRadius: 'var(--radius-md)',
          background: 'var(--bg-surface)',
          border: '1px solid var(--border-subtle)',
          textAlign: 'center',
          display: 'flex',
          flexDirection: 'column',
          alignItems: 'center',
          gap: '8px',
        }}>
          <CheckCircle size={32} color="#10b981" />
          <h3 style={{ fontSize: '16px', fontWeight: 700, color: 'var(--text-primary)' }}>
            Fim do Conteúdo
          </h3>
          <p style={{ fontSize: '13px', color: 'var(--text-secondary)' }}>
            Você concluiu a leitura de <strong>{book.title}</strong>! Você pode navegar pela sua biblioteca para iniciar outro livro.
          </p>
        </div>

        {/* Floating Sync Button quando o usuário rolou manualmente */}
        {isDetachedFromVoice && (
          <button
            onClick={handleSyncWithVoice}
            style={{
              position: 'fixed',
              bottom: '95px',
              right: '28px',
              zIndex: 60,
              display: 'flex',
              alignItems: 'center',
              gap: '8px',
              padding: '10px 20px',
              borderRadius: '9999px',
              background: '#10b981',
              color: '#ffffff',
              border: '1px solid rgba(255, 255, 255, 0.25)',
              boxShadow: '0 10px 25px -3px rgba(16, 185, 129, 0.5), 0 4px 6px -2px rgba(0, 0, 0, 0.2)',
              fontSize: '11px',
              fontWeight: 900,
              textTransform: 'uppercase',
              letterSpacing: '0.08em',
              cursor: 'pointer',
              transition: 'all 200ms cubic-bezier(0.4, 0, 0.2, 1)',
            }}
            title="Voltar o foco para onde a voz está lendo agora"
          >
            <Sparkles size={14} />
            <span>Sincronizar com a Voz</span>
          </button>
        )}
      </div>
    </main>
  );
};
