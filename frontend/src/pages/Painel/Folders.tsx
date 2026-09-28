import React, { useState } from 'react';
import { Folder, FolderOpen, FolderPlus, Pencil, Trash2, Check, X, Library, Inbox } from 'lucide-react';
import type { Book, BookFolder } from '../../types';
import type { FolderResult } from '../../services/api';

// ------------------------------------------------------------------ campo de nome (criar / renomear)

const NameInput: React.FC<{
  initial?: string;
  placeholder: string;
  onSubmit: (name: string) => Promise<string | null>;
  onCancel: () => void;
}> = ({ initial = '', placeholder, onSubmit, onCancel }) => {
  const [value, setValue] = useState(initial);
  const [error, setError] = useState<string | null>(null);
  const [busy, setBusy] = useState(false);

  const submit = async () => {
    const name = value.trim();
    if (!name || busy) return;
    setBusy(true);
    const err = await onSubmit(name);
    setBusy(false);
    if (err) setError(err);
  };

  return (
    <div style={{ display: 'flex', flexDirection: 'column', gap: '4px' }}>
      <div style={{ display: 'flex', alignItems: 'center', gap: '6px' }}>
        <input
          autoFocus
          value={value}
          maxLength={60}
          placeholder={placeholder}
          onChange={(e) => {
            setValue(e.target.value);
            setError(null);
          }}
          onKeyDown={(e) => {
            if (e.key === 'Enter') submit();
            if (e.key === 'Escape') onCancel();
          }}
          style={{
            minWidth: 0,
            width: '200px',
            padding: '8px 12px',
            borderRadius: '12px',
            background: 'rgba(255, 255, 255, 0.05)',
            border: `1px solid ${error ? 'rgba(239, 68, 68, 0.6)' : 'rgba(16, 185, 129, 0.4)'}`,
            color: '#f8fafc',
            fontSize: '13px',
            outline: 'none',
          }}
        />
        <button
          onClick={submit}
          disabled={busy || !value.trim()}
          title="Salvar"
          style={{
            padding: '8px',
            borderRadius: '10px',
            background: '#10b981',
            color: '#ffffff',
            opacity: busy || !value.trim() ? 0.5 : 1,
            display: 'flex',
          }}
        >
          <Check size={14} />
        </button>
        <button
          onClick={onCancel}
          title="Cancelar"
          style={{ padding: '8px', borderRadius: '10px', background: 'rgba(255, 255, 255, 0.06)', color: '#94a3b8', display: 'flex' }}
        >
          <X size={14} />
        </button>
      </div>
      {error && <span style={{ fontSize: '11px', color: '#f87171' }}>{error}</span>}
    </div>
  );
};

// ------------------------------------------------------------------ barra de pastas do Painel

const chipStyle = (active: boolean): React.CSSProperties => ({
  display: 'flex',
  alignItems: 'center',
  gap: '6px',
  flexShrink: 0,
  padding: '7px 14px',
  borderRadius: '999px',
  fontSize: '12px',
  fontWeight: 700,
  whiteSpace: 'nowrap',
  cursor: 'pointer',
  background: active ? 'rgba(16, 185, 129, 0.18)' : 'rgba(255, 255, 255, 0.04)',
  border: `1px solid ${active ? 'rgba(16, 185, 129, 0.55)' : 'rgba(255, 255, 255, 0.08)'}`,
  color: active ? '#10b981' : '#cbd5e1',
});

const countStyle: React.CSSProperties = { fontSize: '11px', fontWeight: 600, opacity: 0.7 };

interface FolderBarProps {
  books: Book[];
  folders: BookFolder[];
  activeFolderId: string;
  onSelect: (id: string) => void;
  onCreate: (name: string) => Promise<FolderResult<BookFolder>>;
  onRename: (id: string, name: string) => Promise<string | null>;
  onDelete: (id: string) => Promise<string | null>;
}

export const FolderBar: React.FC<FolderBarProps> = ({
  books,
  folders,
  activeFolderId,
  onSelect,
  onCreate,
  onRename,
  onDelete,
}) => {
  const [creating, setCreating] = useState(false);
  const [renaming, setRenaming] = useState(false);
  const [deleteError, setDeleteError] = useState<string | null>(null);

  const countIn = (folderId: string | null) => books.filter((b) => (b.folderId ?? null) === folderId).length;
  const withoutFolder = countIn(null);
  const activeFolder = folders.find((f) => f.id === activeFolderId);

  const select = (id: string) => {
    setRenaming(false);
    setDeleteError(null);
    onSelect(id);
  };

  const confirmDelete = async (folder: BookFolder) => {
    const n = countIn(folder.id);
    const detail = n === 0
      ? 'A pasta está vazia.'
      : `${n === 1 ? 'O livro dela não é apagado: volta' : `Os ${n} livros dela não são apagados: voltam`} para "Sem pasta".`;
    if (!window.confirm(`Apagar a pasta "${folder.name}"?\n\n${detail}`)) return;
    const err = await onDelete(folder.id);
    setDeleteError(err);
  };

  return (
    <div style={{ display: 'flex', flexDirection: 'column', gap: '10px' }}>
      <div style={{ display: 'flex', alignItems: 'center', gap: '8px', overflowX: 'auto', paddingBottom: '4px', scrollbarWidth: 'thin' }}>
        <button onClick={() => select('all')} style={chipStyle(activeFolderId === 'all')}>
          <Library size={14} />
          <span>Todos</span>
          <span style={countStyle}>{books.length}</span>
        </button>

        {folders.map((f) => (
          <button key={f.id} onClick={() => select(f.id)} style={chipStyle(activeFolderId === f.id)} title={f.name}>
            {activeFolderId === f.id ? <FolderOpen size={14} /> : <Folder size={14} />}
            <span style={{ maxWidth: '180px', overflow: 'hidden', textOverflow: 'ellipsis' }}>{f.name}</span>
            <span style={countStyle}>{countIn(f.id)}</span>
          </button>
        ))}

        {folders.length > 0 && (withoutFolder > 0 || activeFolderId === 'none') && (
          <button onClick={() => select('none')} style={chipStyle(activeFolderId === 'none')}>
            <Inbox size={14} />
            <span>Sem pasta</span>
            <span style={countStyle}>{withoutFolder}</span>
          </button>
        )}

        {!creating && (
          <button
            onClick={() => setCreating(true)}
            style={{ ...chipStyle(false), borderStyle: 'dashed', color: '#10b981', borderColor: 'rgba(16, 185, 129, 0.4)' }}
          >
            <FolderPlus size={14} />
            <span>Nova pasta</span>
          </button>
        )}
      </div>

      {creating && (
        <NameInput
          placeholder="Nome da pasta"
          onSubmit={async (name) => {
            const r = await onCreate(name);
            if (!r.ok) return r.error;
            setCreating(false);
            return null;
          }}
          onCancel={() => setCreating(false)}
        />
      )}

      {/* Pasta aberta: renomear ou apagar */}
      {activeFolder && !creating && (
        renaming ? (
          <NameInput
            initial={activeFolder.name}
            placeholder="Novo nome"
            onSubmit={async (name) => {
              const err = await onRename(activeFolder.id, name);
              if (!err) setRenaming(false);
              return err;
            }}
            onCancel={() => setRenaming(false)}
          />
        ) : (
          <div style={{ display: 'flex', alignItems: 'center', gap: '8px', flexWrap: 'wrap' }}>
            <button
              onClick={() => setRenaming(true)}
              style={{ display: 'flex', alignItems: 'center', gap: '5px', fontSize: '12px', fontWeight: 600, color: '#94a3b8', padding: '4px 8px', borderRadius: '8px' }}
            >
              <Pencil size={12} />
              <span>Renomear pasta</span>
            </button>
            <button
              onClick={() => confirmDelete(activeFolder)}
              style={{ display: 'flex', alignItems: 'center', gap: '5px', fontSize: '12px', fontWeight: 600, color: '#f87171', padding: '4px 8px', borderRadius: '8px' }}
            >
              <Trash2 size={12} />
              <span>Apagar pasta</span>
            </button>
            {deleteError && <span style={{ fontSize: '11px', color: '#f87171' }}>{deleteError}</span>}
          </div>
        )
      )}
    </div>
  );
};

// ------------------------------------------------------------------ janela "Mover para pasta"

interface MoveToFolderSheetProps {
  book: Book;
  folders: BookFolder[];
  onMove: (bookId: string, folderId: string | null) => Promise<string | null>;
  onCreate: (name: string, openIt: boolean) => Promise<FolderResult<BookFolder>>;
  onClose: () => void;
}

export const MoveToFolderSheet: React.FC<MoveToFolderSheetProps> = ({ book, folders, onMove, onCreate, onClose }) => {
  const [creating, setCreating] = useState(false);
  const [error, setError] = useState<string | null>(null);
  const current = book.folderId ?? null;

  const move = async (folderId: string | null) => {
    const err = await onMove(book.id, folderId);
    if (err) setError(err);
    else onClose();
  };

  const option = (key: string, folderId: string | null, label: string, icon: React.ReactNode) => {
    const selected = current === folderId;
    return (
      <button
        key={key}
        onClick={() => move(folderId)}
        style={{
          display: 'flex',
          alignItems: 'center',
          gap: '10px',
          width: '100%',
          padding: '12px 14px',
          borderRadius: '12px',
          textAlign: 'left',
          fontSize: '14px',
          fontWeight: 600,
          color: selected ? '#10b981' : '#e2e8f0',
          background: selected ? 'rgba(16, 185, 129, 0.12)' : 'rgba(255, 255, 255, 0.03)',
          border: `1px solid ${selected ? 'rgba(16, 185, 129, 0.4)' : 'transparent'}`,
        }}
      >
        {icon}
        <span style={{ flex: 1, minWidth: 0, overflow: 'hidden', textOverflow: 'ellipsis', whiteSpace: 'nowrap' }}>{label}</span>
        {selected && <Check size={16} />}
      </button>
    );
  };

  return (
    <div
      onClick={onClose}
      style={{
        position: 'fixed',
        inset: 0,
        zIndex: 1000,
        background: 'rgba(0, 0, 0, 0.6)',
        backdropFilter: 'blur(3px)',
        display: 'flex',
        alignItems: 'center',
        justifyContent: 'center',
        padding: '16px',
      }}
    >
      <div
        onClick={(e) => e.stopPropagation()}
        style={{
          width: '100%',
          maxWidth: '400px',
          maxHeight: '80vh',
          display: 'flex',
          flexDirection: 'column',
          gap: '12px',
          padding: '20px',
          borderRadius: '20px',
          background: 'var(--bg-surface)',
          border: '1px solid var(--border-subtle)',
          boxShadow: '0 20px 50px rgba(0, 0, 0, 0.5)',
        }}
      >
        <div style={{ display: 'flex', alignItems: 'flex-start', justifyContent: 'space-between', gap: '12px' }}>
          <div style={{ minWidth: 0 }}>
            <h3 style={{ fontSize: '16px', fontWeight: 800, color: '#f8fafc' }}>Mover para pasta</h3>
            <p style={{ fontSize: '12px', color: '#94a3b8', overflow: 'hidden', textOverflow: 'ellipsis', whiteSpace: 'nowrap' }}>
              {book.title}
            </p>
          </div>
          <button onClick={onClose} title="Fechar" style={{ padding: '6px', borderRadius: '8px', color: '#94a3b8', display: 'flex' }}>
            <X size={18} />
          </button>
        </div>

        <div style={{ display: 'flex', flexDirection: 'column', gap: '6px', overflowY: 'auto' }}>
          {option('none', null, 'Sem pasta', <Inbox size={16} />)}
          {folders.map((f) => option(f.id, f.id, f.name, <Folder size={16} />))}
        </div>

        {creating ? (
          <NameInput
            placeholder="Nome da nova pasta"
            onSubmit={async (name) => {
              const r = await onCreate(name, false);
              if (!r.ok) return r.error;
              await move(r.data.id);
              return null;
            }}
            onCancel={() => setCreating(false)}
          />
        ) : (
          <button
            onClick={() => setCreating(true)}
            style={{
              display: 'flex',
              alignItems: 'center',
              justifyContent: 'center',
              gap: '8px',
              padding: '10px',
              borderRadius: '12px',
              fontSize: '13px',
              fontWeight: 700,
              color: '#10b981',
              border: '1px dashed rgba(16, 185, 129, 0.4)',
            }}
          >
            <FolderPlus size={15} />
            <span>Criar pasta e mover</span>
          </button>
        )}

        {error && <span style={{ fontSize: '12px', color: '#f87171' }}>{error}</span>}
      </div>
    </div>
  );
};
