import React from 'react';
import { 
  BookOpen, 
  Play, 
  Upload, 
  Heart, 
  Volume2, 
  ChevronRight, 
  Flame,
  CheckCircle2,
  Trash2
} from 'lucide-react';
import type { Book, VoiceOption } from '../../types';

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
  userName: string;
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
  userName,
}) => {
  const favoriteVoices = allVoices.filter((v) => favoriteVoiceIds.includes(v.id));

  const totalWordsRead = books.reduce((acc, b) => acc + Math.round((b.totalWords * b.readingProgress) / 100), 0);
  const totalBooks = books.length;
  const completedBooks = books.filter((b) => b.readingProgress >= 100).length;

  return (
    <div style={{
      flex: 1,
      overflowY: 'auto',
      padding: '32px 24px 120px 24px',
      maxWidth: '1240px',
      margin: '0 auto',
      width: '100%',
      display: 'flex',
      flexDirection: 'column',
      gap: '32px',
    }}>
      {/* Welcome Banner (Soft & Bold Cyber-Dark) */}
      <div 
        className="floating-card"
        style={{
          padding: '32px',
          borderRadius: '28px',
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
            <span style={{ fontSize: '12px', color: '#94a3b8' }}>Ebook Readers GTP</span>
          </div>

          <h1 style={{
            fontSize: '28px',
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
                {totalWordsRead.toLocaleString()} palavras lidas
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
        <div style={{ display: 'flex', gap: '12px' }}>
          {books.length > 0 && currentBook ? (
            <button
              onClick={() => onOpenBookInReader(currentBook)}
              style={{
                display: 'flex',
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

      {/* Seção 1: Todos os Livros Subidos & Porcentagem Lida */}
      <div style={{ display: 'flex', flexDirection: 'column', gap: '16px' }}>
        <div style={{ display: 'flex', alignItems: 'center', justifyContent: 'space-between' }}>
          <div style={{ display: 'flex', alignItems: 'center', gap: '10px' }}>
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
              Seus Livros & Leituras ({books.length})
            </h2>
          </div>

          <button
            onClick={onOpenUpload}
            style={{
              display: 'flex',
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
            <span>Adicionar Novo PDF</span>
          </button>
        </div>

        {/* Grid de Livros com Progresso em Destaque ou Empty State */}
        <div style={{
          display: 'grid',
          gridTemplateColumns: books.length === 0 ? '1fr' : 'repeat(auto-fill, minmax(270px, 1fr))',
          gap: '20px',
        }}>
          {books.length === 0 ? (
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
                  Nenhum livro cadastrado ainda
                </h3>
                <p style={{ fontSize: '13px', color: '#94a3b8', maxWidth: '440px', lineHeight: 1.5 }}>
                  Todos os dados fictícios foram removidos. Suba o seu primeiro PDF para salvá-lo no bucket do Supabase e começar a ouvir com sincronia de sentenças.
                </p>
              </div>
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
            </div>
          ) : (
            books.map((book) => {
            const isFinished = book.readingProgress >= 100;
            return (
              <div
                key={book.id}
                className="floating-card"
                onClick={() => onOpenBookInReader(book)}
                style={{
                  borderRadius: '24px',
                  padding: '20px',
                  background: 'var(--bg-surface)',
                  border: '1px solid var(--border-subtle)',
                  cursor: 'pointer',
                  display: 'flex',
                  flexDirection: 'column',
                  justifyContent: 'space-between',
                  position: 'relative',
                }}
              >
                {/* Book Banner */}
                <div style={{
                  height: '120px',
                  borderRadius: '16px',
                  background: book.coverGradient,
                  boxShadow: 'var(--shadow-sm)',
                  display: 'flex',
                  flexDirection: 'column',
                  justifyContent: 'space-between',
                  padding: '14px',
                  color: '#ffffff',
                }}>
                  <div style={{ display: 'flex', justifyContent: 'space-between', alignItems: 'center' }}>
                    <span style={{
                      fontSize: '10px',
                      fontWeight: 800,
                      padding: '3px 8px',
                      borderRadius: '6px',
                      background: 'rgba(0, 0, 0, 0.4)',
                      letterSpacing: '0.05em',
                    }}>
                      {book.type.toUpperCase()}
                    </span>

                    {/* Badge da Porcentagem Lida */}
                    <div style={{
                      display: 'flex',
                      alignItems: 'center',
                      gap: '4px',
                      padding: '3px 8px',
                      borderRadius: '8px',
                      background: isFinished ? '#10b981' : 'rgba(0, 0, 0, 0.55)',
                      fontSize: '11px',
                      fontWeight: 800,
                    }}>
                      {book.readingProgress}% LIDO
                    </div>
                  </div>

                  <h3 style={{
                    fontSize: '15px',
                    fontWeight: 800,
                    lineHeight: 1.25,
                    textShadow: '0 2px 4px rgba(0,0,0,0.6)',
                  }}>
                    {book.title}
                  </h3>
                </div>

                {/* Details */}
                <div style={{ marginTop: '14px', display: 'flex', flexDirection: 'column', gap: '8px' }}>
                  <div style={{ display: 'flex', justifyContent: 'space-between', alignItems: 'center' }}>
                    <span style={{ fontSize: '13px', color: '#94a3b8', fontWeight: 500 }}>
                      {book.author}
                    </span>
                    <span style={{ fontSize: '11px', color: '#64748b' }}>
                      ~{book.durationMinutes} min
                    </span>
                  </div>

                  {/* Barra de Progresso Verde Esmeralda */}
                  <div style={{
                    width: '100%',
                    height: '6px',
                    background: 'rgba(255, 255, 255, 0.06)',
                    borderRadius: '4px',
                    overflow: 'hidden',
                  }}>
                    <div style={{
                      width: `${book.readingProgress}%`,
                      height: '100%',
                      background: 'linear-gradient(90deg, #10b981 0%, #059669 100%)',
                      borderRadius: '4px',
                    }} />
                  </div>

                  <div style={{
                    display: 'flex',
                    alignItems: 'center',
                    justifyContent: 'space-between',
                    marginTop: '4px',
                  }}>
                    <span style={{ fontSize: '11px', color: '#64748b' }}>
                      {book.totalWords.toLocaleString()} palavras
                    </span>

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
                  </div>
                </div>

                {/* Botão de excluir livro */}
                {onDeleteBook && (
                  <button
                    onClick={(e) => {
                      e.stopPropagation();
                      onDeleteBook(book.id);
                    }}
                    style={{
                      position: 'absolute',
                      top: '12px',
                      right: '12px',
                      background: 'rgba(0, 0, 0, 0.6)',
                      color: '#ef4444',
                      padding: '5px',
                      borderRadius: '6px',
                    }}
                    title="Excluir livro"
                  >
                    <Trash2 size={13} />
                  </button>
                )}
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
            gridTemplateColumns: 'repeat(auto-fill, minmax(300px, 1fr))',
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
    </div>
  );
};
