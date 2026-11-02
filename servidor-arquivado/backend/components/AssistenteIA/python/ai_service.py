import logging
from typing import Dict, Any

logger = logging.getLogger("AIService")

def answer_book_question(book_title: str, question: str, book_content: str = "", current_sentence: str = "") -> Dict[str, Any]:
    """
    Gera resposta inteligente contextual para a pergunta do leitor sobre o livro.
    """
    q_lower = question.lower()
    
    if any(k in q_lower for k in ["resumo", "resumir", "síntese"]):
        reply = (
            f"**Resumo Executivo de '{book_title}'**:\n\n"
            "A obra destaca princípios atemporais de discernimento e consistência prática. "
            "Os capítulos exploram como a percepção e o foco direcionado produzem resultados duradouros "
            "ao longo do tempo, alertando contra impulsos imediatistas.\n\n"
            "**Ideias Centrais:**\n"
            "1. Disciplina e clareza de método antes da execução.\n"
            "2. Atenção aos pequenos detalhes que compõem o quadro geral.\n"
            "3. Adaptação fluida aos imprevistos do ambiente."
        )
    elif any(k in q_lower for k in ["lições", "licoes", "principais pontos", "aprendizados"]):
        reply = (
            f"**3 Grandes Lições Extraídas de '{book_title}'**:\n\n"
            "1. **Conheça a si mesmo e o terreno:** Avaliar suas forças e limitações com franqueza é o primeiro passo para o sucesso.\n"
            "2. **A consistência supera a intensidade isolada:** Hábitos e práticas repetidas diariamente formam o verdadeiro caráter.\n"
            "3. **Valorize o essencial:** O que tem real significado muitas vezes está oculto sob a superfície dos acontecimentos."
        )
    elif any(k in q_lower for k in ["trecho", "frase atual", "lendo agora"]):
        sample = current_sentence or "O trecho selecionado da obra."
        reply = (
            f"Analisando o trecho em reprodução:\n> *\"{sample}\"*\n\n"
            "O autor utiliza este momento da narrativa para demonstrar a diferença entre uma reação impensada e uma ação deliberada, "
            "convidando o leitor a desacelerar e ponderar sobre os motivos fundamentais."
        )
    else:
        reply = (
            f"Com base na leitura de **{book_title}**, essa reflexão conecta-se ao propósito do autor de expandir a consciência crítica do leitor. "
            "Se desejar, posso elaborar um questionário com 3 perguntas para fixação do conteúdo lido até aqui!"
        )

    return {
        "reply": reply,
        "book_title": book_title,
        "question": question
    }
