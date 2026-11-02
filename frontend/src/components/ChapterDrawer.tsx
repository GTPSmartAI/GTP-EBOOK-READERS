import React, { useEffect, useRef } from 'react';
import { X, Bookmark, ChevronRight } from 'lucide-react';
import type { Book } from '../types';
import { useEscapeKey } from '../hooks/useEscapeKey';

interface ChapterDrawerProps {
  isOpen: boolean;
  onClose: () => void;
  book: Book;
  currentSentenceIndex: number;
  onJumpToSentence: (sentenceIndex: number) => void;
}

/** Lista de capítulos do livro aberto. Tudo funciona sem internet: a voz é gerada no aparelho. */
export const ChapterDrawer: React.FC<ChapterDrawerProps> = ({
  isOpen,
  onClose,
  book,
  currentSentenceIndex,
  onJumpToSentence,
}) => {
  useEscapeKey(isOpen, onClose);
  const currentRef = useRef<HTMLDivElement | null>(null);

  const currentChapterIdx = (() => {
    for (let i = book.chapters.length - 1; i >= 0; i--) {
      if (currentSentenceIndex >= book.chapters[i].startIndex) return i;
    }
    return 0;
  })();

  // Ao abrir, a lista já aparece no capítulo que está sendo lido
  useEffect(() => {
    if (isOpen) currentRef.current?.scrollIntoView({ block: 'center' });
  }, [isOpen]);

  if (!isOpen) return null;

  return (
    <div
      onClick={onClose}
      style={{
        position: 'fixed',
        inset: 0,
        zIndex: 90,
        display: 'flex',
        justifyContent: 'flex-start',
        backgroundColor: 'rgba(0, 0, 0, 0.55)',
        backdropFilter: 'blur(4px)',
      }}
    >
      <div
        className="fade-in"
        onClick={(e) => e.stopPropagation()}
        style={{
          width: '100%',
          maxWidth: '400px',
          height: '100%',
          background: 'var(--bg-surface)',
          borderRight: '1px solid var(--border-subtle)',
          boxShadow: 'var(--shadow-lg)',
          display: 'flex',
          flexDirection: 'column',
          paddingTop: 'env(safe-area-inset-top, 0px)',
        }}
      >
        {/* Header */}
        <div style={{
          display: 'flex',
          alignItems: 'center',
          justifyContent: 'space-between',
          padding: '18px 20px',
          borderBottom: '1px solid var(--border-subtle)',
        }}>
          <div style={{ display: 'flex', alignItems: 'center', gap: '8px' }}>
            <Bookmark size={18} color="var(--accent-primary)" />
            <h3 style={{ fontSize: '16px', fontWeight: 700, color: 'var(--text-primary)' }}>Capítulos</h3>
          </div>
          <button
            onClick={onClose}
            title="Fechar (Esc)"
            style={{
              width: '34px', height: '34px', borderRadius: '10px', display: 'flex', alignItems: 'center', justifyContent: 'center',
              color: 'var(--text-muted)', background: 'rgba(255,255,255,0.05)', border: '1px solid var(--border-subtle)', cursor: 'pointer',
            }}
          >
            <X size={18} />
          </button>
        </div>

        {/* Livro */}
        <div style={{ padding: '14px 20px', borderBottom: '1px solid var(--border-subtle)', background: 'var(--bg-surface-elevated)' }}>
          <h4 style={{ fontSize: '14px', fontWeight: 600, color: 'var(--text-primary)' }}>{book.title}</h4>
          <p style={{ fontSize: '12px', color: 'var(--text-muted)' }}>
            {book.chapters.length} capítulos · lendo o {currentChapterIdx + 1}º
          </p>
        </div>

        {/* Lista */}
        <div style={{ flex: 1, overflowY: 'auto', padding: '10px', overscrollBehavior: 'contain' }}>
          {book.chapters.map((ch, idx) => {
            const isCurrentChapter = idx === currentChapterIdx;
            return (
              <div
                key={ch.id || idx}
                ref={isCurrentChapter ? currentRef : null}
                style={{
                  borderRadius: 'var(--radius-sm)',
                  background: isCurrentChapter ? 'var(--highlight-sentence)' : 'transparent',
                  border: isCurrentChapter ? '1px solid var(--highlight-sentence-border)' : '1px solid transparent',
                  marginBottom: '4px',
                }}
              >
                <button
                  onClick={() => {
                    onJumpToSentence(ch.startIndex);
                    onClose();
                  }}
                  style={{
                    width: '100%',
                    display: 'flex',
                    alignItems: 'center',
                    justifyContent: 'space-between',
                    gap: '10px',
                    padding: '11px 12px',
                    textAlign: 'left',
                    cursor: 'pointer',
                  }}
                >
                  <div style={{ display: 'flex', flexDirection: 'column', gap: '2px', minWidth: 0 }}>
                    <span style={{ fontSize: '10px', fontWeight: 700, letterSpacing: '0.06em', textTransform: 'uppercase', color: 'var(--text-muted)' }}>
                      Capítulo {idx + 1}
                    </span>
                    <span style={{
                      fontSize: '13px',
                      fontWeight: isCurrentChapter ? 700 : 500,
                      color: isCurrentChapter ? 'var(--accent-primary)' : 'var(--text-primary)',
                      lineHeight: 1.35,
                    }}>
                      {ch.title}
                    </span>
                  </div>
                  <ChevronRight size={14} style={{ flexShrink: 0 }} color={isCurrentChapter ? 'var(--accent-primary)' : 'var(--text-muted)'} />
                </button>
              </div>
            );
          })}
        </div>
      </div>
    </div>
  );
};
