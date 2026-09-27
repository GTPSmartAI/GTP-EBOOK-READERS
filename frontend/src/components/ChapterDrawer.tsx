import React, { useEffect, useMemo, useRef, useState } from 'react';
import { X, Bookmark, ChevronRight, Download, CheckCircle2, Clock, AlertCircle, Loader2, WifiOff, Trash2 } from 'lucide-react';
import type { Book } from '../types';
import { useEscapeKey } from '../hooks/useEscapeKey';
import { OFFLINE_ENABLED, useOfflineState } from '../hooks/useOfflineState';
import {
  OFFLINE_DAYS,
  cancelDownload,
  daysLeft,
  deleteOfflineBook,
  deleteOfflineChapter,
  formatBytes,
  queueChapterDownloads,
} from '../services/offlineAudio';
import { speechEngine } from '../services/speechEngine';

interface ChapterDrawerProps {
  isOpen: boolean;
  onClose: () => void;
  book: Book;
  currentSentenceIndex: number;
  onJumpToSentence: (sentenceIndex: number) => void;
  voiceName?: string;
  onNotice?: (message: string) => void;
}

const COUNT_OPTIONS = [1, 3, 5, 10];

export const ChapterDrawer: React.FC<ChapterDrawerProps> = ({
  isOpen,
  onClose,
  book,
  currentSentenceIndex,
  onJumpToSentence,
  voiceName = '',
  onNotice,
}) => {
  useEscapeKey(isOpen, onClose);
  const currentRef = useRef<HTMLDivElement | null>(null);
  const offline = useOfflineState();
  const [count, setCount] = useState(3);

  const currentChapterIdx = (() => {
    for (let i = book.chapters.length - 1; i >= 0; i--) {
      if (currentSentenceIndex >= book.chapters[i].startIndex) return i;
    }
    return 0;
  })();

  // Estado de download de cada capítulo deste livro
  const downloaded = useMemo(
    () => new Map(offline.chapters.filter((c) => c.bookId === book.id).map((c) => [c.chapterId, c])),
    [offline.chapters, book.id],
  );
  const jobs = useMemo(
    () => new Map(offline.jobs.filter((j) => j.bookId === book.id).map((j) => [j.id.split('|').slice(1).join('|'), j])),
    [offline.jobs, book.id],
  );
  const bookBytes = [...downloaded.values()].reduce((s, c) => s + c.bytes, 0);
  const activeJobs = [...jobs.values()].filter((j) => j.state !== 'error');

  // Ao abrir, a lista já aparece no capítulo que está sendo lido
  useEffect(() => {
    if (isOpen) currentRef.current?.scrollIntoView({ block: 'center' });
  }, [isOpen]);

  if (!isOpen) return null;

  const canDownload = OFFLINE_ENABLED && book.sentences?.length > 0;

  const queue = async (indexes: number[]) => {
    if (!navigator.onLine) {
      onNotice?.('Sem internet agora. Conecte-se para baixar os capítulos.');
      return;
    }
    const todo = indexes.filter((i) => book.chapters[i] && !downloaded.has(book.chapters[i].id));
    if (!todo.length) {
      onNotice?.('Esses capítulos já estão baixados.');
      return;
    }
    const added = await queueChapterDownloads(book, todo, (i) => speechEngine.synthesisParamsFor(i), voiceName);
    if (added < todo.length) onNotice?.('A fila de downloads está cheia. Espere terminar para baixar mais.');
  };

  const nextIndexes = Array.from({ length: count }, (_, k) => currentChapterIdx + k).filter((i) => i < book.chapters.length);

  const statusControl = (chapterId: string, idx: number) => {
    const done = downloaded.get(chapterId);
    const job = jobs.get(chapterId);
    const base: React.CSSProperties = {
      width: '38px',
      height: '38px',
      flexShrink: 0,
      borderRadius: '10px',
      display: 'flex',
      alignItems: 'center',
      justifyContent: 'center',
      cursor: 'pointer',
    };
    if (done) {
      return (
        <button
          style={{ ...base, color: 'var(--accent-primary)' }}
          aria-label="Capítulo baixado. Apagar download"
          onClick={() => {
            if (window.confirm(`Apagar o download do capítulo ${idx + 1}?`)) deleteOfflineChapter(done.id);
          }}
        >
          <CheckCircle2 size={20} />
        </button>
      );
    }
    if (job?.state === 'downloading') {
      const pct = job.total ? Math.floor((job.done / job.total) * 100) : 0;
      return (
        <button style={{ ...base, flexDirection: 'column', gap: 1, color: 'var(--accent-primary)' }} aria-label="Cancelar download" onClick={() => cancelDownload(job.id)}>
          <Loader2 size={15} className="animate-spin" />
          <span style={{ fontSize: '9px', fontWeight: 700 }}>{pct}%</span>
        </button>
      );
    }
    if (job?.state === 'queued') {
      return (
        <button style={{ ...base, color: 'var(--text-muted)' }} aria-label="Na fila. Cancelar" onClick={() => cancelDownload(job.id)}>
          <Clock size={18} />
        </button>
      );
    }
    if (job?.state === 'error') {
      return (
        <button
          style={{ ...base, color: '#f87171' }}
          aria-label="Falhou. Tentar de novo"
          title={job.error}
          onClick={() => {
            cancelDownload(job.id);
            queue([idx]);
          }}
        >
          <AlertCircle size={19} />
        </button>
      );
    }
    return (
      <button style={{ ...base, color: 'var(--text-muted)' }} aria-label={`Baixar capítulo ${idx + 1}`} onClick={() => queue([idx])}>
        <Download size={18} />
      </button>
    );
  };

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

        {/* Ouvir sem internet */}
        {canDownload && (
          <div style={{ padding: '14px 20px', borderBottom: '1px solid var(--border-subtle)', display: 'flex', flexDirection: 'column', gap: '10px' }}>
            <div style={{ display: 'flex', alignItems: 'center', gap: '8px' }}>
              <WifiOff size={16} color="var(--accent-primary)" />
              <span style={{ fontSize: '13px', fontWeight: 700, color: 'var(--text-primary)' }}>Ouvir sem internet</span>
            </div>
            <div style={{ display: 'flex', alignItems: 'center', gap: '6px', flexWrap: 'wrap' }}>
              <span style={{ fontSize: '12px', color: 'var(--text-secondary)', marginRight: '2px' }}>Baixar os próximos</span>
              {COUNT_OPTIONS.map((n) => (
                <button
                  key={n}
                  onClick={() => setCount(n)}
                  style={{
                    minWidth: '34px',
                    height: '30px',
                    padding: '0 8px',
                    borderRadius: '9px',
                    fontSize: '13px',
                    fontWeight: 700,
                    background: count === n ? 'var(--accent-primary)' : 'rgba(255,255,255,0.05)',
                    color: count === n ? '#fff' : 'var(--text-secondary)',
                    border: '1px solid var(--border-subtle)',
                  }}
                >
                  {n}
                </button>
              ))}
            </div>
            <button
              onClick={() => queue(nextIndexes)}
              style={{
                height: '42px',
                borderRadius: '12px',
                background: 'linear-gradient(135deg, #10b981 0%, #059669 100%)',
                color: '#fff',
                fontSize: '13px',
                fontWeight: 800,
                display: 'flex',
                alignItems: 'center',
                justifyContent: 'center',
                gap: '8px',
              }}
            >
              <Download size={16} />
              Baixar {count === 1 ? 'este capítulo' : `${nextIndexes.length} capítulos`}
            </button>
            <p style={{ fontSize: '11px', color: 'var(--text-muted)', lineHeight: 1.45 }}>
              Com a voz {voiceName || 'atual'}. Ficam no celular por {OFFLINE_DAYS} dias e depois são apagados sozinhos.
              Deixe o app aberto enquanto baixa.
            </p>
            {(downloaded.size > 0 || activeJobs.length > 0) && (
              <div style={{ display: 'flex', alignItems: 'center', justifyContent: 'space-between', gap: '8px', fontSize: '12px', color: 'var(--text-secondary)' }}>
                <span>
                  {activeJobs.length > 0 && `Baixando ${activeJobs.length} · `}
                  {downloaded.size} baixado{downloaded.size === 1 ? '' : 's'}
                  {bookBytes > 0 && ` · ${formatBytes(bookBytes)}`}
                </span>
                {downloaded.size > 0 && (
                  <button
                    onClick={() => {
                      if (window.confirm('Apagar todos os capítulos baixados deste livro?')) deleteOfflineBook(book.id);
                    }}
                    style={{ display: 'flex', alignItems: 'center', gap: '4px', color: '#f87171', fontSize: '12px', fontWeight: 700 }}
                  >
                    <Trash2 size={13} /> Apagar
                  </button>
                )}
              </div>
            )}
          </div>
        )}

        {/* Lista */}
        <div style={{ flex: 1, overflowY: 'auto', padding: '10px', overscrollBehavior: 'contain' }}>
          {book.chapters.map((ch, idx) => {
            const isCurrentChapter = idx === currentChapterIdx;
            const done = canDownload ? downloaded.get(ch.id) : undefined;
            return (
              <div
                key={ch.id || idx}
                ref={isCurrentChapter ? currentRef : null}
                style={{
                  display: 'flex',
                  alignItems: 'center',
                  gap: '4px',
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
                    flex: 1,
                    minWidth: 0,
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
                      {done && (
                        <span style={{ color: 'var(--accent-primary)', textTransform: 'none', letterSpacing: 0, fontWeight: 600 }}>
                          {' '}· offline · {daysLeft(done.expiresAt)}d
                        </span>
                      )}
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
                  {!canDownload && (
                    <ChevronRight size={14} style={{ flexShrink: 0 }} color={isCurrentChapter ? 'var(--accent-primary)' : 'var(--text-muted)'} />
                  )}
                </button>
                {canDownload && statusControl(ch.id, idx)}
              </div>
            );
          })}
        </div>
      </div>
    </div>
  );
};
