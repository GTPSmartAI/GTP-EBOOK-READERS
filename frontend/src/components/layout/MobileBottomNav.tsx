import React from 'react';
import { BookOpen, Home, Mic2, Plus, Sliders } from 'lucide-react';
import type { AppPage } from '../../types';

/** Altura do menu de baixo do celular, sem contar a área do gesto do Android (safe-area). */
export const MOBILE_NAV_HEIGHT = 62;
export const MOBILE_NAV_OFFSET = `calc(${MOBILE_NAV_HEIGHT}px + env(safe-area-inset-bottom, 0px))`;

interface MobileBottomNavProps {
  activePage: AppPage;
  onNavigate: (page: AppPage) => void;
  onOpenUpload: () => void;
}

/** Menu do celular: Início, Leitor, [+ subir livro], Vozes, Configurações. Só ícones. */
export const MobileBottomNav: React.FC<MobileBottomNavProps> = ({ activePage, onNavigate, onOpenUpload }) => {
  const tab = (id: AppPage, label: string, Icon: typeof Home) => {
    const active = activePage === id;
    return (
      <button
        key={id}
        onClick={() => onNavigate(id)}
        aria-label={label}
        aria-current={active ? 'page' : undefined}
        style={{
          flex: 1,
          height: '100%',
          display: 'flex',
          flexDirection: 'column',
          alignItems: 'center',
          justifyContent: 'center',
          gap: '5px',
          color: active ? '#10b981' : '#64748b',
          transition: 'color 150ms',
        }}
      >
        <Icon size={23} strokeWidth={active ? 2.4 : 2} />
        <span style={{
          width: '4px',
          height: '4px',
          borderRadius: '50%',
          background: active ? '#10b981' : 'transparent',
        }} />
      </button>
    );
  };

  return (
    <nav
      aria-label="Menu principal"
      style={{
        flexShrink: 0,
        height: MOBILE_NAV_OFFSET,
        paddingBottom: 'env(safe-area-inset-bottom, 0px)',
        background: 'rgba(12, 16, 21, 0.98)',
        borderTop: '1px solid var(--border-subtle)',
        display: 'flex',
        alignItems: 'stretch',
        position: 'relative',
        zIndex: 60,
      }}
    >
      {tab('painel', 'Início', Home)}
      {tab('leitor', 'Leitor', BookOpen)}
      <div style={{ flex: 1, display: 'flex', alignItems: 'center', justifyContent: 'center' }}>
        <button
          onClick={onOpenUpload}
          aria-label="Subir livro"
          style={{
            width: '50px',
            height: '50px',
            borderRadius: '50%',
            background: 'linear-gradient(135deg, #10b981 0%, #059669 100%)',
            color: '#ffffff',
            display: 'flex',
            alignItems: 'center',
            justifyContent: 'center',
            boxShadow: '0 6px 18px rgba(16, 185, 129, 0.45)',
          }}
        >
          <Plus size={28} strokeWidth={2.6} />
        </button>
      </div>
      {tab('vozes', 'Vozes', Mic2)}
      {tab('configuracoes', 'Configurações', Sliders)}
    </nav>
  );
};
