import React, { useMemo, useState } from 'react';
import { DISCIPLINE_RULES } from '../engine/bookCodex';

type TargetMethod = 'box_breakout' | 'swing_target' | 'flag_pennant' | 'triangle';

export const TargetsAndDisciplineView: React.FC = () => {
  const [method, setMethod] = useState<TargetMethod>('box_breakout');
  const [direction, setDirection] = useState<'up' | 'down'>('up');
  const [levelA, setLevelA] = useState('100.00');
  const [levelB, setLevelB] = useState('112.00');
  const [breakoutPrice, setBreakoutPrice] = useState('112.50');

  const calc = useMemo(() => {
    const a = Number(levelA);
    const b = Number(levelB);
    const br = Number(breakoutPrice);
    if (![a, b, br].every(Number.isFinite)) return null;

    const span = Math.abs(b - a);
    if (method === 'box_breakout') {
      const top = Math.max(a, b);
      const bottom = Math.min(a, b);
      const target = direction === 'up' ? top + span : bottom - span;
      return {
        span,
        target,
        explanation:
          direction === 'up'
            ? `Box Top (${top.toFixed(2)}) + Box Height (${span.toFixed(2)}) = ${target.toFixed(2)} (Ch. 16, p. 250)`
            : `Box Bottom (${bottom.toFixed(2)}) - Box Height (${span.toFixed(2)}) = ${target.toFixed(2)} (Ch. 16, p. 250)`,
      };
    }

    if (method === 'swing_target') {
      const target = direction === 'up' ? Math.max(a, b) + span : Math.min(a, b) - span;
      return {
        span,
        target,
        explanation:
          direction === 'up'
            ? `Prior Swing High (${Math.max(a, b).toFixed(2)}) + Prior Swing Amplitude (${span.toFixed(2)}) = ${target.toFixed(2)} (Ch. 16, p. 255)`
            : `Prior Swing Low (${Math.min(a, b).toFixed(2)}) - Prior Swing Amplitude (${span.toFixed(2)}) = ${target.toFixed(2)} (Ch. 16, p. 255)`,
      };
    }

    if (method === 'flag_pennant') {
      const target = direction === 'up' ? br + span : br - span;
      return {
        span,
        target,
        explanation:
          direction === 'up'
            ? `Flag Breakout (${br.toFixed(2)}) + Flagpole Height (${span.toFixed(2)}) = ${target.toFixed(2)} (Ch. 16, p. 252)`
            : `Flag Breakdown (${br.toFixed(2)}) - Flagpole Height (${span.toFixed(2)}) = ${target.toFixed(2)} (Ch. 16, p. 252)`,
      };
    }

    const target = direction === 'up' ? br + span : br - span;
    return {
      span,
      target,
      explanation: `Triangle Breakout (${br.toFixed(2)}) ${direction === 'up' ? '+' : '-'} Widest Triangle Base (${span.toFixed(2)}) = ${target.toFixed(2)} (Ch. 16, p. 256)`,
    };
  }, [method, direction, levelA, levelB, breakoutPrice]);

  return (
    <div className="grid grid-cols-1 lg:grid-cols-12 gap-6">
      {/* Chapter 16 Measured Move Target Calculator */}
      <div className="lg:col-span-5 rounded-lg border border-slate-800 bg-[#111827] p-5 space-y-4">
        <div className="border-b border-slate-800 pb-3">
          <h2 className="font-display text-base font-bold text-slate-100">
            Chapter 16: Measured Price Target Calculator
          </h2>
          <p className="text-xs text-slate-400 mt-1">
            "Candles do not give price targets." Use Western measured-move geometry (pp. 249–260) alongside candle entry/exit signals.
          </p>
        </div>

        <div className="space-y-3">
          <div>
            <label className="block text-xs font-medium text-slate-300 mb-1.5">
              Measured Move Technique
            </label>
            <div className="grid grid-cols-2 gap-1.5">
              {(
                [
                  { id: 'box_breakout', label: 'Box Range Breakout' },
                  { id: 'swing_target', label: 'Swing Target' },
                  { id: 'flag_pennant', label: 'Flag / Pennant' },
                  { id: 'triangle', label: 'Triangle Base' },
                ] as { id: TargetMethod; label: string }[]
              ).map((m) => (
                <button
                  key={m.id}
                  type="button"
                  onClick={() => setMethod(m.id)}
                  className={`rounded px-2.5 py-2 text-xs font-medium border cursor-pointer ${
                    method === m.id
                      ? 'border-slate-200 bg-slate-100 text-slate-950'
                      : 'border-slate-700 bg-[#0B0F19] text-slate-300 hover:bg-slate-800'
                  }`}
                >
                  {m.label}
                </button>
              ))}
            </div>
          </div>

          <div>
            <label className="block text-xs font-medium text-slate-300 mb-1.5">
              Breakout Direction
            </label>
            <div className="grid grid-cols-2 gap-1.5">
              <button
                type="button"
                onClick={() => setDirection('up')}
                className={`rounded py-1.5 text-xs font-semibold border cursor-pointer ${
                  direction === 'up'
                    ? 'border-emerald-500 bg-emerald-600 text-white'
                    : 'border-slate-700 bg-[#0B0F19] text-slate-300'
                }`}
              >
                Upside Breakout
              </button>
              <button
                type="button"
                onClick={() => setDirection('down')}
                className={`rounded py-1.5 text-xs font-semibold border cursor-pointer ${
                  direction === 'down'
                    ? 'border-red-500 bg-red-600 text-white'
                    : 'border-slate-700 bg-[#0B0F19] text-slate-300'
                }`}
              >
                Downside Breakdown
              </button>
            </div>
          </div>

          <div className="grid grid-cols-1 sm:grid-cols-3 gap-2.5">
            <div>
              <label className="block text-[11px] font-medium text-slate-400 mb-1">
                {method === 'flag_pennant' ? 'Pole Start' : method === 'triangle' ? 'Base Low' : 'Range Low'}
              </label>
              <input
                type="number"
                step="0.01"
                value={levelA}
                onChange={(e) => setLevelA(e.target.value)}
                className="w-full rounded border border-slate-700 bg-[#0B0F19] px-2.5 py-1.5 font-mono text-xs text-slate-100 tabular-nums focus:border-emerald-400 focus:outline-none"
              />
            </div>
            <div>
              <label className="block text-[11px] font-medium text-slate-400 mb-1">
                {method === 'flag_pennant' ? 'Pole End' : method === 'triangle' ? 'Base High' : 'Range High'}
              </label>
              <input
                type="number"
                step="0.01"
                value={levelB}
                onChange={(e) => setLevelB(e.target.value)}
                className="w-full rounded border border-slate-700 bg-[#0B0F19] px-2.5 py-1.5 font-mono text-xs text-slate-100 tabular-nums focus:border-emerald-400 focus:outline-none"
              />
            </div>
            <div>
              <label className="block text-[11px] font-medium text-slate-400 mb-1">
                Breakout Price
              </label>
              <input
                type="number"
                step="0.01"
                value={breakoutPrice}
                onChange={(e) => setBreakoutPrice(e.target.value)}
                className="w-full rounded border border-slate-700 bg-[#0B0F19] px-2.5 py-1.5 font-mono text-xs text-slate-100 tabular-nums focus:border-emerald-400 focus:outline-none"
              />
            </div>
          </div>
        </div>

        {calc && (
          <div className="rounded-md border border-slate-800 bg-[#0B0F19] p-4 space-y-1.5">
            <div className="flex items-baseline justify-between">
              <span className="text-xs font-medium text-slate-400">Projected Measured Objective</span>
              <span
                className={`font-mono text-xl font-bold tabular-nums ${
                  direction === 'up' ? 'text-emerald-400' : 'text-red-400'
                }`}
              >
                {calc.target.toFixed(2)}
              </span>
            </div>
            <div className="text-xs text-slate-400 leading-relaxed">{calc.explanation}</div>
          </div>
        )}
      </div>

      {/* Chapter 17 DISCIPLINE Acronym & Rulebook */}
      <div className="lg:col-span-7 rounded-lg border border-slate-800 bg-[#111827] p-5 space-y-4">
        <div className="border-b border-slate-800 pb-3">
          <h2 className="font-display text-base font-bold text-slate-100">
            Chapter 17: How I Use Candles — The DISCIPLINE Rules (p. 268)
          </h2>
          <p className="text-xs text-slate-400 mt-1">
            Nison’s core execution mandate: "It’s not what we buy or sell, but how we do it." Candle signals act strictly as timing tools inside disciplined Western risk management.
          </p>
        </div>

        <div className="divide-y divide-slate-800">
          {DISCIPLINE_RULES.map((rule, idx) => (
            <div key={idx} className="py-2.5 flex items-start gap-3">
              <div className="w-7 h-7 rounded border border-slate-700 bg-[#0B0F19] flex items-center justify-center font-display text-xs font-bold text-emerald-400 shrink-0">
                {rule.letter}
              </div>
              <div>
                <div className="text-xs font-semibold text-slate-100">{rule.title}</div>
                <p className="text-xs text-slate-400 leading-relaxed mt-0.5">{rule.detail}</p>
              </div>
            </div>
          ))}
        </div>
      </div>
    </div>
  );
};
