import React from 'react';
import { 
  BookOpen, 
  Home, 
  Mic2, 
  Sliders, 
  Upload, 
  Crown, 
  User, 
  LogOut
} from 'lucide-react';
import type { AppPage } from '../../types';
import type { UserProfile } from '../../services/supabase';

interface AppHeaderProps {
  activePage: AppPage;
  onNavigate: (page: AppPage) => void;
  user: any;
  userProfile: UserProfile | null;
  onOpenUpload: () => void;
  onOpenSubscription: () => void;
  onOpenAuth: () => void;
  onSignOut: () => void;
}

export const AppHeader: React.FC<AppHeaderProps> = ({
  activePage,
  onNavigate,
  user,
  userProfile,
  onOpenUpload,
  onOpenSubscription,
  onOpenAuth,
  onSignOut,
}) => {
  const isPro = userProfile?.subscription_tier === 'pro' || userProfile?.subscription_tier === 'unlimited';

  const navTabs: { id: AppPage; label: string; icon: React.ReactNode }[] = [
    { id: 'painel', label: 'Início', icon: <Home size={15} /> },
    { id: 'leitor', label: 'Leitor', icon: <BookOpen size={15} /> },
    { id: 'vozes', label: 'Vozes', icon: <Mic2 size={15} /> },
    { id: 'configuracoes', label: 'Configurações', icon: <Sliders size={15} /> },
  ];

  return (
    <header style={{
      position: 'sticky',
      top: 0,
      zIndex: 50,
      height: '68px',
      background: 'rgba(12, 16, 21, 0.92)',
      backdropFilter: 'blur(20px)',
      WebkitBackdropFilter: 'blur(20px)',
      borderBottom: '1px solid var(--border-subtle)',
      display: 'flex',
      alignItems: 'center',
      justifyContent: 'space-between',
      padding: '0 24px',
    }}>
      {/* Brand Logo */}
      <div 
        onClick={() => onNavigate('painel')}
        style={{
          display: 'flex',
          alignItems: 'center',
          gap: '10px',
          cursor: 'pointer',
        }}
      >
        <div style={{
          width: '36px',
          height: '36px',
          borderRadius: '12px',
          background: 'linear-gradient(135deg, #10b981 0%, #059669 100%)',
          display: 'flex',
          alignItems: 'center',
          justifyContent: 'center',
          color: '#ffffff',
          boxShadow: '0 8px 18px rgba(16, 185, 129, 0.35)',
        }}>
          <BookOpen size={20} />
        </div>
        <div>
          <span style={{
            fontSize: '15px',
            fontWeight: 900,
            color: '#f8fafc',
            letterSpacing: '-0.025em',
            textTransform: 'uppercase',
          }}>
            Ebook Readers <span style={{ color: '#10b981' }}>GTP</span>
          </span>
          <span style={{
            display: 'block',
            fontSize: '9px',
            fontWeight: 800,
            color: '#10b981',
            letterSpacing: '0.1em',
            textTransform: 'uppercase',
          }}>
            Leitor Inteligente
          </span>
        </div>
      </div>

      {/* Center Navigation Tabs (Estilo GTP-TESTE-SISTEMA) */}
      <nav style={{
        display: 'flex',
        alignItems: 'center',
        background: 'var(--bg-surface)',
        padding: '4px',
        borderRadius: '16px',
        border: '1px solid var(--border-subtle)',
      }}>
        {navTabs.map((tab) => {
          const isActive = activePage === tab.id;
          return (
            <button
              key={tab.id}
              onClick={() => onNavigate(tab.id)}
              style={{
                display: 'flex',
                alignItems: 'center',
                gap: '8px',
                padding: '7px 16px',
                borderRadius: '12px',
                fontSize: '13px',
                fontWeight: 700,
                background: isActive ? 'linear-gradient(135deg, #10b981 0%, #059669 100%)' : 'transparent',
                color: isActive ? '#ffffff' : '#94a3b8',
                boxShadow: isActive ? '0 4px 12px rgba(16, 185, 129, 0.3)' : 'none',
                transition: 'all 200ms',
              }}
            >
              {tab.icon}
              <span>{tab.label}</span>
            </button>
          );
        })}
      </nav>

      {/* Right Controls */}
      <div style={{ display: 'flex', alignItems: 'center', gap: '10px' }}>
        {/* Upload Button */}
        <button
          onClick={onOpenUpload}
          style={{
            display: 'flex',
            alignItems: 'center',
            gap: '6px',
            padding: '7px 14px',
            borderRadius: '12px',
            background: 'rgba(16, 185, 129, 0.12)',
            border: '1px solid rgba(16, 185, 129, 0.3)',
            color: '#10b981',
            fontSize: '12px',
            fontWeight: 700,
          }}
        >
          <Upload size={14} />
          <span>Subir PDF</span>
        </button>

        {/* Subscription Plan Badge */}
        {!isPro ? (
          <button
            onClick={onOpenSubscription}
            style={{
              display: 'flex',
              alignItems: 'center',
              gap: '6px',
              padding: '7px 14px',
              borderRadius: '12px',
              background: 'linear-gradient(135deg, rgba(245, 158, 11, 0.15) 0%, rgba(217, 119, 6, 0.25) 100%)',
              border: '1px solid rgba(245, 158, 11, 0.4)',
              color: '#f59e0b',
              fontSize: '12px',
              fontWeight: 800,
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
              padding: '6px 12px',
              borderRadius: '12px',
              background: 'rgba(16, 185, 129, 0.15)',
              border: '1px solid rgba(16, 185, 129, 0.3)',
              color: '#10b981',
              fontSize: '11px',
              fontWeight: 800,
            }}
          >
            <Crown size={13} />
            <span>PRO ATIVO</span>
          </button>
        )}

        {/* User Status / Login */}
        {user ? (
          <div style={{ display: 'flex', alignItems: 'center', gap: '6px' }}>
            <div 
              onClick={() => onNavigate('configuracoes')}
              style={{
                display: 'flex',
                alignItems: 'center',
                gap: '8px',
                padding: '5px 12px',
                borderRadius: '12px',
                background: 'var(--bg-surface)',
                border: '1px solid var(--border-subtle)',
                cursor: 'pointer',
              }}
              title="Acessar Configurações da Conta"
            >
              <div style={{
                width: '24px',
                height: '24px',
                borderRadius: '50%',
                background: '#10b981',
                display: 'flex',
                alignItems: 'center',
                justifyContent: 'center',
                fontSize: '11px',
                color: '#fff',
                fontWeight: 800,
              }}>
                {(user.email || 'U')[0].toUpperCase()}
              </div>
              <span style={{ fontSize: '12px', color: '#f8fafc', fontWeight: 600, maxWidth: '90px', overflow: 'hidden', textOverflow: 'ellipsis', whiteSpace: 'nowrap' }}>
                {user.user_metadata?.full_name || user.email?.split('@')[0]}
              </span>
            </div>

            <button
              onClick={onSignOut}
              style={{ padding: '8px', color: '#94a3b8' }}
              title="Sair da Conta"
            >
              <LogOut size={16} />
            </button>
          </div>
        ) : (
          <button
            onClick={onOpenAuth}
            style={{
              display: 'flex',
              alignItems: 'center',
              gap: '6px',
              padding: '7px 14px',
              borderRadius: '12px',
              background: '#10b981',
              color: '#ffffff',
              fontSize: '12px',
              fontWeight: 700,
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
