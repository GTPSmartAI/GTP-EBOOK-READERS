import React, { useCallback, useEffect, useLayoutEffect, useMemo, useRef, useState } from 'react';
import type { Book, ReaderSettings } from '../types';
import { Play, Sparkles, BookOpen, Clock, Bookmark } from 'lucide-react';
import { speechEngine } from '../services/speechEngine';

interface ReaderViewProps {
  book: Book;
  currentSentenceIndex: number;
  settings: ReaderSettings;
  onSentenceClick: (sentenceIndex: number) => void;
  onPlayChapter: (startIndex: number) => void;
  onWordClick?: (sentenceIndex: number, wordIndex: number, word: string) => void;
  contentLoad?: { progress: number; failed: boolean } | null;
  onRetryContent?: () => void;
}

interface ParagraphInfo {
  start: number; // primeira unidade (inclusive)
  end: number; // última unidade (exclusive)
  heading: boolean;
}

// Rolagem infinita com "janela": só uma faixa de parágrafos fica no DOM (livros têm 100 mil+ trechos)
const WINDOW_BEFORE = 30; // parágrafos acima do trecho atual ao (re)centralizar
const WINDOW_AFTER = 70; // parágrafos abaixo
const EXTEND_BY = 50; // parágrafos acrescentados quando a rolagem chega perto da borda
const MAX_RENDERED = 260; // acima disso, descarta o lado mais distante da tela
const EDGE_PX = 1600; // distância da borda que dispara o carregamento
const FOLLOW_LINE_AT = 0.35; // altura da tela (fração, de cima) onde fica a linha que a voz está lendo

const FONT_FAMILY = { sans: 'var(--font-sans)', serif: 'var(--font-serif)', mono: 'var(--font-mono)' };
const MAX_WIDTH = { narrow: '620px', medium: '740px', wide: '900px', full: '100%' };

/** Parágrafos do livro: estrutura do backend ou, em livros antigos, marcação por "\n" / grupos de 4 frases */
function buildParagraphs(book: Book): ParagraphInfo[] {
  const total = book.sentences?.length || 0;
  const kinds = book.sentenceKinds;
  const result: ParagraphInfo[] = [];

  if (book.paragraphStarts?.length) {
    const starts = book.paragraphStarts;
    for (let p = 0; p < starts.length; p++) {
      const start = starts[p];
      const end = p + 1 < starts.length ? starts[p + 1] : total;
      if (end > start) result.push({ start, end, heading: kinds?.[start] === 'h' });
    }
    return result;
  }

  const hasMarks = (book.sentences || []).some((s) => /\n\s*$/.test(s));
  let start = 0;
  for (let i = 0; i < total; i++) {
    const endsHere = hasMarks ? /\n\s*$/.test(book.sentences[i]) : i - start + 1 >= 4;
    if (endsHere || i === total - 1) {
      result.push({ start, end: i + 1, heading: false });
      start = i + 1;
    }
  }
  return result;
}

/** Índice do parágrafo que contém a unidade (busca binária) */
function paragraphIndexOf(paragraphs: ParagraphInfo[], unitIndex: number): number {
  let lo = 0;
  let hi = paragraphs.length - 1;
  while (lo < hi) {
    const mid = (lo + hi + 1) >> 1;
    if (paragraphs[mid].start <= unitIndex) lo = mid;
    else hi = mid - 1;
  }
  return Math.max(0, lo);
}

export const ReaderView: React.FC<ReaderViewProps> = ({
  book,
  currentSentenceIndex,
  settings,
  onSentenceClick,
  onPlayChapter,
  onWordClick,
  contentLoad,
  onRetryContent,
}) => {
  const scrollRef = useRef<HTMLElement | null>(null);
  const activeSentenceRef = useRef<HTMLSpanElement | null>(null);
  const [isDetachedFromVoice, setIsDetachedFromVoice] = useState(false);
  const detachTimeoutRef = useRef<ReturnType<typeof setTimeout> | null>(null);

  const paragraphs = useMemo(() => buildParagraphs(book), [book.sentences, book.paragraphStarts, book.sentenceKinds]);

  const chapters = useMemo(
    () => (book.chapters?.length ? book.chapters : [{ id: 'ch-1', title: 'Início', startIndex: 0 }]),
    [book.chapters]
  );
  const chapterByStart = useMemo(() => {
    const map = new Map<number, { title: string; number: number }>();
    chapters.forEach((ch, i) => {
      // O capítulo aparece antes do parágrafo que contém a unidade inicial dele
      const p = paragraphIndexOf(paragraphs, ch.startIndex);
      if (paragraphs[p] && !map.has(paragraphs[p].start)) {
        map.set(paragraphs[p].start, { title: ch.title, number: i + 1 });
      }
    });
    return map;
  }, [chapters, paragraphs]);

  const activeChapterIndex = useMemo(() => {
    for (let i = chapters.length - 1; i >= 0; i--) {
      if (currentSentenceIndex >= chapters[i].startIndex) return i;
    }
    return 0;
  }, [chapters, currentSentenceIndex]);
  const currentChapter = chapters[activeChapterIndex];

  // ------------------------------------------------------------------ janela de parágrafos
  const centeredRange = useCallback(
    (unitIndex: number) => {
      const p = paragraphIndexOf(paragraphs, unitIndex);
      return {
        first: Math.max(0, p - WINDOW_BEFORE),
        last: Math.min(paragraphs.length, p + WINDOW_AFTER),
      };
    },
    [paragraphs]
  );
  const [range, setRange] = useState(() => centeredRange(currentSentenceIndex));
  // Âncora para manter o texto parado na tela quando parágrafos entram/saem acima dele
  const pendingAnchor = useRef<{ id: string; top: number } | null>(null);

  // Livro trocou: recentraliza
  useEffect(() => {
    setRange(centeredRange(currentSentenceIndex));
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [book.id, paragraphs.length]);

  const rangeRef = useRef(range);
  rangeRef.current = range;
  const isOutsideWindow = (unitIndex: number) => {
    const p = paragraphIndexOf(paragraphs, unitIndex);
    return p < rangeRef.current.first || p >= rangeRef.current.last;
  };

  // A leitura foi para fora da janela: recentraliza lá.
  // Avanço normal da voz (+1 trecho) com o usuário rolando o texto por conta própria não puxa a tela;
  // um salto (capítulo, 15s, índice) sempre leva até o trecho.
  const previousIndexRef = useRef(currentSentenceIndex);
  useEffect(() => {
    const isJump = Math.abs(currentSentenceIndex - previousIndexRef.current) > 1;
    previousIndexRef.current = currentSentenceIndex;
    if (!paragraphs.length) return;
    if (isJump) setIsDetachedFromVoice(false);
    else if (isDetachedFromVoice) return;
    if (isOutsideWindow(currentSentenceIndex)) {
      pendingAnchor.current = null;
      setRange(centeredRange(currentSentenceIndex));
    }
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [currentSentenceIndex, paragraphs, centeredRange]);

  // Ao abrir o livro, posiciona a tela no trecho onde a leitura parou
  const positionedBookRef = useRef<string | null>(null);
  useLayoutEffect(() => {
    if (positionedBookRef.current === book.id || !activeSentenceRef.current) return;
    positionedBookRef.current = book.id;
    activeSentenceRef.current.scrollIntoView({ block: 'center' });
  });

  const captureAnchor = () => {
    const container = scrollRef.current;
    if (!container) return;
    const containerTop = container.getBoundingClientRect().top;
    const blocks = container.querySelectorAll<HTMLElement>('[data-para]');
    for (const el of Array.from(blocks)) {
      const rect = el.getBoundingClientRect();
      if (rect.bottom > containerTop) {
        pendingAnchor.current = { id: el.id, top: rect.top - containerTop };
        return;
      }
    }
  };

  const checkEdges = useCallback(() => {
    const container = scrollRef.current;
    if (!container) return;
    const { scrollTop, scrollHeight, clientHeight } = container;

    if (scrollHeight - (scrollTop + clientHeight) < EDGE_PX && range.last < paragraphs.length) {
      captureAnchor();
      setRange((r) => {
        const last = Math.min(paragraphs.length, r.last + EXTEND_BY);
        const first = last - r.first > MAX_RENDERED ? last - MAX_RENDERED : r.first;
        return { first, last };
      });
    } else if (scrollTop < EDGE_PX && range.first > 0) {
      captureAnchor();
      setRange((r) => {
        const first = Math.max(0, r.first - EXTEND_BY);
        const last = r.last - first > MAX_RENDERED ? first + MAX_RENDERED : r.last;
        return { first, last };
      });
    }
  }, [range.first, range.last, paragraphs.length]);

  // Depois de acrescentar/descartar parágrafos, devolve o texto âncora ao mesmo ponto da tela
  useLayoutEffect(() => {
    const container = scrollRef.current;
    const anchor = pendingAnchor.current;
    if (container && anchor) {
      const el = document.getElementById(anchor.id);
      if (el) {
        const delta = el.getBoundingClientRect().top - container.getBoundingClientRect().top - anchor.top;
        container.scrollTop += delta;
      }
      pendingAnchor.current = null;
    }
    checkEdges(); // janela ainda pequena para a tela? carrega mais
  }, [range.first, range.last]);

  // ------------------------------------------------------------------ rolagem manual x acompanhar a voz
  const markDetached = useCallback(() => {
    setIsDetachedFromVoice(true);
    if (detachTimeoutRef.current) clearTimeout(detachTimeoutRef.current);
    detachTimeoutRef.current = setTimeout(() => setIsDetachedFromVoice(false), 12000);
  }, []);

  useEffect(() => {
    const container = scrollRef.current;
    if (!container) return;
    let frame = 0;
    const onScroll = () => {
      if (frame) return;
      frame = requestAnimationFrame(() => {
        frame = 0;
        checkEdges();
      });
    };
    container.addEventListener('scroll', onScroll, { passive: true });
    container.addEventListener('wheel', markDetached, { passive: true });
    container.addEventListener('touchmove', markDetached, { passive: true });
    return () => {
      container.removeEventListener('scroll', onScroll);
      container.removeEventListener('wheel', markDetached);
      container.removeEventListener('touchmove', markDetached);
      if (frame) cancelAnimationFrame(frame);
    };
  }, [checkEdges, markDetached]);

  useEffect(() => () => {
    if (detachTimeoutRef.current) clearTimeout(detachTimeoutRef.current);
  }, []);

  // Destaque da palavra falada: muda só a classe no DOM, a cada quadro (sem re-renderizar o React).
  // Acompanhar a voz: a cada linha nova, o texto sobe para a linha lida ficar sempre na mesma altura da tela.
  const followRef = useRef(false);
  followRef.current = settings.autoScroll && !isDetachedFromVoice;
  useEffect(() => {
    let frame = 0;
    let lastId = '';
    let lastEl: HTMLElement | null = null;
    let lastLineTop = NaN;
    const followLine = (el: HTMLElement) => {
      const container = scrollRef.current;
      if (!container || !followRef.current) return;
      const box = container.getBoundingClientRect();
      const rect = el.getBoundingClientRect();
      // Posição da linha no texto (não na tela): muda só quando a palavra passa para outra linha
      const lineTop = rect.top - box.top + container.scrollTop;
      if (Math.abs(lineTop - lastLineTop) < rect.height / 2) return;
      lastLineTop = lineTop;
      const delta = rect.top - (box.top + box.height * FOLLOW_LINE_AT);
      if (Math.abs(delta) > 2) container.scrollBy({ top: delta, behavior: 'smooth' });
    };
    const tick = () => {
      const spoken = speechEngine.getSpokenWord();
      const id = spoken ? `word-anchor-${spoken.sentenceIndex}-${spoken.wordIndex}` : '';
      if (id !== lastId || (lastEl && !lastEl.isConnected)) {
        lastEl?.classList.remove('spoken');
        lastEl = id ? document.getElementById(id) : null;
        lastEl?.classList.add('spoken');
        lastId = id;
        if (lastEl) followLine(lastEl);
        else lastLineTop = NaN;
      }
      frame = requestAnimationFrame(tick);
    };
    frame = requestAnimationFrame(tick);
    return () => {
      cancelAnimationFrame(frame);
      lastEl?.classList.remove('spoken');
    };
  }, []);

  // Trecho novo fora da tela (salto, play, voz ainda carregando): leva o começo dele até a altura de leitura.
  // Dentro do trecho, quem sobe o texto linha a linha é o destaque da palavra (acima).
  useEffect(() => {
    if (!settings.autoScroll || isDetachedFromVoice) return;
    const container = scrollRef.current;
    const target = activeSentenceRef.current;
    if (!container || !target) return;
    const box = container.getBoundingClientRect();
    const rect = target.getBoundingClientRect();
    if (rect.top < box.top + 90 || rect.top > box.bottom - 140) {
      container.scrollBy({ top: rect.top - (box.top + box.height * FOLLOW_LINE_AT), behavior: 'smooth' });
    }
  }, [currentSentenceIndex, settings.autoScroll, isDetachedFromVoice, range.first, range.last]);

  const handleSyncWithVoice = () => {
    setIsDetachedFromVoice(false);
    if (isOutsideWindow(currentSentenceIndex)) {
      // O efeito de acompanhar a voz rola até o trecho quando a janela nova for desenhada
      pendingAnchor.current = null;
      setRange(centeredRange(currentSentenceIndex));
      return;
    }
    activeSentenceRef.current?.scrollIntoView({ behavior: 'smooth', block: 'center' });
  };

  const jumpToChapter = (idx: number) => {
    const ch = chapters[idx];
    if (!ch) return;
    setIsDetachedFromVoice(false);
    onSentenceClick(ch.startIndex);
  };

  // ------------------------------------------------------------------ render
  const renderUnits = (paragraph: ParagraphInfo) => {
    const units: React.ReactNode[] = [];
    for (let index = paragraph.start; index < paragraph.end; index++) {
      const cleanText = (book.sentences[index] || '').replace(/[\r\n]+/g, ' ').trim();
      if (!cleanText) continue;
      const isActive = index === currentSentenceIndex;
      const tokens = cleanText.split(/(\s+)/);
      let wordIdx = 0;
      units.push(
        <React.Fragment key={index}>
          <span
            id={`sentence-anchor-${index}`}
            ref={isActive ? activeSentenceRef : null}
            onClick={() => {
              setIsDetachedFromVoice(false);
              onSentenceClick(index);
            }}
            className={`reading-sentence ${isActive ? 'active' : ''}`}
          >
            {tokens.map((token, tIdx) => {
              if (/^\s+$/.test(token)) return <React.Fragment key={tIdx}>{token}</React.Fragment>;
              const wordIndex = wordIdx++;
              return (
                <span
                  key={tIdx}
                  id={`word-anchor-${index}-${wordIndex}`}
                  className="clickable-word"
                  onClick={(e) => {
                    e.stopPropagation();
                    setIsDetachedFromVoice(false);
                    if (onWordClick) onWordClick(index, wordIndex, token);
                    else onSentenceClick(index);
                  }}
                >
                  {token}
                </span>
              );
            })}
          </span>{' '}
        </React.Fragment>
      );
    }
    return units;
  };

  const blocks: React.ReactNode[] = [];
  for (let p = range.first; p < range.last; p++) {
    const paragraph = paragraphs[p];
    const chapter = chapterByStart.get(paragraph.start);
    if (chapter) {
      blocks.push(
        <div key={`ch-${paragraph.start}`} id={`chapter-anchor-${paragraph.start}`} className="chapter-divider">
          <span className="chapter-divider-label">Capítulo {chapter.number}</span>
          {!paragraph.heading && <span className="chapter-divider-title">{chapter.title}</span>}
        </div>
      );
    }
    blocks.push(
      <p
        key={`p-${paragraph.start}`}
        id={`para-${paragraph.start}`}
        data-para=""
        className={paragraph.heading ? 'reading-heading' : 'reading-paragraph'}
        style={
          paragraph.heading
            ? { fontSize: `${settings.fontSize * 1.3}px` }
            : { fontSize: `${settings.fontSize}px`, lineHeight: settings.lineHeight }
        }
      >
        {renderUnits(paragraph)}
      </p>
    );
  }

  return (
    <main
      ref={scrollRef}
      id="reader-scroll-container"
      className="reader-scroll"
      style={{ fontFamily: FONT_FAMILY[settings.fontFamily] }}
    >
      <div className="reader-column" style={{ maxWidth: MAX_WIDTH[settings.readingWidth] }}>
        {/* Barra fixa: capítulo atual */}
        <div className="reader-chapter-bar">
          <div className="reader-chapter-bar-text">
            <span className="reader-chapter-bar-label">
              Capítulo {activeChapterIndex + 1} de {chapters.length}
            </span>
            <span className="reader-chapter-bar-title">{currentChapter.title}</span>
          </div>
          <div className="reader-chapter-bar-actions">
            <button onClick={() => jumpToChapter(activeChapterIndex - 1)} disabled={activeChapterIndex === 0} title="Capítulo anterior">‹</button>
            <button
              className="primary"
              onClick={() => {
                setIsDetachedFromVoice(false);
                onPlayChapter(currentChapter.startIndex);
              }}
              title="Ouvir este capítulo do início"
            >
              <Play size={12} fill="currentColor" />
            </button>
            <button onClick={() => jumpToChapter(activeChapterIndex + 1)} disabled={activeChapterIndex >= chapters.length - 1} title="Próximo capítulo">›</button>
          </div>
        </div>

        {/* Capa: só no começo do livro */}
        {range.first === 0 && (
          <header className="reader-book-header">
            {book.coverImage ? (
              <img className="reader-book-cover" src={book.coverImage} alt={book.title} />
            ) : (
              <div className="reader-book-cover placeholder" style={{ background: book.coverGradient }}>
                {String(book.type).toUpperCase()}
              </div>
            )}
            <h1 style={{ fontSize: `${Math.round(settings.fontSize * 1.5)}px` }}>{book.title}</h1>
            <p className="reader-book-author">{book.author}</p>
            <div className="reader-book-meta">
              <span><BookOpen size={13} /> {book.totalWords.toLocaleString('pt-BR')} palavras</span>
              <span><Clock size={13} /> ~{book.durationMinutes} min</span>
              <span><Bookmark size={13} /> {chapters.length} capítulos</span>
            </div>
          </header>
        )}

        <div className="reader-text">
          {paragraphs.length === 0 ? (
            contentLoad?.failed ? (
              <div className="reader-empty">
                <p>Não foi possível baixar o texto do livro. Verifique a internet.</p>
                {onRetryContent && (
                  <button className="reader-retry-button" onClick={onRetryContent}>Tentar de novo</button>
                )}
              </div>
            ) : (
              <div className="reader-empty">
                <p>
                  {contentLoad && contentLoad.progress > 0
                    ? `Baixando o livro... ${Math.round(contentLoad.progress * 100)}%`
                    : 'Carregando o texto do livro...'}
                </p>
                {contentLoad && contentLoad.progress > 0 && (
                  <div className="reader-load-bar">
                    <div style={{ width: `${Math.round(contentLoad.progress * 100)}%` }} />
                  </div>
                )}
              </div>
            )
          ) : (
            blocks
          )}
        </div>

        {range.last >= paragraphs.length && paragraphs.length > 0 && (
          <div className="reader-end">Fim do livro 🎉</div>
        )}
      </div>

      {isDetachedFromVoice && (
        <button className="reader-sync-button" onClick={handleSyncWithVoice} title="Voltar para onde a voz está lendo">
          <Sparkles size={14} />
          <span>Voltar para a leitura</span>
        </button>
      )}
    </main>
  );
};
