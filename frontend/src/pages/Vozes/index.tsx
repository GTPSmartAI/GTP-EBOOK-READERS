import React, { useState, useRef, useEffect } from 'react';
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
  AudioLines 
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
  const [filterLang, setFilterLang] = useState<string>('all');
  
  // Voice Cloning State
  const [voiceName, setVoiceName] = useState('');
  const [gender, setGender] = useState<'male' | 'female'>('male');
  const [narrativeStyle, setNarrativeStyle] = useState('Dramático & Suspense');
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
        // Stop audio tracks
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
      setCloneErrorMsg('Grave um áudio de pelo menos 15 segundos ou envie um arquivo de áudio.');
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
      formData.append('user_id', 'pro_subscriber');

      const response = await fetch('http://localhost:4000/api/voices/clone', {
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

      setCloneSuccessMsg(`Voz "${newVoice.name}" clonada com sucesso! Ela já foi definida como a voz ativa do seu leitor.`);
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
    if (filterLang === 'pt') return v.lang.startsWith('pt');
    if (filterLang === 'en') return v.lang.startsWith('en');
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
              width: '36px',
              height: '36px',
              borderRadius: '12px',
              background: 'linear-gradient(135deg, #10b981 0%, #059669 100%)',
              display: 'flex',
              alignItems: 'center',
              justifyContent: 'center',
              color: '#fff',
              boxShadow: '0 8px 20px rgba(16, 185, 129, 0.3)',
            }}>
              <Mic2 size={20} />
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
                Entonação humana cinematográfica com suspense e clonagem da sua própria voz para narração.
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
            }}
          >
            <AudioLines size={15} />
            <span>Vozes Cinematográficas</span>
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
            }}
          >
            <Sparkles size={15} />
            <span>Duplicador de Voz (Clone)</span>
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
            <div style={{ display: 'flex', gap: '8px' }}>
              {[
                { id: 'all', label: 'Todas as Vozes' },
                { id: 'pt', label: '🇧🇷 Português do Brasil' },
                { id: 'en', label: '🇺🇸 / 🇬🇧 Inglês' },
              ].map((tab) => (
                <button
                  key={tab.id}
                  onClick={() => setFilterLang(tab.id)}
                  style={{
                    padding: '6px 14px',
                    borderRadius: '12px',
                    fontSize: '12px',
                    fontWeight: 700,
                    background: filterLang === tab.id ? 'rgba(16, 185, 129, 0.15)' : 'var(--bg-surface)',
                    color: filterLang === tab.id ? '#10b981' : '#94a3b8',
                    border: filterLang === tab.id ? '1px solid rgba(16, 185, 129, 0.3)' : '1px solid var(--border-subtle)',
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
                padding: '4px 10px',
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
            gridTemplateColumns: 'repeat(auto-fill, minmax(360px, 1fr))',
            gap: '20px',
          }}>
            {filteredVoices.map((voice) => {
              const isSelected = selectedVoice.id === voice.id;
              const isFav = favoriteVoiceIds.includes(voice.id);
              const isCloned = (voice as any).isCloned;

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
                            {isCloned && (
                              <span style={{
                                fontSize: '10px',
                                fontWeight: 800,
                                background: 'rgba(16, 185, 129, 0.2)',
                                color: '#10b981',
                                padding: '2px 6px',
                                borderRadius: '6px',
                                border: '1px solid rgba(16, 185, 129, 0.3)',
                              }}>
                                SUA VOZ
                              </span>
                            )}
                          </div>
                          <span style={{ fontSize: '12px', color: '#94a3b8' }}>
                            {voice.accent}
                          </span>
                        </div>
                      </div>

                      {/* Favorite & Delete Buttons */}
                      <div style={{ display: 'flex', gap: '6px' }}>
                        {isCloned && (
                          <button
                            onClick={(e) => {
                              e.stopPropagation();
                              handleDeleteClonedVoice(voice.id);
                            }}
                            style={{
                              padding: '8px',
                              color: '#ef4444',
                              background: 'rgba(239, 68, 68, 0.1)',
                              borderRadius: '10px',
                            }}
                            title="Remover voz clonada"
                          >
                            <Trash2 size={15} />
                          </button>
                        )}

                        <button
                          onClick={(e) => {
                            e.stopPropagation();
                            onToggleFavoriteVoice(voice.id);
                          }}
                          style={{
                            padding: '8px',
                            color: isFav ? '#10b981' : '#64748b',
                            background: isFav ? 'rgba(16, 185, 129, 0.15)' : 'rgba(255, 255, 255, 0.04)',
                            borderRadius: '10px',
                          }}
                        >
                          <Heart size={16} fill={isFav ? '#10b981' : 'none'} />
                        </button>
                      </div>
                    </div>

                    {/* Tag Badge */}
                    <div style={{ marginTop: '14px' }}>
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

      {/* ABA 2: DUPLICADOR DE VOZ COM IA (CLONAGEM) */}
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
                <span style={{ fontSize: '12px', color: '#94a3b8' }}>Instant Voice Cloning</span>
              </div>

              <h2 style={{
                fontSize: '26px',
                fontWeight: 900,
                color: '#f8fafc',
                textTransform: 'uppercase',
                letterSpacing: '-0.02em',
              }}>
                Duplique Sua Própria Voz Para Narrar Seus Livros
              </h2>

              <p style={{ fontSize: '14px', color: '#94a3b8', lineHeight: 1.6 }}>
                Grave um minuto da sua voz ou envie um arquivo de áudio. Nossa inteligência artificial aprenderá suas nuances, timbre e entonação, permitindo que você ouça qualquer livro com a sua própria voz narrando as páginas.
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
                  {clonedVoices.length} Vozes Clonadas
                </span>
                <span style={{ fontSize: '11px', color: '#10b981' }}>Disponíveis no seu leitor</span>
              </div>
            </div>
          </div>

          {/* Form de Clonagem */}
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
              1. Grave ou Envie Sua Amostra de Voz
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
                Texto Sugerido Para Ler em Voz Alta (30 segundos):
              </span>
              <p style={{ fontSize: '13px', color: '#e2e8f0', lineHeight: 1.6, fontStyle: 'italic' }}>
                "A leitura expande os horizontes da imaginação e transforma histórias em experiências inesquecíveis. Quando leio com atenção e calma, cada palavra ganha ritmo, entonação e vida própria."
              </p>
            </div>

            {/* Opções de Gravação & Upload */}
            <div style={{ display: 'grid', gridTemplateColumns: 'repeat(auto-fit, minmax(280px, 1fr))', gap: '20px' }}>
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
                  animation: isRecording ? 'pulse 1.5s infinite' : 'none',
                }}>
                  {isRecording ? <Radio size={28} /> : <Mic2 size={28} />}
                </div>

                <div>
                  <h4 style={{ fontSize: '15px', fontWeight: 800, color: '#f8fafc' }}>
                    {isRecording ? `Gravando... ${recordingSeconds}s` : 'Gravar com o Microfone'}
                  </h4>
                  <p style={{ fontSize: '12px', color: '#94a3b8', marginTop: '4px' }}>
                    {isRecording ? 'Fale de forma clara e natural' : 'Clique no botão abaixo para começar'}
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
                    {uploadedFile ? uploadedFile.name : 'Ou Subir Arquivo de Áudio'}
                  </h4>
                  <p style={{ fontSize: '12px', color: '#94a3b8', marginTop: '4px' }}>
                    Formatos suportados: .wav, .mp3, .m4a (até 20MB)
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
                  {uploadedFile ? 'Arquivo Selecionado' : 'Clique Para Procurar'}
                </span>
              </div>
            </div>

            {/* Preview do Áudio Gravado */}
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
                    Amostra de voz capturada com sucesso!
                  </span>
                </div>

                <audio controls src={audioUrl} style={{ height: '36px', maxWidth: '320px' }} />
              </div>
            )}

            {/* Configurações da Voz Clonada */}
            <h3 style={{ fontSize: '18px', fontWeight: 900, color: '#f8fafc', textTransform: 'uppercase', marginTop: '8px' }}>
              2. Personalize Seu Clone de Voz
            </h3>

            <div style={{ display: 'grid', gridTemplateColumns: 'repeat(auto-fit, minmax(240px, 1fr))', gap: '20px' }}>
              {/* Nome */}
              <div style={{ display: 'flex', flexDirection: 'column', gap: '8px' }}>
                <label style={{ fontSize: '12px', fontWeight: 700, color: '#94a3b8', textTransform: 'uppercase' }}>
                  Nome da Voz
                </label>
                <input
                  type="text"
                  value={voiceName}
                  onChange={(e) => setVoiceName(e.target.value)}
                  placeholder="Ex: Minha Voz - Alexandre"
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
                  Gênero
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
                  <option value="Dramático & Suspense">Dramático & Suspense (Imersivo)</option>
                  <option value="Narrador Cinematográfico">Narrador Cinematográfico (Trailer)</option>
                  <option value="Calmo & Reflexivo">Calmo & Reflexivo (Não-ficção)</option>
                  <option value="Dinâmico & Moderno">Dinâmico & Moderno (Artigos & Negócios)</option>
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
              }}
            >
              {isCloning ? (
                <>
                  <Loader2 size={18} className="animate-spin" />
                  <span>Processando Amostra e Clonando com IA...</span>
                </>
              ) : (
                <>
                  <Sparkles size={18} />
                  <span>Duplicar e Ativar Minha Voz no Leitor</span>
                </>
              )}
            </button>
          </form>
        </div>
      )}
    </div>
  );
};
