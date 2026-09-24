import React, { useState } from 'react';
import { 
  BookOpen, 
  FileText, 
  MessageSquare, 
  Bookmark, 
  ArrowLeft
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
    <div style={{ flex: 1, display: 'flex', flexDirection: 'column', position: 'relative' }}>
      {/* Sub-header de Ações do Leitor */}
      <div style={{
        height: '48px',
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

      {/* Viewport Principal do Texto */}
      <ReaderView
        book={book}
        currentSentenceIndex={currentSentenceIndex}
        settings={settings}
        viewMode={viewMode}
        onSentenceClick={onSentenceClick}
        onPlayChapter={onPlayChapter}
      />
    </div>
  );
};
