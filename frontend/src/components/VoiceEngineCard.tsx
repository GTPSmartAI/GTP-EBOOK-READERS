import React, { useEffect, useState } from 'react';
import { Cpu, RefreshCw, Trash2 } from 'lucide-react';
import { VOICES } from '../data/voices';
import { clearAudioCache, engineInfo, hasLocalEngine, type LocalTtsStats } from '../services/localTts';

const formatBytes = (bytes: number) =>
  bytes >= 1024 * 1024 * 1024
    ? `${(bytes / 1024 / 1024 / 1024).toFixed(1)} GB`
    : `${Math.round(bytes / 1024 / 1024)} MB`;

/**
 * Configurações > Voz neste aparelho: vozes instaladas, desempenho do motor (gera a voz no processador)
 * e o cache dos áudios já gerados. Abaixo de ~1,3x o tempo real a leitura engasga.
 */
export const VoiceEngineCard: React.FC = () => {
  const [info, setInfo] = useState<{ models: string[]; stats: LocalTtsStats } | null>(null);
  const [loaded, setLoaded] = useState(false);
  const [clearing, setClearing] = useState(false);

  const refresh = () => {
    engineInfo().then((data) => {
      setInfo(data);
      setLoaded(true);
    });
  };
  useEffect(refresh, []);

  const handleClear = async () => {
    setClearing(true);
    await clearAudioCache();
    setClearing(false);
    refresh();
  };

  const stats = info?.stats;
  const installed = new Set(info?.models || []);
  const speed = stats?.realtimeFactor || 0;

  const row = (label: string, value: React.ReactNode) => (
    <div style={{ display: 'flex', justifyContent: 'space-between', gap: '12px', fontSize: '13px', padding: '6px 0', borderBottom: '1px solid var(--border-subtle)' }}>
      <span style={{ color: '#94a3b8' }}>{label}</span>
      <strong style={{ color: '#f8fafc', textAlign: 'right' }}>{value}</strong>
    </div>
  );

  return (
    <div
      className="floating-card"
      style={{
        padding: '28px',
        borderRadius: '24px',
        background: 'var(--bg-surface)',
        border: '1px solid var(--border-subtle)',
        display: 'flex',
        flexDirection: 'column',
        gap: '14px',
      }}
    >
      <div style={{ display: 'flex', alignItems: 'center', justifyContent: 'space-between', gap: '8px' }}>
        <div style={{ display: 'flex', alignItems: 'center', gap: '8px' }}>
          <Cpu size={18} color="#10b981" />
          <h2 style={{ fontSize: '16px', fontWeight: 800, color: '#f8fafc' }}>Voz neste aparelho</h2>
        </div>
        <button onClick={refresh} title="Atualizar" style={{ padding: '6px', color: '#94a3b8' }}>
          <RefreshCw size={15} />
        </button>
      </div>

      <p style={{ fontSize: '12px', color: '#94a3b8', lineHeight: 1.5 }}>
        {hasLocalEngine
          ? 'A voz é gerada no processador do celular, sem internet. Cada trecho gerado fica guardado: ouvir de novo é imediato.'
          : 'Teste no computador: a voz vem do ajudante local (Aedolia-PC.bat). No celular ela é gerada no próprio aparelho.'}
      </p>

      {!loaded ? (
        <span style={{ fontSize: '13px', color: '#94a3b8' }}>Carregando…</span>
      ) : !info ? (
        <span style={{ fontSize: '13px', color: '#f59e0b' }}>
          Motor de voz não encontrado. No computador, abra pelo Aedolia-PC.bat para ouvir as vozes.
        </span>
      ) : (
        <div style={{ display: 'flex', flexDirection: 'column' }}>
          {row(
            'Vozes instaladas',
            VOICES.filter((v) => installed.has(v.model)).map((v) => v.name).join(', ') || 'nenhuma'
          )}
          {row(
            'Velocidade do motor',
            stats?.generated
              ? <span style={{ color: speed >= 1.3 ? '#10b981' : '#f59e0b' }}>{speed.toFixed(1)}x o tempo real</span>
              : 'ainda não gerou nada desde que o app abriu'
          )}
          {stats?.generated ? row('Trechos gerados nesta sessão', `${stats.generated} (${Math.round(stats.audioSeconds / 60)} min de fala)`) : null}
          {stats?.lastLoadMs ? row('Tempo para carregar a voz', `${(stats.lastLoadMs / 1000).toFixed(1)} s`) : null}
          {stats ? row('Processador', `${stats.threads} de ${stats.cores} núcleos`) : null}
          {stats?.failures ? row('Falhas', <span style={{ color: '#f87171' }}>{stats.failures}{stats.lastError ? ` · ${stats.lastError}` : ''}</span>) : null}
          {row('Áudio guardado', formatBytes(stats?.cacheBytes || 0))}
        </div>
      )}

      {info && (
        <button
          onClick={handleClear}
          disabled={clearing}
          style={{
            alignSelf: 'flex-start',
            display: 'flex',
            alignItems: 'center',
            gap: '6px',
            padding: '8px 14px',
            borderRadius: '12px',
            background: 'rgba(239, 68, 68, 0.1)',
            border: '1px solid rgba(239, 68, 68, 0.25)',
            color: '#ef4444',
            fontSize: '12px',
            fontWeight: 700,
          }}
        >
          <Trash2 size={14} />
          <span>{clearing ? 'Apagando…' : 'Apagar áudio guardado'}</span>
        </button>
      )}
    </div>
  );
};
