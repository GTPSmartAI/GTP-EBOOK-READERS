import React, { useEffect, useMemo, useRef, useState } from 'react';
import { Mail, Lock, ArrowRight, Eye, EyeOff, User, AtSign, Check, ShieldCheck, Loader2 } from 'lucide-react';
import { AedoliaMark } from '../../components/brand/AedoliaMark';
import { login, loginWithGoogle, register } from '../../services/session';
import { getGoogleClientId, isNativeApp, nativeGoogleIdToken, renderGoogleButton } from '../../services/googleAuth';

const GoogleLogo = () => (
  <svg width="18" height="18" viewBox="0 0 48 48" aria-hidden="true">
    <path fill="#FFC107" d="M43.6 20.5H42V20H24v8h11.3C33.7 32.7 29.2 36 24 36c-6.6 0-12-5.4-12-12s5.4-12 12-12c3.1 0 5.8 1.2 7.9 3.1l5.7-5.7C34 6.1 29.3 4 24 4 12.9 4 4 12.9 4 24s8.9 20 20 20 20-8.9 20-20c0-1.3-.1-2.4-.4-3.5z" />
    <path fill="#FF3D00" d="M6.3 14.7l6.6 4.8C14.7 15.1 19 12 24 12c3.1 0 5.8 1.2 7.9 3.1l5.7-5.7C34 6.1 29.3 4 24 4 16.3 4 9.7 8.3 6.3 14.7z" />
    <path fill="#4CAF50" d="M24 44c5.2 0 9.9-2 13.4-5.2l-6.2-5.2C29.2 35.1 26.7 36 24 36c-5.2 0-9.6-3.3-11.3-8l-6.5 5C9.5 39.6 16.2 44 24 44z" />
    <path fill="#1976D2" d="M43.6 20.5H42V20H24v8h11.3c-.8 2.2-2.2 4.2-4.1 5.6l6.2 5.2C37 39.2 44 34 44 24c0-1.3-.1-2.4-.4-3.5z" />
  </svg>
);

/** Botão "Continuar com o Google". Some sozinho enquanto o login com Google não estiver configurado no servidor. */
const GoogleSignIn: React.FC<{ onError: (msg: string | null) => void }> = ({ onError }) => {
  const [clientId, setClientId] = useState<string | null>(null);
  const [busy, setBusy] = useState(false);
  const boxRef = useRef<HTMLDivElement>(null);
  const native = isNativeApp();

  useEffect(() => {
    getGoogleClientId().then(setClientId);
  }, []);

  const finish = async (idToken: string) => {
    setBusy(true);
    onError(null);
    try {
      await loginWithGoogle(idToken); // a sessão nova troca a tela sozinha
    } catch (err: any) {
      onError(err?.message || 'Não foi possível entrar com o Google.');
      setBusy(false);
    }
  };

  useEffect(() => {
    if (!clientId || native || !boxRef.current) return;
    renderGoogleButton(boxRef.current, clientId, finish).catch((e) => onError(e.message));
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [clientId, native]);

  if (!clientId) return null;

  const nativeClick = async () => {
    onError(null);
    try {
      const token = await nativeGoogleIdToken(clientId);
      await finish(token);
    } catch (err: any) {
      const msg = String(err?.message || '');
      if (!/cancel/i.test(msg)) onError('Não foi possível entrar com o Google. Tente de novo.');
    }
  };

  return (
    <div style={{ marginBottom: '18px' }}>
      {native ? (
        <button
          type="button"
          onClick={nativeClick}
          disabled={busy}
          style={{
            width: '100%',
            height: '50px',
            borderRadius: '999px',
            background: '#131314',
            border: '1px solid #8e918f',
            color: '#e3e3e3',
            fontSize: '15px',
            fontWeight: 600,
            display: 'flex',
            alignItems: 'center',
            justifyContent: 'center',
            gap: '10px',
            opacity: busy ? 0.7 : 1,
          }}
        >
          {busy ? <Loader2 size={18} className="animate-spin" /> : <GoogleLogo />}
          Continuar com o Google
        </button>
      ) : (
        <div style={{ position: 'relative', minHeight: '44px' }}>
          <div ref={boxRef} style={{ display: 'flex', justifyContent: 'center', opacity: busy ? 0.5 : 1 }} />
          {busy && <Loader2 size={18} className="animate-spin" style={{ position: 'absolute', right: 12, top: 13, color: '#94a3b8' }} />}
        </div>
      )}
      <div style={{ display: 'flex', alignItems: 'center', gap: '12px', marginTop: '18px', color: '#64748b', fontSize: '12px' }}>
        <span style={{ flex: 1, height: 1, background: 'rgba(255,255,255,0.08)' }} />
        ou use seu e-mail
        <span style={{ flex: 1, height: 1, background: 'rgba(255,255,255,0.08)' }} />
      </div>
    </div>
  );
};

/** 'Alexandre Guterres' -> 'alexandre.guterres' (sugestão de nome de usuário) */
function suggestUsername(name: string): string {
  return name
    .normalize('NFKD')
    .replace(/[̀-ͯ]/g, '')
    .toLowerCase()
    .trim()
    .replace(/\s+/g, '.')
    .replace(/[^a-z0-9._-]/g, '')
    .replace(/^[._-]+/, '')
    .slice(0, 30);
}

const USERNAME_RE = /^[a-z0-9][a-z0-9._-]{2,29}$/;

// Erros de digitação comuns no domínio do e-mail ("gmal.com" -> "gmail.com")
const DOMAIN_TYPOS: Record<string, string> = {
  'gmal.com': 'gmail.com', 'gmial.com': 'gmail.com', 'gmai.com': 'gmail.com', 'gamil.com': 'gmail.com',
  'gnail.com': 'gmail.com', 'gmail.co': 'gmail.com', 'gmail.con': 'gmail.com', 'gmail.cm': 'gmail.com',
  'gmail.com.br': 'gmail.com', 'gmaill.com': 'gmail.com', 'gimail.com': 'gmail.com',
  'hotmal.com': 'hotmail.com', 'hotmial.com': 'hotmail.com', 'hotmail.con': 'hotmail.com', 'hotmai.com': 'hotmail.com',
  'outlok.com': 'outlook.com', 'outloo.com': 'outlook.com', 'outlook.con': 'outlook.com',
  'yahoo.con': 'yahoo.com', 'yaho.com': 'yahoo.com', 'yahoo.com.b': 'yahoo.com.br',
};

function emailSuggestion(email: string): string | null {
  const m = email.trim().toLowerCase().match(/^([^@\s]+)@([^@\s]+)$/);
  const fixed = m && DOMAIN_TYPOS[m[2]];
  return fixed ? `${m![1]}@${fixed}` : null;
}

const fieldBox: React.CSSProperties = {
  display: 'flex',
  alignItems: 'center',
  gap: '10px',
  padding: '0 14px',
  height: '50px',
  borderRadius: '14px',
  background: 'rgba(255, 255, 255, 0.04)',
  border: '1px solid rgba(255, 255, 255, 0.1)',
};

const inputStyle: React.CSSProperties = {
  background: 'transparent',
  color: '#ffffff',
  width: '100%',
  height: '100%',
  fontSize: '15px',
  outline: 'none',
  minWidth: 0,
};

const labelStyle: React.CSSProperties = {
  fontSize: '11px',
  fontWeight: 700,
  textTransform: 'uppercase',
  letterSpacing: '0.06em',
  color: '#94a3b8',
};

const Field: React.FC<{
  id: string;
  label: string;
  icon: React.ReactNode;
  hint?: React.ReactNode;
  children: React.ReactNode;
}> = ({ id, label, icon, hint, children }) => (
  <div style={{ display: 'flex', flexDirection: 'column', gap: '6px' }}>
    <label htmlFor={id} style={labelStyle}>{label}</label>
    <div className="login-field" style={fieldBox}>
      {icon}
      {children}
    </div>
    {hint}
  </div>
);

export const Login: React.FC = () => {
  const [mode, setMode] = useState<'login' | 'register'>('login');
  const [email, setEmail] = useState('');
  const [password, setPassword] = useState('');
  const [confirm, setConfirm] = useState('');
  const [fullName, setFullName] = useState('');
  const [username, setUsername] = useState('');
  const [usernameEdited, setUsernameEdited] = useState(false);
  const [showPassword, setShowPassword] = useState(false);
  const [loading, setLoading] = useState(false);
  const [errorMsg, setErrorMsg] = useState<string | null>(null);

  const isRegister = mode === 'register';

  const rules = useMemo(
    () => [
      { ok: password.length >= 8, text: '8 caracteres ou mais' },
      { ok: /[a-z]/.test(password) && /[A-Z]/.test(password), text: 'letras maiúsculas e minúsculas' },
      { ok: /\d/.test(password), text: 'pelo menos um número' },
    ],
    [password]
  );

  const switchMode = (next: 'login' | 'register') => {
    setMode(next);
    setErrorMsg(null);
    setConfirm('');
  };

  const handleSubmit = async (e: React.FormEvent) => {
    e.preventDefault();
    setErrorMsg(null);
    if (isRegister) {
      if (!USERNAME_RE.test(username)) {
        setErrorMsg('O nome de usuário precisa ter de 3 a 30 caracteres: letras minúsculas, números, ponto, hífen ou _.');
        return;
      }
      if (rules.some((r) => !r.ok)) {
        setErrorMsg('A senha ainda não atende a todas as regras.');
        return;
      }
      if (password !== confirm) {
        setErrorMsg('As senhas não conferem.');
        return;
      }
    }
    setLoading(true);
    try {
      if (isRegister) await register({ email, password, fullName, username });
      else await login(email, password);
      // A sessão nova troca a tela sozinha (App escuta onSessionChange)
    } catch (err: any) {
      setErrorMsg(err?.message || 'Não foi possível entrar. Tente de novo.');
      setLoading(false);
    }
  };

  const eyeButton = (
    <button
      type="button"
      onClick={() => setShowPassword((v) => !v)}
      aria-label={showPassword ? 'Esconder senha' : 'Mostrar senha'}
      style={{ color: '#64748b', display: 'flex', padding: '6px', flexShrink: 0 }}
    >
      {showPassword ? <EyeOff size={18} /> : <Eye size={18} />}
    </button>
  );

  return (
    <div style={{
      minHeight: '100dvh',
      background: '#050505',
      display: 'flex',
      flexDirection: 'column',
      alignItems: 'center',
      justifyContent: 'center',
      padding: '24px 16px calc(24px + env(safe-area-inset-bottom, 0px))',
      overflowY: 'auto',
    }}>
      <style>{`.login-field:focus-within { border-color: #10b981 !important; box-shadow: 0 0 0 3px rgba(16,185,129,0.15); }`}</style>
      <div
        className="slide-up"
        style={{
          width: '100%',
          maxWidth: '440px',
          background: 'rgba(12, 16, 21, 0.95)',
          borderRadius: '28px',
          border: '1px solid rgba(16, 185, 129, 0.2)',
          boxShadow: '0 25px 60px rgba(0, 0, 0, 0.8), 0 0 30px rgba(16, 185, 129, 0.1)',
          padding: 'clamp(24px, 6vw, 36px)',
        }}
      >
        <div style={{ display: 'flex', flexDirection: 'column', alignItems: 'center', textAlign: 'center', marginBottom: '24px' }}>
          <div style={{
            width: '52px',
            height: '52px',
            borderRadius: '16px',
            background: 'linear-gradient(135deg, #10b981 0%, #059669 100%)',
            display: 'flex',
            alignItems: 'center',
            justifyContent: 'center',
            color: '#ffffff',
            boxShadow: '0 10px 25px rgba(16, 185, 129, 0.35)',
            marginBottom: '14px',
          }}>
            <AedoliaMark size={40} />
          </div>
          <h1 style={{ fontSize: '24px', fontWeight: 900, color: '#f8fafc', letterSpacing: '-0.02em', textTransform: 'uppercase' }}>
            Aedolia
          </h1>
          <span style={{ fontSize: '10px', fontWeight: 800, color: '#10b981', letterSpacing: '0.14em', textTransform: 'uppercase', marginTop: '2px' }}>
            por GTP Smart
          </span>
          <p style={{ fontSize: '14px', color: '#94a3b8', marginTop: '6px' }}>
            {isRegister ? 'Crie sua conta para ouvir seus livros.' : 'Entre para continuar sua leitura.'}
          </p>
        </div>

        <GoogleSignIn onError={setErrorMsg} />

        {/* Entrar / Criar conta */}
        <div role="tablist" style={{
          display: 'grid',
          gridTemplateColumns: '1fr 1fr',
          padding: '4px',
          borderRadius: '14px',
          background: 'rgba(255,255,255,0.04)',
          border: '1px solid rgba(255,255,255,0.08)',
          marginBottom: '20px',
        }}>
          {(['login', 'register'] as const).map((m) => (
            <button
              key={m}
              type="button"
              role="tab"
              aria-selected={mode === m}
              onClick={() => switchMode(m)}
              style={{
                height: '40px',
                borderRadius: '11px',
                fontSize: '14px',
                fontWeight: 700,
                color: mode === m ? '#fff' : '#94a3b8',
                background: mode === m ? 'linear-gradient(135deg, #10b981 0%, #059669 100%)' : 'transparent',
              }}
            >
              {m === 'login' ? 'Entrar' : 'Criar conta'}
            </button>
          ))}
        </div>

        <form onSubmit={handleSubmit} style={{ display: 'flex', flexDirection: 'column', gap: '14px' }} noValidate={false}>
          {isRegister && (
            <>
              <Field id="login-name" label="Seu nome" icon={<User size={17} color="#64748b" />}>
                <input
                  id="login-name"
                  type="text"
                  autoComplete="name"
                  value={fullName}
                  onChange={(e) => {
                    setFullName(e.target.value);
                    if (!usernameEdited) setUsername(suggestUsername(e.target.value));
                  }}
                  placeholder="Como você se chama"
                  required
                  maxLength={120}
                  style={inputStyle}
                />
              </Field>
              <Field
                id="login-username"
                label="Nome de usuário"
                icon={<AtSign size={17} color="#64748b" />}
                hint={
                  <span style={{ fontSize: '12px', color: username && !USERNAME_RE.test(username) ? '#f87171' : '#64748b' }}>
                    {username && !USERNAME_RE.test(username)
                      ? 'De 3 a 30 caracteres: a-z, 0-9, ponto, hífen ou _.'
                      : 'Seus livros ficam guardados numa pasta com esse nome.'}
                  </span>
                }
              >
                <input
                  id="login-username"
                  type="text"
                  autoComplete="username"
                  autoCapitalize="none"
                  spellCheck={false}
                  value={username}
                  onChange={(e) => {
                    setUsernameEdited(true);
                    setUsername(e.target.value.toLowerCase().replace(/\s/g, ''));
                  }}
                  placeholder="alexandre"
                  required
                  maxLength={30}
                  style={inputStyle}
                />
              </Field>
            </>
          )}

          <Field
            id="login-email"
            label="E-mail"
            icon={<Mail size={17} color="#64748b" />}
            hint={emailSuggestion(email) && (
              <button
                type="button"
                onClick={() => setEmail(emailSuggestion(email)!)}
                style={{ alignSelf: 'flex-start', fontSize: '12px', color: '#fbbf24', textAlign: 'left' }}
              >
                Você quis dizer <u style={{ fontWeight: 700 }}>{emailSuggestion(email)}</u>? Toque para corrigir.
              </button>
            )}
          >
            <input
              id="login-email"
              type="email"
              autoComplete="email"
              autoCapitalize="none"
              spellCheck={false}
              value={email}
              onChange={(e) => setEmail(e.target.value)}
              placeholder="seuemail@exemplo.com"
              required
              maxLength={254}
              style={inputStyle}
            />
          </Field>

          <Field
            id="login-password"
            label="Senha"
            icon={<Lock size={17} color="#64748b" />}
            hint={isRegister && (
              <ul style={{ listStyle: 'none', display: 'flex', flexWrap: 'wrap', gap: '6px 12px', marginTop: '2px' }}>
                {rules.map((r) => (
                  <li key={r.text} style={{ display: 'flex', alignItems: 'center', gap: '4px', fontSize: '12px', color: r.ok ? '#10b981' : '#64748b' }}>
                    <Check size={13} strokeWidth={3} style={{ opacity: r.ok ? 1 : 0.35 }} />
                    {r.text}
                  </li>
                ))}
              </ul>
            )}
          >
            <input
              id="login-password"
              type={showPassword ? 'text' : 'password'}
              autoComplete={isRegister ? 'new-password' : 'current-password'}
              value={password}
              onChange={(e) => setPassword(e.target.value)}
              placeholder="••••••••"
              required
              maxLength={256}
              style={inputStyle}
            />
            {eyeButton}
          </Field>

          {isRegister && (
            <Field id="login-confirm" label="Repita a senha" icon={<Lock size={17} color="#64748b" />}>
              <input
                id="login-confirm"
                type={showPassword ? 'text' : 'password'}
                autoComplete="new-password"
                value={confirm}
                onChange={(e) => setConfirm(e.target.value)}
                placeholder="••••••••"
                required
                maxLength={256}
                style={inputStyle}
              />
            </Field>
          )}

          {errorMsg && (
            <div role="alert" style={{
              padding: '12px',
              borderRadius: '12px',
              background: 'rgba(239, 68, 68, 0.1)',
              border: '1px solid rgba(239, 68, 68, 0.3)',
              color: '#f87171',
              fontSize: '13px',
              textAlign: 'center',
            }}>
              {errorMsg}
            </div>
          )}

          <button
            type="submit"
            disabled={loading}
            style={{
              marginTop: '6px',
              height: '52px',
              borderRadius: '14px',
              background: 'linear-gradient(135deg, #10b981 0%, #059669 100%)',
              color: '#ffffff',
              fontSize: '14px',
              fontWeight: 800,
              textTransform: 'uppercase',
              letterSpacing: '0.06em',
              boxShadow: '0 10px 25px rgba(16, 185, 129, 0.3)',
              display: 'flex',
              alignItems: 'center',
              justifyContent: 'center',
              gap: '8px',
              opacity: loading ? 0.7 : 1,
            }}
          >
            {loading ? <Loader2 size={18} className="animate-spin" /> : null}
            {loading ? 'Aguarde...' : isRegister ? 'Criar conta' : 'Entrar'}
            {!loading && <ArrowRight size={17} />}
          </button>
        </form>

        <p style={{
          display: 'flex',
          alignItems: 'flex-start',
          gap: '8px',
          marginTop: '22px',
          paddingTop: '18px',
          borderTop: '1px solid rgba(255, 255, 255, 0.06)',
          fontSize: '12px',
          lineHeight: 1.5,
          color: '#64748b',
        }}>
          <ShieldCheck size={16} color="#10b981" style={{ flexShrink: 0, marginTop: '1px' }} />
          Conexão criptografada (HTTPS). Sua senha é guardada com Argon2id e nunca fica salva no aparelho.
          Seus livros só aparecem para você.
        </p>
      </div>
    </div>
  );
};
