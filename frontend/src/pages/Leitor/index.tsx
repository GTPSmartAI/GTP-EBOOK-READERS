import React, { useState } from 'react';
import { 
  BookOpen, 
  FileText, 
  MessageSquare, 
  Bookmark, 
  ArrowLeft,
  ChevronLeft,
  ChevronRight
} from 'lucide-react';
import type { Book, ReaderSettings } from '../../types';
import { ReaderView } from '../../components/ReaderView';

interface LeitorPageProps {
  book: Book | null | undefined;
  currentSentenceIndex: number;
  settings: ReaderSettings;
  onSentenceClick: (sentenceIndex: number) => void;
  onPlayChapter: (startIndex: number) => void;
  onOpenChapters: () => void;
  onOpenAIChat: () => void;
  onBackToPainel: () => void;
  onOpenUpload?: () => void;
}

export const Leitor: React.FC<LeitorPageProps> = ({
  book,
  currentSentenceIndex,
  settings,
  onSentenceClick,
  onPlayChapter,
  onOpenChapters,
  onOpenAIChat,
  onBackToPainel,
  onOpenUpload,
}) => {
  const [viewMode, setViewMode] = useState<'flow' | 'pdf'>('flow');
  const [isSidebarOpen, setIsSidebarOpen] = useState(true);

  if (!book) {
    return (
      <div style={{
        flex: 1,
        display: 'flex',
        flexDirection: 'column',
        alignItems: 'center',
        justifyContent: 'center',
        padding: '32px',
        textAlign: 'center',
        gap: '20px',
      }}>
        <div style={{
          width: '72px',
          height: '72px',
          borderRadius: '50%',
          background: 'rgba(16, 185, 129, 0.1)',
          display: 'flex',
          alignItems: 'center',
          justifyContent: 'center',
          color: '#10b981',
          border: '1px solid rgba(16, 185, 129, 0.25)',
        }}>
          <BookOpen size={36} />
        </div>

        <div style={{ display: 'flex', flexDirection: 'column', gap: '8px', maxWidth: '460px' }}>
          <h2 style={{ fontSize: '22px', fontWeight: 900, color: '#f8fafc', textTransform: 'uppercase' }}>
            Nenhum livro selecionado
          </h2>
          <p style={{ fontSize: '14px', color: '#94a3b8', lineHeight: 1.5 }}>
            Sua biblioteca está limpa sem dados fictícios. Suba um PDF ou selecione um documento do seu painel para começar a leitura e reprodução sincronizada.
          </p>
        </div>

        <div style={{ display: 'flex', gap: '12px', marginTop: '8px' }}>
          <button
            onClick={onBackToPainel}
            style={{
              display: 'flex',
              alignItems: 'center',
              gap: '8px',
              padding: '12px 20px',
              borderRadius: '14px',
              background: 'rgba(255, 255, 255, 0.05)',
              border: '1px solid rgba(255, 255, 255, 0.1)',
              color: '#f8fafc',
              fontSize: '13px',
              fontWeight: 700,
            }}
          >
            <ArrowLeft size={16} />
            <span>Voltar ao Painel</span>
          </button>

          {onOpenUpload && (
            <button
              onClick={onOpenUpload}
              style={{
                display: 'flex',
                alignItems: 'center',
                gap: '8px',
                padding: '12px 24px',
                borderRadius: '14px',
                background: 'linear-gradient(135deg, #10b981 0%, #059669 100%)',
                color: '#ffffff',
                fontSize: '13px',
                fontWeight: 800,
                textTransform: 'uppercase',
                letterSpacing: '0.05em',
                boxShadow: '0 8px 20px rgba(16, 185, 129, 0.3)',
              }}
            >
              <span>Subir Primeiro PDF</span>
            </button>
          )}
        </div>
      </div>
    );
  }

  return (
    <div style={{
      flex: 1,
      height: 'calc(100vh - 60px)',
      maxHeight: 'calc(100vh - 60px)',
      minHeight: 0,
      display: 'flex',
      flexDirection: 'column',
      position: 'relative',
      overflow: 'hidden',
    }}>
      {/* Sub-header de Ações do Leitor */}
      <div style={{
        height: '48px',
        minHeight: '48px',
        background: 'var(--bg-surface)',
        borderBottom: '1px solid var(--border-subtle)',
        display: 'flex',
        alignItems: 'center',
        justifyContent: 'space-between',
        padding: '0 24px',
      }}>
        {/* Voltar ao Painel */}
        <button
          onClick={onBackToPainel}
          style={{
            display: 'flex',
            alignItems: 'center',
            gap: '6px',
            fontSize: '12px',
            fontWeight: 700,
            color: '#94a3b8',
          }}
        >
          <ArrowLeft size={15} />
          <span>Voltar ao Painel</span>
        </button>

        {/* View Mode Toggle */}
        <div style={{
          display: 'flex',
          background: 'rgba(255, 255, 255, 0.04)',
          borderRadius: '10px',
          padding: '2px',
          border: '1px solid var(--border-subtle)',
        }}>
          <button
            onClick={() => setViewMode('flow')}
            style={{
              display: 'flex',
              alignItems: 'center',
              gap: '6px',
              padding: '4px 10px',
              borderRadius: '8px',
              fontSize: '11px',
              fontWeight: 700,
              background: viewMode === 'flow' ? '#10b981' : 'transparent',
              color: viewMode === 'flow' ? '#ffffff' : '#94a3b8',
            }}
          >
            <BookOpen size={13} />
            <span>Leitura Fluida</span>
          </button>

          <button
            onClick={() => setViewMode('pdf')}
            style={{
              display: 'flex',
              alignItems: 'center',
              gap: '6px',
              padding: '4px 10px',
              borderRadius: '8px',
              fontSize: '11px',
              fontWeight: 700,
              background: viewMode === 'pdf' ? '#10b981' : 'transparent',
              color: viewMode === 'pdf' ? '#ffffff' : '#94a3b8',
            }}
          >
            <FileText size={13} />
            <span>Documento Original</span>
          </button>
        </div>

        {/* Ferramentas do Leitor */}
        <div style={{ display: 'flex', alignItems: 'center', gap: '8px' }}>
          <button
            onClick={onOpenChapters}
            style={{
              display: 'flex',
              alignItems: 'center',
              gap: '6px',
              padding: '5px 10px',
              borderRadius: '8px',
              background: 'rgba(255, 255, 255, 0.04)',
              border: '1px solid var(--border-subtle)',
              color: '#94a3b8',
              fontSize: '12px',
              fontWeight: 600,
            }}
          >
            <Bookmark size={14} color="#10b981" />
            <span>Capítulos</span>
          </button>

          <button
            onClick={onOpenAIChat}
            style={{
              display: 'flex',
              alignItems: 'center',
              gap: '6px',
              padding: '5px 10px',
              borderRadius: '8px',
              background: 'rgba(16, 185, 129, 0.1)',
              border: '1px solid rgba(16, 185, 129, 0.3)',
              color: '#10b981',
              fontSize: '12px',
              fontWeight: 700,
            }}
          >
            <MessageSquare size={14} />
            <span>Pergunte ao Livro</span>
          </button>
        </div>
      </div>

      {/* Viewport Principal com Barra Lateral Esquerda de Capítulos */}
      <div style={{
        flex: 1,
        display: 'flex',
        minHeight: 0,
        height: 'calc(100% - 48px)',
        overflow: 'hidden',
        position: 'relative',
      }}>
        {/* Barra Lateral de Capítulos (Colapsável) */}
        <aside style={{
          width: isSidebarOpen ? '280px' : '0px',
          minWidth: isSidebarOpen ? '280px' : '0px',
          background: 'rgba(10, 15, 29, 0.95)',
          borderRight: isSidebarOpen ? '1px solid var(--border-subtle)' : 'none',
          display: 'flex',
          flexDirection: 'column',
          transition: 'all 250ms cubic-bezier(0.4, 0, 0.2, 1)',
          overflow: 'hidden',
          zIndex: 20,
        }}>
          {/* Header da Sidebar de Capítulos */}
          <div style={{
            padding: '16px 18px',
            borderBottom: '1px solid var(--border-subtle)',
            display: 'flex',
            alignItems: 'center',
            justifyContent: 'space-between',
            background: 'rgba(15, 23, 42, 0.6)',
          }}>
            <div style={{ display: 'flex', alignItems: 'center', gap: '8px' }}>
              <Bookmark size={15} color="#10b981" />
              <span style={{
                fontSize: '11px',
                fontWeight: 900,
                textTransform: 'uppercase',
                letterSpacing: '0.1em',
                color: '#f8fafc',
              }}>
                Capítulos ({book.chapters.length})
              </span>
            </div>

            <button
              onClick={() => setIsSidebarOpen(false)}
              style={{
                width: '28px',
                height: '28px',
                borderRadius: '8px',
                background: 'rgba(255, 255, 255, 0.05)',
                border: '1px solid rgba(255, 255, 255, 0.08)',
                color: '#94a3b8',
                display: 'flex',
                alignItems: 'center',
                justifyContent: 'center',
                cursor: 'pointer',
              }}
              title="Minimizar barra de capítulos"
            >
              <ChevronLeft size={16} />
            </button>
          </div>

          {/* Lista de Capítulos com Rolagem Limpa */}
          <div style={{
            flex: 1,
            overflowY: 'auto',
            padding: '8px',
            display: 'flex',
            flexDirection: 'column',
            gap: '2px',
          }}>
            {book.chapters.map((ch, idx) => {
              const nextChapter = book.chapters[idx + 1];
              const isCurrentChapter = currentSentenceIndex >= ch.startIndex && 
                (!nextChapter || currentSentenceIndex < nextChapter.startIndex);

              return (
                <button
                  key={ch.id || `ch-${idx}`}
                  onClick={() => onPlayChapter(ch.startIndex)}
                  style={{
                    padding: '10px 14px',
                    borderRadius: '10px',
                    textAlign: 'left',
                    background: isCurrentChapter ? 'rgba(16, 185, 129, 0.12)' : 'transparent',
                    border: isCurrentChapter ? '1px solid rgba(16, 185, 129, 0.3)' : '1px solid transparent',
                    color: isCurrentChapter ? '#10b981' : '#94a3b8',
                    cursor: 'pointer',
                    display: 'flex',
                    flexDirection: 'column',
                    gap: '4px',
                    transition: 'all 150ms ease',
                  }}
                  onMouseEnter={(e) => {
                    if (!isCurrentChapter) {
                      e.currentTarget.style.background = 'rgba(255, 255, 255, 0.04)';
                      e.currentTarget.style.color = '#f1f5f9';
                    }
                  }}
                  onMouseLeave={(e) => {
                    if (!isCurrentChapter) {
                      e.currentTarget.style.background = 'transparent';
                      e.currentTarget.style.color = '#94a3b8';
                    }
                  }}
                >
                  <div style={{ display: 'flex', alignItems: 'center', justifyContent: 'space-between' }}>
                    <span style={{
                      fontSize: '10px',
                      fontWeight: 800,
                      textTransform: 'uppercase',
                      letterSpacing: '0.08em',
                      color: isCurrentChapter ? '#10b981' : '#64748b',
                    }}>
                      Capítulo {idx + 1}
                    </span>
                    {isCurrentChapter && (
                      <span style={{
                        width: '6px',
                        height: '6px',
                        borderRadius: '50%',
                        background: '#10b981',
                        boxShadow: '0 0 8px #10b981',
                      }} />
                    )}
                  </div>
                  <span style={{
                    fontSize: '13px',
                    fontWeight: isCurrentChapter ? 700 : 500,
                    whiteSpace: 'nowrap',
                    overflow: 'hidden',
                    textOverflow: 'ellipsis',
                  }}>
                    {ch.title}
                  </span>
                </button>
              );
            })}
          </div>
        </aside>

        {/* Botão de Expandir Barra Lateral (quando recolhida) */}
        {!isSidebarOpen && (
          <button
            onClick={() => setIsSidebarOpen(true)}
            style={{
              position: 'absolute',
              top: '12px',
              left: '12px',
              zIndex: 30,
              display: 'flex',
              alignItems: 'center',
              gap: '6px',
              padding: '8px 12px',
              borderRadius: '10px',
              background: 'rgba(15, 23, 42, 0.9)',
              backdropFilter: 'blur(10px)',
              border: '1px solid rgba(255, 255, 255, 0.1)',
              color: '#f8fafc',
              fontSize: '11px',
              fontWeight: 800,
              textTransform: 'uppercase',
              letterSpacing: '0.05em',
              boxShadow: '0 4px 12px rgba(0, 0, 0, 0.3)',
              cursor: 'pointer',
            }}
            title="Expandir barra de capítulos"
          >
            <ChevronRight size={15} color="#10b981" />
            <span>Capítulos</span>
          </button>
        )}

        {/* Leitor Principal Fluido */}
        <div style={{
          flex: 1,
          display: 'flex',
          flexDirection: 'column',
          minHeight: 0,
          height: '100%',
          overflow: 'hidden',
        }}>
          <ReaderView
            book={book}
            currentSentenceIndex={currentSentenceIndex}
            settings={settings}
            viewMode={viewMode}
            onSentenceClick={onSentenceClick}
            onPlayChapter={onPlayChapter}
          />
        </div>
      </div>
    </div>
  );
};
