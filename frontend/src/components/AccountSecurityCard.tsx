import React, { useState } from 'react';
import { KeyRound, Check, Eye, EyeOff, Loader2 } from 'lucide-react';
import { changePassword, type SessionUser } from '../services/session';

const inputStyle: React.CSSProperties = {
  width: '100%',
  height: '46px',
  padding: '0 14px',
  borderRadius: '12px',
  background: 'rgba(255,255,255,0.04)',
  border: '1px solid var(--border-subtle)',
  color: '#f8fafc',
  fontSize: '14px',
  outline: 'none',
};

/** Conta: criar ou trocar a senha. Trocar desconecta os outros aparelhos (o backend apaga as sessões). */
export const AccountSecurityCard: React.FC<{ user: SessionUser }> = ({ user }) => {
  const hasPassword = user.has_password !== false;
  const [open, setOpen] = useState(false);
  const [current, setCurrent] = useState('');
  const [next, setNext] = useState('');
  const [confirm, setConfirm] = useState('');
  const [show, setShow] = useState(false);
  const [busy, setBusy] = useState(false);
  const [msg, setMsg] = useState<{ ok: boolean; text: string } | null>(null);

  const rules = [
    { ok: next.length >= 8, text: '8 caracteres ou mais' },
    { ok: /[a-z]/.test(next) && /[A-Z]/.test(next), text: 'maiúsculas e minúsculas' },
    { ok: /\d/.test(next), text: 'um número' },
  ];

  const submit = async (e: React.FormEvent) => {
    e.preventDefault();
    setMsg(null);
    if (rules.some((r) => !r.ok)) return setMsg({ ok: false, text: 'A nova senha ainda não atende às regras.' });
    if (next !== confirm) return setMsg({ ok: false, text: 'As senhas novas não conferem.' });
    setBusy(true);
    try {
      await changePassword(current, next);
      setMsg({ ok: true, text: 'Senha salva. Os outros aparelhos foram desconectados.' });
      setCurrent('');
      setNext('');
      setConfirm('');
      setOpen(false);
    } catch (err: any) {
      setMsg({ ok: false, text: err?.message || 'Não foi possível salvar a senha.' });
    } finally {
      setBusy(false);
    }
  };

  return (
    <div
      className="floating-card"
      style={{
        padding: '24px 28px',
        borderRadius: '24px',
        background: 'var(--bg-surface)',
        border: '1px solid var(--border-subtle)',
        display: 'flex',
        flexDirection: 'column',
        gap: '16px',
      }}
    >
      <div style={{ display: 'flex', alignItems: 'center', justifyContent: 'space-between', gap: '12px', flexWrap: 'wrap' }}>
        <div style={{ display: 'flex', alignItems: 'center', gap: '12px' }}>
          <KeyRound size={20} color="#10b981" />
          <div>
            <h3 style={{ fontSize: '15px', fontWeight: 800, color: '#f8fafc' }}>Senha e acesso</h3>
            <p style={{ fontSize: '12px', color: '#94a3b8', marginTop: '2px' }}>
              {user.has_google ? 'Conta ligada ao Google. ' : ''}
              {hasPassword ? 'Você também entra com e-mail e senha.' : 'Crie uma senha para entrar também com e-mail.'}
            </p>
          </div>
        </div>
        {!open && (
          <button
            type="button"
            onClick={() => { setOpen(true); setMsg(null); }}
            style={{
              padding: '10px 16px',
              borderRadius: '12px',
              border: '1px solid var(--border-subtle)',
              background: 'rgba(255,255,255,0.04)',
              color: '#e2e8f0',
              fontSize: '12px',
              fontWeight: 700,
            }}
          >
            {hasPassword ? 'Trocar senha' : 'Criar senha'}
          </button>
        )}
      </div>

      {open && (
        <form onSubmit={submit} style={{ display: 'flex', flexDirection: 'column', gap: '10px', maxWidth: '420px' }}>
          {hasPassword && (
            <input
              type={show ? 'text' : 'password'}
              autoComplete="current-password"
              placeholder="Senha atual"
              value={current}
              onChange={(e) => setCurrent(e.target.value)}
              required
              style={inputStyle}
            />
          )}
          <div style={{ position: 'relative' }}>
            <input
              type={show ? 'text' : 'password'}
              autoComplete="new-password"
              placeholder="Nova senha"
              value={next}
              onChange={(e) => setNext(e.target.value)}
              required
              maxLength={256}
              style={{ ...inputStyle, paddingRight: '44px' }}
            />
            <button
              type="button"
              onClick={() => setShow((v) => !v)}
              aria-label={show ? 'Esconder senhas' : 'Mostrar senhas'}
              style={{ position: 'absolute', right: 8, top: 8, padding: 6, color: '#64748b', display: 'flex' }}
            >
              {show ? <EyeOff size={18} /> : <Eye size={18} />}
            </button>
          </div>
          <input
            type={show ? 'text' : 'password'}
            autoComplete="new-password"
            placeholder="Repita a nova senha"
            value={confirm}
            onChange={(e) => setConfirm(e.target.value)}
            required
            maxLength={256}
            style={inputStyle}
          />
          <ul style={{ listStyle: 'none', display: 'flex', flexWrap: 'wrap', gap: '4px 12px' }}>
            {rules.map((r) => (
              <li key={r.text} style={{ display: 'flex', alignItems: 'center', gap: '4px', fontSize: '12px', color: r.ok ? '#10b981' : '#64748b' }}>
                <Check size={13} strokeWidth={3} style={{ opacity: r.ok ? 1 : 0.35 }} />
                {r.text}
              </li>
            ))}
          </ul>
          <div style={{ display: 'flex', gap: '10px', marginTop: '4px' }}>
            <button
              type="submit"
              disabled={busy}
              style={{
                padding: '11px 18px',
                borderRadius: '12px',
                background: 'linear-gradient(135deg, #10b981 0%, #059669 100%)',
                color: '#fff',
                fontSize: '13px',
                fontWeight: 800,
                display: 'flex',
                alignItems: 'center',
                gap: '6px',
                opacity: busy ? 0.7 : 1,
              }}
            >
              {busy && <Loader2 size={15} className="animate-spin" />}
              Salvar senha
            </button>
            <button
              type="button"
              onClick={() => { setOpen(false); setMsg(null); }}
              style={{ padding: '11px 16px', borderRadius: '12px', color: '#94a3b8', fontSize: '13px', fontWeight: 700 }}
            >
              Cancelar
            </button>
          </div>
        </form>
      )}

      {msg && (
        <div role="status" style={{ fontSize: '13px', color: msg.ok ? '#10b981' : '#f87171' }}>{msg.text}</div>
      )}
    </div>
  );
};
