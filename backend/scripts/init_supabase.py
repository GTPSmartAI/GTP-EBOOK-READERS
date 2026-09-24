import sys
from pathlib import Path

# Add shared/python to sys.path
_BASE_DIR = Path(__file__).resolve().parent.parent
sys.path.insert(0, str(_BASE_DIR / "shared" / "python"))

from database import get_supabase_admin
from config import get_settings

def init_supabase():
    print("=" * 60)
    print("Verificando Conexão e Recursos no Supabase...")
    print("=" * 60)

    settings = get_settings()
    print(f"Supabase URL: {settings.SUPABASE_URL}")

    admin = get_supabase_admin()

    # 1. Bucket Storage
    try:
        buckets = admin.storage.list_buckets()
        bucket_names = [b.name for b in buckets] if buckets else []
        print(f"Buckets de Storage encontrados: {bucket_names}")

        if "pdf-uploads" not in bucket_names:
            admin.storage.create_bucket("pdf-uploads", {"public": True})
            print("Bucket 'pdf-uploads' criado com sucesso!")
        else:
            print("Bucket 'pdf-uploads' já existe e está pronto.")
    except Exception as e:
        print(f"Aviso no Storage: {e}")

    # 2. Testar acesso à tabela profiles
    try:
        res = admin.from_('profiles').select('id').limit(1).execute()
        print("Tabela 'profiles' conectada e acessível.")
    except Exception as e:
        print(f"Nota: Tabela 'profiles' ainda precisa ser criada no SQL Editor caso não apareça ({e}).")

    print("\nPara criar as tabelas completas com RLS e triggers:")
    print(f"Copie o conteúdo de '{_BASE_DIR / 'schema.sql'}' e execute no SQL Editor do painel Supabase.")

if __name__ == "__main__":
    init_supabase()
