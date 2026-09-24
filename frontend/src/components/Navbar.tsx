import React from 'react';
import { 
  BookOpen, 
  Sparkles, 
  Sliders, 
  Upload, 
  MessageSquare, 
  Mic2,
  FileText,
  User,
  Crown,
  LogOut
} from 'lucide-react';
import type { Book } from '../types';
import type { UserProfile } from '../services/supabase';

interface NavbarProps {
  currentBook: Book;
  onOpenLibrary: () => void;
  onOpenVoicePicker: () => void;
  onOpenSettings: () => void;
  onOpenUpload: () => void;
  onOpenAIChat: () => void;
  onOpenChapters: () => void;
  viewMode: 'flow' | 'pdf';
  onToggleViewMode: (mode: 'flow' | 'pdf') => void;
  selectedVoiceName: string;
  user: any;
  userProfile: UserProfile | null;
  onOpenAuth: () => void;
  onOpenSubscription: () => void;
  onSignOut: () => void;
}

export const Navbar: React.FC<NavbarProps> = ({
  currentBook,
  onOpenLibrary,
  onOpenVoicePicker,
  onOpenSettings,
  onOpenUpload,
  onOpenAIChat,
  onOpenChapters,
  viewMode,
  onToggleViewMode,
  selectedVoiceName,
  user,
  userProfile,
  onOpenAuth,
  onOpenSubscription,
  onSignOut,
}) => {
  const isPro = userProfile?.subscription_tier === 'pro' || userProfile?.subscription_tier === 'unlimited';

  return (
    <header style={{
      position: 'sticky',
      top: 0,
      zIndex: 40,
      height: '64px',
      display: 'flex',
      alignItems: 'center',
      justifyContent: 'space-between',
      padding: '0 24px',
      background: 'var(--bg-surface-glass)',
      backdropFilter: 'blur(16px)',
      WebkitBackdropFilter: 'blur(16px)',
      borderBottom: '1px solid var(--border-subtle)',
    }}>
      {/* Brand & Library trigger */}
      <div style={{ display: 'flex', alignItems: 'center', gap: '16px' }}>
        <button 
          onClick={onOpenLibrary}
          style={{
            display: 'flex',
            alignItems: 'center',
            gap: '10px',
            padding: '6px 12px',
            borderRadius: 'var(--radius-md)',
            background: 'rgba(255, 255, 255, 0.04)',
            border: '1px solid var(--border-subtle)',
            color: 'var(--text-primary)',
          }}
          title="Abrir Biblioteca"
        >
          {/* Logo wave icon */}
          <div style={{
            width: '28px',
            height: '28px',
            borderRadius: '6px',
            background: 'linear-gradient(135deg, var(--accent-primary) 0%, #8b5cf6 100%)',
            display: 'flex',
            alignItems: 'center',
            justifyContent: 'center',
            color: '#fff',
          }}>
            <BookOpen size={16} />
          </div>
          <span style={{ fontWeight: 700, fontSize: '15px', letterSpacing: '-0.02em' }}>
            Eleven<span style={{ color: 'var(--accent-primary)' }}>Reader</span>
          </span>
          <span style={{
            fontSize: '11px',
            padding: '2px 6px',
            borderRadius: '4px',
            background: isPro ? 'rgba(245, 158, 11, 0.2)' : 'var(--accent-glow)',
            color: isPro ? '#f59e0b' : 'var(--accent-primary)',
            fontWeight: 700,
          }}>
            {isPro ? 'PRO' : 'FREE'}
          </span>
        </button>

        {/* Current Book Info */}
        <div 
          onClick={onOpenChapters}
          style={{
            display: 'flex',
            alignItems: 'center',
            gap: '8px',
            cursor: 'pointer',
            padding: '4px 10px',
            borderRadius: 'var(--radius-sm)',
            border: '1px solid transparent',
          }}
          title="Ver Capítulos / Índice"
        >
          <div style={{
            width: '6px',
            height: '6px',
            borderRadius: '50%',
            backgroundColor: 'var(--accent-primary)',
          }} />
          <div style={{ display: 'flex', flexDirection: 'column' }}>
            <span style={{
              fontSize: '13px',
              fontWeight: 600,
              color: 'var(--text-primary)',
              maxWidth: '200px',
              whiteSpace: 'nowrap',
              overflow: 'hidden',
              textOverflow: 'ellipsis',
            }}>
              {currentBook.title}
            </span>
            <span style={{ fontSize: '11px', color: 'var(--text-muted)' }}>
              {currentBook.author} • {currentBook.readingProgress}% lido
            </span>
          </div>
        </div>
      </div>

      {/* Middle: View Mode Selector */}
      <div style={{
        display: 'flex',
        alignItems: 'center',
        background: 'var(--bg-surface)',
        padding: '3px',
        borderRadius: 'var(--radius-md)',
        border: '1px solid var(--border-subtle)',
      }}>
        <button
          onClick={() => onToggleViewMode('flow')}
          style={{
            display: 'flex',
            alignItems: 'center',
            gap: '6px',
            padding: '5px 12px',
            borderRadius: 'var(--radius-sm)',
            fontSize: '12px',
            fontWeight: 500,
            background: viewMode === 'flow' ? 'var(--accent-primary)' : 'transparent',
            color: viewMode === 'flow' ? '#ffffff' : 'var(--text-secondary)',
          }}
        >
          <BookOpen size={14} />
          Leitura Fluida
        </button>
        <button
          onClick={() => onToggleViewMode('pdf')}
          style={{
            display: 'flex',
            alignItems: 'center',
            gap: '6px',
            padding: '5px 12px',
            borderRadius: 'var(--radius-sm)',
            fontSize: '12px',
            fontWeight: 500,
            background: viewMode === 'pdf' ? 'var(--accent-primary)' : 'transparent',
            color: viewMode === 'pdf' ? '#ffffff' : 'var(--text-secondary)',
          }}
        >
          <FileText size={14} />
          Documento Original
        </button>
      </div>

      {/* Right controls */}
      <div style={{ display: 'flex', alignItems: 'center', gap: '8px' }}>
        {/* Upgrade / Subscription button */}
        {!isPro ? (
          <button
            onClick={onOpenSubscription}
            style={{
              display: 'flex',
              alignItems: 'center',
              gap: '6px',
              padding: '6px 12px',
              borderRadius: 'var(--radius-full)',
              background: 'linear-gradient(135deg, rgba(245, 158, 11, 0.15) 0%, rgba(217, 119, 6, 0.25) 100%)',
              border: '1px solid rgba(245, 158, 11, 0.4)',
              color: '#f59e0b',
              fontSize: '12px',
              fontWeight: 700,
            }}
          >
            <Crown size={14} />
            <span>Assinar PRO</span>
          </button>
        ) : (
          <button
            onClick={onOpenSubscription}
            style={{
              display: 'flex',
              alignItems: 'center',
              gap: '6px',
              padding: '5px 10px',
              borderRadius: 'var(--radius-full)',
              background: 'rgba(16, 185, 129, 0.15)',
              border: '1px solid rgba(16, 185, 129, 0.3)',
              color: '#10b981',
              fontSize: '11px',
              fontWeight: 700,
            }}
          >
            <Crown size={13} />
            <span>PRO ATIVO</span>
          </button>
        )}

        {/* Voice Trigger Pill */}
        <button
          onClick={onOpenVoicePicker}
          style={{
            display: 'flex',
            alignItems: 'center',
            gap: '6px',
            padding: '6px 12px',
            borderRadius: 'var(--radius-full)',
            background: 'var(--bg-surface)',
            border: '1px solid var(--border-subtle)',
            color: 'var(--text-primary)',
            fontSize: '12px',
            fontWeight: 500,
          }}
          title="Escolher Voz da Narração"
        >
          <Mic2 size={14} color="var(--accent-primary)" />
          <span>Voz: <strong>{selectedVoiceName}</strong></span>
          <Sparkles size={12} color="#f59e0b" />
        </button>

        {/* AI Chat button */}
        <button
          onClick={onOpenAIChat}
          style={{
            display: 'flex',
            alignItems: 'center',
            gap: '6px',
            padding: '6px 12px',
            borderRadius: 'var(--radius-md)',
            background: 'var(--bg-surface)',
            border: '1px solid var(--border-subtle)',
            color: 'var(--text-secondary)',
            fontSize: '12px',
          }}
          title="Pergunte ao Livro (IA)"
        >
          <MessageSquare size={14} />
          <span>Pergunte ao Livro</span>
        </button>

        {/* Appearance Settings */}
        <button
          onClick={onOpenSettings}
          style={{
            display: 'flex',
            alignItems: 'center',
            justifyContent: 'center',
            width: '36px',
            height: '36px',
            borderRadius: 'var(--radius-md)',
            background: 'var(--bg-surface)',
            border: '1px solid var(--border-subtle)',
            color: 'var(--text-secondary)',
          }}
          title="Configurações de Leitura e Aparência"
        >
          <Sliders size={15} />
        </button>

        {/* Upload Button */}
        <button
          onClick={onOpenUpload}
          style={{
            display: 'flex',
            alignItems: 'center',
            gap: '6px',
            padding: '6px 14px',
            borderRadius: 'var(--radius-md)',
            background: 'linear-gradient(135deg, var(--accent-primary) 0%, #4338ca 100%)',
            border: '1px solid rgba(255, 255, 255, 0.1)',
            color: '#ffffff',
            fontSize: '12px',
            fontWeight: 600,
            boxShadow: 'var(--shadow-sm)',
          }}
        >
          <Upload size={14} />
          <span>Enviar PDF</span>
        </button>

        {/* User Auth Chip */}
        {user ? (
          <div style={{ display: 'flex', alignItems: 'center', gap: '6px' }}>
            <div style={{
              display: 'flex',
              alignItems: 'center',
              gap: '6px',
              padding: '4px 10px',
              borderRadius: 'var(--radius-full)',
              background: 'var(--bg-surface-elevated)',
              border: '1px solid var(--border-subtle)',
              fontSize: '12px',
              color: 'var(--text-primary)',
            }}>
              <div style={{
                width: '20px',
                height: '20px',
                borderRadius: '50%',
                background: 'var(--accent-primary)',
                display: 'flex',
                alignItems: 'center',
                justifyContent: 'center',
                fontSize: '10px',
                color: '#fff',
                fontWeight: 700,
              }}>
                {(user.email || 'U')[0].toUpperCase()}
              </div>
              <span style={{ maxWidth: '100px', overflow: 'hidden', textOverflow: 'ellipsis', whiteSpace: 'nowrap' }}>
                {user.user_metadata?.full_name || user.email?.split('@')[0]}
              </span>
            </div>

            <button
              onClick={onSignOut}
              style={{
                padding: '6px',
                color: 'var(--text-muted)',
                borderRadius: 'var(--radius-sm)',
              }}
              title="Sair da Conta"
            >
              <LogOut size={15} />
            </button>
          </div>
        ) : (
          <button
            onClick={onOpenAuth}
            style={{
              display: 'flex',
              alignItems: 'center',
              gap: '6px',
              padding: '6px 14px',
              borderRadius: 'var(--radius-md)',
              background: 'var(--bg-surface)',
              border: '1px solid var(--border-subtle)',
              color: 'var(--text-primary)',
              fontSize: '12px',
              fontWeight: 600,
            }}
          >
            <User size={14} />
            <span>Entrar</span>
          </button>
        )}
      </div>
    </header>
  );
};
