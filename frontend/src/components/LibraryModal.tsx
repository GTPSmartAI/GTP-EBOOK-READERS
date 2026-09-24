import React, { useState } from 'react';
import { X, BookOpen, Clock, Trash2, Plus } from 'lucide-react';
import type { Book } from '../types';

interface LibraryModalProps {
  isOpen: boolean;
  onClose: () => void;
  books: Book[];
  currentBookId: string;
  onSelectBook: (book: Book) => void;
  onDeleteBook: (bookId: string) => void;
  onOpenUpload: () => void;
}

export const LibraryModal: React.FC<LibraryModalProps> = ({
  isOpen,
  onClose,
  books,
  currentBookId,
  onSelectBook,
  onDeleteBook,
  onOpenUpload,
}) => {
  const [filterType, setFilterType] = useState<string>('all');

  if (!isOpen) return null;

  const filteredBooks = books.filter((b) => {
    if (filterType === 'pdf') return b.type === 'pdf';
    if (filterType === 'epub') return b.type === 'epub';
    if (filterType === 'article') return b.type === 'article';
    return true;
  });

  return (
    <div style={{
      position: 'fixed',
      inset: 0,
      zIndex: 100,
      display: 'flex',
      alignItems: 'center',
      justifyContent: 'center',
      backgroundColor: 'rgba(0, 0, 0, 0.65)',
      backdropFilter: 'blur(8px)',
      padding: '20px',
    }}>
      <div 
        className="slide-up"
        style={{
          width: '100%',
          maxWidth: '850px',
          maxHeight: '90vh',
          background: 'var(--bg-surface)',
          borderRadius: 'var(--radius-lg)',
          border: '1px solid var(--border-subtle)',
          boxShadow: 'var(--shadow-lg)',
          display: 'flex',
          flexDirection: 'column',
          overflow: 'hidden',
        }}
      >
        {/* Header */}
        <div style={{
          display: 'flex',
          alignItems: 'center',
          justifyContent: 'space-between',
          padding: '20px 24px',
          borderBottom: '1px solid var(--border-subtle)',
        }}>
          <div>
            <div style={{ display: 'flex', alignItems: 'center', gap: '8px' }}>
              <BookOpen size={18} color="var(--accent-primary)" />
              <h2 style={{ fontSize: '18px', fontWeight: 700, color: 'var(--text-primary)' }}>
                Sua Biblioteca de Leituras
              </h2>
            </div>
            <p style={{ fontSize: '13px', color: 'var(--text-secondary)', marginTop: '2px' }}>
              Escolha uma obra para ouvir ou faça upload de um novo PDF/Ebook.
            </p>
          </div>

          <div style={{ display: 'flex', alignItems: 'center', gap: '8px' }}>
            <button
              onClick={() => {
                onClose();
                onOpenUpload();
              }}
              style={{
                display: 'flex',
                alignItems: 'center',
                gap: '6px',
                padding: '7px 14px',
                borderRadius: 'var(--radius-md)',
                background: 'linear-gradient(135deg, var(--accent-primary) 0%, #7c3aed 100%)',
                color: '#ffffff',
                fontSize: '12px',
                fontWeight: 600,
              }}
            >
              <Plus size={15} />
              <span>Importar Arquivo</span>
            </button>

            <button
              onClick={onClose}
              style={{ padding: '8px', color: 'var(--text-muted)' }}
            >
              <X size={18} />
            </button>
          </div>
        </div>

        {/* Filter Bar */}
        <div style={{
          display: 'flex',
          gap: '8px',
          padding: '12px 24px',
          borderBottom: '1px solid var(--border-subtle)',
          background: 'rgba(255, 255, 255, 0.02)',
        }}>
          {[
            { id: 'all', label: 'Todos os Títulos' },
            { id: 'pdf', label: 'Documentos PDF' },
            { id: 'epub', label: 'Livros & Ebooks' },
            { id: 'article', label: 'Artigos & Textos' },
          ].map((tab) => (
            <button
              key={tab.id}
              onClick={() => setFilterType(tab.id)}
              style={{
                padding: '4px 12px',
                borderRadius: 'var(--radius-full)',
                fontSize: '12px',
                fontWeight: 500,
                background: filterType === tab.id ? 'var(--accent-primary)' : 'var(--bg-surface-elevated)',
                color: filterType === tab.id ? '#ffffff' : 'var(--text-secondary)',
                border: '1px solid var(--border-subtle)',
              }}
            >
              {tab.label}
            </button>
          ))}
        </div>

        {/* Book Grid */}
        <div style={{
          flex: 1,
          overflowY: 'auto',
          padding: '24px',
          display: 'grid',
          gridTemplateColumns: 'repeat(auto-fill, minmax(240px, 1fr))',
          gap: '18px',
        }}>
          {filteredBooks.map((book) => {
            const isCurrent = book.id === currentBookId;
            return (
              <div
                key={book.id}
                onClick={() => {
                  onSelectBook(book);
                  onClose();
                }}
                className="floating-card"
                style={{
                  display: 'flex',
                  flexDirection: 'column',
                  borderRadius: 'var(--radius-md)',
                  padding: '16px',
                  cursor: 'pointer',
                  border: isCurrent ? '2px solid var(--accent-primary)' : '1px solid var(--border-subtle)',
                  background: isCurrent ? 'var(--bg-surface-elevated)' : 'var(--bg-surface)',
                  position: 'relative',
                }}
              >
                {/* Book Cover Banner */}
                <div style={{
                  height: '110px',
                  borderRadius: 'var(--radius-sm)',
                  background: book.coverGradient,
                  boxShadow: 'var(--shadow-sm)',
                  display: 'flex',
                  flexDirection: 'column',
                  justifyContent: 'space-between',
                  padding: '12px',
                  color: '#ffffff',
                }}>
                  <div style={{ display: 'flex', justifyContent: 'space-between', alignItems: 'center' }}>
                    <span style={{
                      fontSize: '10px',
                      padding: '2px 6px',
                      borderRadius: '4px',
                      background: 'rgba(0, 0, 0, 0.35)',
                      fontWeight: 700,
                      letterSpacing: '0.05em',
                    }}>
                      {book.type.toUpperCase()}
                    </span>
                    {isCurrent && (
                      <span style={{
                        fontSize: '10px',
                        padding: '2px 6px',
                        borderRadius: '4px',
                        background: '#10b981',
                        fontWeight: 600,
                      }}>
                        LENDO AGORA
                      </span>
                    )}
                  </div>
                  <h3 style={{
                    fontSize: '14px',
                    fontWeight: 700,
                    textShadow: '0 2px 4px rgba(0,0,0,0.5)',
                    lineHeight: 1.2,
                  }}>
                    {book.title}
                  </h3>
                </div>

                {/* Details */}
                <div style={{ marginTop: '12px', display: 'flex', flexDirection: 'column', gap: '4px' }}>
                  <span style={{ fontSize: '12px', color: 'var(--text-secondary)', fontWeight: 500 }}>
                    {book.author}
                  </span>

                  <div style={{
                    display: 'flex',
                    alignItems: 'center',
                    justifyContent: 'space-between',
                    fontSize: '11px',
                    color: 'var(--text-muted)',
                    marginTop: '6px',
                  }}>
                    <span style={{ display: 'flex', alignItems: 'center', gap: '4px' }}>
                      <Clock size={12} />
                      ~{book.durationMinutes} min
                    </span>
                    <span>{book.totalWords.toLocaleString()} palavras</span>
                  </div>

                  {/* Reading progress bar */}
                  <div style={{
                    width: '100%',
                    height: '4px',
                    background: 'rgba(255, 255, 255, 0.08)',
                    borderRadius: '2px',
                    marginTop: '8px',
                    overflow: 'hidden',
                  }}>
                    <div style={{
                      width: `${book.readingProgress}%`,
                      height: '100%',
                      background: 'var(--accent-primary)',
                      borderRadius: '2px',
                    }} />
                  </div>
                </div>

                {/* Delete button if uploaded */}
                {book.id.startsWith('book-') && (
                  <button
                    onClick={(e) => {
                      e.stopPropagation();
                      onDeleteBook(book.id);
                    }}
                    style={{
                      position: 'absolute',
                      top: '8px',
                      right: '8px',
                      background: 'rgba(0, 0, 0, 0.5)',
                      color: '#f87171',
                      padding: '4px',
                      borderRadius: '4px',
                    }}
                    title="Excluir este livro"
                  >
                    <Trash2 size={13} />
                  </button>
                )}
              </div>
            );
          })}
        </div>
      </div>
    </div>
  );
};
