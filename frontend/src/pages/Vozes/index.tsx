import React, { useState, useRef, useEffect } from 'react';
import { apiFetch } from '../../services/session';
import { 
  Heart, 
  Volume2, 
  Check, 
  Mic2, 
  Radio, 
  Square, 
  Upload, 
  Sparkles, 
  Crown, 
  AlertCircle, 
  CheckCircle2, 
  Loader2, 
  Trash2, 
  AudioLines,
  Compass,
  ExternalLink,
  HelpCircle
} from 'lucide-react';
import type { VoiceOption } from '../../types';

interface VozesProps {
  voices: VoiceOption[];
  selectedVoice: VoiceOption;
  favoriteVoiceIds: string[];
  onSelectVoice: (voice: VoiceOption) => void;
  onToggleFavoriteVoice: (voiceId: string) => void;
  onPreviewVoice: (voice: VoiceOption) => void;
  onVoiceCloned?: (newVoice: VoiceOption) => void;
  isProUser?: boolean;
}

type FilterCategory = 'all' | 'grave' | 'espacosa' | 'cinema' | 'pt' | 'en';

export const Vozes: React.FC<VozesProps> = ({
  voices,
  selectedVoice,
  favoriteVoiceIds,
  onSelectVoice,
  onToggleFavoriteVoice,
  onPreviewVoice,
  onVoiceCloned,
  isProUser = true,
}) => {
  const [activeTab, setActiveTab] = useState<'catalogo' | 'duplicador'>('catalogo');
  const [filterStyle, setFilterStyle] = useState<FilterCategory>('all');
  
  // Voice Cloning State
  const [voiceName, setVoiceName] = useState('');
  const [gender, setGender] = useState<'male' | 'female'>('male');
  const [narrativeStyle, setNarrativeStyle] = useState('Grave & Solene (Cid Moreira)');
  const [pitchAdjustment, setPitchAdjustment] = useState('-8Hz');
  const [cadenceChoice, setCadenceChoice] = useState<'espacosa' | 'dramatica' | 'natural'>('espacosa');
  const [baseVoiceChoice, setBaseVoiceChoice] = useState('pt-BR-AntonioNeural');

  const [isRecording, setIsRecording] = useState(false);
  const [recordingSeconds, setRecordingSeconds] = useState(0);
  const [audioBlob, setAudioBlob] = useState<Blob | null>(null);
  const [audioUrl, setAudioUrl] = useState<string | null>(null);
  const [uploadedFile, setUploadedFile] = useState<File | null>(null);
  const [isCloning, setIsCloning] = useState(false);
  const [cloneSuccessMsg, setCloneSuccessMsg] = useState<string | null>(null);
  const [cloneErrorMsg, setCloneErrorMsg] = useState<string | null>(null);
  
  // Cloned voices list
  const [clonedVoices, setClonedVoices] = useState<VoiceOption[]>(() => {
    const saved = localStorage.getItem('gtp_cloned_voices');
    if (saved) {
      try {
        return JSON.parse(saved);
      } catch (e) {
        console.error(e);
      }
    }
    return [];
  });

  const mediaRecorderRef = useRef<MediaRecorder | null>(null);
  const audioChunksRef = useRef<Blob[]>([]);
  const timerIntervalRef = useRef<number | null>(null);
  const fileInputRef = useRef<HTMLInputElement>(null);

  // Timer while recording
  useEffect(() => {
    if (isRecording) {
      setRecordingSeconds(0);
      timerIntervalRef.current = window.setInterval(() => {
        setRecordingSeconds((prev) => prev + 1);
      }, 1000);
    } else {
      if (timerIntervalRef.current) {
        clearInterval(timerIntervalRef.current);
        timerIntervalRef.current = null;
      }
    }
    return () => {
      if (timerIntervalRef.current) clearInterval(timerIntervalRef.current);
    };
  }, [isRecording]);

  const startRecording = async () => {
    try {
      setCloneErrorMsg(null);
      setAudioBlob(null);
      setAudioUrl(null);
      setUploadedFile(null);

      const stream = await navigator.mediaDevices.getUserMedia({ audio: true });
      audioChunksRef.current = [];

      const mediaRecorder = new MediaRecorder(stream);
      mediaRecorderRef.current = mediaRecorder;

      mediaRecorder.ondataavailable = (event) => {
        if (event.data.size > 0) {
          audioChunksRef.current.push(event.data);
        }
      };

      mediaRecorder.onstop = () => {
        const blob = new Blob(audioChunksRef.current, { type: 'audio/wav' });
        setAudioBlob(blob);
        const url = URL.createObjectURL(blob);
        setAudioUrl(url);
        stream.getTracks().forEach((track) => track.stop());
      };

      mediaRecorder.start(200);
      setIsRecording(true);
    } catch (err: any) {
      console.error(err);
      setCloneErrorMsg('Permissão de microfone negada ou dispositivo não encontrado.');
    }
  };

  const stopRecording = () => {
    if (mediaRecorderRef.current && isRecording) {
      mediaRecorderRef.current.stop();
      setIsRecording(false);
    }
  };

  const handleFileUpload = (e: React.ChangeEvent<HTMLInputElement>) => {
    if (e.target.files && e.target.files[0]) {
      const file = e.target.files[0];
      setUploadedFile(file);
      setAudioBlob(file);
      setAudioUrl(URL.createObjectURL(file));
      setCloneErrorMsg(null);
      if (!voiceName) {
        setVoiceName(file.name.replace(/\.[^/.]+$/, '').replace(/[-_]/g, ' '));
      }
    }
  };

  const handleCreateClone = async (e: React.FormEvent) => {
    e.preventDefault();
    if (!voiceName.trim()) {
      setCloneErrorMsg('Por favor dê um nome para sua voz clonada.');
      return;
    }
    if (!audioBlob) {
      setCloneErrorMsg('Grave um áudio de pelo menos 15 segundos ou envie um arquivo de áudio (.mp3 ou .wav).');
      return;
    }

    setIsCloning(true);
    setCloneErrorMsg(null);
    setCloneSuccessMsg(null);

    try {
      const formData = new FormData();
      formData.append('audio', audioBlob, uploadedFile ? uploadedFile.name : 'gravacao_voz.wav');
      formData.append('voice_name', voiceName.trim());
      formData.append('gender', gender);
      formData.append('style', narrativeStyle);
      formData.append('pitch', pitchAdjustment);
      formData.append('cadence', cadenceChoice);
      formData.append('base_voice', baseVoiceChoice);

      const response = await apiFetch('/api/voices/clone', {
        method: 'POST',
        body: formData,
      });

      if (!response.ok) {
        throw new Error('Falha ao processar duplicação de voz no servidor.');
      }

      const result = await response.json();
      if (!result.success || !result.voice) {
        throw new Error(result.error || 'Erro na clonagem');
      }

      const newVoice: VoiceOption = result.voice;
      const updated = [newVoice, ...clonedVoices];
      setClonedVoices(updated);
      localStorage.setItem('gtp_cloned_voices', JSON.stringify(updated));

      if (onVoiceCloned) {
        onVoiceCloned(newVoice);
      }
      onSelectVoice(newVoice);

      setCloneSuccessMsg(`Voz "${newVoice.name}" configurada com sucesso! Ela já foi definida como a voz ativa do seu leitor.`);
      setVoiceName('');
      setAudioBlob(null);
      setAudioUrl(null);
      setUploadedFile(null);
    } catch (err: any) {
      console.error(err);
      setCloneErrorMsg(err.message || 'Erro ao duplicar voz.');
    } finally {
      setIsCloning(false);
    }
  };

  const handleDeleteClonedVoice = (id: string) => {
    const updated = clonedVoices.filter((v) => v.id !== id);
    setClonedVoices(updated);
    localStorage.setItem('gtp_cloned_voices', JSON.stringify(updated));
  };

  const allDisplayVoices = [...clonedVoices, ...voices];

  const filteredVoices = allDisplayVoices.filter((v) => {
    if (filterStyle === 'pt') return v.lang.startsWith('pt');
    if (filterStyle === 'en') return v.lang.startsWith('en');
    if (filterStyle === 'grave') return v.category === 'grave' || (v.pitch && parseInt(v.pitch) <= -4);
    if (filterStyle === 'espacosa') return v.category === 'espacosa' || v.cadence === 'espacosa';
    if (filterStyle === 'cinema') return v.category === 'cinema';
    return true; // all
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
      {/* Top Header & Tab Switcher */}
      <div style={{
        display: 'flex',
        justifyContent: 'space-between',
        alignItems: 'center',
        flexWrap: 'wrap',
        gap: '20px',
        paddingBottom: '20px',
        borderBottom: '1px solid var(--border-subtle)',
      }}>
        <div>
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
                Vozes Neurais & Duplicador IA
              </h1>
              <p style={{ fontSize: '13px', color: '#94a3b8', marginTop: '2px' }}>
                Vozes mais graves, espaçadas e lentas para filosofia, suspense e audiolivros de alta imersão.
              </p>
            </div>
          </div>
        </div>

        {/* Tab Switcher */}
        <div style={{
          display: 'flex',
          gap: '6px',
          background: 'var(--bg-surface)',
          padding: '4px',
          borderRadius: '16px',
          border: '1px solid var(--border-subtle)',
        }}>
          <button
            onClick={() => setActiveTab('catalogo')}
            style={{
              display: 'flex',
              alignItems: 'center',
              gap: '8px',
              padding: '8px 18px',
              borderRadius: '12px',
              fontSize: '12px',
              fontWeight: 800,
              textTransform: 'uppercase',
              letterSpacing: '0.04em',
              background: activeTab === 'catalogo' ? 'linear-gradient(135deg, #10b981 0%, #059669 100%)' : 'transparent',
              color: activeTab === 'catalogo' ? '#ffffff' : '#94a3b8',
              boxShadow: activeTab === 'catalogo' ? '0 4px 12px rgba(16, 185, 129, 0.3)' : 'none',
              transition: 'all 200ms',
              cursor: 'pointer',
            }}
          >
            <AudioLines size={15} />
            <span>Catálogo de Vozes</span>
          </button>

          <button
            onClick={() => setActiveTab('duplicador')}
            style={{
              display: 'flex',
              alignItems: 'center',
              gap: '8px',
              padding: '8px 18px',
              borderRadius: '12px',
              fontSize: '12px',
              fontWeight: 800,
              textTransform: 'uppercase',
              letterSpacing: '0.04em',
              background: activeTab === 'duplicador' ? 'linear-gradient(135deg, #10b981 0%, #059669 100%)' : 'transparent',
              color: activeTab === 'duplicador' ? '#ffffff' : '#94a3b8',
              boxShadow: activeTab === 'duplicador' ? '0 4px 12px rgba(16, 185, 129, 0.3)' : 'none',
              transition: 'all 200ms',
              cursor: 'pointer',
            }}
          >
            <Sparkles size={15} />
            <span>Subir Voz & Duplicador IA</span>
          </button>
        </div>
      </div>

      {/* ABA 1: CATÁLOGO DE VOZES */}
      {activeTab === 'catalogo' && (
        <div style={{ display: 'flex', flexDirection: 'column', gap: '24px' }}>
          {/* Filters & Active Info Banner */}
          <div style={{
            display: 'flex',
            justifyContent: 'space-between',
            alignItems: 'center',
            flexWrap: 'wrap',
            gap: '16px',
          }}>
            <div style={{ display: 'flex', gap: '8px', flexWrap: 'wrap' }}>
              {[
                { id: 'all', label: 'Todas as Vozes' },
                { id: 'grave', label: 'Mais Graves 🎙️' },
                { id: 'espacosa', label: 'Espaçosas & Lentas 🧘' },
                { id: 'cinema', label: 'Cinematográficas 🎬' },
                { id: 'pt', label: '🇧🇷 Português' },
                { id: 'en', label: '🇺🇸 Inglês' },
              ].map((tab) => (
                <button
                  key={tab.id}
                  onClick={() => setFilterStyle(tab.id as FilterCategory)}
                  style={{
                    padding: '6px 14px',
                    borderRadius: '12px',
                    fontSize: '12px',
                    fontWeight: 700,
                    background: filterStyle === tab.id ? 'rgba(16, 185, 129, 0.15)' : 'var(--bg-surface)',
                    color: filterStyle === tab.id ? '#10b981' : '#94a3b8',
                    border: filterStyle === tab.id ? '1px solid rgba(16, 185, 129, 0.3)' : '1px solid var(--border-subtle)',
                    cursor: 'pointer',
                    transition: 'all 120ms',
                  }}
                >
                  {tab.label}
                </button>
              ))}
            </div>

            <div style={{ display: 'flex', alignItems: 'center', gap: '8px' }}>
              <span style={{ fontSize: '12px', color: '#94a3b8' }}>Voz Ativa no Leitor:</span>
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

          {/* Grid de Vozes */}
          <div style={{
            display: 'grid',
            gridTemplateColumns: 'repeat(auto-fill, minmax(min(360px, 100%), 1fr))',
            gap: '20px',
          }}>
            {filteredVoices.map((voice) => {
              const isSelected = selectedVoice.id === voice.id;
              const isFav = favoriteVoiceIds.includes(voice.id);
              const isCloned = (voice as any).isCloned;
              const isGrave = voice.category === 'grave' || (voice.pitch && parseInt(voice.pitch) <= -4);
              const isEspacosa = voice.category === 'espacosa' || voice.cadence === 'espacosa';

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
                    {/* Top Row: Avatar & Actions */}
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
                          <div style={{ display: 'flex', alignItems: 'center', gap: '8px' }}>
                            <h3 style={{ fontSize: '17px', fontWeight: 800, color: '#f8fafc' }}>
                              {voice.name}
                            </h3>
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
                            {!isCloned && (
                              <span style={{
                                fontSize: '9px',
                                fontWeight: 800,
                                padding: '2px 6px',
                                borderRadius: '6px',
                                background: voice.tier === 'premium' ? 'rgba(245, 158, 11, 0.18)' : 'rgba(148, 163, 184, 0.12)',
                                color: voice.tier === 'premium' ? '#fbbf24' : '#94a3b8',
                                border: voice.tier === 'premium' ? '1px solid rgba(245, 158, 11, 0.35)' : '1px solid rgba(148, 163, 184, 0.25)',
                              }}>
                                {voice.tier === 'premium' ? (isProUser ? '★ PRO' : '🔒 PRO') : 'GRÁTIS'}
                              </span>
                            )}
                          </div>
                          <span style={{ fontSize: '11px', color: '#94a3b8' }}>
                            {voice.accent}
                          </span>
                        </div>
                      </div>

                      {/* Right top actions: Delete (if cloned) or Fav */}
                      <div style={{ display: 'flex', gap: '6px' }}>
                        {isCloned && (
                          <button
                            onClick={(e) => {
                              e.stopPropagation();
                              handleDeleteClonedVoice(voice.id);
                            }}
                            title="Remover voz clonada"
                            style={{
                              padding: '6px',
                              color: '#ef4444',
                              background: 'rgba(239, 68, 68, 0.1)',
                              borderRadius: '10px',
                              cursor: 'pointer',
                            }}
                          >
                            <Trash2 size={16} />
                          </button>
                        )}

                        <button
                          onClick={(e) => {
                            e.stopPropagation();
                            onToggleFavoriteVoice(voice.id);
                          }}
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
                    </div>

                    {/* Tag Badges */}
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

                      {isGrave && (
                        <span style={{
                          fontSize: '10px',
                          fontWeight: 800,
                          color: '#34d399',
                          background: 'rgba(5, 150, 105, 0.2)',
                          padding: '3px 8px',
                          borderRadius: '6px',
                          border: '1px solid rgba(16, 185, 129, 0.3)',
                        }}>
                          🎙️ ULTRA-GRAVE
                        </span>
                      )}

                      {isEspacosa && (
                        <span style={{
                          fontSize: '10px',
                          fontWeight: 800,
                          color: '#818cf8',
                          background: 'rgba(99, 102, 241, 0.2)',
                          padding: '3px 8px',
                          borderRadius: '6px',
                          border: '1px solid rgba(99, 102, 241, 0.3)',
                        }}>
                          🧘 ESPAÇOSA & LENTA
                        </span>
                      )}
                    </div>

                    {/* Description */}
                    <p style={{
                      fontSize: '13px',
                      color: '#94a3b8',
                      lineHeight: 1.5,
                      marginTop: '10px',
                    }}>
                      {voice.description}
                    </p>
                  </div>

                  {/* Sample Phrase Preview Dock */}
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
      )}

      {/* ABA 2: DUPLICADOR DE VOZ COM IA (SUBIR VOZ / CLONAGEM) */}
      {activeTab === 'duplicador' && (
        <div style={{ display: 'flex', flexDirection: 'column', gap: '32px' }}>
          {/* Banner Hero do Duplicador */}
          <div 
            className="floating-card"
            style={{
              padding: '32px',
              borderRadius: '28px',
              background: 'linear-gradient(135deg, rgba(16, 185, 129, 0.15) 0%, rgba(12, 16, 21, 0.95) 70%)',
              border: '1px solid rgba(16, 185, 129, 0.3)',
              display: 'flex',
              justifyContent: 'space-between',
              alignItems: 'center',
              flexWrap: 'wrap',
              gap: '24px',
            }}
          >
            <div style={{ maxWidth: '680px', display: 'flex', flexDirection: 'column', gap: '10px' }}>
              <div style={{ display: 'flex', alignItems: 'center', gap: '8px' }}>
                <span style={{
                  fontSize: '10px',
                  fontWeight: 900,
                  textTransform: 'uppercase',
                  letterSpacing: '0.1em',
                  color: '#10b981',
                  background: 'rgba(16, 185, 129, 0.15)',
                  padding: '3px 8px',
                  borderRadius: '6px',
                  display: 'flex',
                  alignItems: 'center',
                  gap: '4px',
                }}>
                  <Crown size={12} />
                  {isProUser ? 'PRO ATIVADO' : 'RECURSO VIP / PRO'}
                </span>
                <span style={{ fontSize: '12px', color: '#94a3b8' }}>Duplicador de Voz & Subir Amostras</span>
              </div>

              <h2 style={{
                fontSize: '26px',
                fontWeight: 900,
                color: '#f8fafc',
                textTransform: 'uppercase',
                letterSpacing: '-0.02em',
              }}>
                Suba ou Grave Qualquer Voz Para Narrar Seus Livros
              </h2>

              <p style={{ fontSize: '14px', color: '#94a3b8', lineHeight: 1.6 }}>
                Envie um arquivo de áudio (MP3 ou WAV) de qualquer locutor, ou grave sua própria voz no microfone. Você pode calibrar a afinação para deixá-la <strong>ultra-grave</strong> e ajustar o <strong>espaçamento entre pausas</strong> para leituras profundas e meditativas.
              </p>
            </div>

            <div style={{
              display: 'flex',
              alignItems: 'center',
              gap: '12px',
              padding: '16px 22px',
              borderRadius: '20px',
              background: 'rgba(0, 0, 0, 0.4)',
              border: '1px solid rgba(16, 185, 129, 0.2)',
            }}>
              <Sparkles size={24} color="#10b981" />
              <div style={{ display: 'flex', flexDirection: 'column' }}>
                <span style={{ fontSize: '13px', fontWeight: 800, color: '#f8fafc' }}>
                  {clonedVoices.length} Vozes Personalizadas
                </span>
                <span style={{ fontSize: '11px', color: '#10b981' }}>Salvas e prontas no leitor</span>
              </div>
            </div>
          </div>

          {/* GUIA EDUCATIVO: ONDE ACHAR VOZES NA INTERNET E COMO SUBIR */}
          <div style={{
            borderRadius: '24px',
            padding: '28px',
            background: 'rgba(15, 23, 42, 0.6)',
            border: '1px solid rgba(255, 255, 255, 0.08)',
            display: 'flex',
            flexDirection: 'column',
            gap: '20px',
          }}>
            <div style={{ display: 'flex', alignItems: 'center', gap: '10px' }}>
              <div style={{
                width: '32px',
                height: '32px',
                borderRadius: '8px',
                background: 'rgba(59, 130, 246, 0.15)',
                display: 'flex',
                alignItems: 'center',
                justifyContent: 'center',
                color: '#60a5fa',
              }}>
                <Compass size={18} />
              </div>
              <div>
                <h3 style={{ fontSize: '16px', fontWeight: 800, color: '#f8fafc', textTransform: 'uppercase' }}>
                  Onde Encontrar Vozes na Internet Para Subir?
                </h3>
                <p style={{ fontSize: '12px', color: '#94a3b8' }}>
                  Repositórios abertos com gravações em alta fidelidade prontas para usar como amostras de locução:
                </p>
              </div>
            </div>

            <div style={{
              display: 'grid',
              gridTemplateColumns: 'repeat(auto-fit, minmax(min(260px, 100%), 1fr))',
              gap: '16px',
            }}>
              {/* Card 1: Hugging Face */}
              <a
                href="https://huggingface.co/datasets?task_categories=automatic-speech-recognition"
                target="_blank"
                rel="noreferrer"
                style={{
                  textDecoration: 'none',
                  padding: '16px',
                  borderRadius: '16px',
                  background: 'rgba(255, 255, 255, 0.03)',
                  border: '1px solid rgba(255, 255, 255, 0.06)',
                  display: 'flex',
                  flexDirection: 'column',
                  gap: '8px',
                  transition: 'all 200ms',
                }}
              >
                <div style={{ display: 'flex', justifyContent: 'space-between', alignItems: 'center' }}>
                  <span style={{ fontSize: '14px', fontWeight: 800, color: '#f8fafc' }}>
                    🤗 Hugging Face Audio
                  </span>
                  <ExternalLink size={14} color="#94a3b8" />
                </div>
                <p style={{ fontSize: '12px', color: '#94a3b8', lineHeight: 1.5 }}>
                  A maior plataforma de IA do mundo. Baixe amostras de datasets abertos como <em>Common Voice (Mozilla)</em> com vozes reais em português.
                </p>
              </a>

              {/* Card 2: LibriVox */}
              <a
                href="https://librivox.org"
                target="_blank"
                rel="noreferrer"
                style={{
                  textDecoration: 'none',
                  padding: '16px',
                  borderRadius: '16px',
                  background: 'rgba(255, 255, 255, 0.03)',
                  border: '1px solid rgba(255, 255, 255, 0.06)',
                  display: 'flex',
                  flexDirection: 'column',
                  gap: '8px',
                  transition: 'all 200ms',
                }}
              >
                <div style={{ display: 'flex', justifyContent: 'space-between', alignItems: 'center' }}>
                  <span style={{ fontSize: '14px', fontWeight: 800, color: '#f8fafc' }}>
                    📚 LibriVox Audiolivros
                  </span>
                  <ExternalLink size={14} color="#94a3b8" />
                </div>
                <p style={{ fontSize: '12px', color: '#94a3b8', lineHeight: 1.5 }}>
                  Milhares de audiolivros em domínio público. Excelente para pegar trechos de 30 a 60 segundos de narradores literários experientes.
                </p>
              </a>

              {/* Card 3: Freesound */}
              <a
                href="https://freesound.org"
                target="_blank"
                rel="noreferrer"
                style={{
                  textDecoration: 'none',
                  padding: '16px',
                  borderRadius: '16px',
                  background: 'rgba(255, 255, 255, 0.03)',
                  border: '1px solid rgba(255, 255, 255, 0.06)',
                  display: 'flex',
                  flexDirection: 'column',
                  gap: '8px',
                  transition: 'all 200ms',
                }}
              >
                <div style={{ display: 'flex', justifyContent: 'space-between', alignItems: 'center' }}>
                  <span style={{ fontSize: '14px', fontWeight: 800, color: '#f8fafc' }}>
                    🎵 Freesound.org
                  </span>
                  <ExternalLink size={14} color="#94a3b8" />
                </div>
                <p style={{ fontSize: '12px', color: '#94a3b8', lineHeight: 1.5 }}>
                  Pesquise por <em>"spoken voice"</em> ou <em>"narration"</em> para achar gravações limpas de estúdio com licença Creative Commons.
                </p>
              </a>

              {/* Card 4: Internet Archive */}
              <a
                href="https://archive.org/details/audio_bookspoetry"
                target="_blank"
                rel="noreferrer"
                style={{
                  textDecoration: 'none',
                  padding: '16px',
                  borderRadius: '16px',
                  background: 'rgba(255, 255, 255, 0.03)',
                  border: '1px solid rgba(255, 255, 255, 0.06)',
                  display: 'flex',
                  flexDirection: 'column',
                  gap: '8px',
                  transition: 'all 200ms',
                }}
              >
                <div style={{ display: 'flex', justifyContent: 'space-between', alignItems: 'center' }}>
                  <span style={{ fontSize: '14px', fontWeight: 800, color: '#f8fafc' }}>
                    🏛️ Internet Archive
                  </span>
                  <ExternalLink size={14} color="#94a3b8" />
                </div>
                <p style={{ fontSize: '12px', color: '#94a3b8', lineHeight: 1.5 }}>
                  Acervo histórico com discursos solenes, leituras de clássicos, poemas e oratória de figuras marcantes do mundo todo.
                </p>
              </a>
            </div>

            {/* Dica de Gravação */}
            <div style={{
              display: 'flex',
              alignItems: 'flex-start',
              gap: '12px',
              padding: '14px 18px',
              borderRadius: '14px',
              background: 'rgba(16, 185, 129, 0.06)',
              border: '1px solid rgba(16, 185, 129, 0.2)',
            }}>
              <HelpCircle size={18} color="#10b981" style={{ flexShrink: 0, marginTop: '2px' }} />
              <div style={{ fontSize: '12px', color: '#cbd5e1', lineHeight: 1.6 }}>
                <strong>Dica de Ouro:</strong> Para ter o melhor resultado, use uma amostra de <strong>30 a 60 segundos</strong> de fala contínua, sem música de fundo e com pouco eco de sala.
              </div>
            </div>
          </div>

          {/* Form de Clonagem & Configurações */}
          <form 
            onSubmit={handleCreateClone}
            className="floating-card"
            style={{
              padding: '32px',
              borderRadius: '28px',
              background: 'var(--bg-surface)',
              border: '1px solid var(--border-subtle)',
              display: 'flex',
              flexDirection: 'column',
              gap: '24px',
            }}
          >
            <h3 style={{ fontSize: '18px', fontWeight: 900, color: '#f8fafc', textTransform: 'uppercase' }}>
              1. Envie ou Grave o Áudio da Voz
            </h3>

            {/* Roteiro Orientativo */}
            <div style={{
              padding: '16px 20px',
              borderRadius: '16px',
              background: 'rgba(16, 185, 129, 0.08)',
              border: '1px solid rgba(16, 185, 129, 0.2)',
              display: 'flex',
              flexDirection: 'column',
              gap: '6px',
            }}>
              <span style={{ fontSize: '11px', fontWeight: 800, color: '#10b981', textTransform: 'uppercase', letterSpacing: '0.05em' }}>
                Texto Sugerido Para Ler em Voz Alta (Caso vá gravar):
              </span>
              <p style={{ fontSize: '13px', color: '#e2e8f0', lineHeight: 1.6, fontStyle: 'italic' }}>
                "No silêncio das páginas, as histórias ganham alma e voz própria. A leitura com pausas calculadas e entonação profunda nos conduz a um estado de atenção e presença absoluta."
              </p>
            </div>

            {/* Opções de Gravação & Upload */}
            <div style={{ display: 'grid', gridTemplateColumns: 'repeat(auto-fit, minmax(min(280px, 100%), 1fr))', gap: '20px' }}>
              {/* Opção A: Gravar pelo Microfone */}
              <div style={{
                padding: '24px',
                borderRadius: '20px',
                background: 'rgba(0, 0, 0, 0.25)',
                border: isRecording ? '2px solid #ef4444' : '1px solid var(--border-subtle)',
                display: 'flex',
                flexDirection: 'column',
                alignItems: 'center',
                justifyContent: 'center',
                gap: '16px',
                textAlign: 'center',
              }}>
                <div style={{
                  width: '64px',
                  height: '64px',
                  borderRadius: '50%',
                  background: isRecording ? 'rgba(239, 68, 68, 0.2)' : 'rgba(16, 185, 129, 0.15)',
                  display: 'flex',
                  alignItems: 'center',
                  justifyContent: 'center',
                  color: isRecording ? '#ef4444' : '#10b981',
                  border: isRecording ? '2px solid #ef4444' : '1px solid rgba(16, 185, 129, 0.3)',
                }}>
                  {isRecording ? <Radio size={28} /> : <Mic2 size={28} />}
                </div>

                <div>
                  <h4 style={{ fontSize: '15px', fontWeight: 800, color: '#f8fafc' }}>
                    {isRecording ? `Gravando... ${recordingSeconds}s` : 'Gravar com Microfone'}
                  </h4>
                  <p style={{ fontSize: '12px', color: '#94a3b8', marginTop: '4px' }}>
                    {isRecording ? 'Fale com clareza e ritmo pausado' : 'Clique para começar sua amostra'}
                  </p>
                </div>

                {isRecording ? (
                  <button
                    type="button"
                    onClick={stopRecording}
                    style={{
                      display: 'flex',
                      alignItems: 'center',
                      gap: '8px',
                      padding: '10px 20px',
                      borderRadius: '12px',
                      background: '#ef4444',
                      color: '#ffffff',
                      fontSize: '12px',
                      fontWeight: 800,
                      textTransform: 'uppercase',
                      cursor: 'pointer',
                    }}
                  >
                    <Square size={14} />
                    <span>Parar Gravação ({recordingSeconds}s)</span>
                  </button>
                ) : (
                  <button
                    type="button"
                    onClick={startRecording}
                    style={{
                      display: 'flex',
                      alignItems: 'center',
                      gap: '8px',
                      padding: '10px 20px',
                      borderRadius: '12px',
                      background: 'linear-gradient(135deg, #10b981 0%, #059669 100%)',
                      color: '#ffffff',
                      fontSize: '12px',
                      fontWeight: 800,
                      textTransform: 'uppercase',
                      boxShadow: '0 6px 15px rgba(16, 185, 129, 0.3)',
                      cursor: 'pointer',
                    }}
                  >
                    <Mic2 size={14} />
                    <span>Iniciar Gravação</span>
                  </button>
                )}
              </div>

              {/* Opção B: Enviar Arquivo de Áudio */}
              <div 
                onClick={() => fileInputRef.current?.click()}
                style={{
                  padding: '24px',
                  borderRadius: '20px',
                  background: 'rgba(0, 0, 0, 0.25)',
                  border: uploadedFile ? '2px solid #10b981' : '1px dashed var(--border-subtle)',
                  display: 'flex',
                  flexDirection: 'column',
                  alignItems: 'center',
                  justifyContent: 'center',
                  gap: '16px',
                  textAlign: 'center',
                  cursor: 'pointer',
                }}
              >
                <input
                  type="file"
                  ref={fileInputRef}
                  onChange={handleFileUpload}
                  accept="audio/mp3,audio/wav,audio/m4a,audio/ogg"
                  style={{ display: 'none' }}
                />

                <div style={{
                  width: '64px',
                  height: '64px',
                  borderRadius: '50%',
                  background: 'rgba(255, 255, 255, 0.05)',
                  display: 'flex',
                  alignItems: 'center',
                  justifyContent: 'center',
                  color: '#94a3b8',
                }}>
                  <Upload size={28} />
                </div>

                <div>
                  <h4 style={{ fontSize: '15px', fontWeight: 800, color: '#f8fafc' }}>
                    {uploadedFile ? uploadedFile.name : 'Subir Arquivo de Áudio'}
                  </h4>
                  <p style={{ fontSize: '12px', color: '#94a3b8', marginTop: '4px' }}>
                    Formatos suportados: .wav, .mp3, .m4a (até 25MB)
                  </p>
                </div>

                <span style={{
                  fontSize: '11px',
                  fontWeight: 800,
                  color: '#10b981',
                  background: 'rgba(16, 185, 129, 0.1)',
                  padding: '4px 10px',
                  borderRadius: '8px',
                }}>
                  {uploadedFile ? 'Arquivo Selecionado ✓' : 'Clique Para Escolher o Arquivo'}
                </span>
              </div>
            </div>

            {/* Preview do Áudio Gravado/Subido */}
            {audioUrl && (
              <div style={{
                padding: '16px 20px',
                borderRadius: '16px',
                background: 'rgba(16, 185, 129, 0.08)',
                border: '1px solid rgba(16, 185, 129, 0.25)',
                display: 'flex',
                alignItems: 'center',
                justifyContent: 'space-between',
                flexWrap: 'wrap',
                gap: '14px',
              }}>
                <div style={{ display: 'flex', alignItems: 'center', gap: '10px' }}>
                  <CheckCircle2 size={18} color="#10b981" />
                  <span style={{ fontSize: '13px', fontWeight: 700, color: '#f8fafc' }}>
                    Amostra de áudio pronta para calibração!
                  </span>
                </div>

                <audio controls src={audioUrl} style={{ height: '36px', maxWidth: '320px' }} />
              </div>
            )}

            {/* Configurações da Voz Clonada */}
            <h3 style={{ fontSize: '18px', fontWeight: 900, color: '#f8fafc', textTransform: 'uppercase', marginTop: '8px' }}>
              2. Calibre a Afinação Grave & Espaçamento da Narração
            </h3>

            <div style={{ display: 'grid', gridTemplateColumns: 'repeat(auto-fit, minmax(min(240px, 100%), 1fr))', gap: '20px' }}>
              {/* Nome */}
              <div style={{ display: 'flex', flexDirection: 'column', gap: '8px' }}>
                <label style={{ fontSize: '12px', fontWeight: 700, color: '#94a3b8', textTransform: 'uppercase' }}>
                  Nome da Voz
                </label>
                <input
                  type="text"
                  value={voiceName}
                  onChange={(e) => setVoiceName(e.target.value)}
                  placeholder="Ex: Narrador Filosófico Grave"
                  style={{
                    padding: '12px 16px',
                    borderRadius: '12px',
                    background: 'var(--bg-surface-elevated)',
                    border: '1px solid var(--border-subtle)',
                    color: '#f8fafc',
                    fontSize: '14px',
                  }}
                />
              </div>

              {/* Gênero */}
              <div style={{ display: 'flex', flexDirection: 'column', gap: '8px' }}>
                <label style={{ fontSize: '12px', fontWeight: 700, color: '#94a3b8', textTransform: 'uppercase' }}>
                  Gênero do Locutor
                </label>
                <select
                  value={gender}
                  onChange={(e) => setGender(e.target.value as any)}
                  style={{
                    padding: '12px 16px',
                    borderRadius: '12px',
                    background: 'var(--bg-surface-elevated)',
                    border: '1px solid var(--border-subtle)',
                    color: '#f8fafc',
                    fontSize: '14px',
                  }}
                >
                  <option value="male">Masculino</option>
                  <option value="female">Feminino</option>
                </select>
              </div>

              {/* Estilo de Narração */}
              <div style={{ display: 'flex', flexDirection: 'column', gap: '8px' }}>
                <label style={{ fontSize: '12px', fontWeight: 700, color: '#94a3b8', textTransform: 'uppercase' }}>
                  Estilo de Interpretação
                </label>
                <select
                  value={narrativeStyle}
                  onChange={(e) => setNarrativeStyle(e.target.value)}
                  style={{
                    padding: '12px 16px',
                    borderRadius: '12px',
                    background: 'var(--bg-surface-elevated)',
                    border: '1px solid var(--border-subtle)',
                    color: '#f8fafc',
                    fontSize: '14px',
                  }}
                >
                  <option value="Grave & Solene (Cid Moreira)">Grave & Solene (Cid Moreira)</option>
                  <option value="Espaçoso & Reflexivo (Zen)">Espaçoso & Reflexivo (Zen / Filosofia)</option>
                  <option value="Dramático & Suspense">Dramático & Suspense (Mistério)</option>
                  <option value="Cinema & Trailer">Cinema & Trailer (Blockbuster)</option>
                  <option value="Suave & Noturno">Suave & Noturno (Aconchegante)</option>
                </select>
              </div>

              {/* Afinação / Gravidade (Pitch) */}
              <div style={{ display: 'flex', flexDirection: 'column', gap: '8px' }}>
                <label style={{ fontSize: '12px', fontWeight: 700, color: '#94a3b8', textTransform: 'uppercase' }}>
                  Afinação / Tom da Voz (Pitch)
                </label>
                <select
                  value={pitchAdjustment}
                  onChange={(e) => setPitchAdjustment(e.target.value)}
                  style={{
                    padding: '12px 16px',
                    borderRadius: '12px',
                    background: 'var(--bg-surface-elevated)',
                    border: '1px solid var(--border-subtle)',
                    color: '#f8fafc',
                    fontSize: '14px',
                  }}
                >
                  <option value="-12Hz">🎙️ Ultra-Grave (Cid Moreira™ -12Hz)</option>
                  <option value="-8Hz">🎙️ Barítono Profundo (-8Hz)</option>
                  <option value="-4Hz">🎙️ Grave Médio Ponderado (-4Hz)</option>
                  <option value="+0Hz">✨ Tom Natural (0Hz)</option>
                  <option value="+3Hz">🌟 Tom Suave Mais Agudo (+3Hz)</option>
                </select>
              </div>

              {/* Cadência / Espaçamento (Pausas) */}
              <div style={{ display: 'flex', flexDirection: 'column', gap: '8px' }}>
                <label style={{ fontSize: '12px', fontWeight: 700, color: '#94a3b8', textTransform: 'uppercase' }}>
                  Espaçamento & Cadência de Fala
                </label>
                <select
                  value={cadenceChoice}
                  onChange={(e) => setCadenceChoice(e.target.value as any)}
                  style={{
                    padding: '12px 16px',
                    borderRadius: '12px',
                    background: 'var(--bg-surface-elevated)',
                    border: '1px solid var(--border-subtle)',
                    color: '#f8fafc',
                    fontSize: '14px',
                  }}
                >
                  <option value="espacosa">🧘 Espaçosa & Lenta (Com Pausas de Respiração e Reflexão)</option>
                  <option value="dramatica">🎭 Dramática & Suspense (Tensão e Mistério)</option>
                  <option value="natural">📖 Fluida Natural (Audiolivro Padrão)</option>
                </select>
              </div>

              {/* Voz Base de Modulação */}
              <div style={{ display: 'flex', flexDirection: 'column', gap: '8px' }}>
                <label style={{ fontSize: '12px', fontWeight: 700, color: '#94a3b8', textTransform: 'uppercase' }}>
                  Matriz Neural Base
                </label>
                <select
                  value={baseVoiceChoice}
                  onChange={(e) => setBaseVoiceChoice(e.target.value)}
                  style={{
                    padding: '12px 16px',
                    borderRadius: '12px',
                    background: 'var(--bg-surface-elevated)',
                    border: '1px solid var(--border-subtle)',
                    color: '#f8fafc',
                    fontSize: '14px',
                  }}
                >
                  <option value="pt-BR-AntonioNeural">Antônio Neural (Masculina Profunda)</option>
                  <option value="pt-BR-FranciscaNeural">Francisca Neural (Feminina Expressiva)</option>
                  <option value="en-US-BrianMultilingualNeural">Brian Multilingual (Barítono Cinema)</option>
                  <option value="pt-BR-ThalitaMultilingualNeural">Thalita Multilingual (Fluida & Clara)</option>
                </select>
              </div>
            </div>

            {/* Mensagens de Sucesso ou Erro */}
            {cloneErrorMsg && (
              <div style={{
                display: 'flex',
                alignItems: 'center',
                gap: '8px',
                padding: '12px 16px',
                borderRadius: '12px',
                background: 'rgba(239, 68, 68, 0.1)',
                border: '1px solid rgba(239, 68, 68, 0.3)',
                color: '#ef4444',
                fontSize: '13px',
              }}>
                <AlertCircle size={16} />
                <span>{cloneErrorMsg}</span>
              </div>
            )}

            {cloneSuccessMsg && (
              <div style={{
                display: 'flex',
                alignItems: 'center',
                gap: '8px',
                padding: '12px 16px',
                borderRadius: '12px',
                background: 'rgba(16, 185, 129, 0.12)',
                border: '1px solid rgba(16, 185, 129, 0.3)',
                color: '#10b981',
                fontSize: '13px',
              }}>
                <CheckCircle2 size={16} />
                <span>{cloneSuccessMsg}</span>
              </div>
            )}

            {/* Submit Button */}
            <button
              type="submit"
              disabled={isCloning || !audioBlob}
              style={{
                display: 'flex',
                alignItems: 'center',
                justifyContent: 'center',
                gap: '10px',
                padding: '16px 32px',
                borderRadius: '16px',
                background: 'linear-gradient(135deg, #10b981 0%, #059669 100%)',
                color: '#ffffff',
                fontSize: '14px',
                fontWeight: 900,
                textTransform: 'uppercase',
                letterSpacing: '0.06em',
                opacity: isCloning || !audioBlob ? 0.6 : 1,
                boxShadow: '0 10px 25px rgba(16, 185, 129, 0.35)',
                cursor: isCloning || !audioBlob ? 'not-allowed' : 'pointer',
                transition: 'all 200ms',
              }}
            >
              {isCloning ? (
                <>
                  <Loader2 size={18} className="animate-spin" />
                  <span>Configurando Voz e Calibrando Afinação...</span>
                </>
              ) : (
                <>
                  <Sparkles size={18} />
                  <span>Salvar Voz Personalizada e Ativar no Leitor</span>
                </>
              )}
            </button>
          </form>
        </div>
      )}
    </div>
  );
};
