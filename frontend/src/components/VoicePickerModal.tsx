import React, { useState } from 'react';
import { X, Play, Check, Heart, Volume2 } from 'lucide-react';
import type { VoiceOption } from '../types';
import { VOICES, ENGINE_BADGE } from '../data/voices';
import { speechEngine } from '../services/speechEngine';
import { useEscapeKey } from '../hooks/useEscapeKey';

interface VoicePickerModalProps {
  isOpen: boolean;
  onClose: () => void;
  selectedVoice: VoiceOption;
  onSelectVoice: (voice: VoiceOption) => void;
}

// Todas as vozes são em português e geradas no aparelho
type TabType = 'all' | 'azure' | 'offline' | 'favorites';

const LANGUAGE_TABS: { id: TabType; label: string }[] = [
  { id: 'all', label: '🇧🇷 Todas' },
  { id: 'azure', label: '✨ Estúdio Azure' },
  { id: 'offline', label: '⚡ No Celular' },
  { id: 'favorites', label: 'Favoritas ❤️' },
];

export const VoicePickerModal: React.FC<VoicePickerModalProps> = ({
  isOpen,
  onClose,
  selectedVoice,
  onSelectVoice,
}) => {
  const [activeTab, setActiveTab] = useState<TabType>('all');
  const [previewingId, setPreviewingId] = useState<string | null>(null);
  useEscapeKey(isOpen, onClose);

  // Vozes favoritas salvas
  const [favoriteIds, setFavoriteIds] = useState<string[]>(() => {
    try {
      const saved = localStorage.getItem('gtp_favorite_voices');
      return saved ? JSON.parse(saved) : [];
    } catch {
      return [];
    }
  });

  const toggleFavorite = (e: React.MouseEvent, voiceId: string) => {
    e.stopPropagation();
    setFavoriteIds((prev: string[]) => {
      const next = prev.includes(voiceId) ? prev.filter((id: string) => id !== voiceId) : [...prev, voiceId];
      localStorage.setItem('gtp_favorite_voices', JSON.stringify(next));
      return next;
    });
  };

  const handlePreview = (e: React.MouseEvent, voice: VoiceOption) => {
    e.stopPropagation();
    setPreviewingId(voice.id);
    speechEngine.previewVoice(voice).finally(() => {
      setPreviewingId((current) => (current === voice.id ? null : current));
    });
  };

  if (!isOpen) return null;

  const displayedVoices = VOICES.filter((v) => {
    if (activeTab === 'favorites') return favoriteIds.includes(v.id);
    if (activeTab === 'azure') return v.engine === 'edge';
    if (activeTab === 'offline') return v.engine === 'piper';
    return true;
  });

  return (
    <div style={{
      position: 'fixed',
      inset: 0,
      zIndex: 120,
      display: 'flex',
      justifyContent: 'flex-end',
      backgroundColor: 'rgba(0, 0, 0, 0.75)',
      backdropFilter: 'blur(10px)',
      WebkitBackdropFilter: 'blur(10px)',
      transition: 'opacity 250ms ease',
    }}>
      {/* Backdrop clicável para fechar */}
      <div 
        onClick={onClose} 
        style={{ flex: 1, cursor: 'pointer' }} 
      />

      {/* Drawer Lateral Direito Soft & Bold Cyber-Dark */}
      <div style={{
        width: '100%',
        maxWidth: '460px',
        height: '100%',
        background: '#090d16',
        borderLeft: '1px solid rgba(255, 255, 255, 0.12)',
        boxShadow: '-10px 0 35px rgba(0, 0, 0, 0.8)',
        display: 'flex',
        flexDirection: 'column',
        zIndex: 130,
        animation: 'slideInRight 0.25s cubic-bezier(0.16, 1, 0.3, 1)',
      }}>
        {/* Header do Drawer: Voices + Fechar */}
        <div style={{
          padding: '20px 24px 16px 24px',
          display: 'flex',
          alignItems: 'center',
          justifyContent: 'space-between',
          borderBottom: '1px solid rgba(255, 255, 255, 0.08)',
        }}>
          <div>
            <h2 style={{
              fontSize: '18px',
              fontWeight: 900,
              color: '#f8fafc',
              letterSpacing: '-0.02em',
              textTransform: 'uppercase',
            }}>
              Vozes & Narradores
            </h2>
            <p style={{ fontSize: '11px', color: '#94a3b8', marginTop: '2px' }}>
              A voz escolhida aqui é a da narração
            </p>
          </div>

          <button
            onClick={onClose}
            style={{
              width: '32px',
              height: '32px',
              borderRadius: '8px',
              background: 'rgba(255, 255, 255, 0.05)',
              border: '1px solid rgba(255, 255, 255, 0.08)',
              color: '#94a3b8',
              display: 'flex',
              alignItems: 'center',
              justifyContent: 'center',
              cursor: 'pointer',
              transition: 'all 150ms',
            }}
          >
            <X size={18} />
          </button>
        </div>

        {/* Abas em Pílula (Filtros: Todas | Graves 🎙️ | Espaçosas 🧘 | Cinema 🎬 | Criadas | Favoritas) */}
        <div style={{
          display: 'flex',
          alignItems: 'center',
          gap: '6px',
          padding: '12px 20px',
          borderBottom: '1px solid rgba(255, 255, 255, 0.06)',
          background: 'rgba(255, 255, 255, 0.02)',
          overflowX: 'auto',
          scrollbarWidth: 'none',
        }}>
          {LANGUAGE_TABS.map((tab) => {
            const isSelected = activeTab === tab.id;
            return (
              <button
                key={tab.id}
                onClick={() => setActiveTab(tab.id)}
                style={{
                  padding: '5px 12px',
                  borderRadius: '9999px',
                  fontSize: '11px',
                  fontWeight: isSelected ? 800 : 600,
                  background: isSelected ? '#10b981' : 'rgba(255, 255, 255, 0.05)',
                  color: isSelected ? '#ffffff' : '#94a3b8',
                  border: isSelected ? '1px solid #10b981' : '1px solid rgba(255, 255, 255, 0.08)',
                  cursor: 'pointer',
                  whiteSpace: 'nowrap',
                  transition: 'all 150ms ease',
                }}
              >
                {tab.label}
              </button>
            );
          })}
        </div>

        {/* Área Scrollável */}
        <div style={{
          flex: 1,
          overflowY: 'auto',
          padding: '18px 24px',
          display: 'flex',
          flexDirection: 'column',
          gap: '16px',
        }}>
          {/* Subtítulo da Lista */}
          <div>
            <div style={{ display: 'flex', justifyContent: 'space-between', alignItems: 'center', marginBottom: '10px' }}>
              <span style={{
                fontSize: '10px',
                fontWeight: 800,
                textTransform: 'uppercase',
                letterSpacing: '0.08em',
                color: '#64748b',
              }}>
                {activeTab === 'favorites' ? 'Vozes Favoritas' : activeTab === 'azure' ? 'Vozes Estúdio Azure (Online)' : activeTab === 'offline' ? 'Vozes no Celular (Offline)' : 'Todas as vozes em português'}
              </span>
              <span style={{ fontSize: '11px', color: '#94a3b8', fontWeight: 600 }}>
                {displayedVoices.length} disponíveis
              </span>
            </div>

            {/* Lista de Vozes */}
            <div style={{ display: 'flex', flexDirection: 'column', gap: '8px' }}>
              {displayedVoices.map((voice) => {
                const isSelected = selectedVoice.id === voice.id;
                const isFav = favoriteIds.includes(voice.id);
                const isPreviewing = previewingId === voice.id;

                return (
                  <div
                    key={voice.id}
                    onClick={() => onSelectVoice(voice)}
                    style={{
                      display: 'flex',
                      alignItems: 'center',
                      justifyContent: 'space-between',
                      padding: '12px 14px',
                      borderRadius: '16px',
                      background: isSelected ? 'rgba(16, 185, 129, 0.12)' : 'rgba(255, 255, 255, 0.03)',
                      border: isSelected ? '1px solid rgba(16, 185, 129, 0.5)' : '1px solid rgba(255, 255, 255, 0.06)',
                      cursor: 'pointer',
                      transition: 'all 150ms ease',
                    }}
                  >
                    {/* Esquerda: Avatar + Informações da voz */}
                    <div style={{ display: 'flex', alignItems: 'center', gap: '12px', flex: 1, overflow: 'hidden' }}>
                      <div style={{
                        width: '42px',
                        height: '42px',
                        borderRadius: '50%',
                        background: voice.avatarColor || 'linear-gradient(135deg, #10b981 0%, #059669 100%)',
                        display: 'flex',
                        alignItems: 'center',
                        justifyContent: 'center',
                        color: '#ffffff',
                        fontWeight: 900,
                        fontSize: '15px',
                        flexShrink: 0,
                        boxShadow: '0 4px 10px rgba(0, 0, 0, 0.3)',
                      }}>
                        {voice.name[0]}
                      </div>

                      <div style={{ display: 'flex', flexDirection: 'column', overflow: 'hidden' }}>
                        <div style={{ display: 'flex', alignItems: 'center', gap: '6px' }}>
                          <span style={{
                            fontSize: '13px',
                            fontWeight: isSelected ? 800 : 700,
                            color: isSelected ? '#10b981' : '#f8fafc',
                            whiteSpace: 'nowrap',
                            overflow: 'hidden',
                            textOverflow: 'ellipsis',
                          }}>
                            {voice.name}
                          </span>

                          {/* Badge do motor */}
                          {voice.engine && ENGINE_BADGE[voice.engine] && (
                            <span style={{
                              fontSize: '9px',
                              fontWeight: 800,
                              padding: '1px 6px',
                              borderRadius: '4px',
                              color: ENGINE_BADGE[voice.engine].color,
                              border: `1px solid ${ENGINE_BADGE[voice.engine].color}55`,
                            }}>
                              {ENGINE_BADGE[voice.engine].label}
                            </span>
                          )}
                        </div>
                        <span style={{
                          fontSize: '11px',
                          color: '#94a3b8',
                          whiteSpace: 'nowrap',
                          overflow: 'hidden',
                          textOverflow: 'ellipsis',
                          marginTop: '1px',
                        }}>
                          {voice.tag}{voice.accent ? ` · ${voice.accent.split('·').pop()?.trim()}` : ''}{voice.gender === 'female' ? ' · Feminina' : ' · Masculina'}
                        </span>
                      </div>
                    </div>

                    {/* Direita: Ações (Play Amostra, Favorito, Check) */}
                    <div style={{ display: 'flex', alignItems: 'center', gap: '8px', flexShrink: 0 }}>
                      <button
                        onClick={(e) => handlePreview(e, voice)}
                        style={{
                          width: '28px',
                          height: '28px',
                          borderRadius: '50%',
                          background: isPreviewing ? '#10b981' : 'rgba(255, 255, 255, 0.08)',
                          color: isPreviewing ? '#ffffff' : '#cbd5e1',
                          border: 'none',
                          display: 'flex',
                          alignItems: 'center',
                          justifyContent: 'center',
                          cursor: 'pointer',
                          transition: 'all 120ms',
                        }}
                        title="Ouvir amostra de voz"
                      >
                        {isPreviewing ? <Volume2 size={13} /> : <Play size={12} style={{ marginLeft: '1px' }} />}
                      </button>

                      <button
                        onClick={(e) => toggleFavorite(e, voice.id)}
                        style={{
                          width: '28px',
                          height: '28px',
                          borderRadius: '50%',
                          background: 'transparent',
                          color: isFav ? '#ef4444' : '#64748b',
                          border: 'none',
                          display: 'flex',
                          alignItems: 'center',
                          justifyContent: 'center',
                          cursor: 'pointer',
                        }}
                        title={isFav ? 'Remover dos favoritos' : 'Favoritar voz'}
                      >
                        <Heart size={14} fill={isFav ? '#ef4444' : 'none'} />
                      </button>

                      {isSelected && (
                        <div style={{
                          width: '22px',
                          height: '22px',
                          borderRadius: '50%',
                          background: '#10b981',
                          color: '#ffffff',
                          display: 'flex',
                          alignItems: 'center',
                          justifyContent: 'center',
                        }}>
                          <Check size={13} />
                        </div>
                      )}
                    </div>
                  </div>
                );
              })}
            </div>
          </div>
        </div>
      </div>
    </div>
  );
};
