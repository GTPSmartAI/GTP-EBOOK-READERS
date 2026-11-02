import React, { useState } from 'react';
import { Heart, Volume2, Check, Mic2, Cpu } from 'lucide-react';
import type { VoiceOption } from '../../types';
import { ENGINE_BADGE } from '../../data/voices';

interface VozesProps {
  voices: VoiceOption[];
  selectedVoice: VoiceOption;
  favoriteVoiceIds: string[];
  onSelectVoice: (voice: VoiceOption) => void;
  onToggleFavoriteVoice: (voiceId: string) => void;
  onPreviewVoice: (voice: VoiceOption) => void;
}

type FilterCategory = 'all' | 'female' | 'male' | 'favorites';

const FILTERS: { id: FilterCategory; label: string }[] = [
  { id: 'all', label: 'Todas as vozes' },
  { id: 'female', label: 'Femininas' },
  { id: 'male', label: 'Masculinas' },
  { id: 'favorites', label: 'Favoritas ❤️' },
];

/**
 * Catálogo de vozes. Todas são geradas no próprio aparelho (motor Piper no processador do celular).
 * O duplicador de voz da versão com servidor está em servidor-arquivado/frontend/src/pages/Vozes.
 */
export const Vozes: React.FC<VozesProps> = ({
  voices,
  selectedVoice,
  favoriteVoiceIds,
  onSelectVoice,
  onToggleFavoriteVoice,
  onPreviewVoice,
}) => {
  const [filter, setFilter] = useState<FilterCategory>('all');

  const filteredVoices = voices.filter((v) => {
    if (filter === 'female') return v.gender === 'female';
    if (filter === 'male') return v.gender === 'male';
    if (filter === 'favorites') return favoriteVoiceIds.includes(v.id);
    return true;
  });

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
      gap: '28px',
    }}>
      {/* Título */}
      <div style={{ paddingBottom: '20px', borderBottom: '1px solid var(--border-subtle)' }}>
        <div style={{ display: 'flex', alignItems: 'center', gap: '10px' }}>
          <div style={{
            width: '40px',
            height: '40px',
            borderRadius: '12px',
            background: 'linear-gradient(135deg, #10b981 0%, #059669 100%)',
            display: 'flex',
            alignItems: 'center',
            justifyContent: 'center',
            color: '#fff',
            boxShadow: '0 8px 20px rgba(16, 185, 129, 0.3)',
            flexShrink: 0,
          }}>
            <Mic2 size={22} />
          </div>
          <div>
            <h1 style={{
              fontSize: '24px',
              fontWeight: 900,
              color: '#f8fafc',
              textTransform: 'uppercase',
              letterSpacing: '-0.02em',
            }}>
              Vozes
            </h1>
            <p style={{ fontSize: '13px', color: '#94a3b8', marginTop: '2px', display: 'flex', alignItems: 'center', gap: '6px' }}>
              <Cpu size={13} /> Geradas no próprio aparelho, sem internet.
            </p>
          </div>
        </div>
      </div>

      {/* Filtros e voz ativa */}
      <div style={{ display: 'flex', justifyContent: 'space-between', alignItems: 'center', flexWrap: 'wrap', gap: '16px' }}>
        <div style={{ display: 'flex', gap: '8px', flexWrap: 'wrap' }}>
          {FILTERS.map((tab) => (
            <button
              key={tab.id}
              onClick={() => setFilter(tab.id)}
              style={{
                padding: '6px 14px',
                borderRadius: '12px',
                fontSize: '12px',
                fontWeight: 700,
                background: filter === tab.id ? 'rgba(16, 185, 129, 0.15)' : 'var(--bg-surface)',
                color: filter === tab.id ? '#10b981' : '#94a3b8',
                border: filter === tab.id ? '1px solid rgba(16, 185, 129, 0.3)' : '1px solid var(--border-subtle)',
                cursor: 'pointer',
                transition: 'all 120ms',
              }}
            >
              {tab.label}
            </button>
          ))}
        </div>

        <div style={{ display: 'flex', alignItems: 'center', gap: '8px' }}>
          <span style={{ fontSize: '12px', color: '#94a3b8' }}>Voz ativa no leitor:</span>
          <span style={{
            fontSize: '12px',
            fontWeight: 800,
            color: '#10b981',
            background: 'rgba(16, 185, 129, 0.12)',
            padding: '4px 12px',
            borderRadius: '8px',
            border: '1px solid rgba(16, 185, 129, 0.25)',
          }}>
            {selectedVoice.name}
          </span>
        </div>
      </div>

      {filteredVoices.length === 0 && (
        <p style={{ fontSize: '13px', color: '#94a3b8' }}>Nenhuma voz aqui ainda. Toque no ❤️ de uma voz para favoritá-la.</p>
      )}

      {/* Grade de vozes */}
      <div style={{
        display: 'grid',
        gridTemplateColumns: 'repeat(auto-fill, minmax(min(360px, 100%), 1fr))',
        gap: '20px',
      }}>
        {filteredVoices.map((voice) => {
          const isSelected = selectedVoice.id === voice.id;
          const isFav = favoriteVoiceIds.includes(voice.id);
          const badge = ENGINE_BADGE[voice.engine];

          return (
            <div
              key={voice.id}
              className="floating-card"
              onClick={() => onSelectVoice(voice)}
              style={{
                borderRadius: '24px',
                padding: '24px',
                background: 'var(--bg-surface)',
                border: isSelected ? '2px solid #10b981' : '1px solid var(--border-subtle)',
                cursor: 'pointer',
                display: 'flex',
                flexDirection: 'column',
                justifyContent: 'space-between',
                position: 'relative',
                boxShadow: isSelected ? '0 12px 30px rgba(16, 185, 129, 0.15)' : 'var(--shadow-sm)',
                transition: 'all 200ms ease',
              }}
            >
              <div>
                {/* Avatar, nome e favorito */}
                <div style={{ display: 'flex', justifyContent: 'space-between', alignItems: 'flex-start' }}>
                  <div style={{ display: 'flex', gap: '14px', alignItems: 'center' }}>
                    <div style={{
                      width: '52px',
                      height: '52px',
                      borderRadius: '16px',
                      background: voice.avatarColor || 'linear-gradient(135deg, #10b981 0%, #059669 100%)',
                      display: 'flex',
                      alignItems: 'center',
                      justifyContent: 'center',
                      color: '#ffffff',
                      fontWeight: 900,
                      fontSize: '20px',
                      boxShadow: '0 4px 12px rgba(0,0,0,0.3)',
                    }}>
                      {voice.name.charAt(0)}
                    </div>

                    <div>
                      <div style={{ display: 'flex', alignItems: 'center', gap: '8px', flexWrap: 'wrap' }}>
                        <h3 style={{ fontSize: '17px', fontWeight: 800, color: '#f8fafc' }}>{voice.name}</h3>
                        {isSelected && (
                          <span style={{
                            display: 'flex',
                            alignItems: 'center',
                            gap: '3px',
                            fontSize: '10px',
                            fontWeight: 800,
                            background: '#10b981',
                            color: '#ffffff',
                            padding: '2px 6px',
                            borderRadius: '6px',
                          }}>
                            <Check size={11} /> ATIVA
                          </span>
                        )}
                        {badge && (
                          <span style={{
                            fontSize: '9px',
                            fontWeight: 800,
                            padding: '2px 6px',
                            borderRadius: '6px',
                            color: badge.color,
                            border: `1px solid ${badge.color}55`,
                          }}>
                            {badge.label}
                          </span>
                        )}
                      </div>
                      <span style={{ fontSize: '11px', color: '#94a3b8' }}>
                        {voice.accent} · {voice.gender === 'female' ? 'Feminina' : 'Masculina'}
                      </span>
                    </div>
                  </div>

                  <button
                    onClick={(e) => {
                      e.stopPropagation();
                      onToggleFavoriteVoice(voice.id);
                    }}
                    title={isFav ? 'Remover dos favoritos' : 'Favoritar voz'}
                    style={{
                      padding: '6px',
                      color: isFav ? '#10b981' : '#64748b',
                      background: isFav ? 'rgba(16, 185, 129, 0.15)' : 'rgba(255, 255, 255, 0.04)',
                      borderRadius: '10px',
                      cursor: 'pointer',
                    }}
                  >
                    <Heart size={16} fill={isFav ? '#10b981' : 'none'} />
                  </button>
                </div>

                {/* Etiqueta e descrição */}
                <div style={{ marginTop: '14px', display: 'flex', gap: '6px', flexWrap: 'wrap' }}>
                  <span style={{
                    fontSize: '11px',
                    fontWeight: 700,
                    color: '#10b981',
                    background: 'rgba(16, 185, 129, 0.1)',
                    padding: '3px 8px',
                    borderRadius: '6px',
                    letterSpacing: '0.03em',
                  }}>
                    {voice.tag}
                  </span>
                </div>
                <p style={{ fontSize: '13px', color: '#94a3b8', lineHeight: 1.5, marginTop: '10px' }}>
                  {voice.description}
                </p>
              </div>

              {/* Amostra */}
              <div style={{
                marginTop: '18px',
                padding: '12px 14px',
                borderRadius: '14px',
                background: 'rgba(0, 0, 0, 0.25)',
                border: '1px solid var(--border-subtle)',
                display: 'flex',
                alignItems: 'center',
                justifyContent: 'space-between',
                gap: '12px',
              }}>
                <span style={{
                  fontSize: '12px',
                  color: '#cbd5e1',
                  fontStyle: 'italic',
                  overflow: 'hidden',
                  textOverflow: 'ellipsis',
                  whiteSpace: 'nowrap',
                  flex: 1,
                }}>
                  "{voice.samplePhrase}"
                </span>

                <button
                  onClick={(e) => {
                    e.stopPropagation();
                    onPreviewVoice(voice);
                  }}
                  style={{
                    display: 'flex',
                    alignItems: 'center',
                    gap: '6px',
                    padding: '6px 12px',
                    borderRadius: '10px',
                    background: 'linear-gradient(135deg, #10b981 0%, #059669 100%)',
                    color: '#ffffff',
                    fontSize: '11px',
                    fontWeight: 800,
                    textTransform: 'uppercase',
                    letterSpacing: '0.04em',
                    flexShrink: 0,
                    cursor: 'pointer',
                  }}
                >
                  <Volume2 size={13} />
                  <span>Ouvir</span>
                </button>
              </div>
            </div>
          );
        })}
      </div>
    </div>
  );
};
