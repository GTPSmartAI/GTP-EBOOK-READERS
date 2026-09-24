import React, { useState } from 'react';
import { X, Check, Zap, Sparkles, Crown, ShieldCheck, Loader2 } from 'lucide-react';
import type { UserProfile } from '../services/supabase';

interface SubscriptionModalProps {
  isOpen: boolean;
  onClose: () => void;
  userProfile: UserProfile | null;
  onPlanUpgraded: () => void;
  onOpenAuth: () => void;
}

export const SubscriptionModal: React.FC<SubscriptionModalProps> = ({
  isOpen,
  onClose,
  userProfile,
  onPlanUpgraded,
  onOpenAuth,
}) => {
  const [billingCycle, setBillingCycle] = useState<'monthly' | 'annual'>('monthly');
  const [simulating, setSimulating] = useState(false);
  const [successNotice, setSuccessNotice] = useState<string | null>(null);

  if (!isOpen) return null;

  const isPro = userProfile?.subscription_tier === 'pro' || userProfile?.subscription_tier === 'unlimited';

  const handleSimulatePayment = async () => {
    if (!userProfile) {
      onClose();
      onOpenAuth();
      return;
    }

    setSimulating(true);
    setSuccessNotice(null);

    try {
      // Calls backend webhook endpoint to simulate gateway payment approval
      const response = await fetch('http://localhost:4000/api/webhooks/payment', {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({
          email: userProfile.email,
          plan: billingCycle === 'monthly' ? 'pro_monthly' : 'pro_annual',
          amount: billingCycle === 'monthly' ? 29.90 : 287.00,
          status: 'paid',
          gateway: 'simulated_checkout',
          transaction_id: `tx_${Date.now()}`
        })
      });

      const res = await response.json();
      if (res.success) {
        setSuccessNotice('🎉 Pagamento aprovado! Seu plano PRO foi ativado no Supabase.');
        onPlanUpgraded();
      }
    } catch (e) {
      console.error(e);
      setSuccessNotice('Erro ao conectar ao webhook do backend. Verifique se o servidor está rodando na porta 4000.');
    } finally {
      setSimulating(false);
    }
  };

  return (
    <div style={{
      position: 'fixed',
      inset: 0,
      zIndex: 115,
      display: 'flex',
      alignItems: 'center',
      justifyContent: 'center',
      backgroundColor: 'rgba(0, 0, 0, 0.7)',
      backdropFilter: 'blur(8px)',
      padding: '20px',
    }}>
      <div 
        className="slide-up"
        style={{
          width: '100%',
          maxWidth: '750px',
          maxHeight: '90vh',
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
          padding: '20px 24px',
          borderBottom: '1px solid var(--border-subtle)',
          background: 'linear-gradient(135deg, rgba(99, 102, 241, 0.1) 0%, rgba(139, 92, 246, 0.1) 100%)',
        }}>
          <div style={{ display: 'flex', alignItems: 'center', gap: '10px' }}>
            <div style={{
              width: '36px',
              height: '36px',
              borderRadius: '50%',
              background: 'linear-gradient(135deg, #f59e0b 0%, #d97706 100%)',
              display: 'flex',
              alignItems: 'center',
              justifyContent: 'center',
              color: '#fff',
            }}>
              <Crown size={20} />
            </div>
            <div>
              <h2 style={{ fontSize: '18px', fontWeight: 800, color: 'var(--text-primary)' }}>
                Planos & Assinatura ElevenReader
              </h2>
              <p style={{ fontSize: '12px', color: 'var(--text-secondary)' }}>
                Desbloqueie narração ilimitada com inteligência artificial neural e todas as vozes.
              </p>
            </div>
          </div>

          <button onClick={onClose} style={{ color: 'var(--text-muted)' }}>
            <X size={18} />
          </button>
        </div>

        {/* Billing Cycle Toggle */}
        <div style={{
          display: 'flex',
          justifyContent: 'center',
          padding: '16px',
          background: 'rgba(255, 255, 255, 0.02)',
          borderBottom: '1px solid var(--border-subtle)',
        }}>
          <div style={{
            display: 'flex',
            alignItems: 'center',
            background: 'var(--bg-surface-elevated)',
            padding: '3px',
            borderRadius: 'var(--radius-full)',
            border: '1px solid var(--border-subtle)',
          }}>
            <button
              onClick={() => setBillingCycle('monthly')}
              style={{
                padding: '6px 16px',
                borderRadius: 'var(--radius-full)',
                fontSize: '12px',
                fontWeight: 600,
                background: billingCycle === 'monthly' ? 'var(--accent-primary)' : 'transparent',
                color: billingCycle === 'monthly' ? '#fff' : 'var(--text-secondary)',
              }}
            >
              Mensal
            </button>
            <button
              onClick={() => setBillingCycle('annual')}
              style={{
                padding: '6px 16px',
                borderRadius: 'var(--radius-full)',
                fontSize: '12px',
                fontWeight: 600,
                background: billingCycle === 'annual' ? 'var(--accent-primary)' : 'transparent',
                color: billingCycle === 'annual' ? '#fff' : 'var(--text-secondary)',
                display: 'flex',
                alignItems: 'center',
                gap: '6px',
              }}
            >
              <span>Anual</span>
              <span style={{
                fontSize: '10px',
                padding: '1px 6px',
                borderRadius: '4px',
                background: '#10b981',
                color: '#fff',
                fontWeight: 700,
              }}>
                -20% OFF
              </span>
            </button>
          </div>
        </div>

        {/* Pricing Cards */}
        <div style={{
          flex: 1,
          overflowY: 'auto',
          padding: '24px',
          display: 'grid',
          gridTemplateColumns: 'repeat(auto-fit, minmax(280px, 1fr))',
          gap: '20px',
        }}>
          {/* Free Tier */}
          <div style={{
            padding: '20px',
            borderRadius: 'var(--radius-md)',
            background: 'var(--bg-surface-elevated)',
            border: '1px solid var(--border-subtle)',
            display: 'flex',
            flexDirection: 'column',
            justifyContent: 'space-between',
          }}>
            <div>
              <span style={{ fontSize: '12px', fontWeight: 700, color: 'var(--text-muted)', textTransform: 'uppercase' }}>
                Plano Básico
              </span>
              <h3 style={{ fontSize: '24px', fontWeight: 800, color: 'var(--text-primary)', marginTop: '4px' }}>
                R$ 0 <span style={{ fontSize: '13px', fontWeight: 400, color: 'var(--text-muted)' }}>/mês</span>
              </h3>
              <p style={{ fontSize: '12px', color: 'var(--text-secondary)', marginTop: '8px' }}>
                Ideal para experimentar a leitura inteligente de livros clássicos.
              </p>

              <div style={{ display: 'flex', flexDirection: 'column', gap: '8px', marginTop: '18px' }}>
                {[
                  'Até 3 livros importados',
                  'Vozes padrão do navegador',
                  'Destaque de frases sincronizado',
                  'Modos de leitura e temas visuais',
                ].map((item, idx) => (
                  <div key={idx} style={{ display: 'flex', alignItems: 'center', gap: '8px', fontSize: '12px', color: 'var(--text-secondary)' }}>
                    <Check size={14} color="#10b981" />
                    <span>{item}</span>
                  </div>
                ))}
              </div>
            </div>

            <button
              disabled
              style={{
                marginTop: '24px',
                padding: '10px',
                borderRadius: 'var(--radius-sm)',
                background: 'rgba(255, 255, 255, 0.05)',
                color: 'var(--text-muted)',
                fontSize: '12px',
                fontWeight: 600,
                textAlign: 'center',
              }}
            >
              {isPro ? 'Plano Anterior' : 'Plano Atual'}
            </button>
          </div>

          {/* Pro Tier (Hero Card) */}
          <div style={{
            padding: '20px',
            borderRadius: 'var(--radius-md)',
            background: 'linear-gradient(180deg, var(--bg-surface-elevated) 0%, rgba(99, 102, 241, 0.08) 100%)',
            border: '2px solid var(--accent-primary)',
            boxShadow: '0 0 20px var(--accent-glow)',
            display: 'flex',
            flexDirection: 'column',
            justifyContent: 'space-between',
            position: 'relative',
          }}>
            <div style={{
              position: 'absolute',
              top: '-10px',
              right: '20px',
              background: 'linear-gradient(135deg, var(--accent-primary) 0%, #7c3aed 100%)',
              color: '#fff',
              fontSize: '10px',
              fontWeight: 700,
              padding: '2px 8px',
              borderRadius: 'var(--radius-full)',
              boxShadow: 'var(--shadow-sm)',
            }}>
              MAIS POPULAR
            </div>

            <div>
              <span style={{ fontSize: '12px', fontWeight: 700, color: 'var(--accent-primary)', textTransform: 'uppercase' }}>
                ElevenReader PRO
              </span>
              <h3 style={{ fontSize: '26px', fontWeight: 800, color: 'var(--text-primary)', marginTop: '4px' }}>
                {billingCycle === 'monthly' ? 'R$ 29,90' : 'R$ 23,90'}
                <span style={{ fontSize: '13px', fontWeight: 400, color: 'var(--text-muted)' }}>/mês</span>
              </h3>
              <p style={{ fontSize: '12px', color: 'var(--text-secondary)', marginTop: '8px' }}>
                Acesso completo a todas as tecnologias de áudio neural e leitura ilimitada.
              </p>

              <div style={{ display: 'flex', flexDirection: 'column', gap: '8px', marginTop: '18px' }}>
                {[
                  'PDFs e E-books ilimitados',
                  'Todas as vozes neurais ElevenLabs',
                  'Conversa com o Livro (IA ilimitada)',
                  'Sincronização em nuvem via Supabase',
                  'Ajuste avançado de estabilidade & clareza',
                ].map((item, idx) => (
                  <div key={idx} style={{ display: 'flex', alignItems: 'center', gap: '8px', fontSize: '12px', color: 'var(--text-primary)', fontWeight: 500 }}>
                    <Zap size={14} color="var(--accent-primary)" />
                    <span>{item}</span>
                  </div>
                ))}
              </div>
            </div>

            <div style={{ marginTop: '24px', display: 'flex', flexDirection: 'column', gap: '8px' }}>
              {isPro ? (
                <div style={{
                  display: 'flex',
                  alignItems: 'center',
                  justifyContent: 'center',
                  gap: '6px',
                  padding: '10px',
                  borderRadius: 'var(--radius-sm)',
                  background: 'rgba(16, 185, 129, 0.15)',
                  color: '#10b981',
                  fontWeight: 700,
                  fontSize: '13px',
                }}>
                  <ShieldCheck size={16} />
                  <span>VOCÊ É ASSINANTE PRO</span>
                </div>
              ) : (
                <button
                  onClick={handleSimulatePayment}
                  disabled={simulating}
                  style={{
                    display: 'flex',
                    alignItems: 'center',
                    justifyContent: 'center',
                    gap: '8px',
                    padding: '11px',
                    borderRadius: 'var(--radius-sm)',
                    background: 'linear-gradient(135deg, var(--accent-primary) 0%, #7c3aed 100%)',
                    color: '#ffffff',
                    fontSize: '13px',
                    fontWeight: 700,
                    boxShadow: 'var(--shadow-md)',
                  }}
                >
                  {simulating ? <Loader2 size={16} className="animate-spin" /> : <Sparkles size={16} />}
                  <span>{userProfile ? 'Assinar com 1 Clique (Simulação Webhook)' : 'Entrar para Assinar'}</span>
                </button>
              )}

              {successNotice && (
                <span style={{ fontSize: '11px', color: '#10b981', textAlign: 'center', fontWeight: 600 }}>
                  {successNotice}
                </span>
              )}
            </div>
          </div>
        </div>
      </div>
    </div>
  );
};
