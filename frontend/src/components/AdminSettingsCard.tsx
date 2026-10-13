import React, { useEffect, useState } from 'react';
import { ShieldCheck, Eye, EyeOff, Loader2, CheckCircle2, XCircle } from 'lucide-react';
import { apiFetch } from '../services/session';

const inputStyle: React.CSSProperties = {
  width: '100%',
  height: '46px',
  padding: '0 44px 0 14px',
  borderRadius: '12px',
  background: 'rgba(255,255,255,0.04)',
  border: '1px solid var(--border-subtle)',
  color: '#f8fafc',
  fontSize: '14px',
  outline: 'none',
};

const buttonStyle: React.CSSProperties = {
  padding: '11px 16px',
  borderRadius: '12px',
  border: '1px solid var(--border-subtle)',
  background: 'rgba(255,255,255,0.04)',
  color: '#e2e8f0',
  fontSize: '13px',
  fontWeight: 700,
  display: 'flex',
  alignItems: 'center',
  gap: '6px',
};

interface GoogleStatus {
  configured: boolean;
  source: 'app' | 'env' | null;
  masked_key: string | null;
  last_error: { message: string | null; at: string | null };
}

interface VoiceTest {
  id: string;
  name: string;
  google_voice: string;
  ok: boolean;
  error: string | null;
}

/**
 * Só para administradores (ADMIN_EMAILS no backend): chave do Google Cloud das vozes PRO.
 * A chave é conferida no Google antes de salvar e nunca volta inteira para o app.
 */
export const AdminSettingsCard: React.FC = () => {
  const [status, setStatus] = useState<GoogleStatus | null>(null);
  const [key, setKey] = useState('');
  const [show, setShow] = useState(false);
  const [busy, setBusy] = useState<'save' | 'remove' | 'test' | null>(null);
  const [msg, setMsg] = useState<{ ok: boolean; text: string } | null>(null);
  const [tests, setTests] = useState<VoiceTest[] | null>(null);

  const load = async () => {
    try {
      const res = await apiFetch('/api/admin/settings');
      if (res.ok) setStatus((await res.json()).google_tts);
    } catch {
      // sem internet: o cartão fica sem o status
    }
  };

  useEffect(() => {
    load();
  }, []);

  const save = async (apiKey: string) => {
    setMsg(null);
    setTests(null);
    setBusy(apiKey ? 'save' : 'remove');
    try {
      const res = await apiFetch('/api/admin/settings/google-tts', {
        method: 'PUT',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({ api_key: apiKey }),
      });
      const data = await res.json().catch(() => ({}));
      if (!res.ok) throw new Error(data.error || 'Não foi possível salvar.');
      setKey('');
      setMsg({
        ok: true,
        text: apiKey
          ? `Chave salva. O Google liberou ${data.voices_found} vozes em português para ela.`
          : 'Chave removida. As vozes PRO vão tocar na voz grátis padrão.',
      });
      await load();
    } catch (err: any) {
      setMsg({ ok: false, text: err?.message || 'Não foi possível salvar.' });
    } finally {
      setBusy(null);
    }
  };

  const test = async () => {
    setMsg(null);
    setBusy('test');
    try {
      const res = await apiFetch('/api/admin/settings/google-tts/test', { method: 'POST' });
      const data = await res.json().catch(() => ({}));
      if (!res.ok) throw new Error(data.error || 'Não foi possível testar.');
      setTests(data.results);
    } catch (err: any) {
      setMsg({ ok: false, text: err?.message || 'Não foi possível testar.' });
    } finally {
      setBusy(null);
    }
  };

  return (
    <div
      className="floating-card"
      style={{
        padding: '24px 28px',
        borderRadius: '24px',
        background: 'var(--bg-surface)',
        border: '1px solid rgba(245, 158, 11, 0.35)',
        display: 'flex',
        flexDirection: 'column',
        gap: '16px',
      }}
    >
      <div style={{ display: 'flex', alignItems: 'center', gap: '12px' }}>
        <ShieldCheck size={20} color="#f59e0b" />
        <div>
          <h3 style={{ fontSize: '15px', fontWeight: 800, color: '#f8fafc' }}>Administração · Vozes PRO (Google Cloud)</h3>
          <p style={{ fontSize: '12px', color: '#94a3b8', marginTop: '2px' }}>
            Só administradores veem este cartão. A chave vale para todos os assinantes PRO.
          </p>
        </div>
      </div>

      <div style={{ fontSize: '13px', color: '#cbd5e1', display: 'flex', flexDirection: 'column', gap: '4px' }}>
        {status === null ? (
          <span style={{ color: '#64748b' }}>Carregando…</span>
        ) : status.configured ? (
          <span>
            <strong style={{ color: '#10b981' }}>Chave ativa</strong> ({status.masked_key})
            {status.source === 'env' ? ' — vinda do .env do servidor' : ''}
          </span>
        ) : (
          <span><strong style={{ color: '#f87171' }}>Sem chave.</strong> As vozes PRO tocam na voz grátis padrão.</span>
        )}
        {status?.last_error?.message && (
          <span style={{ color: '#f87171', fontSize: '12px' }}>
            Último erro do Google ({status.last_error.at}): {status.last_error.message}
          </span>
        )}
      </div>

      <form
        onSubmit={(e) => { e.preventDefault(); if (key.trim()) save(key.trim()); }}
        style={{ display: 'flex', flexDirection: 'column', gap: '10px', maxWidth: '520px' }}
      >
        <div style={{ position: 'relative' }}>
          <input
            type={show ? 'text' : 'password'}
            autoComplete="off"
            spellCheck={false}
            placeholder={status?.configured ? 'Nova chave de API (para trocar de conta)' : 'Chave de API do Google Cloud'}
            value={key}
            onChange={(e) => setKey(e.target.value)}
            style={inputStyle}
          />
          <button
            type="button"
            onClick={() => setShow((v) => !v)}
            aria-label={show ? 'Esconder chave' : 'Mostrar chave'}
            style={{ position: 'absolute', right: 8, top: 8, padding: 6, color: '#64748b', display: 'flex' }}
          >
            {show ? <EyeOff size={18} /> : <Eye size={18} />}
          </button>
        </div>
        <div style={{ display: 'flex', gap: '10px', flexWrap: 'wrap' }}>
          <button
            type="submit"
            disabled={!key.trim() || busy !== null}
            style={{
              ...buttonStyle,
              border: 'none',
              background: 'linear-gradient(135deg, #f59e0b 0%, #d97706 100%)',
              color: '#fff',
              fontWeight: 800,
              opacity: !key.trim() || busy !== null ? 0.6 : 1,
            }}
          >
            {busy === 'save' && <Loader2 size={15} className="animate-spin" />}
            Conferir e salvar
          </button>
          {status?.configured && (
            <button type="button" onClick={test} disabled={busy !== null} style={buttonStyle}>
              {busy === 'test' && <Loader2 size={15} className="animate-spin" />}
              Testar vozes
            </button>
          )}
          {status?.source === 'app' && (
            <button
              type="button"
              onClick={() => save('')}
              disabled={busy !== null}
              style={{ ...buttonStyle, color: '#f87171', borderColor: 'rgba(239, 68, 68, 0.3)' }}
            >
              {busy === 'remove' && <Loader2 size={15} className="animate-spin" />}
              Remover chave
            </button>
          )}
        </div>
      </form>

      {msg && <div role="status" style={{ fontSize: '13px', color: msg.ok ? '#10b981' : '#f87171' }}>{msg.text}</div>}

      {tests && (
        <ul style={{ listStyle: 'none', display: 'flex', flexDirection: 'column', gap: '6px' }}>
          {tests.map((t) => (
            <li key={t.id} style={{ display: 'flex', alignItems: 'flex-start', gap: '8px', fontSize: '13px', color: '#cbd5e1' }}>
              {t.ok ? <CheckCircle2 size={16} color="#10b981" /> : <XCircle size={16} color="#f87171" />}
              <span>
                <strong>{t.name}</strong> <span style={{ color: '#64748b' }}>({t.google_voice})</span>
                {!t.ok && t.error && <span style={{ color: '#f87171' }}> — {t.error}</span>}
              </span>
            </li>
          ))}
        </ul>
      )}

      <details style={{ fontSize: '12px', color: '#94a3b8' }}>
        <summary style={{ cursor: 'pointer', fontWeight: 700 }}>Como pegar a chave no Google Cloud</summary>
        <ol style={{ margin: '8px 0 0 18px', display: 'flex', flexDirection: 'column', gap: '4px' }}>
          <li>Abra console.cloud.google.com e escolha o projeto (ou crie um).</li>
          <li>Em "APIs e serviços" &gt; "Biblioteca", ative a <strong>Cloud Text-to-Speech API</strong>.</li>
          <li>Em "APIs e serviços" &gt; "Credenciais", clique em "Criar credenciais" &gt; "Chave de API".</li>
          <li>Edite a chave e, em "Restrições de API", deixe só a Cloud Text-to-Speech API.</li>
          <li>Copie a chave, cole aqui e clique em "Conferir e salvar".</li>
        </ol>
      </details>
    </div>
  );
};
