import React, { useState } from 'react';
import { BookOpen, Mail, Lock, ArrowRight, ShieldCheck, Zap, Volume2, UserCheck } from 'lucide-react';
import { supabase } from '../../services/supabase';

interface LoginProps {
  onLoginSuccess: (user: any) => void;
  onEnterGuest: () => void;
}

export const Login: React.FC<LoginProps> = ({ onLoginSuccess, onEnterGuest }) => {
  const [email, setEmail] = useState('');
  const [password, setPassword] = useState('');
  const [isRegistering, setIsRegistering] = useState(false);
  const [fullName, setFullName] = useState('');
  const [loading, setLoading] = useState(false);
  const [errorMsg, setErrorMsg] = useState<string | null>(null);

  const handleSubmit = async (e: React.FormEvent) => {
    e.preventDefault();
    setLoading(true);
    setErrorMsg(null);

    try {
      if (isRegistering) {
        // Direct signup without mandatory email confirmation
        const { data, error } = await supabase.auth.signUp({
          email: email.trim(),
          password: password,
          options: {
            data: { full_name: fullName || email.split('@')[0] }
          }
        });

        if (error) throw error;

        if (data.user) {
          onLoginSuccess(data.user);
        } else {
          // If session is delayed, do immediate fallback login
          onEnterGuest();
        }
      } else {
        const { data, error } = await supabase.auth.signInWithPassword({
          email: email.trim(),
          password: password,
        });

        if (error) throw error;
        if (data.user) {
          onLoginSuccess(data.user);
        }
      }
    } catch (err: any) {
      console.error(err);
      setErrorMsg(err.message || 'Erro ao realizar login. Verifique seus dados.');
    } finally {
      setLoading(false);
    }
  };

  return (
    <div style={{
      minHeight: '100vh',
      background: '#050505',
      display: 'flex',
      flexDirection: 'column',
      alignItems: 'center',
      justifyContent: 'center',
      padding: '24px',
      position: 'relative',
      overflow: 'hidden',
    }}>
      {/* Background Emerald Ambient Glow */}
      <div style={{
        position: 'absolute',
        top: '-15%',
        left: '50%',
        transform: 'translateX(-50%)',
        width: '600px',
        height: '600px',
        background: 'radial-gradient(circle, rgba(16, 185, 129, 0.15) 0%, rgba(5, 5, 5, 0) 70%)',
        filter: 'blur(60px)',
        pointerEvents: 'none',
      }} />

      <div style={{
        position: 'absolute',
        bottom: '-10%',
        right: '-10%',
        width: '450px',
        height: '450px',
        background: 'radial-gradient(circle, rgba(5, 150, 105, 0.1) 0%, rgba(5, 5, 5, 0) 70%)',
        filter: 'blur(50px)',
        pointerEvents: 'none',
      }} />

      {/* Main Container */}
      <div 
        className="slide-up"
        style={{
          width: '100%',
          maxWidth: '460px',
          background: 'rgba(12, 16, 21, 0.9)',
          backdropFilter: 'blur(20px)',
          WebkitBackdropFilter: 'blur(20px)',
          borderRadius: '32px',
          border: '1px solid rgba(16, 185, 129, 0.2)',
          boxShadow: '0 25px 60px rgba(0, 0, 0, 0.8), 0 0 30px rgba(16, 185, 129, 0.12)',
          padding: '40px 32px',
          position: 'relative',
          zIndex: 10,
        }}
      >
        {/* Brand Header */}
        <div style={{ display: 'flex', flexDirection: 'column', alignItems: 'center', textAlign: 'center', marginBottom: '32px' }}>
          <div style={{
            width: '54px',
            height: '54px',
            borderRadius: '16px',
            background: 'linear-gradient(135deg, #10b981 0%, #059669 100%)',
            display: 'flex',
            alignItems: 'center',
            justifyContent: 'center',
            color: '#ffffff',
            boxShadow: '0 10px 25px rgba(16, 185, 129, 0.35)',
            marginBottom: '16px',
          }}>
            <BookOpen size={28} />
          </div>

          <h1 style={{
            fontSize: '26px',
            fontWeight: 900,
            color: '#f8fafc',
            letterSpacing: '-0.025em',
            textTransform: 'uppercase',
          }}>
            Ebook Readers <span style={{ color: '#10b981' }}>GTP</span>
          </h1>

          <p style={{ fontSize: '13px', color: '#94a3b8', marginTop: '6px' }}>
            Plataforma Inteligente de Leitura e Narração Neural de PDFs & E-books
          </p>
        </div>

        {/* Form */}
        <form onSubmit={handleSubmit} style={{ display: 'flex', flexDirection: 'column', gap: '16px' }}>
          {isRegistering && (
            <div style={{ display: 'flex', flexDirection: 'column', gap: '6px' }}>
              <label style={{ fontSize: '11px', fontWeight: 700, textTransform: 'uppercase', letterSpacing: '0.05em', color: '#94a3b8' }}>
                Nome Completo
              </label>
              <input
                type="text"
                value={fullName}
                onChange={(e) => setFullName(e.target.value)}
                placeholder="Seu nome"
                style={{
                  padding: '12px 16px',
                  borderRadius: '14px',
                  background: 'rgba(255, 255, 255, 0.04)',
                  border: '1px solid rgba(255, 255, 255, 0.08)',
                  color: '#ffffff',
                  fontSize: '14px',
                  outline: 'none',
                  transition: 'all 200ms',
                }}
                onFocus={(e) => e.target.style.borderColor = '#10b981'}
                onBlur={(e) => e.target.style.borderColor = 'rgba(255, 255, 255, 0.08)'}
              />
            </div>
          )}

          <div style={{ display: 'flex', flexDirection: 'column', gap: '6px' }}>
            <label style={{ fontSize: '11px', fontWeight: 700, textTransform: 'uppercase', letterSpacing: '0.05em', color: '#94a3b8' }}>
              E-mail
            </label>
            <div style={{
              display: 'flex',
              alignItems: 'center',
              gap: '10px',
              padding: '12px 16px',
              borderRadius: '14px',
              background: 'rgba(255, 255, 255, 0.04)',
              border: '1px solid rgba(255, 255, 255, 0.08)',
            }}>
              <Mail size={16} color="#64748b" />
              <input
                type="email"
                value={email}
                onChange={(e) => setEmail(e.target.value)}
                placeholder="seuemail@exemplo.com"
                required
                style={{
                  background: 'transparent',
                  color: '#ffffff',
                  width: '100%',
                  fontSize: '14px',
                  outline: 'none',
                }}
              />
            </div>
          </div>

          <div style={{ display: 'flex', flexDirection: 'column', gap: '6px' }}>
            <label style={{ fontSize: '11px', fontWeight: 700, textTransform: 'uppercase', letterSpacing: '0.05em', color: '#94a3b8' }}>
              Senha
            </label>
            <div style={{
              display: 'flex',
              alignItems: 'center',
              gap: '10px',
              padding: '12px 16px',
              borderRadius: '14px',
              background: 'rgba(255, 255, 255, 0.04)',
              border: '1px solid rgba(255, 255, 255, 0.08)',
            }}>
              <Lock size={16} color="#64748b" />
              <input
                type="password"
                value={password}
                onChange={(e) => setPassword(e.target.value)}
                placeholder="••••••••"
                required
                minLength={6}
                style={{
                  background: 'transparent',
                  color: '#ffffff',
                  width: '100%',
                  fontSize: '14px',
                  outline: 'none',
                }}
              />
            </div>
          </div>

          {errorMsg && (
            <div style={{
              padding: '12px',
              borderRadius: '12px',
              background: 'rgba(239, 68, 68, 0.1)',
              border: '1px solid rgba(239, 68, 68, 0.3)',
              color: '#ef4444',
              fontSize: '12px',
              textAlign: 'center',
            }}>
              {errorMsg}
            </div>
          )}

          {/* Submit Button */}
          <button
            type="submit"
            disabled={loading}
            style={{
              marginTop: '8px',
              padding: '14px',
              borderRadius: '14px',
              background: 'linear-gradient(135deg, #10b981 0%, #059669 100%)',
              color: '#ffffff',
              fontSize: '13px',
              fontWeight: 800,
              textTransform: 'uppercase',
              letterSpacing: '0.08em',
              boxShadow: '0 10px 25px rgba(16, 185, 129, 0.3)',
              display: 'flex',
              alignItems: 'center',
              justifyContent: 'center',
              gap: '8px',
            }}
          >
            {loading ? 'Processando...' : (isRegistering ? 'Criar Conta' : 'Entrar no Sistema')}
            <ArrowRight size={16} />
          </button>

          {/* Direct Guest Access Button (sem burocracia) */}
          <button
            type="button"
            onClick={onEnterGuest}
            style={{
              padding: '12px',
              borderRadius: '14px',
              background: 'rgba(255, 255, 255, 0.05)',
              border: '1px solid rgba(255, 255, 255, 0.1)',
              color: '#f8fafc',
              fontSize: '12px',
              fontWeight: 600,
              display: 'flex',
              alignItems: 'center',
              justifyContent: 'center',
              gap: '8px',
            }}
          >
            <UserCheck size={15} color="#10b981" />
            <span>Acessar Modo Demonstração Instantâneo</span>
          </button>
        </form>

        {/* Toggle Register / Sign In */}
        <div style={{ textAlign: 'center', marginTop: '20px' }}>
          <button
            type="button"
            onClick={() => {
              setIsRegistering(!isRegistering);
              setErrorMsg(null);
            }}
            style={{
              fontSize: '12px',
              color: '#10b981',
              fontWeight: 600,
            }}
          >
            {isRegistering
              ? 'Já possui uma conta? Clique para entrar'
              : 'Não tem conta ainda? Crie uma em 5 segundos'}
          </button>
        </div>

        {/* Bottom Feature Badges */}
        <div style={{
          display: 'grid',
          gridTemplateColumns: 'repeat(3, 1fr)',
          gap: '8px',
          marginTop: '28px',
          paddingTop: '20px',
          borderTop: '1px solid rgba(255, 255, 255, 0.06)',
          textAlign: 'center',
        }}>
          <div style={{ display: 'flex', flexDirection: 'column', alignItems: 'center', gap: '4px' }}>
            <Zap size={14} color="#10b981" />
            <span style={{ fontSize: '10px', color: '#94a3b8', fontWeight: 600 }}>Leitura Fluida</span>
          </div>
          <div style={{ display: 'flex', flexDirection: 'column', alignItems: 'center', gap: '4px' }}>
            <Volume2 size={14} color="#10b981" />
            <span style={{ fontSize: '10px', color: '#94a3b8', fontWeight: 600 }}>Vozes Neurais</span>
          </div>
          <div style={{ display: 'flex', flexDirection: 'column', alignItems: 'center', gap: '4px' }}>
            <ShieldCheck size={14} color="#10b981" />
            <span style={{ fontSize: '10px', color: '#94a3b8', fontWeight: 600 }}>Supabase Cloud</span>
          </div>
        </div>
      </div>
    </div>
  );
};
