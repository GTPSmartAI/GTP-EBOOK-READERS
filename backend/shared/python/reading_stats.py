"""
Estatísticas de leitura do usuário (tela Configurações > Estatísticas e "palavras lidas" do Painel).

Os números vêm da tabela reading_stats, alimentada pelo app com o que a voz leu DE FATO:
palavras dos trechos que tocaram até o fim e o tempo real ouvindo. Pular capítulos não conta.

Períodos (calendário de Brasília), com offset para navegar para trás (0 = atual, -1 = anterior):
- day:   o dia; gráfico com os 7 dias até ele
- week:  segunda a domingo; gráfico por dia
- month: o mês; gráfico por dia
- year:  o ano; gráfico por mês
"""

from datetime import date, timedelta
from typing import Any, Callable, Dict, List

from mariadb_client import get_now_br


def _shift_month(d: date, months: int) -> date:
    index = d.year * 12 + (d.month - 1) + months
    return date(index // 12, index % 12 + 1, 1)


def _period_bounds(period: str, offset: int, today: date):
    """(início, fim, início do gráfico, granularidade do gráfico)"""
    if period == "day":
        day = today + timedelta(days=offset)
        return day, day, day - timedelta(days=6), "day"
    if period == "month":
        start = _shift_month(today.replace(day=1), offset)
        end = _shift_month(start, 1) - timedelta(days=1)
        return start, end, start, "day"
    if period == "year":
        start = date(today.year + offset, 1, 1)
        return start, date(start.year, 12, 31), start, "month"
    # week
    start = today - timedelta(days=today.weekday()) + timedelta(weeks=offset)
    return start, start + timedelta(days=6), start, "day"


def _as_date(value: Any) -> date:
    return value if isinstance(value, date) else date.fromisoformat(str(value)[:10])


def _streak(days: List[Any], today: date) -> int:
    """Dias seguidos com leitura, terminando hoje (ou ontem, se hoje ainda não leu)."""
    have = {_as_date(d) for d in days}
    cursor = today if today in have else today - timedelta(days=1)
    count = 0
    while cursor in have:
        count += 1
        cursor -= timedelta(days=1)
    return count


def build_stats(user_id: str, period: str, offset: int,
                fetch_rows: Callable[[str, str, str], List[Dict[str, Any]]],
                fetch_totals: Callable[[str], Dict[str, Any]]) -> Dict[str, Any]:
    if period not in ("day", "week", "month", "year"):
        period = "week"
    today = get_now_br().date()
    start, end, chart_start, grain = _period_bounds(period, offset, today)
    chart_end = end

    rows = fetch_rows(user_id, min(start, chart_start).isoformat(), max(end, chart_end).isoformat())

    # Gráfico: um ponto por dia (ou por mês no ano), inclusive os vazios
    series: List[Dict[str, Any]] = []
    if grain == "day":
        d = chart_start
        while d <= chart_end:
            series.append({"key": d.isoformat(), "words": 0, "seconds": 0, "future": d > today})
            d += timedelta(days=1)
    else:
        for m in range(1, 13):
            first = date(start.year, m, 1)
            series.append({"key": first.isoformat()[:7], "words": 0, "seconds": 0, "future": first > today})
    by_key = {p["key"]: p for p in series}

    totals = {"words": 0, "seconds": 0}
    active_days = set()
    books: Dict[str, Dict[str, Any]] = {}
    for r in rows:
        d = _as_date(r["stat_date"])
        words = int(r.get("words") or 0)
        seconds = int(r.get("seconds") or 0)
        point = by_key.get(d.isoformat() if grain == "day" else d.isoformat()[:7])
        if point is not None:
            point["words"] += words
            point["seconds"] += seconds
        if start <= d <= end:
            totals["words"] += words
            totals["seconds"] += seconds
            if words > 0 or seconds >= 30:
                active_days.add(d)
            b = books.setdefault(r["book_id"], {"book_id": r["book_id"], "title": r.get("title") or "Livro removido",
                                                "words": 0, "seconds": 0})
            b["words"] += words
            b["seconds"] += seconds

    elapsed_days = max(1, (min(end, today) - start).days + 1) if start <= today else 1
    lifetime = fetch_totals(user_id)
    return {
        "period": period,
        "offset": offset,
        "start": start.isoformat(),
        "end": end.isoformat(),
        "today": today.isoformat(),
        "totals": {
            "words": totals["words"],
            "seconds": totals["seconds"],
            "active_days": len(active_days),
            "books": sum(1 for b in books.values() if b["words"] > 0 or b["seconds"] > 0),
            "words_per_day": round(totals["words"] / elapsed_days),
        },
        "series": series,
        "books": sorted(books.values(), key=lambda b: (b["seconds"], b["words"]), reverse=True)[:5],
        "lifetime": {"words": lifetime["words"], "seconds": lifetime["seconds"]},
        "streak_days": _streak(lifetime["days"], today),
    }
