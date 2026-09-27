import React from 'react';
import { 
  BookOpen,
  MessageSquare, 
  Bookmark, 
  ArrowLeft
} from 'lucide-react';
import type { Book, ReaderSettings } from '../../types';
import { ReaderView } from '../../components/ReaderView';
import { useIsMobile } from '../../hooks/useIsMobile';

interface LeitorPageProps {
  book: Book | null | undefined;
  currentSentenceIndex: number;
  settings: ReaderSettings;
  isTheatreMode?: boolean;
  onOpenCastModal?: () => void;
  onSentenceClick: (sentenceIndex: number) => void;
  onPlayChapter: (startIndex: number) => void;
  onWordClick?: (sentenceIndex: number, wordIndex: number, word: string) => void;
  onOpenChapters: () => void;
  onOpenAIChat: () => void;
  onBackToPainel: () => void;
  onOpenUpload?: () => void;
  contentLoad?: { progress: number; failed: boolean } | null;
  onRetryContent?: () => void;
}

export const Leitor: React.FC<LeitorPageProps> = ({
  book,
  currentSentenceIndex,
  settings,
  isTheatreMode = false,
  onOpenCastModal,
  onSentenceClick,
  onPlayChapter,
  onWordClick,
  onOpenChapters,
  onOpenAIChat,
  onBackToPainel,
  onOpenUpload,
  contentLoad,
  onRetryContent,
}) => {
  const isMobile = useIsMobile();

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
      {/* Celular: ações em ícones com rótulo curto, todas cabem na largura da tela */}
      {isMobile ? (
        <div style={{
          display: 'flex',
          alignItems: 'stretch',
          gap: '6px',
          padding: '6px 10px',
          background: 'var(--bg-surface)',
          borderBottom: '1px solid var(--border-subtle)',
          flexShrink: 0,
        }}>
          {[
            { key: 'back', icon: <ArrowLeft size={18} />, label: 'Painel', onClick: onBackToPainel, active: false },
            ...(onOpenCastModal
              ? [{ key: 'cast', icon: <span style={{ fontSize: '16px', lineHeight: 1 }}>🎭</span>, label: isTheatreMode ? 'Vozes ON' : 'Vozes', onClick: onOpenCastModal, active: isTheatreMode }]
              : []),
            { key: 'chapters', icon: <Bookmark size={18} />, label: 'Capítulos', onClick: onOpenChapters, active: false },
            { key: 'ai', icon: <MessageSquare size={18} />, label: 'Perguntar', onClick: onOpenAIChat, active: false },
          ].map((action) => (
            <button
              key={action.key}
              onClick={action.onClick}
              style={{
                flex: 1,
                display: 'flex',
                flexDirection: 'column',
                alignItems: 'center',
                justifyContent: 'center',
                gap: '3px',
                padding: '6px 2px',
                borderRadius: '10px',
                background: action.active ? 'rgba(16, 185, 129, 0.15)' : 'rgba(255, 255, 255, 0.04)',
                border: action.active ? '1px solid rgba(16, 185, 129, 0.4)' : '1px solid var(--border-subtle)',
                color: action.active ? '#10b981' : '#cbd5e1',
                fontSize: '11px',
                fontWeight: 700,
              }}
            >
              {action.icon}
              <span>{action.label}</span>
            </button>
          ))}
        </div>
      ) : (
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

        {/* Ferramentas do Leitor */}
        <div style={{ display: 'flex', alignItems: 'center', gap: '8px' }}>
          {onOpenCastModal && (
            <button
              onClick={onOpenCastModal}
              style={{
                display: 'flex',
                alignItems: 'center',
                gap: '6px',
                padding: '5px 12px',
                borderRadius: '8px',
                background: isTheatreMode ? 'rgba(16, 185, 129, 0.15)' : 'rgba(255, 255, 255, 0.04)',
                border: isTheatreMode ? '1px solid rgba(16, 185, 129, 0.4)' : '1px solid var(--border-subtle)',
                color: isTheatreMode ? '#10b981' : '#cbd5e1',
                fontSize: '12px',
                fontWeight: 700,
                cursor: 'pointer',
              }}
              title="Configurar vozes dos personagens (Áudio-Teatro)"
            >
              <span>🎭</span>
              <span>Vozes do livro</span>
              {isTheatreMode && (
                <span style={{
                  fontSize: '9px',
                  background: '#10b981',
                  color: '#000000',
                  fontWeight: 900,
                  padding: '1px 5px',
                  borderRadius: '9999px',
                  textTransform: 'uppercase',
                }}>
                  ON
                </span>
              )}
            </button>
          )}

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
      )}

      {/* Viewport Principal (capítulos ficam no botão Capítulos do topo) */}
      <div style={{
        flex: 1,
        display: 'flex',
        minHeight: 0,
        height: 'calc(100% - 48px)',
        overflow: 'hidden',
        position: 'relative',
      }}>
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
            onSentenceClick={onSentenceClick}
            onPlayChapter={onPlayChapter}
            onWordClick={onWordClick}
            contentLoad={contentLoad}
            onRetryContent={onRetryContent}
          />
        </div>
      </div>
    </div>
  );
};
