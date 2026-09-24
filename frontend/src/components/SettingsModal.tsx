import React from 'react';
import { X, Moon, Sun, Book, Monitor, Type } from 'lucide-react';
import type { ReaderSettings, ThemeMode, FontFamily } from '../types';

interface SettingsModalProps {
  isOpen: boolean;
  onClose: () => void;
  settings: ReaderSettings;
  onUpdateSettings: (newSettings: Partial<ReaderSettings>) => void;
}

export const SettingsModal: React.FC<SettingsModalProps> = ({
  isOpen,
  onClose,
  settings,
  onUpdateSettings,
}) => {
  if (!isOpen) return null;

  const themes: { id: ThemeMode; label: string; icon: React.ReactNode; bg: string; color: string }[] = [
    { id: 'dark', label: 'Escuro', icon: <Moon size={16} />, bg: '#111726', color: '#f8fafc' },
    { id: 'sepia', label: 'Sépia', icon: <Book size={16} />, bg: '#fbf0d9', color: '#2c221a' },
    { id: 'light', label: 'Claro', icon: <Sun size={16} />, bg: '#ffffff', color: '#0f172a' },
    { id: 'oled', label: 'OLED', icon: <Monitor size={16} />, bg: '#000000', color: '#ffffff' },
  ];

  const fonts: { id: FontFamily; label: string; preview: string; style: string }[] = [
    { id: 'sans', label: 'Sans (Inter)', preview: 'Aa', style: 'var(--font-sans)' },
    { id: 'serif', label: 'Serif (Livro)', preview: 'Aa', style: 'var(--font-serif)' },
    { id: 'mono', label: 'Mono (Código)', preview: 'Aa', style: 'var(--font-mono)' },
  ];

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
          maxWidth: '520px',
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
          padding: '18px 24px',
          borderBottom: '1px solid var(--border-subtle)',
        }}>
          <div style={{ display: 'flex', alignItems: 'center', gap: '8px' }}>
            <Type size={18} color="var(--accent-primary)" />
            <h2 style={{ fontSize: '17px', fontWeight: 700, color: 'var(--text-primary)' }}>
              Aparência & Experiência de Leitura
            </h2>
          </div>

          <button
            onClick={onClose}
            style={{ padding: '6px', color: 'var(--text-muted)' }}
          >
            <X size={18} />
          </button>
        </div>

        {/* Content */}
        <div style={{ padding: '24px', display: 'flex', flexDirection: 'column', gap: '22px' }}>
          {/* Theme selector */}
          <div style={{ display: 'flex', flexDirection: 'column', gap: '8px' }}>
            <label style={{ fontSize: '13px', fontWeight: 600, color: 'var(--text-primary)' }}>
              Tema Visual
            </label>
            <div style={{ display: 'grid', gridTemplateColumns: 'repeat(4, 1fr)', gap: '10px' }}>
              {themes.map((t) => {
                const isSelected = settings.theme === t.id;
                return (
                  <button
                    key={t.id}
                    onClick={() => onUpdateSettings({ theme: t.id })}
                    style={{
                      display: 'flex',
                      flexDirection: 'column',
                      alignItems: 'center',
                      gap: '6px',
                      padding: '12px 8px',
                      borderRadius: 'var(--radius-md)',
                      background: t.bg,
                      color: t.color,
                      border: isSelected ? '2px solid var(--accent-primary)' : '1px solid rgba(128, 128, 128, 0.25)',
                      boxShadow: isSelected ? '0 0 12px var(--accent-glow)' : 'none',
                    }}
                  >
                    {t.icon}
                    <span style={{ fontSize: '12px', fontWeight: 600 }}>{t.label}</span>
                  </button>
                );
              })}
            </div>
          </div>

          {/* Typography font family */}
          <div style={{ display: 'flex', flexDirection: 'column', gap: '8px' }}>
            <label style={{ fontSize: '13px', fontWeight: 600, color: 'var(--text-primary)' }}>
              Tipografia
            </label>
            <div style={{ display: 'grid', gridTemplateColumns: 'repeat(3, 1fr)', gap: '10px' }}>
              {fonts.map((f) => {
                const isSelected = settings.fontFamily === f.id;
                return (
                  <button
                    key={f.id}
                    onClick={() => onUpdateSettings({ fontFamily: f.id })}
                    style={{
                      display: 'flex',
                      alignItems: 'center',
                      justifyContent: 'center',
                      gap: '8px',
                      padding: '10px',
                      borderRadius: 'var(--radius-md)',
                      background: isSelected ? 'var(--bg-surface-elevated)' : 'transparent',
                      border: isSelected ? '2px solid var(--accent-primary)' : '1px solid var(--border-subtle)',
                      color: 'var(--text-primary)',
                      fontFamily: f.style,
                    }}
                  >
                    <span style={{ fontSize: '18px', fontWeight: 700 }}>{f.preview}</span>
                    <span style={{ fontSize: '12px' }}>{f.label}</span>
                  </button>
                );
              })}
            </div>
          </div>

          {/* Font Size Slider */}
          <div style={{ display: 'flex', flexDirection: 'column', gap: '8px' }}>
            <div style={{ display: 'flex', justifyContent: 'space-between', fontSize: '13px' }}>
              <span style={{ fontWeight: 600, color: 'var(--text-primary)' }}>Tamanho da Fonte</span>
              <span style={{ color: 'var(--accent-primary)', fontWeight: 600 }}>{settings.fontSize}px</span>
            </div>
            <input
              type="range"
              min={14}
              max={26}
              value={settings.fontSize}
              onChange={(e) => onUpdateSettings({ fontSize: Number(e.target.value) })}
              style={{ accentColor: 'var(--accent-primary)', width: '100%' }}
            />
          </div>

          {/* Line Height Slider */}
          <div style={{ display: 'flex', flexDirection: 'column', gap: '8px' }}>
            <div style={{ display: 'flex', justifyContent: 'space-between', fontSize: '13px' }}>
              <span style={{ fontWeight: 600, color: 'var(--text-primary)' }}>Espaçamento entre Linhas</span>
              <span style={{ color: 'var(--accent-primary)', fontWeight: 600 }}>{settings.lineHeight}x</span>
            </div>
            <input
              type="range"
              min={1.4}
              max={2.4}
              step={0.1}
              value={settings.lineHeight}
              onChange={(e) => onUpdateSettings({ lineHeight: Number(e.target.value) })}
              style={{ accentColor: 'var(--accent-primary)', width: '100%' }}
            />
          </div>

          {/* Reading Column Width */}
          <div style={{ display: 'flex', flexDirection: 'column', gap: '8px' }}>
            <label style={{ fontSize: '13px', fontWeight: 600, color: 'var(--text-primary)' }}>
              Largura da Coluna de Texto
            </label>
            <div style={{ display: 'grid', gridTemplateColumns: 'repeat(4, 1fr)', gap: '8px' }}>
              {[
                { id: 'narrow', label: 'Estreita (580px)' },
                { id: 'medium', label: 'Média (720px)' },
                { id: 'wide', label: 'Ampla (880px)' },
                { id: 'full', label: 'Total (100%)' },
              ].map((w) => (
                <button
                  key={w.id}
                  onClick={() => onUpdateSettings({ readingWidth: w.id as any })}
                  style={{
                    padding: '8px 4px',
                    borderRadius: 'var(--radius-sm)',
                    fontSize: '11px',
                    fontWeight: 600,
                    background: settings.readingWidth === w.id ? 'var(--accent-primary)' : 'var(--bg-surface-elevated)',
                    color: settings.readingWidth === w.id ? '#fff' : 'var(--text-secondary)',
                    border: '1px solid var(--border-subtle)',
                  }}
                >
                  {w.label}
                </button>
              ))}
            </div>
          </div>

          {/* Auto Scroll toggle */}
          <div style={{
            display: 'flex',
            alignItems: 'center',
            justifyContent: 'space-between',
            paddingTop: '12px',
            borderTop: '1px solid var(--border-subtle)',
          }}>
            <div style={{ display: 'flex', flexDirection: 'column' }}>
              <span style={{ fontSize: '13px', fontWeight: 600, color: 'var(--text-primary)' }}>
                Rolagem Automática com Narração
              </span>
              <span style={{ fontSize: '11px', color: 'var(--text-muted)' }}>
                Mantém a frase que está sendo falada sempre no centro da tela.
              </span>
            </div>
            <button
              onClick={() => onUpdateSettings({ autoScroll: !settings.autoScroll })}
              style={{
                width: '44px',
                height: '24px',
                borderRadius: '12px',
                background: settings.autoScroll ? 'var(--accent-primary)' : 'var(--bg-surface-elevated)',
                border: '1px solid var(--border-subtle)',
                position: 'relative',
                transition: 'background var(--transition-fast)',
              }}
            >
              <div style={{
                width: '18px',
                height: '18px',
                borderRadius: '50%',
                background: '#ffffff',
                position: 'absolute',
                top: '2px',
                left: settings.autoScroll ? '22px' : '2px',
                transition: 'left var(--transition-fast)',
              }} />
            </button>
          </div>
        </div>
      </div>
    </div>
  );
};
