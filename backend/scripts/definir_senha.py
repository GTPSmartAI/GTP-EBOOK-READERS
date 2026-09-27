"""
Define (ou troca) a senha de uma conta existente e desconecta todos os aparelhos dela.
Serve para contas criadas antes do login com senha, como a do dono do sistema.

Na VPS, dentro do container da API (não precisa de túnel):
    ssh -t root@2.25.124.5 'docker exec -it $(docker ps -q -f name=ebook_api | head -1) python scripts/definir_senha.py seu@email.com'

Local (com o túnel do banco aberto pelo iniciar_dev.ps1):
    cd backend; python scripts/definir_senha.py seu@email.com

A senha é digitada sem aparecer na tela e não fica em histórico nem em arquivo.
"""

import getpass
import sys
from pathlib import Path

BASE = Path(__file__).resolve().parent.parent
sys.path.insert(0, str(BASE / "shared" / "python"))

from auth import delete_user_sessions, hash_password, password_problem  # noqa: E402
from database import ensure_schema, get_user_for_login, set_user_password  # noqa: E402


def main() -> int:
    if len(sys.argv) != 2:
        print("Uso: python scripts/definir_senha.py seu@email.com")
        return 2
    email = sys.argv[1].strip().lower()
    ensure_schema()
    user = get_user_for_login(email)
    if not user:
        print(f"Nenhuma conta com o e-mail {email}.")
        return 1

    print(f"Conta: {user.get('full_name')} ({email}) · usuário: {user.get('username')}")
    password = getpass.getpass("Nova senha: ")
    problem = password_problem(password)
    if problem:
        print(problem)
        return 1
    if getpass.getpass("Repita a senha: ") != password:
        print("As senhas não conferem.")
        return 1

    set_user_password(user["id"], hash_password(password))
    delete_user_sessions(user["id"])
    print("Senha definida. Entre no app com o e-mail e essa senha.")
    return 0


if __name__ == "__main__":
    sys.exit(main())
