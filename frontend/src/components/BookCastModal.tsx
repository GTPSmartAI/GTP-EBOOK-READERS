import React, { useEffect, useState } from 'react';
import { X, Volume2, Square, Theater } from 'lucide-react';
import type { BookCast, VoiceRole } from '../services/bookCast';
import { VOICE_ROLES, saveBookCast, voiceIdForRole } from '../services/bookCast';
import { findVoiceById, groupVoicesByLanguage } from '../data/voices';
import { speechEngine } from '../services/speechEngine';

interface BookCastModalProps {
  isOpen: boolean;
  onClose: () => void;
  bookCast: BookCast;
  onUpdateCast: (updatedCast: BookCast) => void;
  bookTitle?: string;
}

const ROLE_FIELD: Record<VoiceRole, keyof Pick<BookCast, 'narratorVoiceId' | 'dialogueVoiceId' | 'systemVoiceId'>> = {
  narrator: 'narratorVoiceId',
  dialogue: 'dialogueVoiceId',
  system: 'systemVoiceId',
};

export const BookCastModal: React.FC<BookCastModalProps> = ({
  isOpen,
  onClose,
  bookCast,
  onUpdateCast,
  bookTitle = 'Livro',
}) => {
  const [previewingRole, setPreviewingRole] = useState<VoiceRole | null>(null);

  useEffect(() => {
    if (!isOpen) return;
    const onKey = (e: KeyboardEvent) => {
      if (e.key === 'Escape') onClose();
    };
    window.addEventListener('keydown', onKey);
    return () => window.removeEventListener('keydown', onKey);
  }, [isOpen, onClose]);

  if (!isOpen) return null;

  const voiceGroups = groupVoicesByLanguage();

  const update = (changes: Partial<BookCast>) => {
    const updated = { ...bookCast, ...changes };
    saveBookCast(updated);
    onUpdateCast(updated);
  };

  const handlePreview = (role: VoiceRole, example: string) => {
    if (previewingRole === role) {
      speechEngine.stopPreview();
      setPreviewingRole(null);
      return;
    }
    const voice = findVoiceById(voiceIdForRole(bookCast, role));
    if (!voice) return;
    setPreviewingRole(role);
    speechEngine
      .previewVoice({ ...voice, sampleAudioUrl: undefined, samplePhrase: example })
      .finally(() => setPreviewingRole((current) => (current === role ? null : current)));
  };

  const handleClose = () => {
    speechEngine.stopPreview();
    setPreviewingRole(null);
    onClose();
  };

  return (
    <div
      onClick={handleClose}
      style={{
        position: 'fixed',
        inset: 0,
        zIndex: 100,
        display: 'flex',
        alignItems: 'center',
        justifyContent: 'center',
        padding: '20px',
        background: 'rgba(0, 0, 0, 0.72)',
        backdropFilter: 'blur(8px)',
      }}
    >
      <div
        className="slide-up"
        onClick={(e) => e.stopPropagation()}
        style={{
          width: '100%',
          maxWidth: '560px',
          maxHeight: '90vh',
          overflowY: 'auto',
          background: 'var(--bg-surface, #0f172a)',
          border: '1px solid rgba(16, 185, 129, 0.25)',
          borderRadius: '20px',
          boxShadow: '0 24px 60px rgba(0, 0, 0, 0.6)',
          color: '#f8fafc',
        }}
      >
        {/* Cabeçalho */}
        <div style={{ display: 'flex', alignItems: 'center', justifyContent: 'space-between', padding: '20px 22px 14px' }}>
          <div style={{ display: 'flex', alignItems: 'center', gap: '12px' }}>
            <div style={{
              width: '40px', height: '40px', borderRadius: '12px', display: 'flex', alignItems: 'center', justifyContent: 'center',
              background: 'linear-gradient(135deg, #10b981 0%, #059669 100%)',
            }}>
              <Theater size={20} color="#fff" />
            </div>
            <div>
              <div style={{ fontSize: '18px', fontWeight: 800 }}>Vozes do livro</div>
              <div style={{ fontSize: '12px', color: '#94a3b8', maxWidth: '380px', overflow: 'hidden', textOverflow: 'ellipsis', whiteSpace: 'nowrap' }}>
                {bookTitle}
              </div>
            </div>
          </div>
          <button
            onClick={handleClose}
            title="Fechar (Esc)"
            style={{
              width: '34px', height: '34px', borderRadius: '10px', display: 'flex', alignItems: 'center', justifyContent: 'center',
              background: 'rgba(255, 255, 255, 0.06)', border: '1px solid rgba(255, 255, 255, 0.1)', color: '#cbd5e1', cursor: 'pointer',
            }}
          >
            <X size={18} />
          </button>
        </div>

        {/* Liga/desliga */}
        <label style={{
          display: 'flex', alignItems: 'center', justifyContent: 'space-between', gap: '12px',
          margin: '0 22px 16px', padding: '12px 14px', borderRadius: '12px', cursor: 'pointer',
          background: 'rgba(255, 255, 255, 0.04)', border: '1px solid rgba(255, 255, 255, 0.08)',
        }}>
          <div>
            <div style={{ fontSize: '13px', fontWeight: 700 }}>Vozes separadas</div>
            <div style={{ fontSize: '12px', color: '#94a3b8' }}>
              {bookCast.theatreModeEnabled
                ? 'Narração, falas e colchetes com vozes diferentes'
                : 'Desligado: tudo é lido com a voz da narração'}
            </div>
          </div>
          <input
            type="checkbox"
            checked={bookCast.theatreModeEnabled}
            onChange={(e) => update({ theatreModeEnabled: e.target.checked })}
            style={{ width: '20px', height: '20px', accentColor: '#10b981', cursor: 'pointer' }}
          />
        </label>

        {/* Três vozes */}
        <div style={{ display: 'flex', flexDirection: 'column', gap: '10px', padding: '0 22px' }}>
          {VOICE_ROLES.map(({ role, label, description, example }) => {
            const disabled = role !== 'narrator' && !bookCast.theatreModeEnabled;
            const voiceId = voiceIdForRole(bookCast, role);
            const isPreviewing = previewingRole === role;
            return (
              <div
                key={role}
                style={{
                  padding: '14px', borderRadius: '14px',
                  background: 'rgba(15, 23, 42, 0.6)', border: '1px solid rgba(255, 255, 255, 0.08)',
                  opacity: disabled ? 0.45 : 1,
                }}
              >
                <div style={{ display: 'flex', alignItems: 'baseline', justifyContent: 'space-between', gap: '8px', marginBottom: '8px' }}>
                  <span style={{ fontSize: '14px', fontWeight: 800, color: '#10b981' }}>{label}</span>
                  <span style={{ fontSize: '11px', color: '#94a3b8' }}>{description}</span>
                </div>
                <div style={{ display: 'flex', gap: '8px' }}>
                  <select
                    value={voiceId}
                    disabled={disabled}
                    onChange={(e) => update({ [ROLE_FIELD[role]]: e.target.value } as Partial<BookCast>)}
                    style={{
                      flex: 1, minWidth: 0, padding: '10px 12px', borderRadius: '10px', fontSize: '13px', fontWeight: 600,
                      background: '#0b1220', color: '#f8fafc', border: '1px solid rgba(255, 255, 255, 0.14)', cursor: 'pointer',
                    }}
                  >
                    {voiceGroups.map((group) => (
                      <optgroup key={group.lang} label={group.label}>
                        {group.voices.map((v) => (
                          <option key={v.id} value={v.id}>
                            {v.tier === 'premium' ? '★ ' : ''}{v.name} {v.gender === 'female' ? '(F)' : '(M)'} — {v.tag}
                          </option>
                        ))}
                      </optgroup>
                    ))}
                  </select>
                  <button
                    onClick={() => handlePreview(role, example)}
                    disabled={disabled}
                    title={isPreviewing ? 'Parar' : 'Ouvir exemplo'}
                    style={{
                      width: '42px', flexShrink: 0, borderRadius: '10px', display: 'flex', alignItems: 'center', justifyContent: 'center',
                      background: isPreviewing ? '#10b981' : 'rgba(16, 185, 129, 0.12)',
                      border: '1px solid rgba(16, 185, 129, 0.35)', color: isPreviewing ? '#fff' : '#10b981',
                      cursor: disabled ? 'not-allowed' : 'pointer',
                    }}
                  >
                    {isPreviewing ? <Square size={14} /> : <Volume2 size={16} />}
                  </button>
                </div>
              </div>
            );
          })}
        </div>

        <p style={{ margin: '14px 22px 0', fontSize: '11px', color: '#64748b', lineHeight: 1.5 }}>
          Escolha uma voz diferente para a narração, as falas e os [colchetes] para distinguir cada parte.
        </p>

        <div style={{ display: 'flex', justifyContent: 'flex-end', padding: '16px 22px 20px' }}>
          <button
            onClick={handleClose}
            style={{
              padding: '11px 22px', borderRadius: '12px', border: 'none', cursor: 'pointer',
              background: 'linear-gradient(135deg, #10b981 0%, #059669 100%)', color: '#fff',
              fontSize: '13px', fontWeight: 800,
            }}
          >
            Pronto
          </button>
        </div>
      </div>
    </div>
  );
};
