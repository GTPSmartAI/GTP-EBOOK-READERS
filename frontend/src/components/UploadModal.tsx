import React, { useState, useRef } from 'react';
import { X, Upload, FileText, CheckCircle2, AlertCircle, Loader2 } from 'lucide-react';
import { parsePdfFile, parseEpubFile, parseTextFile, createBookFromUpload } from '../services/pdfParser';
import { uploadBookReal, supabase } from '../services/supabase';
import { saveBookFull } from '../services/bookStorage';
import type { Book } from '../types';

interface UploadModalProps {
  isOpen: boolean;
  onClose: () => void;
  onBookCreated: (book: Book) => void;
  userId?: string;
}

export const UploadModal: React.FC<UploadModalProps> = ({
  isOpen,
  onClose,
  onBookCreated,
  userId,
}) => {
  const [dragOver, setDragOver] = useState(false);
  const [selectedFile, setSelectedFile] = useState<File | null>(null);
  const [title, setTitle] = useState('');
  const [author, setAuthor] = useState('');
  const [isProcessing, setIsProcessing] = useState(false);
  const [uploadStatusText, setUploadStatusText] = useState<string>('Processando...');
  const [errorMsg, setErrorMsg] = useState<string | null>(null);
  const fileInputRef = useRef<HTMLInputElement>(null);

  if (!isOpen) return null;

  const handleFileSelect = (file: File) => {
    setSelectedFile(file);
    setErrorMsg(null);
    // Auto-fill title from filename
    const cleanName = file.name.replace(/\.[^/.]+$/, '').replace(/[-_]/g, ' ');
    setTitle(cleanName);
  };

  const handleDrop = (e: React.DragEvent) => {
    e.preventDefault();
    setDragOver(false);
    if (e.dataTransfer.files && e.dataTransfer.files[0]) {
      handleFileSelect(e.dataTransfer.files[0]);
    }
  };

  const handleSubmit = async (e: React.FormEvent) => {
    e.preventDefault();
    if (!selectedFile) {
      setErrorMsg('Por favor selecione um arquivo PDF ou texto.');
      return;
    }

    setIsProcessing(true);
    setErrorMsg(null);
    setUploadStatusText('Enviando para o bucket pdf-uploads no Supabase...');

    try {
      // 1. Tenta upload pelo backend Python que já salva no bucket pdf-uploads do Supabase e na tabela books
      let createdBook: Book | null = null;

      try {
        createdBook = await uploadBookReal(
          selectedFile,
          title || selectedFile.name,
          author || 'Autor Importado',
          userId
        );
      } catch (backendErr: any) {
        console.warn('Tentativa via backend retornou erro, executando extração local e sincronização direta:', backendErr);
        
        setUploadStatusText('Extraindo páginas e sentenças do documento...');
        const fileName = selectedFile.name.toLowerCase();
        let fullText = '';
        let sentences: string[] = [];
        let totalWords = 0;
        let durationMinutes = 1;
        let fileType: 'pdf' | 'epub' | 'txt' = 'txt';

        if (fileName.endsWith('.epub')) {
          fileType = 'epub';
          setUploadStatusText('Descompactando e extraindo capítulos do EPUB...');
          const parsed = await parseEpubFile(selectedFile);
          fullText = parsed.fullText;
          sentences = parsed.sentences;
          totalWords = parsed.totalWords;
          durationMinutes = parsed.durationMinutes;
        } else if (fileName.endsWith('.pdf')) {
          fileType = 'pdf';
          const parsed = await parsePdfFile(selectedFile);
          fullText = parsed.fullText;
          sentences = parsed.sentences;
          totalWords = parsed.totalWords;
          durationMinutes = parsed.durationMinutes;
        } else {
          fileType = 'txt';
          const parsed = await parseTextFile(selectedFile);
          fullText = parsed.fullText;
          sentences = parsed.sentences;
          totalWords = parsed.totalWords;
          durationMinutes = Math.max(1, Math.ceil(totalWords / 140));
        }

        if (sentences.length === 0 || totalWords === 0) {
          throw new Error('Não foi possível extrair texto deste arquivo. Verifique se o arquivo contém texto selecionável.');
        }

        createdBook = createBookFromUpload(
          title || selectedFile.name,
          author || 'Autor Importado',
          fileType,
          fullText,
          sentences,
          totalWords,
          durationMinutes
        );

        // Salva na tabela do Supabase se userId presente de forma segura (sem estourar cota do PostgREST)
        if (userId && createdBook) {
          try {
            const safeSentences = createdBook.sentences.length > 250 ? createdBook.sentences.slice(0, 200) : createdBook.sentences;
            const safeContent = createdBook.content.length > 50000 ? createdBook.content.slice(0, 50000) : createdBook.content;

            await supabase.from('books').upsert({
              id: createdBook.id,
              user_id: userId,
              title: createdBook.title,
              author: createdBook.author,
              type: createdBook.type,
              content: safeContent,
              sentences: safeSentences,
              chapters: createdBook.chapters,
              total_words: createdBook.totalWords,
              duration_minutes: createdBook.durationMinutes,
              cover_gradient: createdBook.coverGradient,
            });
          } catch (cloudErr) {
            console.warn('Erro ao salvar livro no Supabase:', cloudErr);
          }
        }
      }

      if (createdBook) {
        // Salva imediatamente os dados completos no IndexedDB de alta capacidade
        await saveBookFull(createdBook);
        onBookCreated(createdBook);
        onClose();
      }
    } catch (err: any) {
      console.error(err);
      setErrorMsg(err.message || 'Falha ao processar arquivo.');
    } finally {
      setIsProcessing(false);
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
      backgroundColor: 'rgba(0, 0, 0, 0.65)',
      backdropFilter: 'blur(8px)',
      padding: '20px',
    }}>
      <div 
        className="slide-up"
        style={{
          width: '100%',
          maxWidth: '520px',
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
          padding: '18px 24px',
          borderBottom: '1px solid var(--border-subtle)',
        }}>
          <div style={{ display: 'flex', alignItems: 'center', gap: '8px' }}>
            <Upload size={18} color="var(--accent-primary)" />
            <h2 style={{ fontSize: '17px', fontWeight: 700, color: 'var(--text-primary)' }}>
              Importar Documento ou E-book
            </h2>
          </div>

          <button
            onClick={onClose}
            disabled={isProcessing}
            style={{ padding: '6px', color: 'var(--text-muted)' }}
          >
            <X size={18} />
          </button>
        </div>

        {/* Form Body */}
        <form onSubmit={handleSubmit} style={{ padding: '24px', display: 'flex', flexDirection: 'column', gap: '18px' }}>
          {/* Dropzone */}
          <div
            onDragOver={(e) => { e.preventDefault(); setDragOver(true); }}
            onDragLeave={() => setDragOver(false)}
            onDrop={handleDrop}
            onClick={() => fileInputRef.current?.click()}
            style={{
              border: dragOver ? '2px dashed var(--accent-primary)' : '2px dashed var(--border-strong)',
              borderRadius: 'var(--radius-md)',
              padding: '28px 16px',
              textAlign: 'center',
              cursor: 'pointer',
              background: dragOver ? 'var(--highlight-sentence)' : 'var(--bg-surface-elevated)',
              transition: 'all var(--transition-fast)',
              display: 'flex',
              flexDirection: 'column',
              alignItems: 'center',
              gap: '8px',
            }}
          >
            <input
              ref={fileInputRef}
              type="file"
              accept=".pdf,.txt,.md,.epub"
              style={{ display: 'none' }}
              onChange={(e) => {
                if (e.target.files && e.target.files[0]) {
                  handleFileSelect(e.target.files[0]);
                }
              }}
            />

            <div style={{
              width: '44px',
              height: '44px',
              borderRadius: '50%',
              background: 'var(--bg-surface)',
              display: 'flex',
              alignItems: 'center',
              justifyContent: 'center',
              color: 'var(--accent-primary)',
              border: '1px solid var(--border-subtle)',
            }}>
              <FileText size={22} />
            </div>

            {selectedFile ? (
              <div style={{ display: 'flex', alignItems: 'center', gap: '6px', color: '#10b981', fontWeight: 600, fontSize: '13px' }}>
                <CheckCircle2 size={16} />
                <span>{selectedFile.name} ({(selectedFile.size / 1024 / 1024).toFixed(2)} MB)</span>
              </div>
            ) : (
              <>
                <p style={{ fontSize: '13px', fontWeight: 600, color: 'var(--text-primary)' }}>
                  Arraste seu PDF aqui ou clique para selecionar
                </p>
                <span style={{ fontSize: '11px', color: 'var(--text-muted)' }}>
                  Suporta arquivos .PDF, .TXT e .MD
                </span>
              </>
            )}
          </div>

          {/* Title Field */}
          <div style={{ display: 'flex', flexDirection: 'column', gap: '6px' }}>
            <label style={{ fontSize: '12px', fontWeight: 600, color: 'var(--text-secondary)' }}>
              Título da Obra
            </label>
            <input
              type="text"
              value={title}
              onChange={(e) => setTitle(e.target.value)}
              placeholder="Ex: O Homem Mais Rico da Babilônia"
              required
              style={{
                padding: '10px 12px',
                borderRadius: 'var(--radius-sm)',
                background: 'var(--bg-surface-elevated)',
                border: '1px solid var(--border-subtle)',
                color: 'var(--text-primary)',
                fontSize: '13px',
              }}
            />
          </div>

          {/* Author Field */}
          <div style={{ display: 'flex', flexDirection: 'column', gap: '6px' }}>
            <label style={{ fontSize: '12px', fontWeight: 600, color: 'var(--text-secondary)' }}>
              Autor (Opcional)
            </label>
            <input
              type="text"
              value={author}
              onChange={(e) => setAuthor(e.target.value)}
              placeholder="Ex: George S. Clason"
              style={{
                padding: '10px 12px',
                borderRadius: 'var(--radius-sm)',
                background: 'var(--bg-surface-elevated)',
                border: '1px solid var(--border-subtle)',
                color: 'var(--text-primary)',
                fontSize: '13px',
              }}
            />
          </div>

          {errorMsg && (
            <div style={{
              display: 'flex',
              alignItems: 'center',
              gap: '6px',
              padding: '10px',
              borderRadius: 'var(--radius-sm)',
              background: 'rgba(239, 68, 68, 0.1)',
              border: '1px solid rgba(239, 68, 68, 0.3)',
              color: '#ef4444',
              fontSize: '12px',
            }}>
              <AlertCircle size={15} />
              <span>{errorMsg}</span>
            </div>
          )}

          {/* Action Buttons */}
          <div style={{ display: 'flex', justifyContent: 'flex-end', gap: '10px', marginTop: '10px' }}>
            <button
              type="button"
              onClick={onClose}
              disabled={isProcessing}
              style={{
                padding: '8px 16px',
                borderRadius: 'var(--radius-sm)',
                background: 'var(--bg-surface-elevated)',
                color: 'var(--text-secondary)',
                fontSize: '13px',
              }}
            >
              Cancelar
            </button>

            <button
              type="submit"
              disabled={isProcessing || !selectedFile}
              style={{
                display: 'flex',
                alignItems: 'center',
                gap: '8px',
                padding: '8px 20px',
                borderRadius: 'var(--radius-sm)',
                background: 'linear-gradient(135deg, #10b981 0%, #059669 100%)',
                color: '#ffffff',
                fontSize: '13px',
                fontWeight: 600,
                opacity: isProcessing || !selectedFile ? 0.6 : 1,
                boxShadow: 'var(--shadow-sm)',
              }}
            >
              {isProcessing ? (
                <>
                  <Loader2 size={15} className="animate-spin" />
                  <span>{uploadStatusText}</span>
                </>
              ) : (
                <span>Começar a Ler & Ouvir</span>
              )}
            </button>
          </div>
        </form>
      </div>
    </div>
  );
};
