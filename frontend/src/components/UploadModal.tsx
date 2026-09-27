import React, { useState, useRef } from 'react';
import { useEscapeKey } from '../hooks/useEscapeKey';
import { X, Upload, FileText, CheckCircle2, AlertCircle, BookOpen, Sparkles } from 'lucide-react';
import { extractCoverThumbnail } from '../services/pdfParser';
import type { Book } from '../types';

interface UploadModalProps {
  isOpen: boolean;
  onClose: () => void;
  onBookCreated: (book: Book) => void;
  onStartUpload?: (file: File, optimisticBook: Book, coverBase64?: string) => void;
  userId?: string;
}

export const UploadModal: React.FC<UploadModalProps> = ({
  isOpen,
  onClose,
  onBookCreated,
  onStartUpload,
  userId: _userId,
}) => {
  const [dragOver, setDragOver] = useState(false);
  const [selectedFile, setSelectedFile] = useState<File | null>(null);
  const [title, setTitle] = useState('');
  const [author, setAuthor] = useState('');
  const [previewCover, setPreviewCover] = useState<string | null>(null);
  const [isExtractingPreview, setIsExtractingPreview] = useState(false);
  const [errorMsg, setErrorMsg] = useState<string | null>(null);
  const fileInputRef = useRef<HTMLInputElement>(null);

  useEscapeKey(isOpen, onClose);
  if (!isOpen) return null;

  const detectDocType = (fileName: string): string => {
    const ext = fileName.toLowerCase().split('.').pop() || 'txt';
    if (['pdf', 'epub', 'docx', 'doc', 'txt', 'md', 'mobi', 'rtf'].includes(ext)) {
      return ext;
    }
    return 'txt';
  };

  const handleFileSelect = async (file: File) => {
    setSelectedFile(file);
    setErrorMsg(null);
    setPreviewCover(null);

    // Auto-preenche título baseado no nome do arquivo
    const cleanName = file.name.replace(/\.[^/.]+$/, '').replace(/[-_]/g, ' ');
    setTitle(cleanName);

    // Tenta gerar prévia rápida da capa se for PDF ou EPUB
    setIsExtractingPreview(true);
    try {
      const coverThumb = await extractCoverThumbnail(file);
      if (coverThumb) {
        setPreviewCover(coverThumb);
      }
    } catch (e) {
      console.warn('Prévia não pôde ser gerada no cliente:', e);
    } finally {
      setIsExtractingPreview(false);
    }
  };

  const handleDrop = (e: React.DragEvent) => {
    e.preventDefault();
    setDragOver(false);
    if (e.dataTransfer.files && e.dataTransfer.files[0]) {
      handleFileSelect(e.dataTransfer.files[0]);
    }
  };

  const handleSubmit = (e: React.FormEvent) => {
    e.preventDefault();
    if (!selectedFile) {
      setErrorMsg('Por favor selecione um arquivo.');
      return;
    }

    const docType = detectDocType(selectedFile.name);
    const tempId = `temp-${Date.now()}`;
    const cleanTitle = title.trim() || selectedFile.name.replace(/\.[^/.]+$/, '');
    const cleanAuthor = author.trim() || 'Autor Desconhecido';

    const gradients = [
      'linear-gradient(135deg, #10b981 0%, #059669 100%)',
      'linear-gradient(135deg, #0ea5e9 0%, #2563eb 100%)',
      'linear-gradient(135deg, #8b5cf6 0%, #6366f1 100%)',
      'linear-gradient(135deg, #f59e0b 0%, #d97706 100%)',
      'linear-gradient(135deg, #ec4899 0%, #be185d 100%)',
    ];
    const coverGradient = gradients[Math.floor(Math.random() * gradients.length)];

    // 1. Cria o livro otimista com a prévia da capa e status de carregando
    const optimisticBook: Book = {
      id: tempId,
      title: cleanTitle,
      author: cleanAuthor,
      coverGradient,
      coverImage: previewCover || undefined,
      type: docType as any,
      content: '',
      sentences: [],
      chapters: [],
      totalWords: 0,
      readingProgress: 0,
      lastReadSentenceIndex: 0,
      durationMinutes: 1,
      uploadedAt: 'Agora',
      isUploading: true,
      uploadProgress: 15,
    };

    // 2. Insere na estante imediatamente
    onBookCreated(optimisticBook);

    // 3. FECHA A TELA DE SUBINDO IMEDIATAMENTE (requisito do usuário!)
    onClose();

    // 4. Inicia o upload e processamento em background
    if (onStartUpload) {
      onStartUpload(selectedFile, optimisticBook, previewCover || undefined);
    }
  };

  return (
    <div style={{
      position: 'fixed',
      inset: 0,
      zIndex: 100,
      display: 'flex',
      alignItems: 'center',
      justifyContent: 'center',
      backgroundColor: 'rgba(0, 0, 0, 0.75)',
      backdropFilter: 'blur(10px)',
      padding: '20px',
    }}>
      <div 
        className="slide-up"
        style={{
          width: '100%',
          maxWidth: '540px',
          background: 'var(--bg-surface)',
          borderRadius: '24px',
          border: '1px solid rgba(16, 185, 129, 0.3)',
          boxShadow: '0 25px 50px -12px rgba(0, 0, 0, 0.5), 0 0 20px rgba(16, 185, 129, 0.1)',
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
          background: 'rgba(16, 185, 129, 0.05)',
        }}>
          <div style={{ display: 'flex', alignItems: 'center', gap: '10px' }}>
            <div style={{
              width: '32px',
              height: '32px',
              borderRadius: '10px',
              background: 'rgba(16, 185, 129, 0.15)',
              display: 'flex',
              alignItems: 'center',
              justifyContent: 'center',
              color: '#10b981',
            }}>
              <Upload size={18} />
            </div>
            <div>
              <h2 style={{ fontSize: '17px', fontWeight: 800, color: 'var(--text-primary)', letterSpacing: '-0.01em' }}>
                Importar Livro ou Documento
              </h2>
              <span style={{ fontSize: '11px', color: '#94a3b8' }}>
                Suporta todos os tipos de arquivos
              </span>
            </div>
          </div>

          <button
            onClick={onClose}
            style={{ 
              padding: '6px', 
              color: 'var(--text-muted)',
              background: 'transparent',
              border: 'none',
              cursor: 'pointer',
              borderRadius: '8px',
            }}
          >
            <X size={18} />
          </button>
        </div>

        {/* Form Body */}
        <form onSubmit={handleSubmit} style={{ padding: '24px', display: 'flex', flexDirection: 'column', gap: '18px' }}>
          {/* Dropzone com suporte total e prévia instantânea */}
          <div
            onDragOver={(e) => { e.preventDefault(); setDragOver(true); }}
            onDragLeave={() => setDragOver(false)}
            onDrop={handleDrop}
            onClick={() => fileInputRef.current?.click()}
            style={{
              border: dragOver ? '2px dashed #10b981' : '2px dashed var(--border-strong)',
              borderRadius: '16px',
              padding: selectedFile ? '20px' : '28px 16px',
              textAlign: 'center',
              cursor: 'pointer',
              background: dragOver ? 'rgba(16, 185, 129, 0.08)' : 'var(--bg-surface-elevated)',
              transition: 'all 200ms ease',
              display: 'flex',
              flexDirection: 'column',
              alignItems: 'center',
              gap: '12px',
            }}
          >
            {/* Aceita TODOS os tipos de arquivos sem exceção */}
            <input
              ref={fileInputRef}
              type="file"
              accept="*/*"
              style={{ display: 'none' }}
              onChange={(e) => {
                if (e.target.files && e.target.files[0]) {
                  handleFileSelect(e.target.files[0]);
                }
              }}
            />

            {selectedFile ? (
              <div style={{ display: 'flex', alignItems: 'center', gap: '16px', width: '100%' }}>
                {/* Thumbnail de prévia se extraído */}
                {previewCover ? (
                  <div style={{
                    width: '60px',
                    height: '84px',
                    borderRadius: '8px',
                    overflow: 'hidden',
                    boxShadow: '0 4px 12px rgba(0,0,0,0.4)',
                    flexShrink: 0,
                    border: '1px solid rgba(16, 185, 129, 0.3)',
                    background: '#0f172a',
                  }}>
                    <img 
                      src={previewCover} 
                      alt="Prévia da Capa" 
                      style={{ width: '100%', height: '100%', objectFit: 'cover' }} 
                    />
                  </div>
                ) : (
                  <div style={{
                    width: '60px',
                    height: '84px',
                    borderRadius: '8px',
                    background: 'linear-gradient(135deg, #10b981 0%, #059669 100%)',
                    display: 'flex',
                    flexDirection: 'column',
                    alignItems: 'center',
                    justifyContent: 'center',
                    color: '#ffffff',
                    flexShrink: 0,
                    gap: '4px',
                  }}>
                    <BookOpen size={24} />
                    <span style={{ fontSize: '9px', fontWeight: 800, textTransform: 'uppercase' }}>
                      {detectDocType(selectedFile.name)}
                    </span>
                  </div>
                )}

                <div style={{ display: 'flex', flexDirection: 'column', alignItems: 'flex-start', flex: 1, overflow: 'hidden' }}>
                  <div style={{ display: 'flex', alignItems: 'center', gap: '6px', color: '#10b981', fontWeight: 700, fontSize: '13px' }}>
                    <CheckCircle2 size={16} />
                    <span>Arquivo Selecionado</span>
                  </div>
                  <span style={{
                    fontSize: '14px',
                    fontWeight: 600,
                    color: 'var(--text-primary)',
                    maxWidth: '100%',
                    overflow: 'hidden',
                    textOverflow: 'ellipsis',
                    whiteSpace: 'nowrap',
                    marginTop: '2px',
                  }}>
                    {selectedFile.name}
                  </span>
                  <div style={{ display: 'flex', gap: '8px', alignItems: 'center', marginTop: '4px' }}>
                    <span style={{ fontSize: '11px', color: 'var(--text-muted)' }}>
                      {(selectedFile.size / 1024 / 1024).toFixed(2)} MB
                    </span>
                    {isExtractingPreview && (
                      <span style={{ fontSize: '10px', color: '#f59e0b' }}>
                        Gerando prévia da capa...
                      </span>
                    )}
                    {previewCover && !isExtractingPreview && (
                      <span style={{
                        fontSize: '10px',
                        fontWeight: 700,
                        color: '#10b981',
                        background: 'rgba(16, 185, 129, 0.15)',
                        padding: '1px 6px',
                        borderRadius: '4px',
                        display: 'flex',
                        alignItems: 'center',
                        gap: '3px',
                      }}>
                        <Sparkles size={10} /> Capa Identificada
                      </span>
                    )}
                  </div>
                  <span style={{ fontSize: '11px', color: '#38bdf8', marginTop: '4px' }}>
                    Clique para trocar de arquivo
                  </span>
                </div>
              </div>
            ) : (
              <>
                <div style={{
                  width: '52px',
                  height: '52px',
                  borderRadius: '16px',
                  background: 'rgba(16, 185, 129, 0.12)',
                  display: 'flex',
                  alignItems: 'center',
                  justifyContent: 'center',
                  color: '#10b981',
                  border: '1px solid rgba(16, 185, 129, 0.25)',
                }}>
                  <FileText size={26} />
                </div>
                <div>
                  <p style={{ fontSize: '14px', fontWeight: 700, color: 'var(--text-primary)' }}>
                    Clique ou arraste qualquer arquivo aqui
                  </p>
                  <p style={{ fontSize: '12px', color: 'var(--text-muted)', marginTop: '4px' }}>
                    Suporta PDF, EPUB, DOCX, TXT, MD, MOBI e todos os formatos
                  </p>
                </div>
              </>
            )}
          </div>

          {/* Title Field */}
          <div style={{ display: 'flex', flexDirection: 'column', gap: '6px' }}>
            <label style={{ fontSize: '12px', fontWeight: 700, color: 'var(--text-secondary)', textTransform: 'uppercase', letterSpacing: '0.05em' }}>
              Título da Obra
            </label>
            <input
              type="text"
              value={title}
              onChange={(e) => setTitle(e.target.value)}
              placeholder="Ex: O Homem Mais Rico da Babilônia"
              required
              style={{
                padding: '12px 14px',
                borderRadius: '12px',
                background: 'var(--bg-surface-elevated)',
                border: '1px solid var(--border-subtle)',
                color: 'var(--text-primary)',
                fontSize: '14px',
                outline: 'none',
              }}
            />
          </div>

          {/* Author Field */}
          <div style={{ display: 'flex', flexDirection: 'column', gap: '6px' }}>
            <label style={{ fontSize: '12px', fontWeight: 700, color: 'var(--text-secondary)', textTransform: 'uppercase', letterSpacing: '0.05em' }}>
              Autor (Opcional)
            </label>
            <input
              type="text"
              value={author}
              onChange={(e) => setAuthor(e.target.value)}
              placeholder="Ex: George S. Clason"
              style={{
                padding: '12px 14px',
                borderRadius: '12px',
                background: 'var(--bg-surface-elevated)',
                border: '1px solid var(--border-subtle)',
                color: 'var(--text-primary)',
                fontSize: '14px',
                outline: 'none',
              }}
            />
          </div>

          {errorMsg && (
            <div style={{
              display: 'flex',
              alignItems: 'center',
              gap: '8px',
              padding: '12px',
              borderRadius: '10px',
              background: 'rgba(239, 68, 68, 0.1)',
              border: '1px solid rgba(239, 68, 68, 0.3)',
              color: '#ef4444',
              fontSize: '13px',
            }}>
              <AlertCircle size={16} />
              <span>{errorMsg}</span>
            </div>
          )}

          {/* Action Buttons */}
          <div style={{ display: 'flex', justifyContent: 'flex-end', gap: '12px', marginTop: '8px' }}>
            <button
              type="button"
              onClick={onClose}
              style={{
                padding: '10px 18px',
                borderRadius: '12px',
                background: 'rgba(255, 255, 255, 0.05)',
                color: 'var(--text-secondary)',
                fontSize: '13px',
                fontWeight: 600,
                border: '1px solid var(--border-subtle)',
                cursor: 'pointer',
              }}
            >
              Cancelar
            </button>

            <button
              type="submit"
              disabled={!selectedFile}
              style={{
                display: 'flex',
                alignItems: 'center',
                gap: '8px',
                padding: '10px 24px',
                borderRadius: '12px',
                background: 'linear-gradient(135deg, #10b981 0%, #059669 100%)',
                color: '#ffffff',
                fontSize: '13px',
                fontWeight: 800,
                textTransform: 'uppercase',
                letterSpacing: '0.05em',
                cursor: selectedFile ? 'pointer' : 'not-allowed',
                opacity: selectedFile ? 1 : 0.5,
                boxShadow: '0 8px 20px rgba(16, 185, 129, 0.35)',
                border: 'none',
              }}
            >
              <Upload size={15} />
              <span>Subir Documento</span>
            </button>
          </div>
        </form>
      </div>
    </div>
  );
};
