import React from 'react';
import { WifiOff, Trash2, Loader2 } from 'lucide-react';
import { OFFLINE_ENABLED, useOfflineState } from '../hooks/useOfflineState';
import { OFFLINE_DAYS, cancelAllDownloads, daysLeft, deleteAllOffline, deleteOfflineBook, formatBytes } from '../services/offlineAudio';

/** Configurações > Downloads offline: o que está guardado no celular, quanto ocupa e quando vence. */
export const OfflineDownloadsCard: React.FC = () => {
  const { chapters, jobs } = useOfflineState();
  if (!OFFLINE_ENABLED) return null;

  const books = new Map<string, { title: string; count: number; bytes: number; expiresAt: number }>();
  for (const c of chapters) {
    const b = books.get(c.bookId) || { title: c.bookTitle, count: 0, bytes: 0, expiresAt: Infinity };
    b.count++;
    b.bytes += c.bytes;
    b.expiresAt = Math.min(b.expiresAt, c.expiresAt);
    books.set(c.bookId, b);
  }
  const total = chapters.reduce((s, c) => s + c.bytes, 0);
  const active = jobs.filter((j) => j.state !== 'error');

  return (
    <div
      className="floating-card"
      style={{
        padding: '24px 28px',
        borderRadius: '24px',
        background: 'var(--bg-surface)',
        border: '1px solid var(--border-subtle)',
        display: 'flex',
        flexDirection: 'column',
        gap: '14px',
      }}
    >
      <div style={{ display: 'flex', alignItems: 'center', justifyContent: 'space-between', gap: '12px', flexWrap: 'wrap' }}>
        <div style={{ display: 'flex', alignItems: 'center', gap: '12px' }}>
          <WifiOff size={20} color="#10b981" />
          <div>
            <h3 style={{ fontSize: '15px', fontWeight: 800, color: '#f8fafc' }}>Downloads offline</h3>
            <p style={{ fontSize: '12px', color: '#94a3b8', marginTop: '2px' }}>
              {chapters.length
                ? `${chapters.length} capítulo${chapters.length === 1 ? '' : 's'} · ${formatBytes(total)} no celular`
                : `Baixe capítulos na lista de capítulos do livro. Eles ficam ${OFFLINE_DAYS} dias no celular.`}
            </p>
          </div>
        </div>
        {chapters.length > 0 && (
          <button
            onClick={() => {
              if (window.confirm('Apagar todos os capítulos baixados?')) deleteAllOffline();
            }}
            style={{
              display: 'flex',
              alignItems: 'center',
              gap: '6px',
              padding: '9px 14px',
              borderRadius: '12px',
              background: 'rgba(239, 68, 68, 0.1)',
              border: '1px solid rgba(239, 68, 68, 0.25)',
              color: '#ef4444',
              fontSize: '12px',
              fontWeight: 700,
            }}
          >
            <Trash2 size={14} /> Apagar tudo
          </button>
        )}
      </div>

      {active.length > 0 && (
        <div style={{ display: 'flex', alignItems: 'center', justifyContent: 'space-between', gap: '10px', fontSize: '12px', color: '#cbd5e1' }}>
          <span style={{ display: 'flex', alignItems: 'center', gap: '6px' }}>
            <Loader2 size={14} className="animate-spin" color="#10b981" />
            Baixando {active.length} capítulo{active.length === 1 ? '' : 's'}…
          </span>
          <button onClick={cancelAllDownloads} style={{ color: '#94a3b8', fontSize: '12px', fontWeight: 700 }}>Cancelar</button>
        </div>
      )}

      {[...books.entries()].map(([bookId, b]) => (
        <div
          key={bookId}
          style={{
            display: 'flex',
            alignItems: 'center',
            justifyContent: 'space-between',
            gap: '10px',
            padding: '12px 14px',
            borderRadius: '14px',
            background: 'rgba(255,255,255,0.03)',
            border: '1px solid var(--border-subtle)',
          }}
        >
          <div style={{ minWidth: 0 }}>
            <div style={{ fontSize: '13px', fontWeight: 700, color: '#f8fafc', overflow: 'hidden', textOverflow: 'ellipsis', whiteSpace: 'nowrap' }}>
              {b.title}
            </div>
            <div style={{ fontSize: '12px', color: '#94a3b8', marginTop: '2px' }}>
              {b.count} capítulo{b.count === 1 ? '' : 's'} · {formatBytes(b.bytes)} · vence em {daysLeft(b.expiresAt)} dia{daysLeft(b.expiresAt) === 1 ? '' : 's'}
            </div>
          </div>
          <button
            aria-label={`Apagar downloads de ${b.title}`}
            onClick={() => {
              if (window.confirm(`Apagar os capítulos baixados de "${b.title}"?`)) deleteOfflineBook(bookId);
            }}
            style={{ padding: '8px', color: '#f87171', flexShrink: 0 }}
          >
            <Trash2 size={17} />
          </button>
        </div>
      ))}
    </div>
  );
};
