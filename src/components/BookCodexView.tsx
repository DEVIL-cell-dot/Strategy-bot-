import React, { useMemo, useState } from 'react';
import { Search } from 'lucide-react';
import { BOOK_PATTERNS_CODEX, CodexEntry } from '../engine/bookCodex';
import { PatternCategory, PatternId } from '../engine/types';

interface BookCodexViewProps {
  highlightedPatternId?: PatternId | null;
}

const CATEGORIES: { id: 'all' | PatternCategory; label: string }[] = [
  { id: 'all', label: 'All Patterns' },
  { id: 'umbrella', label: 'Umbrellas (Ch. 4)' },
  { id: 'reversal_dual', label: 'Dual Reversals (Ch. 4 & 6)' },
  { id: 'star', label: 'Stars (Ch. 5)' },
  { id: 'reversal_multi', label: 'Multi-Bar Reversals (Ch. 6)' },
  { id: 'continuation', label: 'Windows & Continuation (Ch. 7)' },
  { id: 'doji', label: 'Magic Doji (Ch. 8)' },
];

type MiniBar = { x: number; o: number; h: number; l: number; c: number; doji?: boolean };

function MiniPatternDiagram({ entry }: { entry: CodexEntry }) {
  const bars: MiniBar[] = useMemo(() => {
    switch (entry.id) {
      case 'hammer':
        return [
          { x: 18, o: 12, h: 10, l: 30, c: 28 },
          { x: 34, o: 28, h: 25, l: 38, c: 35 },
          { x: 52, o: 34, h: 33, l: 50, c: 39 },
        ];
      case 'hanging_man':
        return [
          { x: 18, o: 42, h: 26, l: 44, c: 28 },
          { x: 34, o: 28, h: 16, l: 30, c: 18 },
          { x: 52, o: 14, h: 12, l: 38, c: 19 },
        ];
      case 'shooting_star':
        return [
          { x: 18, o: 42, h: 28, l: 44, c: 30 },
          { x: 34, o: 30, h: 18, l: 32, c: 20 },
          { x: 54, o: 26, h: 8, l: 33, c: 31 },
        ];
      case 'inverted_hammer':
        return [
          { x: 18, o: 12, h: 10, l: 28, c: 26 },
          { x: 34, o: 26, h: 24, l: 42, c: 40 },
          { x: 54, o: 39, h: 18, l: 46, c: 44 },
        ];
      case 'bullish_engulfing':
        return [
          { x: 26, o: 24, h: 20, l: 38, c: 33 },
          { x: 48, o: 37, h: 14, l: 42, c: 17 },
        ];
      case 'bearish_engulfing':
        return [
          { x: 26, o: 32, h: 20, l: 36, c: 23 },
          { x: 48, o: 17, h: 12, l: 42, c: 39 },
        ];
      case 'dark_cloud_cover':
        return [
          { x: 28, o: 42, h: 14, l: 44, c: 16 },
          { x: 50, o: 10, h: 8, l: 36, c: 33 },
        ];
      case 'piercing_pattern':
        return [
          { x: 28, o: 14, h: 12, l: 42, c: 40 },
          { x: 50, o: 45, h: 19, l: 47, c: 22 },
        ];
      case 'morning_star':
      case 'morning_doji_star':
      case 'abandoned_baby_bottom':
        return [
          { x: 20, o: 12, h: 10, l: 34, c: 31 },
          { x: 42, o: 41, h: 36, l: 48, c: entry.id === 'morning_star' ? 39 : 41, doji: entry.id !== 'morning_star' },
          { x: 64, o: 32, h: 14, l: 35, c: 16 },
        ];
      case 'evening_star':
      case 'evening_doji_star':
      case 'abandoned_baby_top':
        return [
          { x: 20, o: 42, h: 18, l: 44, c: 21 },
          { x: 42, o: 12, h: 6, l: 17, c: entry.id === 'evening_star' ? 14 : 12, doji: entry.id !== 'evening_star' },
          { x: 64, o: 20, h: 18, l: 42, c: 38 },
        ];
      case 'rising_window':
      case 'high_price_gapping_play':
        return [
          { x: 28, o: 44, h: 30, l: 46, c: 32 },
          { x: 54, o: 20, h: 8, l: 23, c: 10 },
        ];
      case 'falling_window':
      case 'low_price_gapping_play':
        return [
          { x: 28, o: 10, h: 8, l: 22, c: 20 },
          { x: 54, o: 34, h: 30, l: 46, c: 44 },
        ];
      case 'rising_three_methods':
        return [
          { x: 14, o: 42, h: 14, l: 44, c: 17 },
          { x: 30, o: 21, h: 19, l: 27, c: 25 },
          { x: 42, o: 26, h: 24, l: 33, c: 31 },
          { x: 54, o: 31, h: 29, l: 37, c: 35 },
          { x: 70, o: 32, h: 7, l: 34, c: 9 },
        ];
      case 'falling_three_methods':
        return [
          { x: 14, o: 12, h: 10, l: 40, c: 37 },
          { x: 30, o: 33, h: 27, l: 35, c: 29 },
          { x: 42, o: 29, h: 22, l: 31, c: 24 },
          { x: 54, o: 24, h: 17, l: 26, c: 19 },
          { x: 70, o: 22, h: 20, l: 48, c: 45 },
        ];
      case 'gravestone_doji':
        return [
          { x: 28, o: 44, h: 24, l: 46, c: 26 },
          { x: 52, o: 42, h: 9, l: 43, c: 42, doji: true },
        ];
      case 'dragonfly_doji':
        return [
          { x: 28, o: 12, h: 10, l: 32, c: 30 },
          { x: 52, o: 14, h: 13, l: 46, c: 14, doji: true },
        ];
      case 'long_legged_doji':
        return [
          { x: 28, o: 40, h: 20, l: 42, c: 22 },
          { x: 52, o: 24, h: 7, l: 45, c: 24, doji: true },
        ];
      case 'tri_star_top':
        return [
          { x: 22, o: 28, h: 21, l: 35, c: 28, doji: true },
          { x: 42, o: 16, h: 9, l: 23, c: 16, doji: true },
          { x: 62, o: 29, h: 22, l: 36, c: 29, doji: true },
        ];
      case 'tri_star_bottom':
        return [
          { x: 22, o: 24, h: 17, l: 31, c: 24, doji: true },
          { x: 42, o: 38, h: 31, l: 46, c: 38, doji: true },
          { x: 62, o: 23, h: 16, l: 30, c: 23, doji: true },
        ];
      case 'harami_bearish':
      case 'harami_cross_bearish':
        return [
          { x: 28, o: 44, h: 10, l: 46, c: 12 },
          { x: 50, o: 26, h: 21, l: 32, c: entry.id === 'harami_cross_bearish' ? 26 : 30, doji: entry.id === 'harami_cross_bearish' },
        ];
      case 'harami_bullish':
      case 'harami_cross_bullish':
        return [
          { x: 28, o: 10, h: 8, l: 44, c: 42 },
          { x: 50, o: 26, h: 20, l: 32, c: entry.id === 'harami_cross_bullish' ? 26 : 22, doji: entry.id === 'harami_cross_bullish' },
        ];
      default:
        return entry.bias === 'bullish'
          ? [
              { x: 22, o: 14, h: 12, l: 36, c: 33 },
              { x: 42, o: 34, h: 30, l: 45, c: 42 },
              { x: 62, o: 40, h: 15, l: 43, c: 18 },
            ]
          : entry.bias === 'bearish'
          ? [
              { x: 22, o: 40, h: 18, l: 42, c: 21 },
              { x: 42, o: 20, h: 9, l: 24, c: 12 },
              { x: 62, o: 15, h: 13, l: 40, c: 37 },
            ]
          : [
              { x: 26, o: 42, h: 14, l: 44, c: 16 },
              { x: 52, o: 16, h: 9, l: 24, c: 16, doji: true },
            ];
    }
  }, [entry.id, entry.bias]);

  return (
    <svg width="84" height="54" viewBox="0 0 84 54" className="rounded border border-slate-800 bg-[#0B0F19] shrink-0">
      {bars.map((b, i) => {
        const isWhite = b.c < b.o;
        const top = Math.min(b.o, b.c);
        const h = Math.max(2, Math.abs(b.c - b.o));
        return (
          <g key={i}>
            <line x1={b.x} y1={b.h} x2={b.x} y2={b.l} stroke={isWhite ? '#F8FAFC' : '#94A3B8'} strokeWidth={1.3} />
            {b.doji ? (
              <line x1={b.x - 6} y1={b.o} x2={b.x + 6} y2={b.o} stroke="#F8FAFC" strokeWidth={1.8} />
            ) : (
              <rect
                x={b.x - 5}
                y={top}
                width={10}
                height={h}
                fill={isWhite ? '#0B0F19' : '#94A3B8'}
                stroke={isWhite ? '#F8FAFC' : '#CBD5E1'}
                strokeWidth={1.2}
              />
            )}
          </g>
        );
      })}
    </svg>
  );
}

export const BookCodexView: React.FC<BookCodexViewProps> = ({ highlightedPatternId }) => {
  const [query, setQuery] = useState('');
  const [category, setCategory] = useState<'all' | PatternCategory>('all');

  const entries = useMemo(() => {
    const q = query.trim().toLowerCase();
    return BOOK_PATTERNS_CODEX.filter((entry) => {
      if (category !== 'all' && entry.category !== category) return false;
      if (!q) return true;
      return (
        entry.name.toLowerCase().includes(q) ||
        (entry.japaneseName?.toLowerCase().includes(q) ?? false) ||
        entry.chapter.toLowerCase().includes(q) ||
        entry.criteria.some((c) => c.toLowerCase().includes(q)) ||
        entry.confirmationRule.toLowerCase().includes(q)
      );
    });
  }, [query, category]);

  return (
    <div className="space-y-5">
      {/* Header & Search */}
      <div className="rounded-lg border border-slate-800 bg-[#111827] p-5 space-y-4">
        <div className="flex flex-wrap items-center justify-between gap-4">
          <div>
            <h1 className="font-display text-lg font-bold text-slate-100">
              Steve Nison 2nd Edition — Complete Pattern & Rule Codex
            </h1>
            <p className="text-xs text-slate-400 mt-0.5">
              {BOOK_PATTERNS_CODEX.length} canonical candlestick patterns, confirmation gates, and S/R rules wired directly into the deterministic signal bot.
            </p>
          </div>
          <div className="relative w-full sm:w-72">
            <Search className="w-4 h-4 text-slate-500 absolute left-3 top-1/2 -translate-y-1/2" />
            <input
              type="text"
              value={query}
              onChange={(e) => setQuery(e.target.value)}
              placeholder="Search pattern, rule, or Japanese name..."
              className="w-full rounded-md border border-slate-700 bg-[#0B0F19] pl-9 pr-3 py-1.5 text-xs text-slate-100 placeholder:text-slate-500 focus:border-emerald-400 focus:outline-none"
            />
          </div>
        </div>

        <div className="flex flex-wrap gap-1.5">
          {CATEGORIES.map((cat) => (
            <button
              key={cat.id}
              type="button"
              onClick={() => setCategory(cat.id)}
              className={`rounded px-2.5 py-1.5 text-xs font-medium whitespace-nowrap cursor-pointer border ${
                category === cat.id
                  ? 'border-slate-200 bg-slate-100 text-slate-950'
                  : 'border-slate-700 bg-[#0B0F19] text-slate-300 hover:bg-slate-800'
              }`}
            >
              {cat.label}
            </button>
          ))}
        </div>
      </div>

      {/* Codex Grid */}
      <div className="grid grid-cols-1 md:grid-cols-2 gap-4">
        {entries.map((entry) => {
          const isHighlighted = highlightedPatternId === entry.id;
          return (
            <article
              key={entry.id}
              className={`rounded-lg border bg-[#111827] p-4 flex flex-col gap-3 ${
                isHighlighted ? 'border-emerald-400 ring-1 ring-emerald-400' : 'border-slate-800'
              }`}
            >
              <div className="flex items-start justify-between gap-3">
                <div className="space-y-1">
                  <div className="flex flex-wrap items-center gap-x-2 gap-y-0.5">
                    <h2 className="font-display text-sm font-bold text-slate-100">
                      {entry.name}
                    </h2>
                    {entry.japaneseName && (
                      <span className="text-xs text-slate-400">· {entry.japaneseName}</span>
                    )}
                  </div>
                  <div className="text-[11.5px] font-medium text-slate-400">
                    <span
                      className={
                        entry.bias === 'bullish'
                          ? 'text-emerald-400 font-semibold'
                          : entry.bias === 'bearish'
                          ? 'text-red-400 font-semibold'
                          : 'text-amber-400 font-semibold'
                      }
                    >
                      {entry.bias === 'bullish'
                        ? 'Bullish'
                        : entry.bias === 'bearish'
                        ? 'Bearish'
                        : 'Neutral / Warning'}
                    </span>
                    {' · '}
                    <span>{entry.chapter}</span>
                    {' · '}
                    <span className="font-mono">{entry.pages}</span>
                  </div>
                  <div className="text-[11.5px] text-slate-400">
                    Required Context: <span className="text-slate-200 font-medium">{entry.trendRequired}</span>
                  </div>
                </div>
                <MiniPatternDiagram entry={entry} />
              </div>

              <ul className="space-y-1 border-t border-slate-800 pt-2.5 text-xs text-slate-300 list-disc pl-4">
                {entry.criteria.map((c, idx) => (
                  <li key={idx}>{c}</li>
                ))}
              </ul>

              <div className="mt-auto border-t border-slate-800 pt-2.5 space-y-1 text-[11.5px] leading-snug text-slate-400">
                <div>
                  <span className="font-semibold text-slate-200">Confirmation:</span> {entry.confirmationRule}
                </div>
                <div>
                  <span className="font-semibold text-slate-200">Support / Resistance:</span> {entry.srRule}
                </div>
              </div>
            </article>
          );
        })}
      </div>
    </div>
  );
};
