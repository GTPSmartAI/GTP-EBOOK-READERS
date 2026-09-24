import React, { useState } from 'react';
import { X, Play, Check, Sparkles, Volume2, SlidersHorizontal } from 'lucide-react';
import type { VoiceOption } from '../types';
import { ELEVEN_VOICES } from '../data/voices';
import { speechEngine } from '../services/speechEngine';

interface VoicePickerModalProps {
  isOpen: boolean;
  onClose: () => void;
  selectedVoice: VoiceOption;
  onSelectVoice: (voice: VoiceOption) => void;
}

export const VoicePickerModal: React.FC<VoicePickerModalProps> = ({
  isOpen,
  onClose,
  selectedVoice,
  onSelectVoice,
}) => {
  const [filterLang, setFilterLang] = useState<string>('all');
  const [previewingId, setPreviewingId] = useState<string | null>(null);
  const [stability, setStability] = useState<number>(selectedVoice.stability * 100);
  const [clarity, setClarity] = useState<number>(selectedVoice.clarity * 100);

  if (!isOpen) return null;

  const handlePreview = (e: React.MouseEvent, voice: VoiceOption) => {
    e.stopPropagation();
    setPreviewingId(voice.id);
    speechEngine.previewVoice(voice);
    setTimeout(() => {
      setPreviewingId(null);
    }, 4000);
  };

  const [clonedVoices] = useState<VoiceOption[]>(() => {
    try {
      const saved = localStorage.getItem('gtp_cloned_voices');
      return saved ? JSON.parse(saved) : [];
    } catch {
      return [];
    }
  });

  const allVoices = [...clonedVoices, ...ELEVEN_VOICES];

  const filteredVoices = allVoices.filter((v) => {
    if (filterLang === 'pt') return v.lang.startsWith('pt');
    if (filterLang === 'en') return v.lang.startsWith('en');
    return true;
  });

  return (
    <div style={{
      position: 'fixed',
      inset: 0,
      zIndex: 100,
      display: 'flex',
      alignItems: 'center',
      justifyContent: 'center',
      backgroundColor: 'rgba(0, 0, 0, 0.65)',
      backdropFilter: 'blur(8px)',
      padding: '20px',
    }}>
      <div 
        className="slide-up"
        style={{
          width: '100%',
          maxWidth: '750px',
          maxHeight: '90vh',
          background: 'var(--bg-surface)',
          borderRadius: 'var(--radius-lg)',
          border: '1px solid var(--border-subtle)',
          boxShadow: 'var(--shadow-lg)',
          display: 'flex',
          flexDirection: 'column',
          overflow: 'hidden',
        }}
      >
        {/* Header */}
        <div style={{
          display: 'flex',
          alignItems: 'center',
          justifyContent: 'space-between',
          padding: '20px 24px',
          borderBottom: '1px solid var(--border-subtle)',
        }}>
          <div>
            <div style={{ display: 'flex', alignItems: 'center', gap: '8px' }}>
              <Sparkles size={18} color="var(--accent-primary)" />
              <h2 style={{ fontSize: '18px', fontWeight: 700, color: 'var(--text-primary)' }}>
                Galeria de Vozes ElevenLabs
              </h2>
            </div>
            <p style={{ fontSize: '13px', color: 'var(--text-secondary)', marginTop: '2px' }}>
              Escolha um narrador ultra-realista para dar vida às páginas do seu livro.
            </p>
          </div>

          <button
            onClick={onClose}
            style={{
              padding: '8px',
              borderRadius: 'var(--radius-sm)',
              color: 'var(--text-muted)',
            }}
          >
            <X size={18} />
          </button>
        </div>

        {/* Filter Tabs */}
        <div style={{
          display: 'flex',
          alignItems: 'center',
          gap: '8px',
          padding: '12px 24px',
          borderBottom: '1px solid var(--border-subtle)',
          background: 'rgba(255, 255, 255, 0.02)',
        }}>
          <span style={{ fontSize: '12px', color: 'var(--text-muted)', marginRight: '4px' }}>Idioma:</span>
          {[
            { id: 'all', label: 'Todas as Vozes' },
            { id: 'pt', label: '🇧🇷 Português do Brasil' },
            { id: 'en', label: '🇺🇸 / 🇬🇧 Inglês' },
          ].map((tab) => (
            <button
              key={tab.id}
              onClick={() => setFilterLang(tab.id)}
              style={{
                padding: '4px 12px',
                borderRadius: 'var(--radius-full)',
                fontSize: '12px',
                fontWeight: 500,
                background: filterLang === tab.id ? 'var(--accent-primary)' : 'var(--bg-surface-elevated)',
                color: filterLang === tab.id ? '#ffffff' : 'var(--text-secondary)',
                border: '1px solid var(--border-subtle)',
              }}
            >
              {tab.label}
            </button>
          ))}
        </div>

        {/* Voice Cards List */}
        <div style={{
          flex: 1,
          overflowY: 'auto',
          padding: '20px 24px',
          display: 'grid',
          gridTemplateColumns: 'repeat(auto-fill, minmax(320px, 1fr))',
          gap: '14px',
        }}>
          {filteredVoices.map((voice) => {
            const isSelected = selectedVoice.id === voice.id;
            return (
              <div
                key={voice.id}
                onClick={() => onSelectVoice(voice)}
                style={{
                  display: 'flex',
                  flexDirection: 'column',
                  gap: '10px',
                  padding: '16px',
                  borderRadius: 'var(--radius-md)',
                  background: isSelected ? 'var(--bg-surface-elevated)' : 'var(--bg-surface)',
                  border: isSelected ? '2px solid var(--accent-primary)' : '1px solid var(--border-subtle)',
                  boxShadow: isSelected ? '0 0 16px var(--accent-glow)' : 'var(--shadow-sm)',
                  cursor: 'pointer',
                  position: 'relative',
                  transition: 'all var(--transition-fast)',
                }}
              >
                {/* Top Row: Avatar, Name, Accent & Check */}
                <div style={{ display: 'flex', alignItems: 'center', justifyContent: 'space-between' }}>
                  <div style={{ display: 'flex', alignItems: 'center', gap: '12px' }}>
                    <div style={{
                      width: '40px',
                      height: '40px',
                      borderRadius: '50%',
                      background: voice.avatarColor,
                      display: 'flex',
                      alignItems: 'center',
                      justifyContent: 'center',
                      color: '#ffffff',
                      fontWeight: 700,
                      fontSize: '16px',
                      boxShadow: 'var(--shadow-sm)',
                    }}>
                      {voice.name[0]}
                    </div>
                    <div>
                      <div style={{ display: 'flex', alignItems: 'center', gap: '6px' }}>
                        <span style={{ fontSize: '15px', fontWeight: 700, color: 'var(--text-primary)' }}>
                          {voice.name}
                        </span>
                        <span style={{
                          fontSize: '10px',
                          padding: '2px 6px',
                          borderRadius: '4px',
                          background: 'rgba(255, 255, 255, 0.08)',
                          color: 'var(--text-secondary)',
                          fontWeight: 500,
                        }}>
                          {voice.accent}
                        </span>
                      </div>
                      <span style={{ fontSize: '11px', color: 'var(--accent-primary)', fontWeight: 600 }}>
                        {voice.tag}
                      </span>
                    </div>
                  </div>

                  {isSelected && (
                    <div style={{
                      width: '24px',
                      height: '24px',
                      borderRadius: '50%',
                      background: 'var(--accent-primary)',
                      display: 'flex',
                      alignItems: 'center',
                      justifyContent: 'center',
                      color: '#ffffff',
                    }}>
                      <Check size={14} />
                    </div>
                  )}
                </div>

                {/* Description */}
                <p style={{
                  fontSize: '12px',
                  color: 'var(--text-secondary)',
                  lineHeight: 1.4,
                }}>
                  {voice.description}
                </p>

                {/* Bottom Row: Sample phrase preview button */}
                <div style={{
                  display: 'flex',
                  alignItems: 'center',
                  justifyContent: 'space-between',
                  paddingTop: '8px',
                  borderTop: '1px solid var(--border-subtle)',
                  marginTop: 'auto',
                }}>
                  <button
                    onClick={(e) => handlePreview(e, voice)}
                    style={{
                      display: 'flex',
                      alignItems: 'center',
                      gap: '6px',
                      padding: '5px 10px',
                      borderRadius: 'var(--radius-sm)',
                      background: 'var(--bg-surface-elevated)',
                      border: '1px solid var(--border-subtle)',
                      color: 'var(--text-primary)',
                      fontSize: '11px',
                      fontWeight: 600,
                    }}
                  >
                    {previewingId === voice.id ? <Volume2 size={13} color="var(--accent-primary)" /> : <Play size={13} />}
                    <span>{previewingId === voice.id ? 'Ouvindo...' : 'Ouvir Exemplo'}</span>
                  </button>

                  <span style={{ fontSize: '11px', color: 'var(--text-muted)' }}>
                    Estabilidade: {Math.round(voice.stability * 100)}%
                  </span>
                </div>
              </div>
            );
          })}
        </div>

        {/* ElevenLabs Advanced Tuning Footer */}
        <div style={{
          padding: '16px 24px',
          background: 'var(--bg-surface-elevated)',
          borderTop: '1px solid var(--border-subtle)',
          display: 'flex',
          flexDirection: 'column',
          gap: '12px',
        }}>
          <div style={{ display: 'flex', alignItems: 'center', gap: '6px' }}>
            <SlidersHorizontal size={14} color="var(--accent-primary)" />
            <span style={{ fontSize: '12px', fontWeight: 600, color: 'var(--text-primary)' }}>
              Ajustes de Voz (ElevenLabs Voice Settings)
            </span>
          </div>

          <div style={{ display: 'grid', gridTemplateColumns: '1fr 1fr', gap: '20px' }}>
            {/* Stability */}
            <div style={{ display: 'flex', flexDirection: 'column', gap: '4px' }}>
              <div style={{ display: 'flex', justifyContent: 'space-between', fontSize: '11px', color: 'var(--text-secondary)' }}>
                <span>Estabilidade da Voz</span>
                <span>{stability}%</span>
              </div>
              <input
                type="range"
                min={0}
                max={100}
                value={stability}
                onChange={(e) => setStability(Number(e.target.value))}
                style={{ accentColor: 'var(--accent-primary)' }}
              />
              <span style={{ fontSize: '10px', color: 'var(--text-muted)' }}>
                Mais estável = narração uniforme. Mais variável = maior emoção e drama.
              </span>
            </div>

            {/* Clarity */}
            <div style={{ display: 'flex', flexDirection: 'column', gap: '4px' }}>
              <div style={{ display: 'flex', justifyContent: 'space-between', fontSize: '11px', color: 'var(--text-secondary)' }}>
                <span>Clareza & Fidelidade</span>
                <span>{clarity}%</span>
              </div>
              <input
                type="range"
                min={0}
                max={100}
                value={clarity}
                onChange={(e) => setClarity(Number(e.target.value))}
                style={{ accentColor: 'var(--accent-primary)' }}
              />
              <span style={{ fontSize: '10px', color: 'var(--text-muted)' }}>
                Aumenta a precisão de dicção e remove ruídos de fundo.
              </span>
            </div>
          </div>
        </div>
      </div>
    </div>
  );
};
