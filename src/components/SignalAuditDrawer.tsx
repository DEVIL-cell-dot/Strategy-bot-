import React from 'react';
import {
  ArrowUpRight,
  ArrowDownRight,
  Clock,
  AlertTriangle,
  CheckCircle2,
  BookOpen,
  ShieldAlert,
  LogOut,
} from 'lucide-react';
import { fmtPairPrice } from '../engine/dataParser';
import { BotSignal } from '../engine/types';

interface SignalAuditDrawerProps {
  signal: BotSignal | null;
  totalSignalsUpToCursor: number;
  currentClose: number;
  pairId?: string;
  onInspectInCodex?: (patternId: BotSignal['primaryPattern']['id']) => void;
}

export const SignalAuditDrawer: React.FC<SignalAuditDrawerProps> = ({
  signal,
  totalSignalsUpToCursor,
  currentClose,
  pairId,
  onInspectInCodex,
}) => {
  const fmtPrice = (v: number) => fmtPairPrice(v, pairId);
  if (!signal) {
    return (
      <div className="rounded-lg border border-slate-800 bg-[#111827] p-5">
        <div className="flex items-center justify-between border-b border-slate-800 pb-3 mb-3">
          <h3 className="font-display text-sm font-semibold text-slate-100">
            Book Signal Audit
          </h3>
          <span className="font-mono text-xs text-slate-400 tabular-nums">
            0 signals fired
          </span>
        </div>
        <p className="text-xs leading-relaxed text-slate-400">
          No Nison candlestick signal has formed up to the active bar (Close:{' '}
          <span className="font-mono font-semibold text-slate-100 tabular-nums">
            {fmtPrice(currentClose)}
          </span>
          ). Wait for the next candle close or switch pair/timeframe to inspect book-strict East + West signals.
        </p>
      </div>
    );
  }

  const actionMeta = (() => {
    switch (signal.action) {
      case 'BUY':
        return {
          label: 'BUY · CALL (UP)',
          textCls: 'text-emerald-400',
          bgCls: 'bg-emerald-500/10 border-slate-800',
          Icon: ArrowUpRight,
        };
      case 'SELL':
        return {
          label: 'SELL · PUT (DOWN)',
          textCls: 'text-red-400',
          bgCls: 'bg-red-500/10 border-slate-800',
          Icon: ArrowDownRight,
        };
      case 'EXIT_LONG':
        return {
          label: 'EXIT LONG',
          textCls: 'text-amber-400',
          bgCls: 'bg-amber-500/10 border-slate-800',
          Icon: LogOut,
        };
      case 'EXIT_SHORT':
        return {
          label: 'COVER SHORT',
          textCls: 'text-amber-400',
          bgCls: 'bg-amber-500/10 border-slate-800',
          Icon: LogOut,
        };
      case 'WAIT_CONFIRMATION':
        return {
          label: 'WAIT CONFIRMATION',
          textCls: 'text-amber-400',
          bgCls: 'bg-amber-500/10 border-slate-800',
          Icon: Clock,
        };
      default:
        return {
          label: 'CAUTION / NEUTRAL',
          textCls: 'text-slate-300',
          bgCls: 'bg-slate-800/70 border-slate-800',
          Icon: AlertTriangle,
        };
    }
  })();

  const { Icon } = actionMeta;

  const statusLabel =
    signal.confirmationStatus === 'CONFIRMED'
      ? 'Confirmed'
      : signal.confirmationStatus === 'PENDING_CONFIRMATION'
      ? 'Pending Close Confirmation'
      : signal.confirmationStatus === 'VOIDED_BY_WINDOW'
      ? 'Blocked by Window Dominance'
      : 'Counter-Trend Exit Only';

  const tierLabel =
    signal.confidenceTier === 'HIGH_CONVERGENCE'
      ? 'High Convergence (East + West)'
      : signal.confidenceTier === 'CONFIRMED_SIGNAL'
      ? 'Confirmed Book Pattern'
      : 'Preliminary Warning';

  return (
    <div className="rounded-lg border border-slate-800 bg-[#111827] overflow-hidden">
      {/* Header Banner */}
      <div className={`border-b px-4 py-3 flex flex-wrap items-center justify-between gap-2 ${actionMeta.bgCls}`}>
        <div className="flex items-center gap-2">
          <Icon className={`w-4 h-4 shrink-0 ${actionMeta.textCls}`} />
          <span className={`font-display text-xs font-bold tracking-wide ${actionMeta.textCls}`}>
            {actionMeta.label}
          </span>
          <span className="text-slate-600">·</span>
          <span className="text-xs font-semibold text-slate-100">
            {signal.primaryPattern.name}
          </span>
          {signal.primaryPattern.japaneseName && (
            <span className="text-xs text-slate-400">
              ({signal.primaryPattern.japaneseName})
            </span>
          )}
        </div>
        <div className="font-mono text-xs text-slate-400 tabular-nums">
          Bar #{signal.candleIndex + 1} · {signal.time} · Signal {totalSignalsUpToCursor}
        </div>
      </div>

      {/* Body */}
      <div className="p-4 grid grid-cols-1 lg:grid-cols-12 gap-4">
        {/* Column 1: Execution Levels & Book Citation */}
        <div className="lg:col-span-4 space-y-3 border-b lg:border-b-0 lg:border-r border-slate-800 pb-3 lg:pb-0 lg:pr-4">
          <div className="grid grid-cols-2 gap-x-3 gap-y-2 text-xs">
            <div>
              <div className="text-[11px] text-slate-400">Signal Entry</div>
              <div className="font-mono text-sm font-semibold text-slate-100 tabular-nums">
                {fmtPrice(signal.entryPrice)}
              </div>
            </div>
            <div>
              <div className="text-[11px] text-slate-400">Protective Stop</div>
              <div className="font-mono text-sm font-semibold text-red-400 tabular-nums">
                {signal.stopLoss !== null ? fmtPrice(signal.stopLoss) : '—'}
              </div>
            </div>
            <div>
              <div className="text-[11px] text-slate-400">Measured Target</div>
              <div className="font-mono text-sm font-semibold text-emerald-400 tabular-nums">
                {signal.targetPrice !== null ? fmtPrice(signal.targetPrice) : '—'}
              </div>
            </div>
            <div>
              <div className="text-[11px] text-slate-400">Risk / Reward</div>
              <div className="font-mono text-sm font-semibold text-slate-100 tabular-nums">
                {signal.riskRewardRatio !== null ? `${signal.riskRewardRatio.toFixed(2)} : 1` : '—'}
              </div>
            </div>
          </div>

          <div className="pt-2 border-t border-slate-800 space-y-1 text-xs">
            <div className="text-slate-400">
              Status: <span className="font-medium text-slate-200">{statusLabel}</span>
            </div>
            <div className="text-slate-400">
              Tier: <span className="font-medium text-slate-200">{tierLabel}</span>
            </div>
            <div className="pt-1 flex items-center justify-between gap-2">
              <span className="inline-flex items-center gap-1 text-slate-300 font-medium">
                <BookOpen className="w-3.5 h-3.5 text-slate-400" />
                {signal.bookReference.chapter}, {signal.bookReference.pages}
              </span>
              {onInspectInCodex && (
                <button
                  type="button"
                  onClick={() => onInspectInCodex(signal.primaryPattern.id)}
                  className="text-[11px] font-semibold text-emerald-400 underline hover:text-emerald-300 whitespace-nowrap shrink-0 cursor-pointer"
                >
                  Open Codex
                </button>
              )}
            </div>
          </div>
        </div>

        {/* Column 2: East + West Converging Factors */}
        <div className="lg:col-span-4 space-y-2 border-b lg:border-b-0 lg:border-r border-slate-800 pb-3 lg:pb-0 lg:pr-4">
          <div className="text-[11px] font-semibold uppercase tracking-wider text-slate-400">
            East + West Convergence ({signal.convergingFactors.length})
          </div>
          {signal.convergingFactors.length === 0 ? (
            <p className="text-xs text-slate-400 leading-relaxed">
              Standalone candle pattern detected. Part 2 convergence (S/R, Trendlines, Fib, MA, RSI/Stoch/MACD, Volume) adds confirmation strength.
            </p>
          ) : (
            <ul className="space-y-1.5">
              {signal.convergingFactors.map((f, idx) => (
                <li key={idx} className="flex items-start gap-1.5 text-xs text-slate-300 leading-snug">
                  <CheckCircle2 className="w-3.5 h-3.5 text-emerald-400 shrink-0 mt-0.5" />
                  <span>{f}</span>
                </li>
              ))}
            </ul>
          )}

          {signal.clusterPatterns.length > 0 && (
            <div className="pt-1 text-[11px] text-slate-400">
              Also on bar: {signal.clusterPatterns.map((p) => p.name).join(' · ')}
            </div>
          )}
        </div>

        {/* Column 3: Rule Chain, Stop/Target Rule & Book Warnings */}
        <div className="lg:col-span-4 space-y-2">
          <div className="text-[11px] font-semibold uppercase tracking-wider text-slate-400">
            Book Rule Audit & Stops
          </div>
          <div className="space-y-1 text-xs text-slate-300 leading-snug">
            <div>
              <span className="font-semibold text-slate-100">Principle:</span> {signal.bookReference.principle}
            </div>
            <div>
              <span className="font-semibold text-slate-100">Stop Rule:</span> {signal.stopRule}
            </div>
            <div>
              <span className="font-semibold text-slate-100">Target Rule:</span> {signal.targetRule}
            </div>
          </div>

          {signal.warningFlags.length > 0 && (
            <div className="mt-2 rounded border border-amber-500/30 bg-amber-500/10 p-2 space-y-1">
              {signal.warningFlags.map((w, idx) => (
                <div key={idx} className="flex items-start gap-1.5 text-[11.5px] text-amber-300 leading-snug">
                  <ShieldAlert className="w-3.5 h-3.5 text-amber-400 shrink-0 mt-0.5" />
                  <span>{w}</span>
                </div>
              ))}
            </div>
          )}
        </div>
      </div>
    </div>
  );
};
