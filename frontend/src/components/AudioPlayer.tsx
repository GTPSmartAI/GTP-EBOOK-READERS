import React, { useState } from 'react';
import { 
  Play, 
  Pause, 
  RotateCcw, 
  RotateCw, 
  ChevronLeft, 
  ChevronRight, 
  Gauge,
  Loader2
} from 'lucide-react';
import type { VoiceOption, Book } from '../types';
import type { PlaybackStatus } from '../services/speechEngine';
import { useIsMobile } from '../hooks/useIsMobile';
import { buildWordsPrefix, wordsPerSecond } from '../utils/readingTime';

interface AudioPlayerProps {
  currentBook: Book;
  currentSentenceIndex: number;
  playbackStatus: PlaybackStatus;
  selectedVoice: VoiceOption;
  speed: number;
  isTheatreMode?: boolean;
  activeSpeakerName?: string;
  onOpenCastModal?: () => void;
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
  isTheatreMode = false,
  activeSpeakerName,
  onOpenCastModal,
  onTogglePlay,
  onPrevSentence,
  onNextSentence,
  onSkipBack,
  onSkipForward,
  onSeek,
  onChangeSpeed,
  onOpenVoicePicker,
}) => {
  const isMobile = useIsMobile();
  const [showSpeedMenu, setShowSpeedMenu] = useState(false);
  const speedMenuRef = React.useRef<HTMLDivElement>(null);
  const sentences = currentBook?.sentences;

  // Menu de velocidade fecha com Esc ou com um clique fora dele (botão incluso no "dentro")
  React.useEffect(() => {
    if (!showSpeedMenu) return;
    const onPointerDown = (e: PointerEvent) => {
      if (!speedMenuRef.current?.contains(e.target as Node)) setShowSpeedMenu(false);
    };
    const onKeyDown = (e: KeyboardEvent) => {
      if (e.key === 'Escape') setShowSpeedMenu(false);
    };
    document.addEventListener('pointerdown', onPointerDown);
    document.addEventListener('keydown', onKeyDown);
    return () => {
      document.removeEventListener('pointerdown', onPointerDown);
      document.removeEventListener('keydown', onKeyDown);
    };
  }, [showSpeedMenu]);

  // Ritmo de leitura ajustado pela velocidade
  const effectiveWps = wordsPerSecond(speed);

  // Palavras acumuladas antes de cada sentença, contadas uma vez por livro
  // (recontar o livro inteiro a cada frase travava a tela em livros grandes)
  const wordsBefore = React.useMemo(() => buildWordsPrefix(sentences), [sentences]);

  const totalWordsCount = wordsBefore[wordsBefore.length - 1];
  const wordsReadCount = wordsBefore[Math.min(Math.max(0, currentSentenceIndex), wordsBefore.length - 1)];

  const [currentPlaySecond, setCurrentPlaySecond] = useState(0);

  // Sincroniza o segundo quando a sentença ou velocidade muda
  React.useEffect(() => {
    const baseSec = Math.round(wordsReadCount / effectiveWps);
    setCurrentPlaySecond(baseSec);
  }, [wordsReadCount, effectiveWps]);

  // Cronômetro ativo quando estiver reproduzindo (avança segundo a segundo: 10:00, 10:01, etc.)
  React.useEffect(() => {
    if (playbackStatus !== 'playing') return;
    const timer = setInterval(() => {
      setCurrentPlaySecond((prev) => prev + 1);
    }, 1000);
    return () => clearInterval(timer);
  }, [playbackStatus]);

  // Todos os hooks ficam acima deste retorno: o livro pode chegar sem frases e ganhá-las depois
  if (!currentBook || !sentences || sentences.length === 0) {
    return null;
  }

  const totalSentences = sentences.length;
  const currentSentence = sentences[currentSentenceIndex] || '';
  const progressPercent = totalSentences > 1 ? (currentSentenceIndex / (totalSentences - 1)) * 100 : 0;

  // Formatação de áudio MM:SS ou HH:MM:SS
  const formatAudioTime = (seconds: number): string => {
    const safeSec = Math.max(0, Math.floor(seconds));
    const hrs = Math.floor(safeSec / 3600);
    const mins = Math.floor((safeSec % 3600) / 60);
    const secs = safeSec % 60;

    if (hrs > 0) {
      return `${hrs}:${mins.toString().padStart(2, '0')}:${secs.toString().padStart(2, '0')}`;
    }
    return `${mins.toString().padStart(2, '0')}:${secs.toString().padStart(2, '0')}`;
  };

  const totalDurationSeconds = Math.max(1, Math.round(totalWordsCount / effectiveWps));
  const elapsedDisplaySeconds = Math.min(totalDurationSeconds, currentPlaySecond);
  const remainingDisplaySeconds = Math.max(0, totalDurationSeconds - elapsedDisplaySeconds);

  // Menu de velocidade (o mesmo no computador e no celular; muda só onde ele aparece)
  const clampSpeed = (v: number) => Math.round(Math.min(4, Math.max(0.5, v)) * 10) / 10;
  const speedPercent = ((speed - 0.5) / 3.5) * 100;
  const stepButton = (delta: number, label: string) => (
    <button
      type="button"
      onClick={() => onChangeSpeed(clampSpeed(speed + delta))}
      disabled={delta < 0 ? speed <= 0.5 : speed >= 4}
      aria-label={label}
      style={{
        width: '44px',
        height: '44px',
        borderRadius: '12px',
        flexShrink: 0,
        display: 'flex',
        alignItems: 'center',
        justifyContent: 'center',
        fontSize: '22px',
        fontWeight: 700,
        lineHeight: 1,
        color: '#f8fafc',
        background: 'rgba(255, 255, 255, 0.06)',
        border: '1px solid rgba(255, 255, 255, 0.12)',
        opacity: (delta < 0 ? speed <= 0.5 : speed >= 4) ? 0.35 : 1,
      }}
    >
      {delta < 0 ? '−' : '+'}
    </button>
  );
  const speedMenuContent = (
    <>
      <div style={{ display: 'flex', alignItems: 'baseline', justifyContent: 'space-between' }}>
        <span style={{ fontSize: '12px', fontWeight: 700, letterSpacing: '0.06em', textTransform: 'uppercase', color: '#94a3b8' }}>
          Velocidade
        </span>
        <span style={{ fontSize: '28px', fontWeight: 900, color: '#ffffff', fontVariantNumeric: 'tabular-nums', lineHeight: 1 }}>
          {Number(speed.toFixed(2))}
          <span style={{ fontSize: '16px', color: '#10b981', marginLeft: '2px' }}>x</span>
        </span>
      </div>

      <div style={{ display: 'flex', alignItems: 'center', gap: '10px' }}>
        {stepButton(-0.1, 'Diminuir velocidade')}
        <input
          className="speed-slider"
          type="range"
          min={0.5}
          max={4.0}
          step={0.1}
          value={speed}
          aria-label="Velocidade de leitura"
          onChange={(e) => onChangeSpeed(parseFloat(e.target.value))}
          style={{
            flex: 1,
            minWidth: 0,
            background: `linear-gradient(to right, #10b981 0%, #10b981 ${speedPercent}%, rgba(255, 255, 255, 0.14) ${speedPercent}%, rgba(255, 255, 255, 0.14) 100%)`,
          }}
        />
        {stepButton(0.1, 'Aumentar velocidade')}
      </div>

      <div style={{ display: 'grid', gridTemplateColumns: 'repeat(4, 1fr)', gap: '6px' }}>
        {[0.75, 1.0, 1.25, 1.5, 1.75, 2.0, 3.0, 4.0].map((opt) => {
          const isSelected = Number(speed).toFixed(2) === opt.toFixed(2);
          return (
            <button
              key={opt}
              type="button"
              onClick={() => onChangeSpeed(opt)}
              aria-pressed={isSelected}
              style={{
                height: '40px',
                borderRadius: '10px',
                fontSize: '14px',
                fontWeight: isSelected ? 800 : 600,
                fontVariantNumeric: 'tabular-nums',
                background: isSelected ? '#10b981' : 'rgba(255, 255, 255, 0.05)',
                color: isSelected ? '#ffffff' : '#cbd5e1',
                border: isSelected ? '1px solid #10b981' : '1px solid rgba(255, 255, 255, 0.08)',
                transition: 'background 120ms, color 120ms',
              }}
            >
              {opt}x
            </button>
          );
        })}
      </div>
    </>
  );

  const playIcon = playbackStatus === 'playing' ? (
    <Pause size={isMobile ? 26 : 22} />
  ) : playbackStatus === 'buffering' ? (
    <Loader2 size={isMobile ? 26 : 22} className="animate-spin" />
  ) : (
    <Play size={isMobile ? 26 : 22} style={{ marginLeft: '3px' }} />
  );

  // ------------------------------------------------------------------ celular
  if (isMobile) {
    const roundButton: React.CSSProperties = {
      position: 'relative',
      width: '44px',
      height: '44px',
      borderRadius: '50%',
      display: 'flex',
      alignItems: 'center',
      justifyContent: 'center',
      color: '#f8fafc',
      flexShrink: 0,
    };
    return (
      <div
        ref={speedMenuRef}
        style={{
          position: 'fixed',
          // Só aparece dentro do livro, onde o menu de baixo fica escondido
          bottom: 0,
          left: 0,
          right: 0,
          zIndex: 50,
          background: 'var(--bg-surface-glass)',
          backdropFilter: 'blur(20px)',
          WebkitBackdropFilter: 'blur(20px)',
          borderTop: '1px solid var(--border-subtle)',
          boxShadow: 'var(--shadow-dock)',
          padding: '8px 12px calc(10px + env(safe-area-inset-bottom, 0px))',
          display: 'flex',
          flexDirection: 'column',
          gap: '6px',
        }}
      >
        {showSpeedMenu && (
          <div style={{
            position: 'absolute',
            left: '12px',
            right: '12px',
            bottom: '100%',
            marginBottom: '8px',
            background: 'rgba(9, 13, 22, 0.98)',
            border: '1px solid rgba(255, 255, 255, 0.12)',
            borderRadius: '16px',
            boxShadow: '0 20px 40px -10px rgba(0, 0, 0, 0.8)',
            padding: '16px',
            display: 'flex',
            flexDirection: 'column',
            gap: '14px',
          }}>
            {speedMenuContent}
          </div>
        )}

        {/* Linha do tempo */}
        <div style={{ display: 'flex', alignItems: 'center', gap: '8px' }}>
          <span style={{ fontSize: '11px', color: '#94a3b8', fontFamily: 'monospace', fontWeight: 700 }}>
            {formatAudioTime(elapsedDisplaySeconds)}
          </span>
          <input
            type="range"
            min={0}
            max={Math.max(0, totalSentences - 1)}
            value={currentSentenceIndex}
            onChange={(e) => onSeek(Number(e.target.value))}
            style={{ flex: 1, minWidth: 0, height: '24px', accentColor: 'var(--accent-primary)' }}
          />
          <span style={{ fontSize: '11px', color: '#94a3b8', fontFamily: 'monospace', fontWeight: 700 }}>
            -{formatAudioTime(remainingDisplaySeconds)}
          </span>
        </div>

        {/* Frase atual */}
        <span style={{
          fontSize: '12px',
          color: 'var(--text-muted)',
          whiteSpace: 'nowrap',
          overflow: 'hidden',
          textOverflow: 'ellipsis',
          fontStyle: 'italic',
          textAlign: 'center',
        }}>
          {isTheatreMode && activeSpeakerName ? `${activeSpeakerName} · ` : ''}"{currentSentence || currentBook.title}"
        </span>

        {/* Controles */}
        <div style={{ display: 'flex', alignItems: 'center', justifyContent: 'space-between' }}>
          <button
            onClick={() => setShowSpeedMenu(!showSpeedMenu)}
            style={{
              ...roundButton,
              width: '48px',
              borderRadius: '12px',
              fontSize: '13px',
              fontWeight: 800,
              background: showSpeedMenu ? 'rgba(16, 185, 129, 0.2)' : 'rgba(255, 255, 255, 0.06)',
              border: '1px solid rgba(255, 255, 255, 0.1)',
            }}
            aria-label="Velocidade de reprodução"
          >
            {speed}x
          </button>

          <button
            onClick={onPrevSentence}
            disabled={currentSentenceIndex <= 0}
            style={{ ...roundButton, width: '36px', color: currentSentenceIndex <= 0 ? 'var(--text-muted)' : 'var(--text-secondary)' }}
            aria-label="Frase anterior"
          >
            <ChevronLeft size={24} />
          </button>

          <button onClick={onSkipBack} style={roundButton} aria-label="Voltar 15 segundos">
            <RotateCcw size={26} strokeWidth={2} />
            <span style={{ position: 'absolute', fontSize: '9px', fontWeight: 900, color: '#10b981', marginTop: '2px' }}>15</span>
          </button>

          <button
            onClick={onTogglePlay}
            style={{
              ...roundButton,
              width: '60px',
              height: '60px',
              color: '#ffffff',
              background: 'linear-gradient(135deg, #10b981 0%, #059669 100%)',
              boxShadow: playbackStatus === 'playing' ? '0 0 22px var(--accent-glow)' : '0 4px 12px rgba(0,0,0,0.3)',
            }}
            aria-label={playbackStatus === 'playing' ? 'Pausar' : 'Reproduzir'}
          >
            {playIcon}
          </button>

          <button onClick={onSkipForward} style={roundButton} aria-label="Avançar 15 segundos">
            <RotateCw size={26} strokeWidth={2} />
            <span style={{ position: 'absolute', fontSize: '9px', fontWeight: 900, color: '#10b981', marginTop: '2px' }}>15</span>
          </button>

          <button
            onClick={onNextSentence}
            disabled={currentSentenceIndex >= totalSentences - 1}
            style={{ ...roundButton, width: '36px', color: currentSentenceIndex >= totalSentences - 1 ? 'var(--text-muted)' : 'var(--text-secondary)' }}
            aria-label="Próxima frase"
          >
            <ChevronRight size={24} />
          </button>

          <button
            onClick={onOpenVoicePicker}
            style={{
              ...roundButton,
              width: '48px',
              borderRadius: '12px',
              background: 'rgba(255, 255, 255, 0.06)',
              border: '1px solid rgba(255, 255, 255, 0.1)',
            }}
            aria-label={`Voz: ${selectedVoice.name}`}
          >
            <div style={{
              width: '28px',
              height: '28px',
              borderRadius: '50%',
              background: selectedVoice.avatarColor || 'linear-gradient(135deg, #10b981 0%, #059669 100%)',
              display: 'flex',
              alignItems: 'center',
              justifyContent: 'center',
              fontSize: '13px',
              color: '#ffffff',
              fontWeight: 900,
            }}>
              {selectedVoice.name[0]}
            </div>
          </button>
        </div>
      </div>
    );
  }

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
      {/* Scrubber / Timeline bar com tempo decorrido e restante */}
      <div style={{
        display: 'flex',
        alignItems: 'center',
        gap: '12px',
        width: '100%',
        maxWidth: '1200px',
        margin: '0 auto',
      }}>
        {/* Tempo decorrido (ex: 10:00, 10:01) */}
        <span style={{
          fontSize: '11px',
          color: '#94a3b8',
          minWidth: '46px',
          textAlign: 'right',
          fontFamily: 'monospace',
          fontWeight: 700,
        }}>
          {formatAudioTime(elapsedDisplaySeconds)}
        </span>

        {/* Timeline Slider Interativo */}
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
              background: `linear-gradient(to right, var(--accent-primary) 0%, var(--accent-primary) ${progressPercent}%, rgba(255,255,255,0.15) ${progressPercent}%, rgba(255,255,255,0.15) 100%)`,
              outline: 'none',
            }}
          />
        </div>

        {/* Tempo restante (ex: -12:30) */}
        <span style={{
          fontSize: '11px',
          color: '#94a3b8',
          minWidth: '55px',
          fontFamily: 'monospace',
          fontWeight: 700,
        }}>
          -{formatAudioTime(remainingDisplaySeconds)}
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
        <div style={{ display: 'flex', alignItems: 'center', gap: '14px' }}>
          {/* Previous sentence */}
          <button
            onClick={onPrevSentence}
            disabled={currentSentenceIndex <= 0}
            style={{
              color: currentSentenceIndex <= 0 ? 'var(--text-muted)' : 'var(--text-secondary)',
              padding: '6px',
              borderRadius: '50%',
              cursor: currentSentenceIndex <= 0 ? 'not-allowed' : 'pointer',
              display: 'flex',
              alignItems: 'center',
              justifyContent: 'center',
            }}
            title="Frase Anterior"
          >
            <ChevronLeft size={20} />
          </button>

          {/* Voltar 15 segundos */}
          <button
            onClick={onSkipBack}
            style={{
              position: 'relative',
              width: '36px',
              height: '36px',
              borderRadius: '50%',
              display: 'flex',
              alignItems: 'center',
              justifyContent: 'center',
              color: '#f8fafc',
              background: 'rgba(255, 255, 255, 0.05)',
              border: '1px solid rgba(255, 255, 255, 0.1)',
              cursor: 'pointer',
              transition: 'all 150ms ease',
            }}
            title="Voltar 15 segundos"
          >
            <RotateCcw size={20} strokeWidth={2.2} />
            <span style={{
              position: 'absolute',
              fontSize: '8px',
              fontWeight: 900,
              color: '#10b981',
              marginTop: '2px',
            }}>
              15
            </span>
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
            title={
              playbackStatus === 'playing' ? 'Pausar'
                : playbackStatus === 'buffering' ? 'Carregando a voz... (clique para cancelar)'
                : 'Reproduzir Narração'
            }
          >
            {playIcon}
          </button>

          {/* Avançar 15 segundos */}
          <button
            onClick={onSkipForward}
            style={{
              position: 'relative',
              width: '36px',
              height: '36px',
              borderRadius: '50%',
              display: 'flex',
              alignItems: 'center',
              justifyContent: 'center',
              color: '#f8fafc',
              background: 'rgba(255, 255, 255, 0.05)',
              border: '1px solid rgba(255, 255, 255, 0.1)',
              cursor: 'pointer',
              transition: 'all 150ms ease',
            }}
            title="Avançar 15 segundos"
          >
            <RotateCw size={20} strokeWidth={2.2} />
            <span style={{
              position: 'absolute',
              fontSize: '8px',
              fontWeight: 900,
              color: '#10b981',
              marginTop: '2px',
            }}>
              15
            </span>
          </button>

          {/* Next sentence */}
          <button
            onClick={onNextSentence}
            disabled={currentSentenceIndex >= totalSentences - 1}
            style={{
              color: currentSentenceIndex >= totalSentences - 1 ? 'var(--text-muted)' : 'var(--text-secondary)',
              padding: '6px',
              borderRadius: '50%',
              cursor: currentSentenceIndex >= totalSentences - 1 ? 'not-allowed' : 'pointer',
              display: 'flex',
              alignItems: 'center',
              justifyContent: 'center',
            }}
            title="Próxima Frase"
          >
            <ChevronRight size={20} />
          </button>
        </div>

        {/* Right: Waveform, Speed and Voice Badge */}
        <div style={{ display: 'flex', alignItems: 'center', gap: '14px', flex: '1', justifyContent: 'flex-end' }}>
          {/* Animated Waveform Visualizer */}
          <div
            className={`waveform-container ${playbackStatus === 'playing' ? 'playing' : ''}`}
            title={playbackStatus === 'playing' ? 'Sintetizando áudio em tempo real...' : 'Áudio pausado'}
            style={{ opacity: playbackStatus === 'playing' ? 1 : 0.4 }}
          >
            {Array.from({ length: 10 }, (_, idx) => (
              <div key={idx} className="waveform-bar" />
            ))}
          </div>

          {/* Speed Controller */}
          <div ref={speedMenuRef} style={{ position: 'relative' }}>
            <button
              onClick={() => setShowSpeedMenu(!showSpeedMenu)}
              style={{
                display: 'flex',
                alignItems: 'center',
                gap: '6px',
                height: '36px',
                padding: '0 14px',
                borderRadius: '12px',
                background: showSpeedMenu ? 'rgba(16, 185, 129, 0.18)' : 'rgba(255, 255, 255, 0.06)',
                border: showSpeedMenu ? '1px solid rgba(16, 185, 129, 0.5)' : '1px solid rgba(255, 255, 255, 0.12)',
                color: 'var(--text-primary)',
                fontSize: '14px',
                fontWeight: 800,
                fontVariantNumeric: 'tabular-nums',
              }}
              title="Velocidade de leitura"
              aria-expanded={showSpeedMenu}
            >
              <Gauge size={17} color="#10b981" />
              <span>{Number(speed.toFixed(2))}x</span>
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
                padding: '18px',
                display: 'flex',
                flexDirection: 'column',
                gap: '16px',
                width: '360px',
                zIndex: 80,
              }}>
                {speedMenuContent}
              </div>
            )}
          </div>

          {/* Botão de Elenco do Livro (Áudio-Teatro) */}
          {onOpenCastModal && (
            <button
              onClick={onOpenCastModal}
              style={{
                display: 'flex',
                alignItems: 'center',
                gap: '6px',
                padding: '6px 12px',
                borderRadius: '9999px',
                background: isTheatreMode 
                  ? 'linear-gradient(135deg, rgba(16, 185, 129, 0.2) 0%, rgba(5, 150, 105, 0.1) 100%)' 
                  : 'rgba(255, 255, 255, 0.05)',
                border: isTheatreMode 
                  ? '1px solid rgba(16, 185, 129, 0.4)' 
                  : '1px solid rgba(255, 255, 255, 0.1)',
                color: isTheatreMode ? '#10b981' : '#cbd5e1',
                fontSize: '11px',
                fontWeight: 700,
                cursor: 'pointer',
                transition: 'all 150ms ease',
              }}
              title="Escolher as vozes de narração, falas e [colchetes]"
            >
              <span>🎭</span>
              <span>Vozes do livro</span>
              {isTheatreMode && (
                <span style={{
                  fontSize: '9px',
                  background: '#10b981',
                  color: '#000000',
                  fontWeight: 900,
                  padding: '1px 5px',
                  borderRadius: '9999px',
                  textTransform: 'uppercase',
                }}>
                  ON
                </span>
              )}
            </button>
          )}

          {/* Selected Voice Pill: Read by {selectedVoice.name} ou Personagem Ativo */}
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
              {activeSpeakerName ? activeSpeakerName[0].toUpperCase() : selectedVoice.name[0]}
            </div>
            <span style={{ color: '#94a3b8', fontSize: '11px', fontWeight: 500 }}>
              {isTheatreMode && activeSpeakerName ? 'Lendo:' : 'Narração:'}
            </span>
            <span style={{ color: '#ffffff', fontWeight: 700 }}>
              {isTheatreMode && activeSpeakerName ? activeSpeakerName : selectedVoice.name}
            </span>
          </button>
        </div>
      </div>
    </div>
  );
};
