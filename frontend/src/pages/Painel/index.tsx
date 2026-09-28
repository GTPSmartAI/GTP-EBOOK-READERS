import React, { useState } from 'react';
import {
  BookOpen,
  Play,
  Upload,
  Heart,
  Volume2,
  ChevronRight,
  Flame,
  CheckCircle2,
  Trash2,
  Loader2,
  Folder,
  FolderInput
} from 'lucide-react';
import type { Book, BookFolder, VoiceOption } from '../../types';
import type { FolderResult } from '../../services/api';
import { useIsMobile } from '../../hooks/useIsMobile';
import { FolderBar, MoveToFolderSheet } from './Folders';

interface PainelProps {
  books: Book[];
  currentBook: Book;
  favoriteVoiceIds: string[];
  allVoices: VoiceOption[];
  onOpenBookInReader: (book: Book) => void;
  onOpenUpload: () => void;
  onNavigateToVoices: () => void;
  onToggleFavoriteVoice: (voiceId: string) => void;
  onPreviewVoice: (voice: VoiceOption) => void;
  onDeleteBook: (bookId: string) => void;
  folders: BookFolder[];
  /** 'all' = todos, 'none' = sem pasta, ou o id da pasta aberta */
  activeFolderId: string;
  onSelectFolder: (id: string) => void;
  onCreateFolder: (name: string, openIt?: boolean) => Promise<FolderResult<BookFolder>>;
  onRenameFolder: (id: string, name: string) => Promise<string | null>;
  onDeleteFolder: (id: string) => Promise<string | null>;
  onMoveBookToFolder: (bookId: string, folderId: string | null) => Promise<string | null>;
  userName: string;
  /** Palavras que a voz leu de verdade (estatísticas); null enquanto carrega */
  wordsReadTotal?: number | null;
}

export const Painel: React.FC<PainelProps> = ({
  books,
  currentBook,
  favoriteVoiceIds,
  allVoices,
  onOpenBookInReader,
  onOpenUpload,
  onNavigateToVoices,
  onToggleFavoriteVoice,
  onPreviewVoice,
  onDeleteBook,
  folders,
  activeFolderId,
  onSelectFolder,
  onCreateFolder,
  onRenameFolder,
  onDeleteFolder,
  onMoveBookToFolder,
  userName,
  wordsReadTotal = null,
}) => {
  const isMobile = useIsMobile();
  const favoriteVoices = allVoices.filter((v) => favoriteVoiceIds.includes(v.id));
  const [movingBook, setMovingBook] = useState<Book | null>(null);

  const folderNameById = new Map(folders.map((f) => [f.id, f.name]));
  const visibleBooks = activeFolderId === 'all'
    ? books
    : books.filter((b) => (b.folderId ?? null) === (activeFolderId === 'none' ? null : activeFolderId));
  const activeFolderName = folderNameById.get(activeFolderId);

  const totalWordsRead = wordsReadTotal ?? 0;
  const totalBooks = books.length;
  const completedBooks = books.filter((b) => b.readingProgress >= 100).length;

  return (
    <div style={{
      flex: 1,
      overflowY: 'auto',
      overflowX: 'hidden',
      // Celular: margem menor e espaço embaixo para o player (mais alto no celular)
      padding: isMobile ? '16px 12px 210px' : '32px 24px 120px 24px',
      maxWidth: '1240px',
      margin: '0 auto',
      width: '100%',
      display: 'flex',
      flexDirection: 'column',
      gap: isMobile ? '24px' : '32px',
    }}>
      {/* Welcome Banner (Soft & Bold Cyber-Dark) */}
      <div
        className="floating-card"
        style={{
          padding: isMobile ? '20px 16px' : '32px',
          borderRadius: isMobile ? '20px' : '28px',
          background: 'linear-gradient(135deg, rgba(16, 185, 129, 0.12) 0%, rgba(12, 16, 21, 0.95) 70%)',
          border: '1px solid rgba(16, 185, 129, 0.25)',
          display: 'flex',
          justifyContent: 'space-between',
          alignItems: 'center',
          flexWrap: 'wrap',
          gap: '24px',
        }}
      >
        <div style={{ display: 'flex', flexDirection: 'column', gap: '8px', maxWidth: '600px' }}>
          <div style={{ display: 'flex', alignItems: 'center', gap: '8px' }}>
            <span style={{
              fontSize: '10px',
              fontWeight: 800,
              textTransform: 'uppercase',
              letterSpacing: '0.1em',
              color: '#10b981',
              background: 'rgba(16, 185, 129, 0.15)',
              padding: '3px 8px',
              borderRadius: '6px',
            }}>
              PAINEL GERAL
            </span>
            <span style={{ fontSize: '12px', color: '#94a3b8' }}>Aedolia</span>
          </div>

          <h1 style={{
            fontSize: isMobile ? '22px' : '28px',
            fontWeight: 900,
            color: '#f8fafc',
            letterSpacing: '-0.025em',
            textTransform: 'uppercase',
          }}>
            Olá, <span style={{ color: '#10b981' }}>{userName}</span>!
          </h1>

          <p style={{ fontSize: '14px', color: '#94a3b8', lineHeight: 1.5 }}>
            Aqui está o status da sua biblioteca. Você pode continuar suas leituras de onde parou ou ouvir suas vozes favoritas.
          </p>

          {/* Quick Metrics */}
          <div style={{ display: 'flex', gap: '20px', marginTop: '8px', flexWrap: 'wrap' }}>
            <div style={{ display: 'flex', alignItems: 'center', gap: '8px' }}>
              <BookOpen size={16} color="#10b981" />
              <span style={{ fontSize: '13px', fontWeight: 600, color: '#f8fafc' }}>
                {totalBooks} {totalBooks === 1 ? 'Livro' : 'Livros'}
              </span>
            </div>

            <div style={{ display: 'flex', alignItems: 'center', gap: '8px' }}>
              <Flame size={16} color="#f59e0b" />
              <span style={{ fontSize: '13px', fontWeight: 600, color: '#f8fafc' }}>
                {wordsReadTotal === null ? '…' : totalWordsRead.toLocaleString('pt-BR')} palavras lidas
              </span>
            </div>

            <div style={{ display: 'flex', alignItems: 'center', gap: '8px' }}>
              <CheckCircle2 size={16} color="#10b981" />
              <span style={{ fontSize: '13px', fontWeight: 600, color: '#f8fafc' }}>
                {completedBooks} concluídos
              </span>
            </div>
          </div>
        </div>

        {/* Action Button */}
        <div style={{ display: 'flex', gap: '12px', flexWrap: 'wrap', width: isMobile ? '100%' : undefined }}>
          {books.length > 0 && currentBook ? (
            <button
              onClick={() => onOpenBookInReader(currentBook)}
              style={{
                display: 'flex',
                flex: isMobile ? '1 1 auto' : undefined,
                justifyContent: 'center',
                alignItems: 'center',
                gap: '10px',
                padding: '14px 22px',
                borderRadius: '16px',
                background: 'linear-gradient(135deg, #10b981 0%, #059669 100%)',
                color: '#ffffff',
                fontSize: '13px',
                fontWeight: 800,
                textTransform: 'uppercase',
                letterSpacing: '0.06em',
                boxShadow: '0 10px 25px rgba(16, 185, 129, 0.3)',
              }}
            >
              <Play size={16} />
              <span>Continuar Lendo</span>
            </button>
          ) : null}

          <button
            onClick={onOpenUpload}
            style={{
              display: 'flex',
              flex: isMobile ? '1 1 auto' : undefined,
              justifyContent: 'center',
              alignItems: 'center',
              gap: '8px',
              padding: '14px 20px',
              borderRadius: '16px',
              background: books.length === 0 ? 'linear-gradient(135deg, #10b981 0%, #059669 100%)' : 'rgba(255, 255, 255, 0.05)',
              border: books.length === 0 ? 'none' : '1px solid rgba(255, 255, 255, 0.1)',
              color: '#ffffff',
              fontSize: '13px',
              fontWeight: 800,
              boxShadow: books.length === 0 ? '0 10px 25px rgba(16, 185, 129, 0.3)' : 'none',
            }}
          >
            <Upload size={16} color="#ffffff" />
            <span>{books.length === 0 ? 'Subir Primeiro PDF' : 'Subir PDF'}</span>
          </button>
        </div>
      </div>

      {/* Seção 1: livros do usuário com a porcentagem lida */}
      <div style={{ display: 'flex', flexDirection: 'column', gap: '16px' }}>
        <div style={{ display: 'flex', alignItems: 'center', justifyContent: 'space-between', flexWrap: 'wrap', gap: '12px' }}>
          <div style={{ display: 'flex', alignItems: 'center', gap: '12px', flexWrap: 'wrap' }}>
            <div style={{
              width: '8px',
              height: '8px',
              borderRadius: '50%',
              background: '#10b981',
              boxShadow: '0 0 10px #10b981',
            }} />
            <h2 style={{
              fontSize: '18px',
              fontWeight: 900,
              color: '#f8fafc',
              textTransform: 'uppercase',
              letterSpacing: '-0.02em',
            }}>
              Biblioteca & Leituras ({books.length})
            </h2>
          </div>

          <button
            onClick={onOpenUpload}
            style={{
              // No celular o envio já está no topo e no cabeçalho
              display: isMobile ? 'none' : 'flex',
              alignItems: 'center',
              gap: '6px',
              fontSize: '12px',
              fontWeight: 700,
              color: '#10b981',
              background: 'rgba(16, 185, 129, 0.1)',
              padding: '6px 14px',
              borderRadius: '12px',
              border: '1px solid rgba(16, 185, 129, 0.25)',
            }}
          >
            <Upload size={14} />
            <span>{activeFolderName ? 'Adicionar nesta pasta' : 'Adicionar Novo PDF'}</span>
          </button>
        </div>

        {books.length > 0 && (
          <FolderBar
            books={books}
            folders={folders}
            activeFolderId={activeFolderId}
            onSelect={onSelectFolder}
            onCreate={(name) => onCreateFolder(name)}
            onRename={onRenameFolder}
            onDelete={onDeleteFolder}
          />
        )}

        {/* Grid de Livros com Progresso em Destaque ou Empty State */}
        <div style={{
          display: 'grid',
          gridTemplateColumns: visibleBooks.length === 0 ? '1fr' : 'repeat(auto-fill, minmax(min(270px, 100%), 1fr))',
          gap: '20px',
        }}>
          {books.length > 0 && visibleBooks.length === 0 ? (
            <div style={{
              padding: '40px 24px',
              borderRadius: '24px',
              border: '1px dashed var(--border-subtle)',
              textAlign: 'center',
              color: '#94a3b8',
              fontSize: '13px',
              lineHeight: 1.6,
            }}>
              {activeFolderId === 'none'
                ? 'Todos os livros já estão em pastas.'
                : <>Esta pasta está vazia. Use o botão <FolderInput size={13} style={{ verticalAlign: '-2px' }} /> de um livro para
                  trazê-lo para cá, ou envie um livro novo com a pasta aberta.</>}
            </div>
          ) : books.length === 0 ? (
            <div style={{
              display: 'flex',
              flexDirection: 'column',
              alignItems: 'center',
              justifyContent: 'center',
              padding: '60px 24px',
              borderRadius: '24px',
              background: 'rgba(255, 255, 255, 0.02)',
              border: '1px dashed rgba(16, 185, 129, 0.35)',
              textAlign: 'center',
              gap: '16px',
            }}>
              <div style={{
                width: '68px',
                height: '68px',
                borderRadius: '50%',
                background: 'rgba(16, 185, 129, 0.12)',
                display: 'flex',
                alignItems: 'center',
                justifyContent: 'center',
                color: '#10b981',
              }}>
                <BookOpen size={32} />
              </div>
              <div style={{ display: 'flex', flexDirection: 'column', gap: '6px' }}>
                <h3 style={{ fontSize: '18px', fontWeight: 800, color: '#f8fafc' }}>
                  Sua estante está vazia
                </h3>
                <p style={{ fontSize: '13px', color: '#94a3b8', maxWidth: '460px', lineHeight: 1.5 }}>
                  Suba seu primeiro PDF ou ebook para ouvir com a palavra destacada enquanto a voz lê.
                </p>
              </div>
              {(
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
                    fontSize: '12px',
                    fontWeight: 800,
                    textTransform: 'uppercase',
                    letterSpacing: '0.08em',
                    boxShadow: '0 8px 20px rgba(16, 185, 129, 0.3)',
                  }}
                >
                  <Upload size={16} />
                  <span>Subir Primeiro PDF</span>
                </button>
              )}
            </div>
          ) : (
            visibleBooks.map((book) => {
            const isFinished = book.readingProgress >= 100;
            // Em "Todos", mostra em que pasta o livro está
            const bookFolderName = activeFolderId === 'all' && book.folderId ? folderNameById.get(book.folderId) : undefined;
            const isUploading = Boolean(book.isUploading);

            return (
              <div
                key={book.id}
                className="floating-card"
                onClick={() => {
                  if (isUploading) return;
                  onOpenBookInReader(book);
                }}
                style={{
                  borderRadius: isMobile ? '18px' : '24px',
                  padding: isMobile ? '12px' : '20px',
                  background: 'var(--bg-surface)',
                  border: isUploading 
                    ? '1px solid rgba(16, 185, 129, 0.4)' 
                    : '1px solid var(--border-subtle)',
                  cursor: isUploading ? 'wait' : 'pointer',
                  display: 'flex',
                  flexDirection: 'column',
                  justifyContent: 'space-between',
                  position: 'relative',
                  overflow: 'hidden',
                  transition: 'all 300ms ease',
                  boxShadow: isUploading ? '0 0 20px rgba(16, 185, 129, 0.15)' : 'none',
                }}
              >
                {/* Book Banner / Capa Real */}
                <div style={{
                  height: isMobile ? '160px' : '140px',
                  borderRadius: '16px',
                  background: book.coverGradient,
                  boxShadow: 'var(--shadow-sm)',
                  display: 'flex',
                  flexDirection: 'column',
                  justifyContent: 'space-between',
                  padding: '14px',
                  color: '#ffffff',
                  position: 'relative',
                  overflow: 'hidden',
                }}>
                  {/* Capa Real como Imagem de Fundo/Destaque */}
                  {book.coverImage && (
                    <div style={{
                      position: 'absolute',
                      inset: 0,
                      zIndex: 0,
                    }}>
                      <img 
                        src={book.coverImage} 
                        alt={book.title} 
                        style={{
                          width: '100%',
                          height: '100%',
                          objectFit: 'cover',
                          objectPosition: 'center top',
                          filter: isUploading ? 'brightness(0.6)' : 'brightness(0.85)',
                          transition: 'transform 300ms ease',
                        }} 
                      />
                      {/* Gradiente escuro para contraste suave e leitura da tipografia */}
                      <div style={{
                        position: 'absolute',
                        inset: 0,
                        background: 'linear-gradient(to top, rgba(15, 23, 42, 0.95) 0%, rgba(15, 23, 42, 0.35) 60%, rgba(0, 0, 0, 0.45) 100%)',
                      }} />
                    </div>
                  )}

                  {/* Badges superiores (no celular, abaixo do botão Excluir, que fica no canto) */}
                  <div style={{ display: 'flex', justifyContent: 'space-between', alignItems: 'center', gap: '6px', flexWrap: 'wrap', zIndex: 1, marginTop: isMobile ? '28px' : 0 }}>
                    <div style={{ display: 'flex', alignItems: 'center', gap: '6px' }}>
                      <span style={{
                        fontSize: '10px',
                        fontWeight: 800,
                        padding: '3px 8px',
                        borderRadius: '6px',
                        background: 'rgba(0, 0, 0, 0.55)',
                        backdropFilter: 'blur(4px)',
                        letterSpacing: '0.05em',
                        border: '1px solid rgba(255, 255, 255, 0.1)',
                      }}>
                        {book.type.toUpperCase()}
                      </span>
                    </div>

                    {/* Badge de Progresso ou Uploading */}
                    {isUploading ? (
                      <div style={{
                        display: 'flex',
                        alignItems: 'center',
                        gap: '5px',
                        padding: '3px 10px',
                        borderRadius: '20px',
                        background: 'rgba(16, 185, 129, 0.25)',
                        border: '1px solid rgba(16, 185, 129, 0.6)',
                        color: '#10b981',
                        fontSize: '10px',
                        fontWeight: 800,
                        letterSpacing: '0.04em',
                      }}>
                        <Loader2 size={11} className="animate-spin" />
                        <span>SUBINDO...</span>
                      </div>
                    ) : (
                      <div style={{
                        display: 'flex',
                        alignItems: 'center',
                        gap: '4px',
                        padding: '3px 8px',
                        borderRadius: '8px',
                        background: isFinished ? '#10b981' : 'rgba(0, 0, 0, 0.6)',
                        backdropFilter: 'blur(4px)',
                        fontSize: '11px',
                        fontWeight: 800,
                        border: '1px solid rgba(255, 255, 255, 0.1)',
                      }}>
                        {book.readingProgress}% LIDO
                      </div>
                    )}
                  </div>

                  {/* Título do Livro no Banner */}
                  <h3 style={{
                    fontSize: '15px',
                    fontWeight: 800,
                    lineHeight: 1.25,
                    textShadow: '0 2px 6px rgba(0,0,0,0.8)',
                    zIndex: 1,
                    display: '-webkit-box',
                    WebkitLineClamp: 2,
                    WebkitBoxOrient: 'vertical',
                    overflow: 'hidden',
                  }}>
                    {book.title}
                  </h3>

                  {/* Overlay animado se estiver subindo */}
                  {isUploading && (
                    <div style={{
                      position: 'absolute',
                      inset: 0,
                      background: 'rgba(10, 15, 22, 0.75)',
                      backdropFilter: 'blur(2px)',
                      display: 'flex',
                      flexDirection: 'column',
                      alignItems: 'center',
                      justifyContent: 'center',
                      gap: '6px',
                      zIndex: 2,
                    }}>
                      <div style={{
                        display: 'flex',
                        alignItems: 'center',
                        gap: '6px',
                        color: '#10b981',
                        fontSize: '11px',
                        fontWeight: 800,
                        letterSpacing: '0.05em',
                      }}>
                        <Loader2 size={14} className="animate-spin" />
                        <span>PROCESSANDO NA NUVEM</span>
                      </div>
                      <span style={{ fontSize: '10px', color: '#94a3b8' }}>
                        Sincronizando no MinIO & MariaDB...
                      </span>
                    </div>
                  )}
                </div>

                {/* Details */}
                <div style={{ marginTop: '14px', display: 'flex', flexDirection: 'column', gap: '8px' }}>
                  <div style={{ display: 'flex', justifyContent: 'space-between', alignItems: 'center' }}>
                    <div style={{ display: 'flex', alignItems: 'center', gap: '8px', minWidth: 0 }}>
                      <span style={{ fontSize: '13px', color: '#94a3b8', fontWeight: 500, overflow: 'hidden', textOverflow: 'ellipsis', whiteSpace: 'nowrap' }}>
                        {book.author}
                      </span>
                      {bookFolderName && (
                        <span style={{
                          display: 'flex',
                          alignItems: 'center',
                          gap: '3px',
                          flexShrink: 1,
                          minWidth: 0,
                          maxWidth: '50%',
                          fontSize: '10px',
                          fontWeight: 700,
                          color: '#10b981',
                          background: 'rgba(16, 185, 129, 0.1)',
                          padding: '2px 6px',
                          borderRadius: '6px',
                          whiteSpace: 'nowrap',
                        }}>
                          <Folder size={10} style={{ flexShrink: 0 }} />
                          <span style={{ overflow: 'hidden', textOverflow: 'ellipsis' }}>{bookFolderName}</span>
                        </span>
                      )}
                    </div>
                    <span style={{ fontSize: '11px', color: '#64748b', flexShrink: 0 }}>
                      {isUploading ? 'Processando' : `~${book.durationMinutes} min`}
                    </span>
                  </div>

                  {/* Barra de Progresso Verde Esmeralda */}
                  <div style={{
                    width: '100%',
                    height: '6px',
                    background: 'rgba(255, 255, 255, 0.06)',
                    borderRadius: '4px',
                    overflow: 'hidden',
                    position: 'relative',
                  }}>
                    {isUploading ? (
                      <div style={{
                        width: '100%',
                        height: '100%',
                        background: 'linear-gradient(90deg, #10b981 0%, #38bdf8 50%, #10b981 100%)',
                        backgroundSize: '200% 100%',
                        animation: 'pulse 1.5s infinite',
                        borderRadius: '4px',
                      }} />
                    ) : (
                      <div style={{
                        width: `${book.readingProgress}%`,
                        height: '100%',
                        background: 'linear-gradient(90deg, #10b981 0%, #059669 100%)',
                        borderRadius: '4px',
                      }} />
                    )}
                  </div>

                  <div style={{
                    display: 'flex',
                    alignItems: 'center',
                    justifyContent: 'space-between',
                    marginTop: '4px',
                  }}>
                    <span style={{ fontSize: '11px', color: '#64748b' }}>
                      {isUploading ? 'Aguarde um instante...' : `${book.totalWords.toLocaleString()} palavras`}
                    </span>

                    {isUploading ? (
                      <span style={{
                        display: 'flex',
                        alignItems: 'center',
                        gap: '4px',
                        fontSize: '11px',
                        color: '#38bdf8',
                        fontWeight: 700,
                      }}>
                        <Loader2 size={12} className="animate-spin" /> Carregando...
                      </span>
                    ) : (
                      <span style={{
                        display: 'flex',
                        alignItems: 'center',
                        gap: '4px',
                        fontSize: '11px',
                        color: '#10b981',
                        fontWeight: 700,
                      }}>
                        Ler Agora <ChevronRight size={13} />
                      </span>
                    )}
                  </div>
                </div>

                {/* Ações do card: mover para pasta e excluir */}
                <div style={{ position: 'absolute', top: isMobile ? '18px' : '12px', right: isMobile ? '18px' : '12px', display: 'flex', gap: '6px', zIndex: 3 }}>
                  {!isUploading && (
                    <button
                      onClick={(e) => {
                        e.stopPropagation();
                        setMovingBook(book);
                      }}
                      style={{
                        background: 'rgba(0, 0, 0, 0.65)',
                        backdropFilter: 'blur(4px)',
                        color: '#e2e8f0',
                        padding: '6px',
                        borderRadius: '8px',
                        border: '1px solid rgba(255, 255, 255, 0.15)',
                        cursor: 'pointer',
                      }}
                      title="Mover para pasta"
                    >
                      <FolderInput size={13} />
                    </button>
                  )}
                  {onDeleteBook && !isUploading && (
                    <button
                      onClick={(e) => {
                        e.stopPropagation();
                        onDeleteBook(book.id);
                      }}
                      style={{
                        background: 'rgba(0, 0, 0, 0.65)',
                        backdropFilter: 'blur(4px)',
                        color: '#ef4444',
                        padding: '6px',
                        borderRadius: '8px',
                        border: '1px solid rgba(239, 68, 68, 0.3)',
                        cursor: 'pointer',
                      }}
                      title="Excluir livro"
                    >
                      <Trash2 size={13} />
                    </button>
                  )}
                </div>
              </div>
            );
          })
        )}
        </div>
      </div>

      {/* Seção 2: Vozes Marcadas como Favoritas */}
      <div style={{ display: 'flex', flexDirection: 'column', gap: '16px' }}>
        <div style={{ display: 'flex', alignItems: 'center', justifyContent: 'space-between' }}>
          <div style={{ display: 'flex', alignItems: 'center', gap: '10px' }}>
            <Heart size={18} color="#10b981" fill="#10b981" />
            <h2 style={{
              fontSize: '18px',
              fontWeight: 900,
              color: '#f8fafc',
              textTransform: 'uppercase',
              letterSpacing: '-0.02em',
            }}>
              Vozes Favoritas ({favoriteVoices.length})
            </h2>
          </div>

          <button
            onClick={onNavigateToVoices}
            style={{
              display: 'flex',
              alignItems: 'center',
              gap: '6px',
              fontSize: '12px',
              fontWeight: 700,
              color: '#10b981',
            }}
          >
            <span>Ver Catálogo Completo</span>
            <ChevronRight size={14} />
          </button>
        </div>

        {favoriteVoices.length === 0 ? (
          <div style={{
            padding: '24px',
            borderRadius: '20px',
            background: 'var(--bg-surface)',
            border: '1px dashed var(--border-subtle)',
            textAlign: 'center',
            color: '#94a3b8',
            fontSize: '13px',
          }}>
            Nenhuma voz favoritada ainda. Acesse a <strong>Página de Vozes</strong> para marcar suas favoritas com um clique!
          </div>
        ) : (
          <div style={{
            display: 'grid',
            gridTemplateColumns: 'repeat(auto-fill, minmax(min(300px, 100%), 1fr))',
            gap: '16px',
          }}>
            {favoriteVoices.map((voice) => (
              <div
                key={voice.id}
                className="floating-card"
                style={{
                  padding: '18px',
                  borderRadius: '20px',
                  background: 'var(--bg-surface)',
                  border: '1px solid var(--border-subtle)',
                  display: 'flex',
                  alignItems: 'center',
                  justifyContent: 'space-between',
                  gap: '14px',
                }}
              >
                <div style={{ display: 'flex', alignItems: 'center', gap: '12px' }}>
                  <div style={{
                    width: '42px',
                    height: '42px',
                    borderRadius: '50%',
                    background: voice.avatarColor,
                    display: 'flex',
                    alignItems: 'center',
                    justifyContent: 'center',
                    color: '#ffffff',
                    fontWeight: 800,
                    fontSize: '16px',
                    boxShadow: 'var(--shadow-sm)',
                    flexShrink: 0,
                  }}>
                    {voice.name[0]}
                  </div>

                  <div>
                    <div style={{ display: 'flex', alignItems: 'center', gap: '6px' }}>
                      <span style={{ fontSize: '14px', fontWeight: 800, color: '#f8fafc' }}>
                        {voice.name}
                      </span>
                      <span style={{
                        fontSize: '9px',
                        padding: '1px 6px',
                        borderRadius: '4px',
                        background: 'rgba(255, 255, 255, 0.08)',
                        color: '#94a3b8',
                      }}>
                        {voice.accent}
                      </span>
                    </div>
                    <span style={{ fontSize: '11px', color: '#10b981', fontWeight: 600 }}>
                      {voice.tag}
                    </span>
                  </div>
                </div>

                <div style={{ display: 'flex', alignItems: 'center', gap: '8px' }}>
                  {/* Ouvir Exemplo */}
                  <button
                    onClick={() => onPreviewVoice(voice)}
                    style={{
                      padding: '7px 10px',
                      borderRadius: '10px',
                      background: 'rgba(16, 185, 129, 0.1)',
                      color: '#10b981',
                      border: '1px solid rgba(16, 185, 129, 0.25)',
                      display: 'flex',
                      alignItems: 'center',
                      gap: '4px',
                      fontSize: '11px',
                      fontWeight: 700,
                    }}
                    title="Ouvir voz"
                  >
                    <Volume2 size={13} />
                    <span>Ouvir</span>
                  </button>

                  {/* Desfavoritar */}
                  <button
                    onClick={() => onToggleFavoriteVoice(voice.id)}
                    style={{
                      padding: '8px',
                      borderRadius: '10px',
                      background: 'transparent',
                      color: '#10b981',
                    }}
                    title="Remover dos favoritos"
                  >
                    <Heart size={16} fill="#10b981" />
                  </button>
                </div>
              </div>
            ))}
          </div>
        )}
      </div>

      {movingBook && (
        <MoveToFolderSheet
          book={books.find((b) => b.id === movingBook.id) || movingBook}
          folders={folders}
          onMove={onMoveBookToFolder}
          onCreate={(name, openIt) => onCreateFolder(name, openIt)}
          onClose={() => setMovingBook(null)}
        />
      )}
    </div>
  );
};
