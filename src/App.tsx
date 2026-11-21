import React, { useCallback, useEffect, useMemo, useRef, useState } from 'react';
import {
  Play,
  Pause,
  SkipBack,
  SkipForward,
  FastForward,
  SlidersHorizontal,
  Layers,
  BookMarked,
  Radio,
  RefreshCw,
  AlertCircle,
  Clock,
} from 'lucide-react';
import { TopNav, WorkspaceTab } from './components/TopNav';
import {
  CandlestickChart,
  ChartOverlayToggles,
  ChartStyleMode,
  SubchartMode,
} from './components/CandlestickChart';
import { SignalAuditDrawer } from './components/SignalAuditDrawer';
import { SignalsLedgerView } from './components/SignalsLedgerView';
import { BookCodexView } from './components/BookCodexView';
import { TargetsAndDisciplineView } from './components/TargetsAndDisciplineView';
import { DataImportModal } from './components/DataImportModal';
import { BOOK_SCENARIOS } from './engine/bookScenarios';
import {
  BINARY_TIMEFRAMES,
  BINARY_TRADING_PAIRS,
  fmtPairPrice,
  LiveFeedStatus,
  PairCategory,
  subscribeUnifiedLiveStream,
  timeframeToSeconds,
  TradingPairDef,
} from './engine/dataParser';
import { DEFAULT_BOT_CONFIG, runNisonBot } from './engine/nisonBot';
import { BotConfig, BotSignal, Candle, PatternId } from './engine/types';

type FeedSourceMode = 'live' | 'scenario' | 'custom';

function formatCountdown(tf: string): string {
  const sec = timeframeToSeconds(tf);
  const nowSec = Math.floor(Date.now() / 1000);
  const rem = sec - (nowSec % sec);
  const hrs = Math.floor(rem / 3600);
  const mins = Math.floor((rem % 3600) / 60);
  const secs = rem % 60;
  if (hrs > 0) {
    return `${String(hrs).padStart(2, '0')}:${String(mins).padStart(2, '0')}:${String(secs).padStart(2, '0')}`;
  }
  return `${String(mins).padStart(2, '0')}:${String(secs).padStart(2, '0')}`;
}

export default function App() {
  const [activeTab, setActiveTab] = useState<WorkspaceTab>('terminal');
  const [importOpen, setImportOpen] = useState(false);

  // Source mode: Binary Trading Live Pairs (defaults to EUR/USD 1m)
  const [sourceMode, setSourceMode] = useState<FeedSourceMode>('live');
  const [selectedPairId, setSelectedPairId] = useState<string>('EUR/USD');
  const [pairCategoryFilter, setPairCategoryFilter] = useState<PairCategory>('forex');
  const [liveTimeframe, setLiveTimeframe] = useState<string>('1m');
  const [liveStreamEnabled, setLiveStreamEnabled] = useState<boolean>(true);
  const [liveStatus, setLiveStatus] = useState<LiveFeedStatus>('connecting');
  const [liveError, setLiveError] = useState<string | null>(null);
  const [lastTickTime, setLastTickTime] = useState<string | null>(null);
  const [loadingLive, setLoadingLive] = useState<boolean>(false);
  const [candleCountdown, setCandleCountdown] = useState<string>(() => formatCountdown('1m'));
  const [reconnectNonce, setReconnectNonce] = useState<number>(0);

  const activePairDef: TradingPairDef = useMemo(
    () =>
      BINARY_TRADING_PAIRS.find((p) => p.id === selectedPairId) ??
      BINARY_TRADING_PAIRS[0],
    [selectedPairId]
  );

  // Initial / offline scenario candles
  const [selectedScenarioId, setSelectedScenarioId] = useState<string>(BOOK_SCENARIOS[0].id);
  const [candles, setCandles] = useState<Candle[]>(BOOK_SCENARIOS[0].candles);
  const [datasetTitle, setDatasetTitle] = useState<string>('Live Binary Feed · EUR/USD (1M)');
  const [symbolLabel, setSymbolLabel] = useState<string>('EUR/USD');
  const [timeframeLabel, setTimeframeLabel] = useState<string>('1M');

  // Strict Nison Book Rule toggles
  const [botConfig, setBotConfig] = useState<BotConfig>(DEFAULT_BOT_CONFIG);

  // Chart visual controls
  const [chartStyle, setChartStyle] = useState<ChartStyleMode>('classic');
  const [subchartMode, setSubchartMode] = useState<SubchartMode>('rsi');
  const [overlays, setOverlays] = useState<ChartOverlayToggles>({
    showMAs: true,
    showWindows: true,
    showSRZones: true,
    showTrendlines: true,
    showFibs: true,
    showSignals: true,
  });

  // Causal analysis
  const analysis = useMemo(() => runNisonBot(candles, botConfig), [candles, botConfig]);

  // Replay cursor & signal selection
  const [replayCursor, setReplayCursor] = useState<number>(candles.length - 1);
  const [followLiveTail, setFollowLiveTail] = useState<boolean>(true);
  const [isPlaying, setIsPlaying] = useState<boolean>(false);
  const [selectedSignalId, setSelectedSignalId] = useState<string | null>(null);
  const [codexHighlightId, setCodexHighlightId] = useState<PatternId | null>(null);

  // Live candle close countdown timer
  useEffect(() => {
    if (sourceMode !== 'live') return;
    setCandleCountdown(formatCountdown(liveTimeframe));
    const t = window.setInterval(() => {
      setCandleCountdown(formatCountdown(liveTimeframe));
    }, 1000);
    return () => window.clearInterval(t);
  }, [sourceMode, liveTimeframe]);

  const subscriptionRef = useRef<{ close: () => void } | null>(null);

  const handleIncomingTick = useCallback((tickCandle: Omit<Candle, 'index'>) => {
    setLastTickTime(new Date().toLocaleTimeString());
    setCandles((prev) => {
      if (prev.length === 0) return [{ ...tickCandle, index: 0 }];
      const last = prev[prev.length - 1];
      if (last.time === tickCandle.time) {
        const updated = [...prev];
        updated[updated.length - 1] = {
          ...tickCandle,
          index: last.index,
        };
        return updated;
      }
      // Guard against stale out-of-order ticks arriving before/after history loads
      if (tickCandle.time < last.time) {
        const matchIdx = prev.findIndex((c) => c.time === tickCandle.time);
        if (matchIdx >= 0) {
          const updated = [...prev];
          updated[matchIdx] = { ...tickCandle, index: updated[matchIdx].index };
          return updated;
        }
        return prev;
      }
      const next = [...prev, { ...tickCandle, index: prev.length }];
      const trimmed = next.length > 140 ? next.slice(next.length - 120) : next;
      return trimmed.map((c, idx) => ({ ...c, index: idx }));
    });
  }, []);

  // Connect unified same-origin live market stream (/api/live-stream SSE + /api/live-klines fallback)
  useEffect(() => {
    if (sourceMode !== 'live') {
      subscriptionRef.current?.close();
      subscriptionRef.current = null;
      return;
    }

    let cancelled = false;
    setIsPlaying(false);
    setLiveError(null);
    setLoadingLive(true);
    setLiveStatus('connecting');
    setSymbolLabel(activePairDef.id);
    setTimeframeLabel(liveTimeframe.toUpperCase());
    setDatasetTitle(
      `Live Stream · ${activePairDef.label} (${liveTimeframe.toUpperCase()})`
    );

    subscriptionRef.current?.close();
    subscriptionRef.current = subscribeUnifiedLiveStream(
      activePairDef.id,
      liveTimeframe,
      liveStreamEnabled,
      (historyCandles) => {
        if (cancelled) return;
        setCandles(historyCandles);
        setReplayCursor(historyCandles.length - 1);
        setFollowLiveTail(true);
        setSelectedSignalId(null);
        setLoadingLive(false);
        setLiveError(null);
        setLastTickTime(new Date().toLocaleTimeString());
      },
      (tickBar) => {
        if (cancelled) return;
        setLoadingLive(false);
        handleIncomingTick(tickBar);
      },
      (status, detail) => {
        if (cancelled) return;
        setLiveStatus(status);
        if (status === 'error') {
          setLoadingLive(false);
          if (detail) setLiveError(detail);
        }
      }
    );

    return () => {
      cancelled = true;
      subscriptionRef.current?.close();
      subscriptionRef.current = null;
    };
  }, [
    sourceMode,
    activePairDef,
    liveTimeframe,
    liveStreamEnabled,
    reconnectNonce,
    handleIncomingTick,
  ]);

  useEffect(() => {
    if (sourceMode === 'live' && followLiveTail) {
      setReplayCursor(candles.length - 1);
    } else if (replayCursor >= candles.length) {
      setReplayCursor(Math.max(0, candles.length - 1));
    }
  }, [candles.length, sourceMode, followLiveTail, replayCursor]);

  useEffect(() => {
    if (!isPlaying) return;
    const timer = window.setInterval(() => {
      setReplayCursor((prev) => {
        if (prev >= candles.length - 1) {
          setIsPlaying(false);
          return prev;
        }
        return prev + 1;
      });
    }, 320);
    return () => window.clearInterval(timer);
  }, [isPlaying, candles.length]);

  const signalsUpToCursor = useMemo(
    () => analysis.signals.filter((s) => s.candleIndex <= replayCursor),
    [analysis.signals, replayCursor]
  );

  const activeAuditSignal: BotSignal | null = useMemo(() => {
    if (selectedSignalId) {
      const match = signalsUpToCursor.find((s) => s.id === selectedSignalId);
      if (match) return match;
    }
    return signalsUpToCursor.length > 0
      ? signalsUpToCursor[signalsUpToCursor.length - 1]
      : null;
  }, [selectedSignalId, signalsUpToCursor]);

  const handleSelectScenario = (scenarioId: string) => {
    const sc = BOOK_SCENARIOS.find((s) => s.id === scenarioId);
    if (!sc) return;
    setSourceMode('scenario');
    setSelectedScenarioId(sc.id);
    setCandles(sc.candles);
    setDatasetTitle(sc.title);
    setSymbolLabel(sc.symbol);
    setTimeframeLabel(sc.timeframe);
    setReplayCursor(sc.candles.length - 1);
    setFollowLiveTail(false);
    setIsPlaying(false);
    setSelectedSignalId(null);
  };

  const handleSelectPair = (pairId: string) => {
    const def = BINARY_TRADING_PAIRS.find((p) => p.id === pairId);
    if (!def) return;
    setSelectedPairId(def.id);
    setPairCategoryFilter(def.category);
    setSourceMode('live');
    setLiveStreamEnabled(true);
    setFollowLiveTail(true);
  };

  const handleTimeframeSelect = (tf: string) => {
    setLiveTimeframe(tf);
    if (sourceMode !== 'live') {
      setSourceMode('live');
      setLiveStreamEnabled(true);
    }
    setFollowLiveTail(true);
  };

  const handleApplyImportedCandles = (newCandles: Candle[], label: string, tf: string) => {
    setSourceMode('custom');
    setSelectedScenarioId('custom');
    setCandles(newCandles);
    setDatasetTitle(`${label} · Imported OHLCV (${newCandles.length} bars)`);
    setSymbolLabel(label);
    setTimeframeLabel(tf);
    setReplayCursor(newCandles.length - 1);
    setFollowLiveTail(false);
    setIsPlaying(false);
    setSelectedSignalId(null);
    setActiveTab('terminal');
  };

  const handleJumpToSignal = (sig: BotSignal) => {
    setIsPlaying(false);
    setFollowLiveTail(false);
    setReplayCursor(Math.max(0, Math.min(candles.length - 1, sig.candleIndex)));
    setSelectedSignalId(sig.id);
    setActiveTab('terminal');
  };

  const handleInspectInCodex = (patternId: PatternId) => {
    setCodexHighlightId(patternId);
    setActiveTab('codex');
  };

  const toggleConfig = (key: keyof Omit<BotConfig, 'minRiskRewardForEntry'>) => {
    setBotConfig((prev) => ({ ...prev, [key]: !prev[key] }));
  };

  const toggleOverlay = (key: keyof ChartOverlayToggles) => {
    setOverlays((prev) => ({ ...prev, [key]: !prev[key] }));
  };

  const safeIdx = Math.max(0, Math.min(replayCursor, candles.length - 1));
  const curCandle = candles[safeIdx];
  const prevCandle = safeIdx > 0 ? candles[safeIdx - 1] : curCandle;
  const barChangePct =
    prevCandle && prevCandle.close > 0
      ? ((curCandle.close - prevCandle.close) / prevCandle.close) * 100
      : 0;
  const curRSI = analysis.indicators.rsi14[safeIdx];
  const activeWindowsAtCursor = analysis.windows.filter(
    (w) =>
      w.createdAtIndex <= replayCursor &&
      (w.voidedAtIndex === undefined || w.voidedAtIndex > replayCursor)
  );

  const liveStatusText =
    liveStatus === 'live'
      ? 'Live Feed ON'
      : liveStatus === 'polling'
      ? 'Live Sync'
      : liveStatus === 'connecting'
      ? 'Connecting...'
      : liveStatus === 'paused'
      ? 'Paused'
      : 'Offline';

  const visibleCategoryPairs = BINARY_TRADING_PAIRS.filter(
    (p) => p.category === pairCategoryFilter
  );

  const activePairForFormatting = sourceMode === 'live' ? selectedPairId : undefined;

  return (
    <div className="min-h-screen bg-[#0B0F19] text-slate-100 flex flex-col">
      <TopNav
        activeTab={activeTab}
        onSelectTab={setActiveTab}
        onOpenImport={() => setImportOpen(true)}
      />

      <main className="flex-1 w-full max-w-[1440px] mx-auto px-4 lg:px-6 py-5">
        {activeTab === 'terminal' && (
          <div className="flex flex-col lg:flex-row gap-5 items-start">
            {/* Left Sidebar */}
            <aside className="w-full lg:w-[276px] shrink-0 space-y-4">
              {/* Binary Trading Live Pairs */}
              <section className="rounded-lg border border-slate-800 bg-[#111827] p-4 space-y-3">
                <div className="flex items-center justify-between">
                  <div className="flex items-center gap-1.5 text-xs font-semibold text-slate-100">
                    <Radio className="w-3.5 h-3.5 text-emerald-400" />
                    <span>Binary Live Pairs</span>
                  </div>
                  <button
                    type="button"
                    onClick={() => {
                      setSourceMode('live');
                      setLiveStreamEnabled(true);
                      setFollowLiveTail(true);
                    }}
                    className={`rounded px-2 py-0.5 text-[11px] font-semibold border cursor-pointer ${
                      sourceMode === 'live'
                        ? 'border-emerald-500 bg-emerald-600 text-white'
                        : 'border-slate-700 bg-[#0B0F19] text-slate-300 hover:bg-slate-800'
                    }`}
                  >
                    {sourceMode === 'live' ? 'Live' : 'Go Live'}
                  </button>
                </div>

                {/* Category Switcher */}
                <div className="grid grid-cols-3 gap-1">
                  {(
                    [
                      { id: 'forex', label: 'Forex' },
                      { id: 'commodities', label: 'Gold/Silver' },
                      { id: 'crypto', label: 'Crypto 24/7' },
                    ] as { id: PairCategory; label: string }[]
                  ).map((cat) => (
                    <button
                      key={cat.id}
                      type="button"
                      onClick={() => setPairCategoryFilter(cat.id)}
                      className={`rounded border py-1 text-[11px] font-medium cursor-pointer ${
                        pairCategoryFilter === cat.id
                          ? 'border-slate-200 bg-slate-100 text-slate-950'
                          : 'border-slate-800 bg-[#0B0F19] text-slate-400 hover:text-slate-200'
                      }`}
                    >
                      {cat.label}
                    </button>
                  ))}
                </div>

                {/* Pairs List for Active Category */}
                <div className="grid grid-cols-2 gap-1.5">
                  {visibleCategoryPairs.map((p) => {
                    const isSelected = sourceMode === 'live' && selectedPairId === p.id;
                    return (
                      <button
                        key={p.id}
                        type="button"
                        onClick={() => handleSelectPair(p.id)}
                        className={`rounded border px-2 py-1.5 text-left font-mono text-[11px] font-medium transition-colors cursor-pointer ${
                          isSelected
                            ? 'border-emerald-500 bg-emerald-500/15 text-emerald-300'
                            : 'border-slate-800 bg-[#0B0F19] text-slate-300 hover:bg-slate-800'
                        }`}
                      >
                        {p.id}
                      </button>
                    );
                  })}
                </div>

                {/* Binary Expiry / Candle Timeframe */}
                <div>
                  <div className="text-[11px] font-medium text-slate-400 mb-1.5">
                    Expiry / Candle Timeframe
                  </div>
                  <div className="grid grid-cols-4 gap-1">
                    {BINARY_TIMEFRAMES.map((tf) => {
                      const isActiveTf = sourceMode === 'live' && liveTimeframe === tf;
                      return (
                        <button
                          key={tf}
                          type="button"
                          onClick={() => handleTimeframeSelect(tf)}
                          className={`rounded border py-1.5 font-mono text-[11px] font-semibold cursor-pointer ${
                            isActiveTf
                              ? 'border-emerald-500 bg-emerald-500/15 text-emerald-300'
                              : 'border-slate-800 bg-[#0B0F19] text-slate-300 hover:bg-slate-800'
                          }`}
                        >
                          {tf}
                        </button>
                      );
                    })}
                  </div>
                </div>
              </section>

              {/* Book Scenarios (Offline Exhibits) */}
              <section className="rounded-lg border border-slate-800 bg-[#111827] p-4 space-y-2">
                <div className="flex items-center gap-1.5 text-xs font-semibold text-slate-100">
                  <BookMarked className="w-3.5 h-3.5 text-slate-400" />
                  <span>Book Exhibits (Replay)</span>
                </div>
                <div className="space-y-1.5">
                  {BOOK_SCENARIOS.map((sc) => {
                    const active = sourceMode === 'scenario' && selectedScenarioId === sc.id;
                    return (
                      <button
                        key={sc.id}
                        type="button"
                        onClick={() => handleSelectScenario(sc.id)}
                        className={`w-full text-left rounded-md border px-2.5 py-2 transition-colors cursor-pointer ${
                          active
                            ? 'border-emerald-500 bg-emerald-500/15 text-slate-100'
                            : 'border-slate-800 bg-[#0B0F19] text-slate-300 hover:bg-slate-800'
                        }`}
                      >
                        <div className="text-[11.5px] font-semibold leading-snug">{sc.title}</div>
                        <div
                          className={`text-[10.5px] mt-0.5 ${
                            active ? 'text-emerald-300' : 'text-slate-500'
                          }`}
                        >
                          {sc.chapterRef} · {sc.candles.length} bars
                        </div>
                      </button>
                    );
                  })}
                </div>
              </section>

              {/* Strict Nison Book Rule Gates */}
              <section className="rounded-lg border border-slate-800 bg-[#111827] p-4 space-y-2.5">
                <div className="flex items-center gap-1.5 text-xs font-semibold text-slate-100">
                  <SlidersHorizontal className="w-3.5 h-3.5 text-slate-400" />
                  <span>Book Rule Constraints</span>
                </div>
                <div className="space-y-2 text-xs">
                  {(
                    [
                      {
                        key: 'strictCloseConfirmation',
                        label: 'Strict Close S/R Voiding',
                        hint: 'Ch. 7 & 11: Windows/S/R void only on close',
                      },
                      {
                        key: 'respectWindowDominance',
                        label: 'Window Dominance Rule',
                        hint: 'Ch. 7 p. 141: Window overrides opposing signals',
                      },
                      {
                        key: 'respectMajorTrendRule',
                        label: 'Major Trend Filter',
                        hint: 'Ch. 4 p. 32: Restrict counter-trend to exits',
                      },
                      {
                        key: 'requireConfirmationForHangingManAndInvHammer',
                        label: 'Hanging Man & Inv. Hammer Close Gate',
                        hint: 'Ch. 4 p. 38 & Ch. 5 p. 78',
                      },
                      {
                        key: 'suppressMiddleBoxDoji',
                        label: 'Filter Middle-Box Doji',
                        hint: 'Ch. 8 p. 165: Suppress lateral congestion dojis',
                      },
                    ] as {
                      key: keyof Omit<BotConfig, 'minRiskRewardForEntry'>;
                      label: string;
                      hint: string;
                    }[]
                  ).map((item) => (
                    <label
                      key={item.key}
                      className="flex items-start gap-2.5 cursor-pointer select-none"
                    >
                      <input
                        type="checkbox"
                        checked={botConfig[item.key]}
                        onChange={() => toggleConfig(item.key)}
                        className="mt-0.5 h-3.5 w-3.5 rounded border-slate-700 accent-emerald-500 cursor-pointer"
                      />
                      <div>
                        <div className="font-medium text-slate-200 leading-tight">
                          {item.label}
                        </div>
                        <div className="text-[11px] text-slate-400 leading-tight mt-0.5">
                          {item.hint}
                        </div>
                      </div>
                    </label>
                  ))}
                </div>
              </section>

              {/* Chart Overlays */}
              <section className="rounded-lg border border-slate-800 bg-[#111827] p-4 space-y-2.5">
                <div className="flex items-center gap-1.5 text-xs font-semibold text-slate-100">
                  <Layers className="w-3.5 h-3.5 text-slate-400" />
                  <span>East + West Overlays</span>
                </div>
                <div className="grid grid-cols-2 gap-x-2 gap-y-2 text-xs">
                  {(
                    [
                      { key: 'showWindows', label: 'Windows' },
                      { key: 'showSRZones', label: 'Polarity S/R' },
                      { key: 'showMAs', label: '5/9/30 MAs' },
                      { key: 'showFibs', label: 'Fib 38/50/61' },
                      { key: 'showTrendlines', label: 'Trendlines' },
                      { key: 'showSignals', label: 'Signals' },
                    ] as { key: keyof ChartOverlayToggles; label: string }[]
                  ).map((ov) => (
                    <label
                      key={ov.key}
                      className="flex items-center gap-2 cursor-pointer select-none text-slate-300"
                    >
                      <input
                        type="checkbox"
                        checked={overlays[ov.key]}
                        onChange={() => toggleOverlay(ov.key)}
                        className="h-3.5 w-3.5 rounded border-slate-700 accent-emerald-500 cursor-pointer"
                      />
                      <span>{ov.label}</span>
                    </label>
                  ))}
                </div>
              </section>

              {/* Market Regime Snapshot */}
              <section className="rounded-lg border border-slate-800 bg-[#111827] p-4 space-y-2 text-xs">
                <div className="font-semibold text-slate-100">Market Regime Snapshot</div>
                <div className="flex justify-between py-1 border-b border-slate-800">
                  <span className="text-slate-400">Major Trend (30 SMA)</span>
                  <span className="font-semibold capitalize text-slate-100">
                    {analysis.currentTrend.majorTrend.replace('_', ' ')}
                  </span>
                </div>
                <div className="flex justify-between py-1 border-b border-slate-800">
                  <span className="text-slate-400">Short-Term Context</span>
                  <span className="font-semibold capitalize text-slate-100">
                    {analysis.currentTrend.shortTerm.replace('_', ' ')}
                  </span>
                </div>
                <div className="flex justify-between py-1 border-b border-slate-800">
                  <span className="text-slate-400">RSI (14)</span>
                  <span className="font-mono tabular-nums font-semibold text-slate-100">
                    {curRSI !== null && curRSI !== undefined ? curRSI.toFixed(1) : '—'}
                  </span>
                </div>
                <div className="flex justify-between py-1">
                  <span className="text-slate-400">Active Windows</span>
                  <span className="font-mono tabular-nums font-semibold text-slate-100">
                    {activeWindowsAtCursor.length}
                  </span>
                </div>
              </section>
            </aside>

            {/* Primary Chart + Audit Stack */}
            <div className="flex-1 min-w-0 space-y-4">
              {/* Top Live Instrument Bar */}
              <div className="rounded-lg border border-slate-800 bg-[#111827] px-4 py-3 space-y-2.5">
                <div className="flex flex-wrap items-center justify-between gap-3">
                  {/* Active Instrument, Live Price & Candle Close Timer */}
                  <div>
                    <div className="flex flex-wrap items-center gap-x-2.5 gap-y-1">
                      <h1 className="font-display text-base font-bold text-slate-100">
                        {symbolLabel}
                      </h1>
                      <span className="text-xs font-mono text-slate-400">
                        {timeframeLabel} · Bar {safeIdx + 1}/{candles.length}
                      </span>
                      <span className="text-slate-600">·</span>
                      <span className="font-mono text-base font-bold text-slate-100 tabular-nums">
                        {fmtPairPrice(curCandle.close, activePairForFormatting)}
                      </span>
                      <span
                        className={`font-mono text-xs font-semibold tabular-nums ${
                          barChangePct >= 0 ? 'text-emerald-400' : 'text-red-400'
                        }`}
                      >
                        {barChangePct >= 0 ? '+' : ''}
                        {barChangePct.toFixed(3)}%
                      </span>
                      {sourceMode === 'live' && (
                        <>
                          <span className="text-slate-600">·</span>
                          <span className="inline-flex items-center gap-1 font-mono text-xs text-amber-300 tabular-nums">
                            <Clock className="w-3.5 h-3.5" />
                            <span>Bar Close {candleCountdown}</span>
                          </span>
                        </>
                      )}
                    </div>
                    <p className="text-xs text-slate-400 mt-0.5">
                      {datasetTitle}
                      {sourceMode === 'live' && lastTickTime ? ` · Last tick ${lastTickTime}` : ''}
                    </p>
                  </div>

                  {/* Quick Live Controls: Binary Pair Select + Timeframe + Live Toggle */}
                  <div className="flex flex-wrap items-center gap-2">
                    <select
                      aria-label="Select binary trading pair"
                      value={selectedPairId}
                      onChange={(e) => handleSelectPair(e.target.value)}
                      className="rounded border border-slate-700 bg-[#0B0F19] px-2.5 py-1.5 font-mono text-xs font-semibold text-slate-100 focus:border-emerald-400 focus:outline-none cursor-pointer"
                    >
                      <optgroup label="Forex Majors & Crosses">
                        {BINARY_TRADING_PAIRS.filter((p) => p.category === 'forex').map((p) => (
                          <option key={p.id} value={p.id}>
                            {p.label}
                          </option>
                        ))}
                      </optgroup>
                      <optgroup label="Gold & Silver">
                        {BINARY_TRADING_PAIRS.filter((p) => p.category === 'commodities').map((p) => (
                          <option key={p.id} value={p.id}>
                            {p.label}
                          </option>
                        ))}
                      </optgroup>
                      <optgroup label="24/7 Crypto Pairs">
                        {BINARY_TRADING_PAIRS.filter((p) => p.category === 'crypto').map((p) => (
                          <option key={p.id} value={p.id}>
                            {p.label}
                          </option>
                        ))}
                      </optgroup>
                    </select>

                    <div className="inline-flex rounded border border-slate-700 bg-[#0B0F19] p-0.5">
                      {BINARY_TIMEFRAMES.map((tf) => {
                        const isAct = sourceMode === 'live' && liveTimeframe === tf;
                        return (
                          <button
                            key={tf}
                            type="button"
                            onClick={() => handleTimeframeSelect(tf)}
                            className={`rounded-sm px-2 py-1 font-mono text-[11px] font-semibold cursor-pointer ${
                              isAct
                                ? 'bg-slate-200 text-slate-950'
                                : 'text-slate-400 hover:text-slate-200'
                            }`}
                          >
                            {tf}
                          </button>
                        );
                      })}
                    </div>

                    {sourceMode === 'live' ? (
                      <>
                        <button
                          type="button"
                          onClick={() => {
                            setLiveStreamEnabled((prev) => !prev);
                            setFollowLiveTail(true);
                          }}
                          className={`inline-flex items-center gap-1.5 rounded border px-2.5 py-1.5 text-xs font-semibold cursor-pointer whitespace-nowrap ${
                            liveStreamEnabled
                              ? 'border-emerald-500 bg-emerald-600 text-white hover:bg-emerald-500'
                              : 'border-slate-700 bg-[#0B0F19] text-slate-300 hover:bg-slate-800'
                          }`}
                        >
                          <Radio className="w-3.5 h-3.5" />
                          <span>{liveStreamEnabled ? liveStatusText : 'Resume Live'}</span>
                        </button>
                        <button
                          type="button"
                          onClick={() => setReconnectNonce((n) => n + 1)}
                          disabled={loadingLive}
                          className="rounded border border-slate-700 bg-[#0B0F19] p-1.5 text-slate-300 hover:bg-slate-800 disabled:opacity-50 cursor-pointer"
                          title="Reconnect & refresh live feed"
                          aria-label="Reconnect live feed"
                        >
                          <RefreshCw className={`w-3.5 h-3.5 ${loadingLive ? 'animate-spin' : ''}`} />
                        </button>
                      </>
                    ) : (
                      <div className="flex items-center gap-1.5">
                        <button
                          type="button"
                          onClick={() => {
                            setIsPlaying(false);
                            setReplayCursor((c) => Math.max(10, c - 1));
                          }}
                          className="rounded border border-slate-700 bg-[#0B0F19] p-1.5 text-slate-300 hover:bg-slate-800 cursor-pointer"
                          title="Step Back 1 Bar"
                          aria-label="Step back 1 bar"
                        >
                          <SkipBack className="w-3.5 h-3.5" />
                        </button>
                        <button
                          type="button"
                          onClick={() => {
                            if (replayCursor >= candles.length - 1) {
                              setReplayCursor(Math.min(candles.length - 1, 20));
                              setIsPlaying(true);
                            } else {
                              setIsPlaying((p) => !p);
                            }
                          }}
                          className="inline-flex items-center gap-1.5 rounded border border-slate-200 bg-slate-100 px-2.5 py-1.5 text-xs font-semibold text-slate-950 hover:bg-white cursor-pointer whitespace-nowrap"
                        >
                          {isPlaying ? (
                            <>
                              <Pause className="w-3.5 h-3.5" />
                              <span>Pause</span>
                            </>
                          ) : (
                            <>
                              <Play className="w-3.5 h-3.5" />
                              <span>Replay</span>
                            </>
                          )}
                        </button>
                        <button
                          type="button"
                          onClick={() => {
                            setIsPlaying(false);
                            setReplayCursor((c) => Math.min(candles.length - 1, c + 1));
                          }}
                          className="rounded border border-slate-700 bg-[#0B0F19] p-1.5 text-slate-300 hover:bg-slate-800 cursor-pointer"
                          title="Step Forward 1 Bar"
                          aria-label="Step forward 1 bar"
                        >
                          <SkipForward className="w-3.5 h-3.5" />
                        </button>
                        <button
                          type="button"
                          onClick={() => {
                            setIsPlaying(false);
                            setReplayCursor(candles.length - 1);
                          }}
                          className="inline-flex items-center gap-1 rounded border border-slate-700 bg-[#0B0F19] px-2 py-1.5 text-xs font-medium text-slate-300 hover:bg-slate-800 cursor-pointer whitespace-nowrap"
                          title="Jump to Final Bar"
                        >
                          <FastForward className="w-3.5 h-3.5" />
                          <span>All Bars</span>
                        </button>
                        <input
                          type="range"
                          min={Math.min(10, candles.length - 1)}
                          max={candles.length - 1}
                          value={replayCursor}
                          onChange={(e) => {
                            setIsPlaying(false);
                            setReplayCursor(Number(e.target.value));
                          }}
                          aria-label="Replay bar position"
                          className="w-20 sm:w-28 accent-emerald-500 cursor-pointer"
                        />
                      </div>
                    )}
                  </div>
                </div>

                {/* Live History Scrub Notice / Error Banner */}
                {sourceMode === 'live' && liveError && (
                  <div className="flex flex-wrap items-center justify-between gap-2 rounded border border-red-500/40 bg-red-500/10 px-3 py-2 text-xs text-red-300">
                    <div className="flex items-center gap-2">
                      <AlertCircle className="w-4 h-4 shrink-0" />
                      <span>{liveError}</span>
                    </div>
                    <div className="flex flex-wrap items-center gap-3">
                      <button
                        type="button"
                        onClick={() => handleSelectPair('EUR/USDT')}
                        className="font-semibold underline text-emerald-300 cursor-pointer"
                      >
                        Switch to EUR/USDT (24/7)
                      </button>
                      <button
                        type="button"
                        onClick={() => handleSelectPair('BTC/USD')}
                        className="font-semibold underline text-emerald-300 cursor-pointer"
                      >
                        Switch to BTC/USD (24/7)
                      </button>
                      <button
                        type="button"
                        onClick={() => setReconnectNonce((n) => n + 1)}
                        className="font-semibold underline cursor-pointer"
                      >
                        Retry
                      </button>
                    </div>
                  </div>
                )}

                {sourceMode === 'live' && !followLiveTail && (
                  <div className="flex items-center justify-between rounded border border-amber-500/40 bg-amber-500/10 px-3 py-1.5 text-xs text-amber-300">
                    <span>
                      Inspecting historical Bar #{safeIdx + 1} while live feed continues in background.
                    </span>
                    <button
                      type="button"
                      onClick={() => {
                        setFollowLiveTail(true);
                        setReplayCursor(candles.length - 1);
                      }}
                      className="font-semibold underline cursor-pointer"
                    >
                      Jump to Live Candle
                    </button>
                  </div>
                )}
              </div>

              {/* Live Candle Signal Strip (Forming Bar + Just-Closed Bar Verdict) */}
              {(() => {
                const liveBarSignal = signalsUpToCursor.find((s) => s.candleIndex === safeIdx);
                const closedBarSignal =
                  !liveBarSignal && safeIdx > 0
                    ? signalsUpToCursor.find((s) => s.candleIndex === safeIdx - 1)
                    : undefined;
                const liveSig = liveBarSignal ?? closedBarSignal ?? null;
                const isForming = Boolean(liveBarSignal);

                if (liveSig) {
                  const isBuy = liveSig.action === 'BUY';
                  const isSell = liveSig.action === 'SELL';
                  const tone = isBuy
                    ? 'border-emerald-500/50 bg-emerald-500/10 text-emerald-300'
                    : isSell
                    ? 'border-red-500/50 bg-red-500/10 text-red-300'
                    : 'border-amber-500/50 bg-amber-500/10 text-amber-300';
                  const label = isBuy
                    ? 'BUY · CALL (UP)'
                    : isSell
                    ? 'SELL · PUT (DOWN)'
                    : liveSig.action === 'WAIT_CONFIRMATION'
                    ? 'WAIT CANDLE CLOSE'
                    : liveSig.action.replace('_', ' ');

                  return (
                    <div
                      onClick={() => setSelectedSignalId(liveSig.id)}
                      className={`rounded-lg border px-4 py-2.5 flex flex-wrap items-center justify-between gap-3 cursor-pointer transition-colors hover:brightness-110 ${tone}`}
                    >
                      <div className="flex flex-wrap items-center gap-x-2.5 gap-y-1 text-xs">
                        <span className="font-mono font-bold uppercase tracking-wide">
                          {isForming
                            ? `Live Forming Candle Signal (Bar #${safeIdx + 1})`
                            : `Latest Closed Candle Signal (Bar #${safeIdx})`}
                        </span>
                        <span className="opacity-60">·</span>
                        <span className="font-display text-sm font-bold text-slate-100">{label}</span>
                        <span className="opacity-60">·</span>
                        <span className="font-medium text-slate-200">{liveSig.primaryPattern.name}</span>
                        <span className="text-slate-400">({liveSig.bookReference.pages})</span>
                      </div>
                      <div className="flex items-center gap-3 text-xs font-mono tabular-nums">
                        {isForming && sourceMode === 'live' && (
                          <span className="text-amber-300">Confirm on close ({candleCountdown})</span>
                        )}
                        <span className="underline text-slate-200 font-sans font-semibold">
                          Inspect Audit
                        </span>
                      </div>
                    </div>
                  );
                }

                const latestPrior = signalsUpToCursor[signalsUpToCursor.length - 1];
                return (
                  <div className="rounded-lg border border-slate-800 bg-[#111827] px-4 py-2 flex flex-wrap items-center justify-between gap-2 text-xs text-slate-400">
                    <div className="flex flex-wrap items-center gap-x-2.5 gap-y-1">
                      <span className="font-semibold text-slate-200">
                        Live Candle #{safeIdx + 1} Scanner:
                      </span>
                      <span>
                        No reversal/window pattern on active candle yet · Major Trend:{' '}
                        <strong className="capitalize text-slate-200">
                          {analysis.currentTrend.majorTrend.replace('_', ' ')}
                        </strong>
                      </span>
                      {sourceMode === 'live' && (
                        <span className="font-mono text-amber-300 tabular-nums">
                          · Next close {candleCountdown}
                        </span>
                      )}
                    </div>
                    {latestPrior && (
                      <button
                        type="button"
                        onClick={() => setSelectedSignalId(latestPrior.id)}
                        className="font-medium text-emerald-400 hover:text-emerald-300 underline cursor-pointer"
                      >
                        Last Signal: Bar #{latestPrior.candleIndex + 1} ({latestPrior.action})
                      </button>
                    )}
                  </div>
                );
              })()}

              {/* TradingView Chart */}
              <CandlestickChart
                analysis={analysis}
                replayCursor={safeIdx}
                selectedSignalId={activeAuditSignal?.id ?? null}
                onSelectSignal={(sig) => setSelectedSignalId(sig.id)}
                chartStyle={chartStyle}
                onChangeChartStyle={setChartStyle}
                subchartMode={subchartMode}
                onChangeSubchartMode={setSubchartMode}
                overlays={overlays}
                isLiveStreaming={sourceMode === 'live' && liveStreamEnabled && followLiveTail}
                pairId={activePairForFormatting}
              />

              {/* Active Signal Audit Panel */}
              <SignalAuditDrawer
                signal={activeAuditSignal}
                totalSignalsUpToCursor={signalsUpToCursor.length}
                currentClose={curCandle.close}
                pairId={activePairForFormatting}
                onInspectInCodex={handleInspectInCodex}
              />
            </div>
          </div>
        )}

        {activeTab === 'ledger' && (
          <SignalsLedgerView analysis={analysis} onJumpToSignal={handleJumpToSignal} />
        )}

        {activeTab === 'codex' && (
          <BookCodexView highlightedPatternId={codexHighlightId} />
        )}

        {activeTab === 'discipline' && <TargetsAndDisciplineView />}
      </main>

      <DataImportModal
        isOpen={importOpen}
        onClose={() => setImportOpen(false)}
        onApplyCandles={handleApplyImportedCandles}
      />
    </div>
  );
}
