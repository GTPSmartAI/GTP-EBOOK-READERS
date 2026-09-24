import React from 'react';
import { 
  Sliders, 
  Type, 
  Moon, 
  Sun, 
  Book, 
  Monitor, 
  Crown, 
  LogOut
} from 'lucide-react';
import type { ReaderSettings, ThemeMode, FontFamily } from '../../types';
import type { UserProfile } from '../../services/supabase';

interface ConfiguracoesProps {
  settings: ReaderSettings;
  onUpdateSettings: (newSettings: Partial<ReaderSettings>) => void;
  user: any;
  userProfile: UserProfile | null;
  onOpenSubscription: () => void;
  onSignOut: () => void;
}

export const Configuracoes: React.FC<ConfiguracoesProps> = ({
  settings,
  onUpdateSettings,
  user,
  userProfile,
  onOpenSubscription,
  onSignOut,
}) => {
  const isPro = userProfile?.subscription_tier === 'pro' || userProfile?.subscription_tier === 'unlimited';

  const themes: { id: ThemeMode; label: string; icon: React.ReactNode; bg: string; color: string }[] = [
    { id: 'dark', label: 'Escuro Cyber', icon: <Moon size={16} />, bg: '#0c1015', color: '#f8fafc' },
    { id: 'oled', label: 'Preto OLED', icon: <Monitor size={16} />, bg: '#000000', color: '#ffffff' },
    { id: 'sepia', label: 'Sépia Livro', icon: <Book size={16} />, bg: '#fbf0d9', color: '#2c221a' },
    { id: 'light', label: 'Claro Editorial', icon: <Sun size={16} />, bg: '#ffffff', color: '#0f172a' },
  ];

  const fonts: { id: FontFamily; label: string; preview: string; fontName: string }[] = [
    { id: 'sans', label: 'Sans (Inter)', preview: 'Aa', fontName: 'Inter' },
    { id: 'serif', label: 'Serif (Livro Clássico)', preview: 'Aa', fontName: 'Newsreader' },
    { id: 'mono', label: 'Mono (Código)', preview: 'Aa', fontName: 'JetBrains Mono' },
  ];

  return (
    <div style={{
      flex: 1,
      overflowY: 'auto',
      padding: '32px 24px 120px 24px',
      maxWidth: '1000px',
      margin: '0 auto',
      width: '100%',
      display: 'flex',
      flexDirection: 'column',
      gap: '32px',
    }}>
      {/* Page Title */}
      <div style={{ paddingBottom: '16px', borderBottom: '1px solid var(--border-subtle)' }}>
        <div style={{ display: 'flex', alignItems: 'center', gap: '8px' }}>
          <div style={{
            width: '32px',
            height: '32px',
            borderRadius: '10px',
            background: 'linear-gradient(135deg, #10b981 0%, #059669 100%)',
            display: 'flex',
            alignItems: 'center',
            justifyContent: 'center',
            color: '#fff',
          }}>
            <Sliders size={18} />
          </div>
          <h1 style={{
            fontSize: '24px',
            fontWeight: 900,
            color: '#f8fafc',
            textTransform: 'uppercase',
            letterSpacing: '-0.02em',
          }}>
            Configurações do Sistema
          </h1>
        </div>
        <p style={{ fontSize: '13px', color: '#94a3b8', marginTop: '4px' }}>
          Personalize sua tipografia de leitura, temas, preferências de narração e assinatura.
        </p>
      </div>

      {/* Card 1: Perfil & Assinatura */}
      <div 
        className="floating-card"
        style={{
          padding: '28px',
          borderRadius: '24px',
          background: 'var(--bg-surface)',
          border: '1px solid var(--border-subtle)',
          display: 'flex',
          justifyContent: 'space-between',
          alignItems: 'center',
          flexWrap: 'wrap',
          gap: '20px',
        }}
      >
        <div style={{ display: 'flex', alignItems: 'center', gap: '16px' }}>
          <div style={{
            width: '52px',
            height: '52px',
            borderRadius: '50%',
            background: 'linear-gradient(135deg, #10b981 0%, #059669 100%)',
            display: 'flex',
            alignItems: 'center',
            justifyContent: 'center',
            color: '#fff',
            fontWeight: 800,
            fontSize: '20px',
            boxShadow: '0 8px 20px rgba(16, 185, 129, 0.3)',
          }}>
            {user?.email ? user.email[0].toUpperCase() : 'U'}
          </div>

          <div>
            <div style={{ display: 'flex', alignItems: 'center', gap: '8px' }}>
              <h3 style={{ fontSize: '16px', fontWeight: 800, color: '#f8fafc' }}>
                {user?.user_metadata?.full_name || user?.email?.split('@')[0] || 'Usuário Convidado'}
              </h3>
              <span style={{
                fontSize: '11px',
                padding: '2px 8px',
                borderRadius: '6px',
                background: isPro ? 'rgba(16, 185, 129, 0.15)' : 'rgba(255, 255, 255, 0.08)',
                color: isPro ? '#10b981' : '#94a3b8',
                fontWeight: 700,
              }}>
                {isPro ? 'PLANO PRO ATIVO' : 'PLANO GRATUITO'}
              </span>
            </div>

            <p style={{ fontSize: '13px', color: '#94a3b8', marginTop: '2px' }}>
              {user?.email || 'Acesso local em modo demonstração'}
            </p>
          </div>
        </div>

        <div style={{ display: 'flex', gap: '12px' }}>
          <button
            onClick={onOpenSubscription}
            style={{
              display: 'flex',
              alignItems: 'center',
              gap: '6px',
              padding: '10px 18px',
              borderRadius: '14px',
              background: 'linear-gradient(135deg, #10b981 0%, #059669 100%)',
              color: '#ffffff',
              fontSize: '12px',
              fontWeight: 800,
              textTransform: 'uppercase',
              letterSpacing: '0.05em',
            }}
          >
            <Crown size={15} />
            <span>{isPro ? 'Gerenciar Assinatura' : 'Fazer Upgrade PRO'}</span>
          </button>

          {user && (
            <button
              onClick={onSignOut}
              style={{
                display: 'flex',
                alignItems: 'center',
                gap: '6px',
                padding: '10px 16px',
                borderRadius: '14px',
                background: 'rgba(239, 68, 68, 0.1)',
                border: '1px solid rgba(239, 68, 68, 0.25)',
                color: '#ef4444',
                fontSize: '12px',
                fontWeight: 700,
              }}
            >
              <LogOut size={15} />
              <span>Sair</span>
            </button>
          )}
        </div>
      </div>

      {/* Card 2: Preferências Visuais e Temas */}
      <div 
        className="floating-card"
        style={{
          padding: '28px',
          borderRadius: '24px',
          background: 'var(--bg-surface)',
          border: '1px solid var(--border-subtle)',
          display: 'flex',
          flexDirection: 'column',
          gap: '24px',
        }}
      >
        <div style={{ display: 'flex', alignItems: 'center', gap: '8px' }}>
          <Moon size={18} color="#10b981" />
          <h2 style={{ fontSize: '16px', fontWeight: 800, color: '#f8fafc' }}>
            Tema Visual do Ambiente
          </h2>
        </div>

        <div style={{ display: 'grid', gridTemplateColumns: 'repeat(auto-fit, minmax(180px, 1fr))', gap: '12px' }}>
          {themes.map((t) => {
            const isSelected = settings.theme === t.id;
            return (
              <button
                key={t.id}
                onClick={() => onUpdateSettings({ theme: t.id })}
                style={{
                  display: 'flex',
                  alignItems: 'center',
                  gap: '10px',
                  padding: '14px',
                  borderRadius: '16px',
                  background: t.bg,
                  color: t.color,
                  border: isSelected ? '2px solid #10b981' : '1px solid rgba(255, 255, 255, 0.1)',
                  boxShadow: isSelected ? '0 0 16px rgba(16, 185, 129, 0.3)' : 'none',
                  fontWeight: 700,
                  fontSize: '13px',
                }}
              >
                {t.icon}
                <span>{t.label}</span>
              </button>
            );
          })}
        </div>
      </div>

      {/* Card 3: Tipografia e Leitura */}
      <div 
        className="floating-card"
        style={{
          padding: '28px',
          borderRadius: '24px',
          background: 'var(--bg-surface)',
          border: '1px solid var(--border-subtle)',
          display: 'flex',
          flexDirection: 'column',
          gap: '24px',
        }}
      >
        <div style={{ display: 'flex', alignItems: 'center', gap: '8px' }}>
          <Type size={18} color="#10b981" />
          <h2 style={{ fontSize: '16px', fontWeight: 800, color: '#f8fafc' }}>
            Tipografia & Conforto de Leitura
          </h2>
        </div>

        {/* Escolha da Fonte */}
        <div style={{ display: 'flex', flexDirection: 'column', gap: '8px' }}>
          <label style={{ fontSize: '12px', fontWeight: 700, color: '#94a3b8', textTransform: 'uppercase' }}>
            Família Tipográfica
          </label>
          <div style={{ display: 'grid', gridTemplateColumns: 'repeat(auto-fit, minmax(200px, 1fr))', gap: '10px' }}>
            {fonts.map((f) => {
              const isSelected = settings.fontFamily === f.id;
              return (
                <button
                  key={f.id}
                  onClick={() => onUpdateSettings({ fontFamily: f.id })}
                  style={{
                    display: 'flex',
                    alignItems: 'center',
                    gap: '10px',
                    padding: '12px',
                    borderRadius: '14px',
                    background: isSelected ? 'rgba(16, 185, 129, 0.15)' : 'var(--bg-surface-elevated)',
                    border: isSelected ? '2px solid #10b981' : '1px solid var(--border-subtle)',
                    color: isSelected ? '#10b981' : '#f8fafc',
                    fontWeight: 700,
                    fontSize: '13px',
                  }}
                >
                  <span style={{ fontSize: '18px', fontWeight: 900 }}>{f.preview}</span>
                  <span>{f.label}</span>
                </button>
              );
            })}
          </div>
        </div>

        {/* Sliders de Tamanho e Espaçamento */}
        <div style={{ display: 'grid', gridTemplateColumns: 'repeat(auto-fit, minmax(280px, 1fr))', gap: '24px' }}>
          <div style={{ display: 'flex', flexDirection: 'column', gap: '6px' }}>
            <div style={{ display: 'flex', justifyContent: 'space-between', fontSize: '13px' }}>
              <span style={{ fontWeight: 600, color: '#f8fafc' }}>Tamanho da Fonte</span>
              <strong style={{ color: '#10b981' }}>{settings.fontSize}px</strong>
            </div>
            <input
              type="range"
              min={14}
              max={28}
              value={settings.fontSize}
              onChange={(e) => onUpdateSettings({ fontSize: Number(e.target.value) })}
              style={{ accentColor: '#10b981', width: '100%' }}
            />
          </div>

          <div style={{ display: 'flex', flexDirection: 'column', gap: '6px' }}>
            <div style={{ display: 'flex', justifyContent: 'space-between', fontSize: '13px' }}>
              <span style={{ fontWeight: 600, color: '#f8fafc' }}>Espaçamento entre Linhas</span>
              <strong style={{ color: '#10b981' }}>{settings.lineHeight}x</strong>
            </div>
            <input
              type="range"
              min={1.4}
              max={2.4}
              step={0.1}
              value={settings.lineHeight}
              onChange={(e) => onUpdateSettings({ lineHeight: Number(e.target.value) })}
              style={{ accentColor: '#10b981', width: '100%' }}
            />
          </div>
        </div>

        {/* Largura da Coluna */}
        <div style={{ display: 'flex', flexDirection: 'column', gap: '8px' }}>
          <label style={{ fontSize: '12px', fontWeight: 700, color: '#94a3b8', textTransform: 'uppercase' }}>
            Largura da Coluna de Texto
          </label>
          <div style={{ display: 'grid', gridTemplateColumns: 'repeat(4, 1fr)', gap: '10px' }}>
            {[
              { id: 'narrow', label: 'Estreita' },
              { id: 'medium', label: 'Média' },
              { id: 'wide', label: 'Ampla' },
              { id: 'full', label: 'Total (100%)' },
            ].map((w) => (
              <button
                key={w.id}
                onClick={() => onUpdateSettings({ readingWidth: w.id as any })}
                style={{
                  padding: '10px',
                  borderRadius: '12px',
                  fontSize: '12px',
                  fontWeight: 700,
                  background: settings.readingWidth === w.id ? '#10b981' : 'var(--bg-surface-elevated)',
                  color: settings.readingWidth === w.id ? '#fff' : '#94a3b8',
                  border: '1px solid var(--border-subtle)',
                }}
              >
                {w.label}
              </button>
            ))}
          </div>
        </div>

        {/* Rolagem Automática */}
        <div style={{
          display: 'flex',
          alignItems: 'center',
          justifyContent: 'space-between',
          paddingTop: '16px',
          borderTop: '1px solid var(--border-subtle)',
        }}>
          <div>
            <span style={{ fontSize: '14px', fontWeight: 700, color: '#f8fafc' }}>
              Rolagem Automática (Auto-Scroll)
            </span>
            <p style={{ fontSize: '12px', color: '#94a3b8', marginTop: '2px' }}>
              Desliza a página suavemente acompanhando a frase que o narrador está falando.
            </p>
          </div>

          <button
            onClick={() => onUpdateSettings({ autoScroll: !settings.autoScroll })}
            style={{
              width: '48px',
              height: '26px',
              borderRadius: '13px',
              background: settings.autoScroll ? '#10b981' : 'rgba(255, 255, 255, 0.1)',
              position: 'relative',
              transition: 'all 200ms',
            }}
          >
            <div style={{
              width: '20px',
              height: '20px',
              borderRadius: '50%',
              background: '#ffffff',
              position: 'absolute',
              top: '3px',
              left: settings.autoScroll ? '25px' : '3px',
              transition: 'left 200ms',
            }} />
          </button>
        </div>
      </div>
    </div>
  );
};
