import React from 'react';
import { X, Bookmark, ChevronRight } from 'lucide-react';
import type { Book } from '../types';

interface ChapterDrawerProps {
  isOpen: boolean;
  onClose: () => void;
  book: Book;
  currentSentenceIndex: number;
  onJumpToSentence: (sentenceIndex: number) => void;
}

export const ChapterDrawer: React.FC<ChapterDrawerProps> = ({
  isOpen,
  onClose,
  book,
  currentSentenceIndex,
  onJumpToSentence,
}) => {
  if (!isOpen) return null;

  return (
    <div style={{
      position: 'fixed',
      inset: 0,
      zIndex: 90,
      display: 'flex',
      justifyContent: 'flex-start',
      backgroundColor: 'rgba(0, 0, 0, 0.5)',
      backdropFilter: 'blur(4px)',
    }}>
      <div 
        className="fade-in"
        style={{
          width: '100%',
          maxWidth: '380px',
          height: '100%',
          background: 'var(--bg-surface)',
          borderRight: '1px solid var(--border-subtle)',
          boxShadow: 'var(--shadow-lg)',
          display: 'flex',
          flexDirection: 'column',
        }}
      >
        {/* Header */}
        <div style={{
          display: 'flex',
          alignItems: 'center',
          justifyContent: 'space-between',
          padding: '20px',
          borderBottom: '1px solid var(--border-subtle)',
        }}>
          <div style={{ display: 'flex', alignItems: 'center', gap: '8px' }}>
            <Bookmark size={18} color="var(--accent-primary)" />
            <h3 style={{ fontSize: '16px', fontWeight: 700, color: 'var(--text-primary)' }}>
              Índice & Capítulos
            </h3>
          </div>

          <button onClick={onClose} style={{ color: 'var(--text-muted)' }}>
            <X size={18} />
          </button>
        </div>

        {/* Book Info Summary */}
        <div style={{ padding: '16px 20px', borderBottom: '1px solid var(--border-subtle)', background: 'var(--bg-surface-elevated)' }}>
          <h4 style={{ fontSize: '14px', fontWeight: 600, color: 'var(--text-primary)' }}>{book.title}</h4>
          <p style={{ fontSize: '12px', color: 'var(--text-muted)' }}>{book.author} • {book.chapters.length} seções</p>
        </div>

        {/* Chapters list */}
        <div style={{ flex: 1, overflowY: 'auto', padding: '12px' }}>
          {book.chapters.map((ch, idx) => {
            // Check if current sentence falls within this chapter
            const nextCh = book.chapters[idx + 1];
            const isCurrentChapter =
              currentSentenceIndex >= ch.startIndex &&
              (nextCh ? currentSentenceIndex < nextCh.startIndex : true);

            return (
              <button
                key={ch.id}
                onClick={() => {
                  onJumpToSentence(ch.startIndex);
                  onClose();
                }}
                style={{
                  width: '100%',
                  display: 'flex',
                  alignItems: 'center',
                  justifyContent: 'space-between',
                  padding: '12px 14px',
                  borderRadius: 'var(--radius-sm)',
                  textAlign: 'left',
                  background: isCurrentChapter ? 'var(--highlight-sentence)' : 'transparent',
                  border: isCurrentChapter ? '1px solid var(--highlight-sentence-border)' : '1px solid transparent',
                  marginBottom: '6px',
                }}
              >
                <div style={{ display: 'flex', flexDirection: 'column', gap: '2px' }}>
                  <span style={{
                    fontSize: '13px',
                    fontWeight: isCurrentChapter ? 700 : 500,
                    color: isCurrentChapter ? 'var(--accent-primary)' : 'var(--text-primary)',
                  }}>
                    {ch.title}
                  </span>
                  <span style={{ fontSize: '11px', color: 'var(--text-muted)' }}>
                    Inicia na frase #{ch.startIndex + 1}
                  </span>
                </div>

                <ChevronRight size={14} color={isCurrentChapter ? 'var(--accent-primary)' : 'var(--text-muted)'} />
              </button>
            );
          })}
        </div>
      </div>
    </div>
  );
};
