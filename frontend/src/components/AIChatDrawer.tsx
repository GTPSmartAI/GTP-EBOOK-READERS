import React, { useState } from 'react';
import { X, Send, Sparkles, Volume2 } from 'lucide-react';
import type { Book, ChatMessage } from '../types';
import { speechEngine } from '../services/speechEngine';

interface AIChatDrawerProps {
  isOpen: boolean;
  onClose: () => void;
  book: Book;
  currentSentenceIndex: number;
}

export const AIChatDrawer: React.FC<AIChatDrawerProps> = ({
  isOpen,
  onClose,
  book,
  currentSentenceIndex,
}) => {
  const [messages, setMessages] = useState<ChatMessage[]>([
    {
      id: 'welcome',
      sender: 'assistant',
      text: `Olá! Eu sou o assistente inteligente do ElevenReader. Estou acompanhando sua leitura de "${book.title}". O que você gostaria de saber ou aprofundar sobre esta obra?`,
      timestamp: 'Agora',
    },
  ]);
  const [inputValue, setInputValue] = useState('');
  const [isTyping, setIsTyping] = useState(false);

  if (!isOpen) return null;

  const quickPrompts = [
    'Faça um resumo executivo deste livro',
    'Quais as 3 lições mais valiosas aqui?',
    'Explique o trecho que estou lendo agora',
  ];

  const handleSend = (textToSend?: string) => {
    const text = textToSend || inputValue;
    if (!text.trim()) return;

    const userMsg: ChatMessage = {
      id: 'msg-' + Date.now(),
      sender: 'user',
      text: text,
      timestamp: 'Agora',
    };

    setMessages((prev) => [...prev, userMsg]);
    setInputValue('');
    setIsTyping(true);

    // Generate context-aware intelligent response
    setTimeout(() => {
      let reply = '';
      const lower = text.toLowerCase();

      if (lower.includes('resumo') || lower.includes('resumir')) {
        reply = `**Resumo de "${book.title}"**:\n\nEsta obra foca em princípios fundamentais de discernimento e ação. No trecho atual, o texto explora as nuances da percepção humana, destacando que pequenas melhorias contínuas e disciplina superam impulsos momentâneos.\n\nPrincipais pontos:\n1. Consistência e foco nas variáveis sob seu controle.\n2. Adaptação constante ao ambiente e ao contexto.\n3. Clareza de propósito na condução dos seus objetivos.`;
      } else if (lower.includes('lições') || lower.includes('licoes') || lower.includes('valiosas')) {
        reply = `**3 Lições Fundamentais da Obra:**\n\n1. **A essência é invisível aos olhos:** Apenas através da atenção profunda e discernimento captamos o real valor das coisas.\n2. **Preparação vence o improviso:** Conhecer o terreno e dominar os fundamentos antes da ação garante o êxito.\n3. **Pequenos hábitos geram juros compostos:** Pequenas práticas diárias moldam sua identidade e resultados a longo prazo.`;
      } else if (lower.includes('trecho') || lower.includes('lendo agora')) {
        const currentSentence = book.sentences[currentSentenceIndex] || book.sentences[0];
        reply = `No trecho atual que você está ouvindo: *" ${currentSentence} "*\n\nO autor reforça que a percepção inicial de um problema frequentemente nos engana. Ele nos convida a observar com mais sensibilidade e método, evitando julgamentos superficiais.`;
      } else {
        reply = `Com base nas páginas de "${book.title}", essa reflexão conecta-se diretamente ao tema central do autor sobre manter o foco nos princípios essenciais enquanto navegamos em ambientes complexos. Se desejar, posso extrair citações diretas do livro para você!`;
      }

      const botMsg: ChatMessage = {
        id: 'reply-' + Date.now(),
        sender: 'assistant',
        text: reply,
        timestamp: 'Agora',
      };

      setMessages((prev) => [...prev, botMsg]);
      setIsTyping(false);
    }, 700);
  };

  const handleSpeakText = (text: string) => {
    // Speak out the response
    const cleanText = text.replace(/[*#]/g, '');
    speechEngine.previewVoice({
      id: 'ai-voice',
      name: 'IA Assistente',
      gender: 'female',
      lang: 'pt-BR',
      accent: 'Brasil',
      tag: 'Assistente',
      description: '',
      avatarColor: '',
      samplePhrase: cleanText.slice(0, 200),
      stability: 0.8,
      clarity: 0.9,
      speed: 1.05,
    });
  };

  return (
    <div style={{
      position: 'fixed',
      inset: 0,
      zIndex: 95,
      display: 'flex',
      justifyContent: 'flex-end',
      backgroundColor: 'rgba(0, 0, 0, 0.5)',
      backdropFilter: 'blur(4px)',
    }}>
      <div 
        className="fade-in"
        style={{
          width: '100%',
          maxWidth: '440px',
          height: '100%',
          background: 'var(--bg-surface)',
          borderLeft: '1px solid var(--border-subtle)',
          boxShadow: 'var(--shadow-lg)',
          display: 'flex',
          flexDirection: 'column',
        }}
      >
        {/* Header */}
        <div style={{
          display: 'flex',
          alignItems: 'center',
          justifyContent: 'space-between',
          padding: '18px 20px',
          borderBottom: '1px solid var(--border-subtle)',
          background: 'var(--bg-surface-glass)',
        }}>
          <div style={{ display: 'flex', alignItems: 'center', gap: '8px' }}>
            <div style={{
              width: '28px',
              height: '28px',
              borderRadius: '50%',
              background: 'linear-gradient(135deg, var(--accent-primary) 0%, #ec4899 100%)',
              display: 'flex',
              alignItems: 'center',
              justifyContent: 'center',
              color: '#fff',
            }}>
              <Sparkles size={15} />
            </div>
            <div>
              <h3 style={{ fontSize: '15px', fontWeight: 700, color: 'var(--text-primary)' }}>
                Pergunte ao Livro
              </h3>
              <p style={{ fontSize: '11px', color: 'var(--text-muted)' }}>
                IA contextual conectada a {book.title}
              </p>
            </div>
          </div>

          <button onClick={onClose} style={{ color: 'var(--text-muted)' }}>
            <X size={18} />
          </button>
        </div>

        {/* Messages Body */}
        <div style={{
          flex: 1,
          overflowY: 'auto',
          padding: '20px',
          display: 'flex',
          flexDirection: 'column',
          gap: '14px',
        }}>
          {messages.map((m) => (
            <div
              key={m.id}
              style={{
                display: 'flex',
                flexDirection: 'column',
                alignItems: m.sender === 'user' ? 'flex-end' : 'flex-start',
              }}
            >
              <div style={{
                maxWidth: '85%',
                padding: '12px 14px',
                borderRadius: 'var(--radius-md)',
                background: m.sender === 'user' ? 'var(--accent-primary)' : 'var(--bg-surface-elevated)',
                color: m.sender === 'user' ? '#ffffff' : 'var(--text-primary)',
                fontSize: '13px',
                lineHeight: 1.5,
                border: m.sender === 'user' ? 'none' : '1px solid var(--border-subtle)',
                whiteSpace: 'pre-wrap',
                position: 'relative',
              }}>
                {m.text}

                {m.sender === 'assistant' && (
                  <div style={{ marginTop: '8px', display: 'flex', justifyContent: 'flex-end' }}>
                    <button
                      onClick={() => handleSpeakText(m.text)}
                      style={{
                        display: 'flex',
                        alignItems: 'center',
                        gap: '4px',
                        fontSize: '11px',
                        color: 'var(--accent-primary)',
                        padding: '2px 6px',
                        borderRadius: '4px',
                        background: 'rgba(255, 255, 255, 0.05)',
                      }}
                      title="Ouvir esta resposta em áudio"
                    >
                      <Volume2 size={12} />
                      <span>Ouvir</span>
                    </button>
                  </div>
                )}
              </div>
            </div>
          ))}

          {isTyping && (
            <div style={{
              display: 'flex',
              alignItems: 'center',
              gap: '6px',
              padding: '10px 14px',
              borderRadius: 'var(--radius-md)',
              background: 'var(--bg-surface-elevated)',
              width: 'fit-content',
              fontSize: '12px',
              color: 'var(--text-muted)',
            }}>
              <Sparkles size={13} className="animate-spin" />
              <span>Analisando as páginas do livro...</span>
            </div>
          )}
        </div>

        {/* Quick Prompts */}
        <div style={{
          padding: '8px 16px',
          display: 'flex',
          gap: '6px',
          overflowX: 'auto',
          borderTop: '1px solid var(--border-subtle)',
          background: 'rgba(255, 255, 255, 0.02)',
        }}>
          {quickPrompts.map((p, idx) => (
            <button
              key={idx}
              onClick={() => handleSend(p)}
              style={{
                padding: '4px 10px',
                borderRadius: 'var(--radius-full)',
                background: 'var(--bg-surface-elevated)',
                border: '1px solid var(--border-subtle)',
                color: 'var(--text-secondary)',
                fontSize: '11px',
                whiteSpace: 'nowrap',
              }}
            >
              {p}
            </button>
          ))}
        </div>

        {/* Input Field */}
        <div style={{
          padding: '14px 16px',
          borderTop: '1px solid var(--border-subtle)',
          display: 'flex',
          alignItems: 'center',
          gap: '8px',
        }}>
          <input
            type="text"
            value={inputValue}
            onChange={(e) => setInputValue(e.target.value)}
            onKeyDown={(e) => e.key === 'Enter' && handleSend()}
            placeholder="Faça uma pergunta sobre o livro..."
            style={{
              flex: 1,
              padding: '10px 14px',
              borderRadius: 'var(--radius-md)',
              background: 'var(--bg-surface-elevated)',
              border: '1px solid var(--border-subtle)',
              color: 'var(--text-primary)',
              fontSize: '13px',
            }}
          />

          <button
            onClick={() => handleSend()}
            disabled={!inputValue.trim()}
            style={{
              width: '38px',
              height: '38px',
              borderRadius: 'var(--radius-md)',
              background: 'var(--accent-primary)',
              color: '#ffffff',
              display: 'flex',
              alignItems: 'center',
              justifyContent: 'center',
              opacity: !inputValue.trim() ? 0.5 : 1,
            }}
          >
            <Send size={16} />
          </button>
        </div>
      </div>
    </div>
  );
};
