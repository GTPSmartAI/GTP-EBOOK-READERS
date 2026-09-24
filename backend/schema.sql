-- ==========================================================
-- ElevenReader - Schema do Banco de Dados Supabase (Passo 2)
-- Execute este script no SQL Editor do painel Supabase
-- ==========================================================

-- 1. Habilitar extensão de UUID
CREATE EXTENSION IF NOT EXISTS "uuid-ossp";

-- 2. Tabela de Perfis de Usuário (vinculada a auth.users)
CREATE TABLE IF NOT EXISTS public.profiles (
  id UUID REFERENCES auth.users ON DELETE CASCADE PRIMARY KEY,
  email TEXT,
  full_name TEXT,
  avatar_url TEXT,
  subscription_tier TEXT DEFAULT 'free', -- 'free', 'pro', 'unlimited'
  subscription_status TEXT DEFAULT 'active', -- 'active', 'trialing', 'canceled', 'past_due'
  words_read_total BIGINT DEFAULT 0,
  daily_words_read INT DEFAULT 0,
  last_active_at TIMESTAMPTZ DEFAULT NOW(),
  created_at TIMESTAMPTZ DEFAULT NOW(),
  updated_at TIMESTAMPTZ DEFAULT NOW()
);

-- 3. Trigger automático para criar perfil ao cadastrar novo usuário no Auth
CREATE OR REPLACE FUNCTION public.handle_new_user()
RETURNS TRIGGER AS $$
BEGIN
  INSERT INTO public.profiles (id, email, full_name, subscription_tier, subscription_status)
  VALUES (
    NEW.id,
    NEW.email,
    COALESCE(NEW.raw_user_meta_data->>'full_name', split_part(NEW.email, '@', 1)),
    'free',
    'active'
  );
  RETURN NEW;
END;
$$ LANGUAGE plpgsql SECURITY DEFINER;

-- Remove trigger anterior se existir e recria
DROP TRIGGER IF EXISTS on_auth_user_created ON auth.users;
CREATE TRIGGER on_auth_user_created
  AFTER INSERT ON auth.users
  FOR EACH ROW EXECUTE FUNCTION public.handle_new_user();

-- 4. Tabela de Livros e Documentos Salvos
CREATE TABLE IF NOT EXISTS public.books (
  id TEXT PRIMARY KEY,
  user_id UUID REFERENCES public.profiles(id) ON DELETE CASCADE,
  title TEXT NOT NULL,
  author TEXT NOT NULL,
  cover_gradient TEXT,
  type TEXT NOT NULL, -- 'pdf', 'epub', 'txt', 'article'
  content TEXT NOT NULL,
  sentences JSONB DEFAULT '[]'::jsonb,
  chapters JSONB DEFAULT '[]'::jsonb,
  total_words INT DEFAULT 0,
  duration_minutes INT DEFAULT 0,
  file_url TEXT,
  created_at TIMESTAMPTZ DEFAULT NOW()
);

-- 5. Tabela de Progresso de Leitura por Usuário
CREATE TABLE IF NOT EXISTS public.reading_progress (
  id UUID DEFAULT uuid_generate_v4() PRIMARY KEY,
  user_id UUID REFERENCES public.profiles(id) ON DELETE CASCADE,
  book_id TEXT REFERENCES public.books(id) ON DELETE CASCADE,
  last_sentence_index INT DEFAULT 0,
  progress_percentage INT DEFAULT 0,
  updated_at TIMESTAMPTZ DEFAULT NOW(),
  UNIQUE(user_id, book_id)
);

-- 6. Tabela de Assinaturas e Histórico de Pagamentos (Webhook n8n / Gateways)
CREATE TABLE IF NOT EXISTS public.subscriptions (
  id UUID DEFAULT uuid_generate_v4() PRIMARY KEY,
  user_id UUID REFERENCES public.profiles(id) ON DELETE SET NULL,
  email TEXT,
  plan TEXT NOT NULL, -- 'pro_monthly', 'pro_annual', etc.
  amount DECIMAL(10, 2),
  gateway TEXT, -- 'kiwify', 'hotmart', 'asaas', 'stripe', 'mercadopago'
  transaction_id TEXT,
  status TEXT DEFAULT 'paid',
  payload JSONB,
  created_at TIMESTAMPTZ DEFAULT NOW()
);

-- ==========================================================
-- 7. Configuração de Segurança (Row Level Security - RLS)
-- ==========================================================
ALTER TABLE public.profiles ENABLE ROW LEVEL SECURITY;
ALTER TABLE public.books ENABLE ROW LEVEL SECURITY;
ALTER TABLE public.reading_progress ENABLE ROW LEVEL SECURITY;
ALTER TABLE public.subscriptions ENABLE ROW LEVEL SECURITY;

-- Políticas para Profiles
DROP POLICY IF EXISTS "Usuário pode visualizar seu próprio perfil" ON public.profiles;
CREATE POLICY "Usuário pode visualizar seu próprio perfil" 
  ON public.profiles FOR SELECT 
  USING (auth.uid() = id);

DROP POLICY IF EXISTS "Usuário pode atualizar seu próprio perfil" ON public.profiles;
CREATE POLICY "Usuário pode atualizar seu próprio perfil" 
  ON public.profiles FOR UPDATE 
  USING (auth.uid() = id);

-- Políticas para Books
DROP POLICY IF EXISTS "Usuários podem ver seus próprios livros" ON public.books;
CREATE POLICY "Usuários podem ver seus próprios livros" 
  ON public.books FOR SELECT 
  USING (auth.uid() = user_id OR user_id IS NULL);

DROP POLICY IF EXISTS "Usuários podem criar seus próprios livros" ON public.books;
CREATE POLICY "Usuários podem criar seus próprios livros" 
  ON public.books FOR INSERT 
  WITH CHECK (auth.uid() = user_id);

DROP POLICY IF EXISTS "Usuários podem excluir seus próprios livros" ON public.books;
CREATE POLICY "Usuários podem excluir seus próprios livros" 
  ON public.books FOR DELETE 
  USING (auth.uid() = user_id);

-- Políticas para Reading Progress
DROP POLICY IF EXISTS "Usuários podem gerenciar seu progresso" ON public.reading_progress;
CREATE POLICY "Usuários podem gerenciar seu progresso" 
  ON public.reading_progress FOR ALL 
  USING (auth.uid() = user_id);

-- Políticas para Subscriptions (Apenas Service Role / Admin pode inserir via Webhook)
DROP POLICY IF EXISTS "Usuários podem visualizar suas assinaturas" ON public.subscriptions;
CREATE POLICY "Usuários podem visualizar suas assinaturas" 
  ON public.subscriptions FOR SELECT 
  USING (auth.uid() = user_id);
