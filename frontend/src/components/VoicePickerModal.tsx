import React, { useState } from 'react';
import { X, Play, Check, Heart, Plus, Volume2 } from 'lucide-react';
import type { VoiceOption } from '../types';
import { ELEVEN_VOICES } from '../data/voices';
import { speechEngine } from '../services/speechEngine';

interface VoicePickerModalProps {
  isOpen: boolean;
  onClose: () => void;
  selectedVoice: VoiceOption;
  onSelectVoice: (voice: VoiceOption) => void;
  onNavigateToCloner?: () => void;
}

export const VoicePickerModal: React.FC<VoicePickerModalProps> = ({
  isOpen,
  onClose,
  selectedVoice,
  onSelectVoice,
  onNavigateToCloner,
}) => {
  const [activeTab, setActiveTab] = useState<'recent' | 'favorites' | 'explore' | 'created'>('recent');
  const [previewingId, setPreviewingId] = useState<string | null>(null);

  // Vozes favoritas salvas
  const [favoriteIds, setFavoriteIds] = useState<string[]>(() => {
    try {
      const saved = localStorage.getItem('gtp_favorite_voices');
      return saved ? JSON.parse(saved) : ['francisca-dramatica', 'antonio-suspense', 'cid-moreira-legend'];
    } catch {
      return ['francisca-dramatica', 'antonio-suspense'];
    }
  });

  const toggleFavorite = (e: React.MouseEvent, voiceId: string) => {
    e.stopPropagation();
    setFavoriteIds((prev) => {
      const next = prev.includes(voiceId) ? prev.filter((id) => id !== voiceId) : [...prev, voiceId];
      localStorage.setItem('gtp_favorite_voices', JSON.stringify(next));
      return next;
    });
  };

  const handlePreview = (e: React.MouseEvent, voice: VoiceOption) => {
    e.stopPropagation();
    setPreviewingId(voice.id);
    speechEngine.previewVoice(voice);
    setTimeout(() => {
      setPreviewingId(null);
    }, 4500);
  };

  if (!isOpen) return null;

  // Vozes clonadas locais
  const clonedVoices: VoiceOption[] = (() => {
    try {
      const saved = localStorage.getItem('gtp_cloned_voices');
      return saved ? JSON.parse(saved) : [];
    } catch {
      return [];
    }
  })();

  // Voz especial Cid Moreira (Lenda brasileira de narração dramática)
  const cidMoreiraVoice: VoiceOption = {
    id: 'cid-moreira-legend',
    name: 'Cid Moreira™',
    gender: 'male',
    lang: 'pt-BR',
    accent: 'Brasil (Voz Lendária & Profunda)',
    tag: 'Brazilian Legend & Dramatic Narrator',
    description: 'Tom icônico, solene e comovente. Ideal para suspense, mistério, história e ficção épica.',
    samplePhrase: 'No princípio era o verbo... e as trevas cobriam a face do abismo.',
    avatarColor: 'linear-gradient(135deg, #10b981 0%, #047857 100%)',
    stability: 0.95,
    clarity: 0.98,
    speed: 0.95,
  };

  const allVoicesList = [cidMoreiraVoice, ...clonedVoices, ...ELEVEN_VOICES];

  const displayedVoices = allVoicesList.filter((v) => {
    if (activeTab === 'favorites') return favoriteIds.includes(v.id);
    if (activeTab === 'created') return clonedVoices.some((c) => c.id === v.id);
    if (activeTab === 'recent') return true;
    return true; // explore
  });

  return (
    <div style={{
      position: 'fixed',
      inset: 0,
      zIndex: 120,
      display: 'flex',
      justifyContent: 'flex-end',
      backgroundColor: 'rgba(0, 0, 0, 0.65)',
      backdropFilter: 'blur(8px)',
      WebkitBackdropFilter: 'blur(8px)',
      transition: 'opacity 250ms ease',
    }}>
      {/* Backdrop clicável para fechar */}
      <div 
        onClick={onClose} 
        style={{ flex: 1, cursor: 'pointer' }} 
      />

      {/* Drawer Lateral Direito */}
      <div style={{
        width: '100%',
        maxWidth: '430px',
        height: '100%',
        background: '#090d16',
        borderLeft: '1px solid rgba(255, 255, 255, 0.12)',
        boxShadow: '-10px 0 35px rgba(0, 0, 0, 0.7)',
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
          <h2 style={{
            fontSize: '18px',
            fontWeight: 800,
            color: '#f8fafc',
            letterSpacing: '-0.02em',
          }}>
            Voices
          </h2>

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

        {/* Abas em Pílula (Recent | Favorites | Explore | Created) */}
        <div style={{
          display: 'flex',
          alignItems: 'center',
          gap: '6px',
          padding: '12px 24px',
          borderBottom: '1px solid rgba(255, 255, 255, 0.06)',
          background: 'rgba(255, 255, 255, 0.02)',
        }}>
          {[
            { id: 'recent', label: 'Recent' },
            { id: 'favorites', label: 'Favorites' },
            { id: 'explore', label: 'Explore' },
            { id: 'created', label: 'Created' },
          ].map((tab) => {
            const isSelected = activeTab === tab.id;
            return (
              <button
                key={tab.id}
                onClick={() => setActiveTab(tab.id as any)}
                style={{
                  padding: '6px 14px',
                  borderRadius: '9999px',
                  fontSize: '12px',
                  fontWeight: isSelected ? 800 : 500,
                  background: isSelected ? '#ffffff' : 'rgba(255, 255, 255, 0.05)',
                  color: isSelected ? '#000000' : '#94a3b8',
                  border: isSelected ? '1px solid #ffffff' : '1px solid rgba(255, 255, 255, 0.08)',
                  cursor: 'pointer',
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
          {/* Card de Ação: Create New Voice */}
          <div>
            <span style={{
              fontSize: '10px',
              fontWeight: 800,
              textTransform: 'uppercase',
              letterSpacing: '0.08em',
              color: '#64748b',
              display: 'block',
              marginBottom: '8px',
            }}>
              Design your own narrator
            </span>

            <button
              onClick={() => {
                onClose();
                onNavigateToCloner?.();
              }}
              style={{
                width: '100%',
                display: 'flex',
                alignItems: 'center',
                gap: '12px',
                padding: '12px 16px',
                borderRadius: '14px',
                background: 'rgba(16, 185, 129, 0.08)',
                border: '1px dashed rgba(16, 185, 129, 0.4)',
                color: '#f8fafc',
                cursor: 'pointer',
                textAlign: 'left',
                transition: 'all 200ms',
              }}
            >
              <div style={{
                width: '36px',
                height: '36px',
                borderRadius: '50%',
                background: '#10b981',
                color: '#ffffff',
                display: 'flex',
                alignItems: 'center',
                justifyContent: 'center',
                fontWeight: 900,
              }}>
                <Plus size={18} />
              </div>
              <div>
                <span style={{ fontSize: '13px', fontWeight: 800, color: '#f8fafc', display: 'block' }}>
                  Create new voice
                </span>
                <span style={{ fontSize: '11px', color: '#94a3b8' }}>
                  Clone sua própria voz ou crie um narrador exclusivo
                </span>
              </div>
            </button>
          </div>

          {/* Subtítulo: Recent voices */}
          <div>
            <span style={{
              fontSize: '10px',
              fontWeight: 800,
              textTransform: 'uppercase',
              letterSpacing: '0.08em',
              color: '#64748b',
              display: 'block',
              marginBottom: '10px',
            }}>
              {activeTab === 'favorites' ? 'Vozes Favoritas' : activeTab === 'created' ? 'Vozes Criadas por Você' : 'Recent voices'}
            </span>

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
                      borderRadius: '14px',
                      background: isSelected ? 'rgba(16, 185, 129, 0.12)' : 'rgba(255, 255, 255, 0.03)',
                      border: isSelected ? '1px solid rgba(16, 185, 129, 0.4)' : '1px solid rgba(255, 255, 255, 0.06)',
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
                        </div>
                        <span style={{
                          fontSize: '11px',
                          color: '#94a3b8',
                          whiteSpace: 'nowrap',
                          overflow: 'hidden',
                          textOverflow: 'ellipsis',
                        }}>
                          {voice.tag || voice.accent}
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
