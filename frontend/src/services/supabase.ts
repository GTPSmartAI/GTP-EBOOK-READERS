import { createClient } from '@supabase/supabase-js';
import type { Book } from '../types';

const SUPABASE_URL = 'https://zylmxakyhjbebdcprlmu.supabase.co';
const SUPABASE_ANON_KEY = 'sb_publishable_R4mup3At253APsLpLn30ew_xVFSVZbJ';

export const supabase = createClient(SUPABASE_URL, SUPABASE_ANON_KEY);

export const BACKEND_API_URL = 'http://localhost:4000';

export interface UserProfile {
  id: string;
  email: string;
  full_name: string;
  subscription_tier: 'free' | 'pro' | 'unlimited';
  subscription_status: 'active' | 'trialing' | 'canceled' | 'past_due';
  words_read_total: number;
}

export async function fetchUserProfile(userId: string): Promise<UserProfile | null> {
  const { data, error } = await supabase
    .from('profiles')
    .select('*')
    .eq('id', userId)
    .maybeSingle();

  if (error) {
    console.warn('Erro ao carregar perfil:', error.message);
    return null;
  }
  return data;
}

/**
 * Busca livros reais salvos no Supabase (via backend ou direto pelo client)
 */
export async function fetchCloudBooks(userId?: string): Promise<Book[]> {
  // 1. Tenta buscar via backend Flask
  try {
    const url = userId ? `${BACKEND_API_URL}/api/books?user_id=${userId}` : `${BACKEND_API_URL}/api/books`;
    const res = await fetch(url);
    if (res.ok) {
      const data = await res.json();
      if (Array.isArray(data.books)) {
        return data.books.map(mapDbToBook);
      }
    }
  } catch (err) {
    console.warn('API local offline, tentando Supabase direto:', err);
  }

  // 2. Fallback direto pelo client Supabase
  try {
    let query = supabase.from('books').select('*').order('created_at', { ascending: false });
    if (userId) {
      query = query.eq('user_id', userId);
    }
    const { data, error } = await query;
    if (error) {
      console.warn('Erro ao buscar livros do Supabase:', error.message);
      return [];
    }
    return (data || []).map(mapDbToBook);
  } catch (e) {
    console.error('Falha geral ao buscar livros:', e);
    return [];
  }
}

/**
 * Realiza upload real do arquivo para o Supabase Storage (bucket pdf-uploads) e salva na tabela books
 */
export async function uploadBookReal(
  file: File, 
  title: string, 
  author: string, 
  userId?: string
): Promise<Book> {
  // 1. Envia via FormData para o backend Python (que tem a service role e faz upload no bucket pdf-uploads)
  const formData = new FormData();
  formData.append('file', file);
  formData.append('title', title);
  formData.append('author', author);
  if (userId) {
    formData.append('user_id', userId);
  }

  const response = await fetch(`${BACKEND_API_URL}/api/books/upload`, {
    method: 'POST',
    body: formData,
  });

  if (!response.ok) {
    const errText = await response.text();
    throw new Error(`Falha no upload para o servidor: ${errText}`);
  }

  const result = await response.json();
  if (!result.success || !result.book) {
    throw new Error(result.error || 'Erro ao processar livro');
  }

  return mapDbToBook(result.book);
}

/**
 * Remove livro do Supabase e do bucket
 */
export async function deleteBookReal(bookId: string): Promise<boolean> {
  try {
    const res = await fetch(`${BACKEND_API_URL}/api/books/${bookId}`, {
      method: 'DELETE',
    });
    return res.ok;
  } catch (e) {
    console.warn('Erro ao deletar livro via backend:', e);
    const { error } = await supabase.from('books').delete().eq('id', bookId);
    return !error;
  }
}

function mapDbToBook(row: any): Book {
  return {
    id: row.id,
    title: row.title,
    author: row.author || 'Autor Desconhecido',
    coverGradient: row.cover_gradient || 'linear-gradient(135deg, #10b981 0%, #059669 100%)',
    type: (row.type as any) || 'pdf',
    content: row.content || '',
    sentences: Array.isArray(row.sentences) ? row.sentences : [],
    chapters: Array.isArray(row.chapters) ? row.chapters : [],
    totalWords: row.total_words || 0,
    durationMinutes: row.duration_minutes || Math.max(1, Math.ceil((row.total_words || 0) / 140)),
    readingProgress: row.reading_progress || 0,
    lastReadSentenceIndex: row.last_read_sentence_index || 0,
    uploadedAt: row.created_at ? new Date(row.created_at).toLocaleDateString('pt-BR') : 'Hoje',
    fileUrl: row.file_url,
  };
}
