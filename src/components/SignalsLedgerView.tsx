import React, { useMemo, useState } from 'react';
import { BotAnalysisResult, BotSignal } from '../engine/types';

interface SignalsLedgerViewProps {
  analysis: BotAnalysisResult;
  onJumpToSignal: (signal: BotSignal) => void;
}

type SignalFilter = 'all' | 'actionable' | 'pending' | 'warnings' | 'voided';

function fmtPrice(v: number): string {
  const abs = Math.abs(v);
  if (abs >= 100) return v.toFixed(2);
  if (abs >= 10) return v.toFixed(3);
  if (abs >= 0.5) return v.toFixed(4);
  return v.toFixed(5);
}

export const SignalsLedgerView: React.FC<SignalsLedgerViewProps> = ({
  analysis,
  onJumpToSignal,
}) => {
  const [filter, setFilter] = useState<SignalFilter>('all');

  const filteredSignals = useMemo(() => {
    const rev = [...analysis.signals].reverse();
    switch (filter) {
      case 'actionable':
        return rev.filter((s) => s.action === 'BUY' || s.action === 'SELL');
      case 'pending':
        return rev.filter((s) => s.action === 'WAIT_CONFIRMATION' && s.confirmationStatus === 'PENDING_CONFIRMATION');
      case 'warnings':
        return rev.filter(
          (s) => s.action === 'EXIT_LONG' || s.action === 'EXIT_SHORT' || s.action === 'CAUTION'
        );
      case 'voided':
        return rev.filter((s) => s.confirmationStatus === 'VOIDED_BY_WINDOW');
      default:
        return rev;
    }
  }, [analysis.signals, filter]);

  const tradeStats = useMemo(() => {
    const closed = analysis.trades.filter((t) => t.status !== 'OPEN');
    const wins = closed.filter((t) => t.pnlPercent > 0).length;
    const netPct = analysis.trades.reduce((acc, t) => acc + t.pnlPercent, 0);
    const open = analysis.trades.find((t) => t.status === 'OPEN') ?? null;
    return {
      total: analysis.trades.length,
      closedCount: closed.length,
      winRate: closed.length > 0 ? (wins / closed.length) * 100 : null,
      netPct,
      open,
    };
  }, [analysis.trades]);

  return (
    <div className="space-y-6">
      {/* KPI Summary Strip */}
      <div className="grid grid-cols-2 lg:grid-cols-4 gap-4">
        <div className="rounded-lg border border-slate-800 bg-[#111827] p-4">
          <div className="text-xs font-medium text-slate-400">Total Book Signals</div>
          <div className="mt-1 font-mono text-2xl font-bold text-slate-100 tabular-nums">
            {analysis.signals.length}
          </div>
          <div className="mt-1 text-[11.5px] text-slate-400">
            {analysis.signals.filter((s) => s.action === 'BUY' || s.action === 'SELL').length} confirmed entries
          </div>
        </div>

        <div className="rounded-lg border border-slate-800 bg-[#111827] p-4">
          <div className="text-xs font-medium text-slate-400">Paper Trades Executed</div>
          <div className="mt-1 font-mono text-2xl font-bold text-slate-100 tabular-nums">
            {tradeStats.total}
          </div>
          <div className="mt-1 text-[11.5px] text-slate-400">
            {tradeStats.closedCount} closed · {tradeStats.open ? `1 open ${tradeStats.open.direction}` : 'flat'}
          </div>
        </div>

        <div className="rounded-lg border border-slate-800 bg-[#111827] p-4">
          <div className="text-xs font-medium text-slate-400">Closed Win Rate</div>
          <div className="mt-1 font-mono text-2xl font-bold text-slate-100 tabular-nums">
            {tradeStats.winRate !== null ? `${tradeStats.winRate.toFixed(0)}%` : '—'}
          </div>
          <div className="mt-1 text-[11.5px] text-slate-400">
            Strictly causal close-based stops & exits
          </div>
        </div>

        <div className="rounded-lg border border-slate-800 bg-[#111827] p-4">
          <div className="text-xs font-medium text-slate-400">Cumulative Paper Return</div>
          <div
            className={`mt-1 font-mono text-2xl font-bold tabular-nums ${
              tradeStats.netPct >= 0 ? 'text-emerald-400' : 'text-red-400'
            }`}
          >
            {tradeStats.netPct >= 0 ? '+' : ''}
            {tradeStats.netPct.toFixed(2)}%
          </div>
          <div className="mt-1 text-[11.5px] text-slate-400">
            Includes Ch. 16 target & Ch. 4 stop exits
          </div>
        </div>
      </div>

      {/* Signals Audit Table */}
      <div className="rounded-lg border border-slate-800 bg-[#111827] overflow-hidden">
        <div className="border-b border-slate-800 px-5 py-3.5 flex flex-wrap items-center justify-between gap-3">
          <div>
            <h2 className="font-display text-base font-bold text-slate-100">
              Chronological Signal Log
            </h2>
            <p className="text-xs text-slate-400">
              Every signal cites its exact pattern, East+West convergence count, and Nison rule status. Click any row to jump to that bar on the chart.
            </p>
          </div>
          <div className="flex flex-wrap items-center gap-1.5">
            {(
              [
                { id: 'all', label: 'All' },
                { id: 'actionable', label: 'Actionable BUY/SELL' },
                { id: 'pending', label: 'Pending Confirm' },
                { id: 'warnings', label: 'Exits & Caution' },
                { id: 'voided', label: 'Voided by Window' },
              ] as { id: SignalFilter; label: string }[]
            ).map((btn) => (
              <button
                key={btn.id}
                type="button"
                onClick={() => setFilter(btn.id)}
                className={`rounded px-2.5 py-1.5 text-xs font-medium whitespace-nowrap cursor-pointer border ${
                  filter === btn.id
                    ? 'border-slate-200 bg-slate-100 text-slate-950'
                    : 'border-slate-700 bg-[#0B0F19] text-slate-300 hover:bg-slate-800'
                }`}
              >
                {btn.label}
              </button>
            ))}
          </div>
        </div>

        <div className="overflow-x-auto">
          <table className="w-full text-left border-collapse text-xs">
            <thead>
              <tr className="border-b border-slate-800 bg-[#0B0F19] text-[11px] font-semibold uppercase tracking-wider text-slate-400">
                <th className="py-2.5 px-4">Bar / Date</th>
                <th className="py-2.5 px-4">Action</th>
                <th className="py-2.5 px-4">Primary Book Pattern</th>
                <th className="py-2.5 px-4 text-right">Entry</th>
                <th className="py-2.5 px-4 text-right">Stop</th>
                <th className="py-2.5 px-4 text-right">Target</th>
                <th className="py-2.5 px-4 text-right">R:R</th>
                <th className="py-2.5 px-4">Convergence & Rule Notes</th>
              </tr>
            </thead>
            <tbody className="divide-y divide-slate-800/80">
              {filteredSignals.length === 0 ? (
                <tr>
                  <td colSpan={8} className="py-8 text-center text-slate-400">
                    No signals match this filter in the current dataset.
                  </td>
                </tr>
              ) : (
                filteredSignals.map((s) => (
                  <tr
                    key={s.id}
                    onClick={() => onJumpToSignal(s)}
                    className="hover:bg-slate-800/60 transition-colors cursor-pointer"
                  >
                    <td className="py-2.5 px-4 font-mono tabular-nums text-slate-300 whitespace-nowrap">
                      #{s.candleIndex + 1} · {s.time}
                    </td>
                    <td className="py-2.5 px-4 font-semibold whitespace-nowrap">
                      <span
                        className={
                          s.action === 'BUY'
                            ? 'text-emerald-400'
                            : s.action === 'SELL'
                            ? 'text-red-400'
                            : s.action === 'WAIT_CONFIRMATION'
                            ? 'text-amber-400'
                            : 'text-slate-300'
                        }
                      >
                        {s.action}
                      </span>
                    </td>
                    <td className="py-2.5 px-4">
                      <div className="font-medium text-slate-100">{s.primaryPattern.name}</div>
                      <div className="text-[11px] text-slate-400">
                        {s.bookReference.chapter}, {s.bookReference.pages}
                      </div>
                    </td>
                    <td className="py-2.5 px-4 text-right font-mono tabular-nums text-slate-100">
                      {fmtPrice(s.entryPrice)}
                    </td>
                    <td className="py-2.5 px-4 text-right font-mono tabular-nums text-red-400">
                      {s.stopLoss !== null ? fmtPrice(s.stopLoss) : '—'}
                    </td>
                    <td className="py-2.5 px-4 text-right font-mono tabular-nums text-emerald-400">
                      {s.targetPrice !== null ? fmtPrice(s.targetPrice) : '—'}
                    </td>
                    <td className="py-2.5 px-4 text-right font-mono tabular-nums text-slate-300">
                      {s.riskRewardRatio !== null ? `${s.riskRewardRatio.toFixed(1)}R` : '—'}
                    </td>
                    <td className="py-2.5 px-4 text-slate-400 max-w-xs">
                      {s.convergingFactors.length > 0
                        ? `${s.convergingFactors.length} factor(s): ${s.convergingFactors[0]}`
                        : s.warningFlags[0] ?? s.primaryPattern.notes}
                    </td>
                  </tr>
                ))
              )}
            </tbody>
          </table>
        </div>
      </div>

      {/* Simulated Paper Trade Ledger */}
      <div className="rounded-lg border border-slate-800 bg-[#111827] overflow-hidden">
        <div className="border-b border-slate-800 px-5 py-3.5">
          <h2 className="font-display text-base font-bold text-slate-100">
            Causal Paper-Trade Execution Ledger
          </h2>
          <p className="text-xs text-slate-400">
            Trades open strictly on confirmed BUY/SELL signals and exit strictly on close-based invalidation stops, Chapter 16 measured targets, or reversal/warning exits.
          </p>
        </div>

        <div className="overflow-x-auto">
          <table className="w-full text-left border-collapse text-xs">
            <thead>
              <tr className="border-b border-slate-800 bg-[#0B0F19] text-[11px] font-semibold uppercase tracking-wider text-slate-400">
                <th className="py-2.5 px-4">Direction</th>
                <th className="py-2.5 px-4">Entry Trigger</th>
                <th className="py-2.5 px-4 text-right">Entry Price</th>
                <th className="py-2.5 px-4 text-right">Stop</th>
                <th className="py-2.5 px-4 text-right">Target</th>
                <th className="py-2.5 px-4">Exit Status & Reason</th>
                <th className="py-2.5 px-4 text-right">Exit Price</th>
                <th className="py-2.5 px-4 text-right">Return %</th>
              </tr>
            </thead>
            <tbody className="divide-y divide-slate-800/80">
              {analysis.trades.length === 0 ? (
                <tr>
                  <td colSpan={8} className="py-8 text-center text-slate-400">
                    No paper trades triggered in this dataset under current rules.
                  </td>
                </tr>
              ) : (
                analysis.trades.map((tr) => (
                  <tr key={tr.id} className="hover:bg-slate-800/60">
                    <td className="py-2.5 px-4 font-semibold whitespace-nowrap">
                      <span className={tr.direction === 'LONG' ? 'text-emerald-400' : 'text-red-400'}>
                        {tr.direction}
                      </span>
                    </td>
                    <td className="py-2.5 px-4">
                      <div className="font-medium text-slate-100">{tr.entryPatternName}</div>
                      <div className="font-mono text-[11px] text-slate-400">
                        Bar #{tr.entryIndex + 1} · {tr.entryTime}
                      </div>
                    </td>
                    <td className="py-2.5 px-4 text-right font-mono tabular-nums text-slate-100">
                      {fmtPrice(tr.entryPrice)}
                    </td>
                    <td className="py-2.5 px-4 text-right font-mono tabular-nums text-red-400">
                      {fmtPrice(tr.stopLoss)}
                    </td>
                    <td className="py-2.5 px-4 text-right font-mono tabular-nums text-emerald-400">
                      {tr.targetPrice !== null ? fmtPrice(tr.targetPrice) : '—'}
                    </td>
                    <td className="py-2.5 px-4 text-slate-300">
                      <div className="font-medium">{tr.status.replace('CLOSED_', 'Closed: ')}</div>
                      {tr.exitReason && <div className="text-[11px] text-slate-400">{tr.exitReason}</div>}
                    </td>
                    <td className="py-2.5 px-4 text-right font-mono tabular-nums text-slate-100">
                      {tr.exitPrice !== undefined ? fmtPrice(tr.exitPrice) : 'Open'}
                    </td>
                    <td
                      className={`py-2.5 px-4 text-right font-mono font-semibold tabular-nums ${
                        tr.pnlPercent >= 0 ? 'text-emerald-400' : 'text-red-400'
                      }`}
                    >
                      {tr.pnlPercent >= 0 ? '+' : ''}
                      {tr.pnlPercent.toFixed(2)}%
                    </td>
                  </tr>
                ))
              )}
            </tbody>
          </table>
        </div>
      </div>
    </div>
  );
};
