import React, { useEffect, useMemo, useState } from 'react';
import { BarChart3, ChevronLeft, ChevronRight, Clock, BookOpen, Flame, TrendingUp, Loader2 } from 'lucide-react';
import { fetchReadingStats } from '../services/api';
import type { ReadingStats, StatsPeriod } from '../services/api';

/**
 * Estatísticas de leitura real (Configurações): tempo ouvindo e palavras que a voz leu,
 * por dia, semana, mês ou ano, com navegação para períodos anteriores.
 */
const PERIODS: { id: StatsPeriod; label: string }[] = [
  { id: 'day', label: 'Dia' },
  { id: 'week', label: 'Semana' },
  { id: 'month', label: 'Mês' },
  { id: 'year', label: 'Ano' },
];

const MONTHS = ['jan', 'fev', 'mar', 'abr', 'mai', 'jun', 'jul', 'ago', 'set', 'out', 'nov', 'dez'];
const MONTHS_FULL = ['janeiro', 'fevereiro', 'março', 'abril', 'maio', 'junho', 'julho', 'agosto', 'setembro', 'outubro', 'novembro', 'dezembro'];
const WEEKDAYS = ['dom', 'seg', 'ter', 'qua', 'qui', 'sex', 'sáb'];

const parseDay = (iso: string) => {
  const [y, m, d] = iso.split('-').map(Number);
  return new Date(y, m - 1, d || 1);
};

function formatDuration(seconds: number): string {
  const s = Math.round(seconds);
  if (s < 60) return s > 0 ? `${s} s` : '0 min';
  const h = Math.floor(s / 3600);
  const m = Math.floor((s % 3600) / 60);
  if (h === 0) return `${m} min`;
  return m ? `${h} h ${m} min` : `${h} h`;
}

function periodLabel(stats: ReadingStats): string {
  const start = parseDay(stats.start);
  const end = parseDay(stats.end);
  if (stats.period === 'day') {
    if (stats.start === stats.today) return 'Hoje';
    return `${WEEKDAYS[start.getDay()]}, ${start.getDate()} de ${MONTHS_FULL[start.getMonth()]}`;
  }
  if (stats.period === 'week') {
    const sameMonth = start.getMonth() === end.getMonth();
    return sameMonth
      ? `${start.getDate()} a ${end.getDate()} de ${MONTHS_FULL[end.getMonth()]}`
      : `${start.getDate()} ${MONTHS[start.getMonth()]} a ${end.getDate()} ${MONTHS[end.getMonth()]}`;
  }
  if (stats.period === 'month') return `${MONTHS_FULL[start.getMonth()]} de ${start.getFullYear()}`;
  return String(start.getFullYear());
}

function pointLabel(key: string, period: StatsPeriod): { short: string; long: string } {
  if (period === 'year') {
    const month = Number(key.slice(5, 7)) - 1;
    return { short: MONTHS[month], long: `${MONTHS_FULL[month]} de ${key.slice(0, 4)}` };
  }
  const d = parseDay(key);
  return {
    short: period === 'month' ? String(d.getDate()) : WEEKDAYS[d.getDay()],
    long: `${WEEKDAYS[d.getDay()]}, ${d.getDate()} de ${MONTHS_FULL[d.getMonth()]}`,
  };
}

const Tile: React.FC<{ icon: React.ReactNode; label: string; value: string; note?: string }> = ({ icon, label, value, note }) => (
  <div style={{
    padding: '16px',
    borderRadius: '16px',
    background: 'var(--bg-surface-elevated)',
    border: '1px solid var(--border-subtle)',
    display: 'flex',
    flexDirection: 'column',
    gap: '6px',
    minWidth: 0,
  }}>
    <span style={{ display: 'flex', alignItems: 'center', gap: '6px', fontSize: '12px', fontWeight: 600, color: 'var(--text-secondary)' }}>
      {icon}
      {label}
    </span>
    <span style={{ fontSize: '24px', fontWeight: 800, color: 'var(--text-primary)', fontVariantNumeric: 'tabular-nums', lineHeight: 1.1 }}>
      {value}
    </span>
    {note && <span style={{ fontSize: '12px', color: 'var(--text-muted)' }}>{note}</span>}
  </div>
);

export const ReadingStatsPanel: React.FC = () => {
  const [period, setPeriod] = useState<StatsPeriod>('week');
  const [offset, setOffset] = useState(0);
  const [stats, setStats] = useState<ReadingStats | null>(null);
  const [loading, setLoading] = useState(true);
  const [failed, setFailed] = useState(false);
  const [hover, setHover] = useState<number | null>(null);

  useEffect(() => {
    let current = true;
    setLoading(true);
    setFailed(false);
    fetchReadingStats(period, offset).then((data) => {
      if (!current) return;
      setLoading(false);
      if (data) setStats(data);
      else setFailed(true);
    });
    return () => {
      current = false;
    };
  }, [period, offset]);

  const maxSeconds = useMemo(() => Math.max(60, ...(stats?.series.map((p) => p.seconds) ?? [0])), [stats]);
  // Linhas de referência do gráfico em minutos "redondos"
  const gridMinutes = useMemo(() => {
    const maxMin = maxSeconds / 60;
    const step = [1, 2, 5, 10, 15, 30, 60, 120, 240].find((s) => maxMin / s <= 4) ?? 480;
    const lines: number[] = [];
    for (let v = step; v < maxMin; v += step) lines.push(v);
    return { lines, top: maxMin };
  }, [maxSeconds]);

  const chartHeight = 150;
  const series = stats?.series ?? [];
  const showEveryLabel = series.length <= 12;
  const hovered = hover !== null ? series[hover] : null;

  return (
    <div
      className="floating-card"
      style={{
        padding: 'clamp(18px, 4vw, 28px)',
        borderRadius: '24px',
        background: 'var(--bg-surface)',
        border: '1px solid var(--border-subtle)',
        display: 'flex',
        flexDirection: 'column',
        gap: '20px',
      }}
    >
      <div style={{ display: 'flex', alignItems: 'center', justifyContent: 'space-between', gap: '12px', flexWrap: 'wrap' }}>
        <div style={{ display: 'flex', alignItems: 'center', gap: '8px' }}>
          <BarChart3 size={18} color="var(--accent-primary)" />
          <h2 style={{ fontSize: '16px', fontWeight: 800, color: 'var(--text-primary)' }}>Estatísticas de leitura</h2>
        </div>
        <div role="tablist" aria-label="Período" style={{
          display: 'flex',
          padding: '3px',
          borderRadius: '12px',
          background: 'var(--bg-surface-elevated)',
          border: '1px solid var(--border-subtle)',
        }}>
          {PERIODS.map((p) => (
            <button
              key={p.id}
              role="tab"
              aria-selected={period === p.id}
              onClick={() => {
                setPeriod(p.id);
                setOffset(0);
                setHover(null);
              }}
              style={{
                padding: '7px 14px',
                borderRadius: '9px',
                fontSize: '13px',
                fontWeight: 700,
                color: period === p.id ? '#fff' : 'var(--text-secondary)',
                background: period === p.id ? 'var(--accent-primary)' : 'transparent',
              }}
            >
              {p.label}
            </button>
          ))}
        </div>
      </div>

      {/* Navegação entre períodos */}
      <div style={{ display: 'flex', alignItems: 'center', justifyContent: 'space-between', gap: '8px' }}>
        <button
          onClick={() => setOffset((o) => o - 1)}
          aria-label="Período anterior"
          style={{ width: '40px', height: '40px', borderRadius: '12px', display: 'flex', alignItems: 'center', justifyContent: 'center', color: 'var(--text-secondary)', background: 'var(--bg-surface-elevated)', border: '1px solid var(--border-subtle)' }}
        >
          <ChevronLeft size={20} />
        </button>
        <span style={{ fontSize: '15px', fontWeight: 700, color: 'var(--text-primary)', textAlign: 'center', textTransform: 'capitalize' }}>
          {stats ? periodLabel(stats) : '…'}
        </span>
        <button
          onClick={() => setOffset((o) => Math.min(0, o + 1))}
          disabled={offset === 0}
          aria-label="Próximo período"
          style={{ width: '40px', height: '40px', borderRadius: '12px', display: 'flex', alignItems: 'center', justifyContent: 'center', color: 'var(--text-secondary)', background: 'var(--bg-surface-elevated)', border: '1px solid var(--border-subtle)', opacity: offset === 0 ? 0.35 : 1 }}
        >
          <ChevronRight size={20} />
        </button>
      </div>

      {failed && !stats ? (
        <p style={{ fontSize: '14px', color: 'var(--text-secondary)', textAlign: 'center', padding: '24px 0' }}>
          Não foi possível carregar as estatísticas. Verifique a internet.
        </p>
      ) : !stats ? (
        <div style={{ display: 'flex', justifyContent: 'center', padding: '40px 0', color: 'var(--text-muted)' }}>
          <Loader2 size={22} className="animate-spin" />
        </div>
      ) : (
        <div style={{ display: 'flex', flexDirection: 'column', gap: '20px', opacity: loading ? 0.6 : 1, transition: 'opacity 150ms' }}>
          <div style={{ display: 'grid', gridTemplateColumns: 'repeat(auto-fit, minmax(min(150px, 100%), 1fr))', gap: '10px' }}>
            <Tile icon={<Clock size={14} />} label="Tempo ouvindo" value={formatDuration(stats.totals.seconds)} />
            <Tile icon={<BookOpen size={14} />} label="Palavras lidas" value={stats.totals.words.toLocaleString('pt-BR')} />
            <Tile
              icon={<TrendingUp size={14} />}
              label="Média por dia"
              value={stats.totals.words_per_day.toLocaleString('pt-BR')}
              note={stats.period === 'day' ? undefined : `palavras · ${stats.totals.active_days} ${stats.totals.active_days === 1 ? 'dia' : 'dias'} com leitura`}
            />
            <Tile
              icon={<Flame size={14} />}
              label="Sequência"
              value={`${stats.streak_days} ${stats.streak_days === 1 ? 'dia' : 'dias'}`}
              note="seguidos lendo"
            />
          </div>

          {/* Gráfico: minutos ouvindo por dia (ou por mês, no ano) */}
          <div>
            <div style={{ display: 'flex', justifyContent: 'space-between', alignItems: 'baseline', gap: '8px', marginBottom: '8px', minHeight: '20px' }}>
              <span style={{ fontSize: '12px', fontWeight: 600, color: 'var(--text-secondary)' }}>
                {stats.period === 'year' ? 'Minutos ouvindo por mês' : stats.period === 'day' ? 'Minutos ouvindo nos últimos 7 dias' : 'Minutos ouvindo por dia'}
              </span>
              {hovered && (
                <span style={{ fontSize: '12px', color: 'var(--text-primary)', fontVariantNumeric: 'tabular-nums' }}>
                  <strong>{pointLabel(hovered.key, stats.period).long}</strong> · {formatDuration(hovered.seconds)} · {hovered.words.toLocaleString('pt-BR')} palavras
                </span>
              )}
            </div>
            <div style={{ position: 'relative', height: `${chartHeight}px`, marginLeft: '28px' }}>
              {gridMinutes.lines.map((v) => (
                <div key={v} style={{ position: 'absolute', left: 0, right: 0, bottom: `${(v / gridMinutes.top) * chartHeight}px`, borderTop: '1px dashed var(--border-subtle)' }}>
                  <span style={{ position: 'absolute', left: '-28px', top: '-8px', fontSize: '10px', color: 'var(--text-muted)', fontVariantNumeric: 'tabular-nums' }}>{v}</span>
                </div>
              ))}
              <div style={{ position: 'absolute', left: 0, right: 0, bottom: 0, borderTop: '1px solid var(--border-subtle)' }} />
              <div
                style={{ position: 'absolute', inset: 0, display: 'flex', alignItems: 'flex-end', gap: '2px' }}
                onMouseLeave={() => setHover(null)}
              >
                {series.map((p, i) => {
                  const h = p.seconds > 0 ? Math.max(3, (p.seconds / 60 / gridMinutes.top) * chartHeight) : 0;
                  const isCurrent = p.key === stats.today || (stats.period === 'year' && stats.today.startsWith(p.key));
                  const label = pointLabel(p.key, stats.period);
                  return (
                    <button
                      key={p.key}
                      onMouseEnter={() => setHover(i)}
                      onFocus={() => setHover(i)}
                      onClick={() => setHover(i)}
                      aria-label={`${label.long}: ${formatDuration(p.seconds)}, ${p.words} palavras`}
                      style={{ flex: 1, height: '100%', display: 'flex', alignItems: 'flex-end', justifyContent: 'center', minWidth: 0, cursor: 'default' }}
                    >
                      <span style={{
                        width: '100%',
                        maxWidth: '28px',
                        height: `${h}px`,
                        borderRadius: '4px 4px 0 0',
                        background: 'var(--accent-primary)',
                        opacity: hover === null || hover === i ? (isCurrent || hover === i ? 1 : 0.75) : 0.35,
                        transition: 'opacity 120ms',
                      }} />
                    </button>
                  );
                })}
              </div>
            </div>
            <div style={{ display: 'flex', gap: '2px', marginLeft: '28px', marginTop: '6px' }}>
              {series.map((p, i) => {
                const label = pointLabel(p.key, stats.period);
                const show = showEveryLabel || i === 0 || (i + 1) % 5 === 0;
                const isCurrent = p.key === stats.today;
                return (
                  <span key={p.key} style={{
                    flex: 1,
                    minWidth: 0,
                    textAlign: 'center',
                    fontSize: '10px',
                    color: isCurrent ? 'var(--text-primary)' : 'var(--text-muted)',
                    fontWeight: isCurrent ? 700 : 400,
                    overflow: 'hidden',
                  }}>
                    {show ? label.short : ''}
                  </span>
                );
              })}
            </div>
          </div>

          {stats.books.length > 0 && (
            <div style={{ display: 'flex', flexDirection: 'column', gap: '8px' }}>
              <span style={{ fontSize: '12px', fontWeight: 600, color: 'var(--text-secondary)' }}>Livros no período</span>
              {stats.books.map((b) => (
                <div key={b.book_id} style={{
                  display: 'flex',
                  alignItems: 'center',
                  justifyContent: 'space-between',
                  gap: '12px',
                  padding: '10px 12px',
                  borderRadius: '12px',
                  background: 'var(--bg-surface-elevated)',
                }}>
                  <span style={{ fontSize: '13px', fontWeight: 600, color: 'var(--text-primary)', overflow: 'hidden', textOverflow: 'ellipsis', whiteSpace: 'nowrap', minWidth: 0 }}>
                    {b.title}
                  </span>
                  <span style={{ fontSize: '12px', color: 'var(--text-secondary)', flexShrink: 0, fontVariantNumeric: 'tabular-nums' }}>
                    {formatDuration(b.seconds)} · {b.words.toLocaleString('pt-BR')} palavras
                  </span>
                </div>
              ))}
            </div>
          )}

          <p style={{ fontSize: '12px', color: 'var(--text-muted)' }}>
            Total desde o início: {formatDuration(stats.lifetime.seconds)} ouvindo e {stats.lifetime.words.toLocaleString('pt-BR')} palavras.
            Conta só o que a voz leu até o fim; pular capítulos não soma.
          </p>
        </div>
      )}
    </div>
  );
};
