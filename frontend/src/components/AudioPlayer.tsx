import React, { useState } from 'react';
import { 
  Play, 
  Pause, 
  RotateCcw, 
  RotateCw, 
  ChevronLeft, 
  ChevronRight, 
  Gauge
} from 'lucide-react';
import type { VoiceOption, Book } from '../types';
import type { PlaybackStatus } from '../services/speechEngine';

interface AudioPlayerProps {
  currentBook: Book;
  currentSentenceIndex: number;
  playbackStatus: PlaybackStatus;
  selectedVoice: VoiceOption;
  speed: number;
  waveformLevels: number[];
  onTogglePlay: () => void;
  onPrevSentence: () => void;
  onNextSentence: () => void;
  onSkipBack: () => void;
  onSkipForward: () => void;
  onSeek: (sentenceIndex: number) => void;
  onChangeSpeed: (newSpeed: number) => void;
  onOpenVoicePicker: () => void;
}

export const AudioPlayer: React.FC<AudioPlayerProps> = ({
  currentBook,
  currentSentenceIndex,
  playbackStatus,
  selectedVoice,
  speed,
  waveformLevels,
  onTogglePlay,
  onPrevSentence,
  onNextSentence,
  onSkipBack,
  onSkipForward,
  onSeek,
  onChangeSpeed,
  onOpenVoicePicker,
}) => {
  const [showSpeedMenu, setShowSpeedMenu] = useState(false);

  if (!currentBook || !currentBook.sentences || currentBook.sentences.length === 0) {
    return null;
  }

  const totalSentences = currentBook.sentences.length;
  const currentSentence = currentBook.sentences[currentSentenceIndex] || '';
  const progressPercent = totalSentences > 0 ? (currentSentenceIndex / (totalSentences - 1)) * 100 : 0;

  // Approximate remaining minutes
  const remainingSentences = Math.max(0, totalSentences - currentSentenceIndex);
  const remainingMinutes = Math.max(1, Math.ceil((remainingSentences * 12) / (60 * speed)));

  return (
    <div style={{
      position: 'fixed',
      bottom: 0,
      left: 0,
      right: 0,
      zIndex: 50,
      background: 'var(--bg-surface-glass)',
      backdropFilter: 'blur(20px)',
      WebkitBackdropFilter: 'blur(20px)',
      borderTop: '1px solid var(--border-subtle)',
      boxShadow: 'var(--shadow-dock)',
      padding: '12px 24px 16px 24px',
      display: 'flex',
      flexDirection: 'column',
      gap: '8px',
    }}>
      {/* Scrubber / Timeline bar */}
      <div style={{
        display: 'flex',
        alignItems: 'center',
        gap: '12px',
        width: '100%',
        maxWidth: '1200px',
        margin: '0 auto',
      }}>
        <span style={{ fontSize: '11px', color: 'var(--text-muted)', minWidth: '40px', textAlign: 'right' }}>
          {currentSentenceIndex + 1} / {totalSentences}
        </span>

        {/* Timeline Slider */}
        <div style={{ position: 'relative', flex: 1, display: 'flex', alignItems: 'center' }}>
          <input
            type="range"
            min={0}
            max={Math.max(0, totalSentences - 1)}
            value={currentSentenceIndex}
            onChange={(e) => onSeek(Number(e.target.value))}
            style={{
              width: '100%',
              height: '4px',
              borderRadius: '2px',
              accentColor: 'var(--accent-primary)',
              cursor: 'pointer',
              background: `linear-gradient(to right, var(--accent-primary) 0%, var(--accent-primary) ${progressPercent}%, rgba(255,255,255,0.1) ${progressPercent}%, rgba(255,255,255,0.1) 100%)`,
              outline: 'none',
            }}
          />
        </div>

        <span style={{ fontSize: '11px', color: 'var(--text-muted)', minWidth: '70px' }}>
          ~{remainingMinutes} min rest.
        </span>
      </div>

      {/* Main player controls row */}
      <div style={{
        display: 'flex',
        alignItems: 'center',
        justifyContent: 'space-between',
        width: '100%',
        maxWidth: '1200px',
        margin: '0 auto',
      }}>
        {/* Left: Book Cover & Current Sentence Preview */}
        <div style={{ display: 'flex', alignItems: 'center', gap: '14px', flex: '1', maxWidth: '350px' }}>
          <div style={{
            width: '42px',
            height: '52px',
            borderRadius: '6px',
            background: currentBook.coverGradient,
            boxShadow: 'var(--shadow-sm)',
            flexShrink: 0,
            display: 'flex',
            alignItems: 'center',
            justifyContent: 'center',
            color: '#fff',
            fontWeight: 700,
            fontSize: '11px',
            textAlign: 'center',
            padding: '2px',
            overflow: 'hidden',
          }}>
            {currentBook.type.toUpperCase()}
          </div>

          <div style={{ display: 'flex', flexDirection: 'column', overflow: 'hidden' }}>
            <span style={{
              fontSize: '13px',
              fontWeight: 600,
              color: 'var(--text-primary)',
              whiteSpace: 'nowrap',
              overflow: 'hidden',
              textOverflow: 'ellipsis',
            }}>
              {currentBook.title}
            </span>
            <span style={{
              fontSize: '11px',
              color: 'var(--text-muted)',
              whiteSpace: 'nowrap',
              overflow: 'hidden',
              textOverflow: 'ellipsis',
              fontStyle: 'italic',
            }}>
              "{currentSentence || 'Selecione uma frase para ouvir...'}"
            </span>
          </div>
        </div>

        {/* Center: Playback buttons */}
        <div style={{ display: 'flex', alignItems: 'center', gap: '16px' }}>
          {/* Previous sentence */}
          <button
            onClick={onPrevSentence}
            disabled={currentSentenceIndex <= 0}
            style={{
              color: currentSentenceIndex <= 0 ? 'var(--text-muted)' : 'var(--text-secondary)',
              padding: '6px',
              borderRadius: '50%',
            }}
            title="Frase Anterior"
          >
            <ChevronLeft size={18} />
          </button>

          {/* Skip Back 10s */}
          <button
            onClick={onSkipBack}
            style={{
              color: 'var(--text-secondary)',
              padding: '6px',
              borderRadius: '50%',
            }}
            title="Voltar 10s"
          >
            <RotateCcw size={18} />
          </button>

          {/* Master Play/Pause with Radiant Halo */}
          <button
            onClick={onTogglePlay}
            style={{
              width: '48px',
              height: '48px',
              borderRadius: '50%',
              background: 'linear-gradient(135deg, #10b981 0%, #059669 100%)',
              color: '#ffffff',
              display: 'flex',
              alignItems: 'center',
              justifyContent: 'center',
              boxShadow: playbackStatus === 'playing' 
                ? '0 0 25px var(--accent-glow), 0 4px 15px rgba(0,0,0,0.3)' 
                : '0 4px 12px rgba(0,0,0,0.3)',
              transform: playbackStatus === 'playing' ? 'scale(1.05)' : 'scale(1)',
              transition: 'transform 150ms ease, box-shadow 150ms ease',
            }}
            title={playbackStatus === 'playing' ? 'Pausar' : 'Reproduzir Narração'}
          >
            {playbackStatus === 'playing' ? <Pause size={22} /> : <Play size={22} style={{ marginLeft: '3px' }} />}
          </button>

          {/* Skip Forward 10s */}
          <button
            onClick={onSkipForward}
            style={{
              color: 'var(--text-secondary)',
              padding: '6px',
              borderRadius: '50%',
            }}
            title="Avançar 10s"
          >
            <RotateCw size={18} />
          </button>

          {/* Next sentence */}
          <button
            onClick={onNextSentence}
            disabled={currentSentenceIndex >= totalSentences - 1}
            style={{
              color: currentSentenceIndex >= totalSentences - 1 ? 'var(--text-muted)' : 'var(--text-secondary)',
              padding: '6px',
              borderRadius: '50%',
            }}
            title="Próxima Frase"
          >
            <ChevronRight size={18} />
          </button>
        </div>

        {/* Right: Waveform, Speed and Voice Badge */}
        <div style={{ display: 'flex', alignItems: 'center', gap: '14px', flex: '1', justifyContent: 'flex-end' }}>
          {/* Animated Waveform Visualizer */}
          <div 
            className="waveform-container" 
            title={playbackStatus === 'playing' ? 'Sintetizando áudio em tempo real...' : 'Áudio pausado'}
            style={{ opacity: playbackStatus === 'playing' ? 1 : 0.4 }}
          >
            {waveformLevels.slice(0, 10).map((lvl, idx) => (
              <div
                key={idx}
                className="waveform-bar"
                style={{
                  height: playbackStatus === 'playing' ? `${lvl * 0.28}px` : '4px',
                }}
              />
            ))}
          </div>

          {/* Speed Controller */}
          <div style={{ position: 'relative' }}>
            <button
              onClick={() => setShowSpeedMenu(!showSpeedMenu)}
              style={{
                display: 'flex',
                alignItems: 'center',
                gap: '4px',
                padding: '4px 8px',
                borderRadius: 'var(--radius-sm)',
                background: 'var(--bg-surface)',
                border: '1px solid var(--border-subtle)',
                color: 'var(--text-primary)',
                fontSize: '11px',
                fontWeight: 600,
              }}
              title="Velocidade de Reprodução"
            >
              <Gauge size={13} />
              <span>{speed}x</span>
            </button>

            {showSpeedMenu && (
              <div style={{
                position: 'absolute',
                bottom: '100%',
                right: '50%',
                transform: 'translateX(50%)',
                marginBottom: '14px',
                background: 'rgba(9, 13, 22, 0.98)',
                backdropFilter: 'blur(24px)',
                WebkitBackdropFilter: 'blur(24px)',
                border: '1px solid rgba(255, 255, 255, 0.12)',
                borderRadius: '16px',
                boxShadow: '0 20px 40px -10px rgba(0, 0, 0, 0.8), 0 0 0 1px rgba(16, 185, 129, 0.2)',
                padding: '12px 16px',
                display: 'flex',
                flexDirection: 'column',
                gap: '10px',
                width: '310px',
                zIndex: 80,
              }}>
                {/* Linha Principal Minimalista: Reading speed ───⚪─── [2] */}
                <div style={{ display: 'flex', alignItems: 'center', gap: '12px' }}>
                  <span style={{
                    fontSize: '11px',
                    fontWeight: 600,
                    color: '#94a3b8',
                    whiteSpace: 'nowrap',
                  }}>
                    Reading speed
                  </span>

                  <div style={{ flex: 1, position: 'relative', display: 'flex', alignItems: 'center' }}>
                    <input
                      type="range"
                      min={0.5}
                      max={4.0}
                      step={0.1}
                      value={speed}
                      onChange={(e) => onChangeSpeed(parseFloat(e.target.value))}
                      style={{
                        width: '100%',
                        height: '4px',
                        borderRadius: '2px',
                        accentColor: '#10b981',
                        cursor: 'pointer',
                        outline: 'none',
                        background: `linear-gradient(to right, #10b981 0%, #10b981 ${((speed - 0.5) / 3.5) * 100}%, rgba(255, 255, 255, 0.15) ${((speed - 0.5) / 3.5) * 100}%, rgba(255, 255, 255, 0.15) 100%)`,
                      }}
                    />
                  </div>

                  {/* Caixinha com valor exato */}
                  <div style={{
                    minWidth: '32px',
                    height: '24px',
                    borderRadius: '6px',
                    background: 'rgba(255, 255, 255, 0.08)',
                    border: '1px solid rgba(255, 255, 255, 0.15)',
                    display: 'flex',
                    alignItems: 'center',
                    justifyContent: 'center',
                    fontSize: '12px',
                    fontWeight: 800,
                    color: '#ffffff',
                    padding: '0 4px',
                  }}>
                    {Number(speed).toFixed(speed % 1 === 0 ? 0 : 1)}
                  </div>
                </div>

                {/* Linha de Atalhos Rápidos Discretos */}
                <div style={{
                  display: 'flex',
                  alignItems: 'center',
                  justifyContent: 'space-between',
                  paddingTop: '8px',
                  borderTop: '1px solid rgba(255, 255, 255, 0.08)',
                  gap: '4px',
                }}>
                  {[0.75, 1.0, 1.25, 1.5, 2.0, 3.0, 4.0].map((opt) => {
                    const isSelected = Number(speed).toFixed(2) === opt.toFixed(2);
                    return (
                      <button
                        key={opt}
                        onClick={() => onChangeSpeed(opt)}
                        style={{
                          padding: '3px 6px',
                          borderRadius: '6px',
                          fontSize: '10px',
                          fontWeight: isSelected ? 800 : 500,
                          background: isSelected ? '#10b981' : 'transparent',
                          color: isSelected ? '#ffffff' : '#94a3b8',
                          border: isSelected ? '1px solid #10b981' : '1px solid transparent',
                          cursor: 'pointer',
                          transition: 'all 120ms',
                        }}
                      >
                        {opt}x
                      </button>
                    );
                  })}
                </div>
              </div>
            )}
          </div>

          {/* Selected Voice Pill: Read by {selectedVoice.name} */}
          <button
            onClick={onOpenVoicePicker}
            style={{
              display: 'flex',
              alignItems: 'center',
              gap: '8px',
              padding: '6px 14px',
              borderRadius: '9999px',
              background: 'rgba(255, 255, 255, 0.05)',
              border: '1px solid rgba(255, 255, 255, 0.1)',
              color: '#f8fafc',
              fontSize: '12px',
              fontWeight: 600,
              cursor: 'pointer',
              transition: 'all 150ms ease',
            }}
            title="Abrir painel lateral de vozes"
          >
            <div style={{
              width: '22px',
              height: '22px',
              borderRadius: '50%',
              background: selectedVoice.avatarColor || 'linear-gradient(135deg, #10b981 0%, #059669 100%)',
              display: 'flex',
              alignItems: 'center',
              justifyContent: 'center',
              fontSize: '11px',
              color: '#ffffff',
              fontWeight: 900,
              boxShadow: '0 2px 6px rgba(0, 0, 0, 0.3)',
            }}>
              {selectedVoice.name[0]}
            </div>
            <span style={{ color: '#94a3b8', fontSize: '11px', fontWeight: 500 }}>Read by</span>
            <span style={{ color: '#ffffff', fontWeight: 700 }}>{selectedVoice.name}</span>
          </button>
        </div>
      </div>
    </div>
  );
};
