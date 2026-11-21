import React, { useEffect, useMemo, useRef, useState } from 'react';
import {
  CandlestickSeries,
  ColorType,
  createChart,
  createSeriesMarkers,
  CrosshairMode,
  HistogramSeries,
  IChartApi,
  IPriceLine,
  IPrimitivePaneRenderer,
  IPrimitivePaneView,
  ISeriesApi,
  ISeriesMarkersPluginApi,
  ISeriesPrimitive,
  LineSeries,
  LineStyle,
  Logical,
  MouseEventParams,
  PrimitivePaneViewZOrder,
  SeriesAttachedParameter,
  SeriesMarker,
  Time,
  UTCTimestamp,
} from 'lightweight-charts';
import { CanvasRenderingTarget2D } from 'fancy-canvas';
import { Maximize2, Radio } from 'lucide-react';
import { BINARY_TRADING_PAIRS, fmtPairPrice } from '../engine/dataParser';
import {
  BotAnalysisResult,
  BotSignal,
  Candle,
  CandleAnatomy,
} from '../engine/types';

export type ChartStyleMode = 'classic' | 'modern';
export type SubchartMode = 'volume' | 'rsi' | 'stoch' | 'macd' | 'maOsc';

export interface ChartOverlayToggles {
  showMAs: boolean;
  showWindows: boolean;
  showSRZones: boolean;
  showTrendlines: boolean;
  showFibs: boolean;
  showSignals: boolean;
}

interface CandlestickChartProps {
  analysis: BotAnalysisResult;
  replayCursor: number; // 0-indexed inclusive last visible candle
  selectedSignalId: string | null;
  onSelectSignal: (signal: BotSignal) => void;
  chartStyle: ChartStyleMode;
  onChangeChartStyle: (mode: ChartStyleMode) => void;
  subchartMode: SubchartMode;
  onChangeSubchartMode: (mode: SubchartMode) => void;
  overlays: ChartOverlayToggles;
  isLiveStreaming?: boolean;
  pairId?: string;
}

interface WindowZoneRenderItem {
  id: string;
  startLogical: number;
  top: number;
  bottom: number;
  isRising: boolean;
}

function describeAnatomy(a: CandleAnatomy | undefined): string {
  if (!a) return 'Candle';
  if (a.isGravestoneDoji) return 'Gravestone Doji';
  if (a.isDragonflyDoji) return 'Dragonfly Doji';
  if (a.isLongLeggedDoji) return 'Long-Legged Doji';
  if (a.isDoji) return 'Doji';
  if (a.isHighWave) return 'High-Wave Spinning Top';
  const colorLabel = a.color === 'white' ? 'White' : 'Black';
  const sizeLabel = a.isLongBody ? 'Tall' : a.isSmallBody ? 'Small' : 'Medium';
  const shaven =
    a.isShavenHead && a.isShavenBottom
      ? ' (Marubozu)'
      : a.isShavenBottom && a.color === 'white'
      ? ' (Shaven Bottom)'
      : a.isShavenHead && a.color === 'black'
      ? ' (Shaven Head)'
      : '';
  return `${sizeLabel} ${colorLabel}${shaven}`;
}

function resolvePricePrecision(pairId: string | undefined, samplePrice: number): {
  precision: number;
  minMove: number;
} {
  let precision = 2;
  if (pairId) {
    const found = BINARY_TRADING_PAIRS.find(
      (p) => p.id === pairId || p.providerSymbol === pairId
    );
    if (found) {
      precision = found.decimals;
    } else if (pairId.toUpperCase().includes('JPY')) {
      precision = 3;
    }
  } else if (Number.isFinite(samplePrice)) {
    const abs = Math.abs(samplePrice);
    if (abs >= 500) precision = 2;
    else if (abs >= 50) precision = 3;
    else if (abs >= 5) precision = 4;
    else precision = 5;
  }
  return {
    precision,
    minMove: Number(Math.pow(10, -precision).toFixed(precision)),
  };
}

function parseCandleTimestampSec(rawTime: string): number | null {
  const s = rawTime.trim();
  if (!s) return null;

  // YYYY-MM-DD HH:MM(:SS)
  if (/^\d{4}-\d{2}-\d{2}\s+\d{2}:\d{2}(:\d{2})?$/.test(s)) {
    const iso = s.replace(/\s+/, 'T') + (s.length === 16 ? ':00Z' : 'Z');
    const ms = Date.parse(iso);
    if (Number.isFinite(ms)) return Math.floor(ms / 1000);
  }

  // YYYY-MM-DD
  if (/^\d{4}-\d{2}-\d{2}$/.test(s)) {
    const ms = Date.parse(`${s}T00:00:00Z`);
    if (Number.isFinite(ms)) return Math.floor(ms / 1000);
  }

  const ms = Date.parse(s);
  if (Number.isFinite(ms)) return Math.floor(ms / 1000);

  return null;
}

function buildMonotonicTimestamps(candles: Candle[]): UTCTimestamp[] {
  const result: UTCTimestamp[] = [];
  // Fallback anchor 2025-01-01 00:00 UTC if synthetic labels like "Bar 1" are used
  const baseFallback = 1735689600;
  let prev = -Infinity;

  for (let i = 0; i < candles.length; i++) {
    const parsed = parseCandleTimestampSec(candles[i].time);
    let ts = parsed !== null ? parsed : baseFallback + i * 86400;
    if (ts <= prev) {
      ts = prev + 60;
    }
    prev = ts;
    result.push(ts as UTCTimestamp);
  }
  return result;
}

class NisonWindowZonesPrimitive implements ISeriesPrimitive<Time> {
  private _param: SeriesAttachedParameter<Time> | null = null;
  private _windows: WindowZoneRenderItem[] = [];

  attached(param: SeriesAttachedParameter<Time>): void {
    this._param = param;
  }

  detached(): void {
    this._param = null;
  }

  setWindows(windows: WindowZoneRenderItem[]): void {
    this._windows = windows;
    this._param?.requestUpdate();
  }

  paneViews(): readonly IPrimitivePaneView[] {
    return [
      {
        zOrder: (): PrimitivePaneViewZOrder => 'bottom',
        renderer: (): IPrimitivePaneRenderer | null => {
          const param = this._param;
          const windows = this._windows;
          if (!param || windows.length === 0) return null;

          return {
            draw: (target: CanvasRenderingTarget2D) => {
              target.useMediaCoordinateSpace(({ context, mediaSize }) => {
                const timeScale = param.chart.timeScale();
                for (const w of windows) {
                  const xRaw = timeScale.logicalToCoordinate(w.startLogical as Logical);
                  const yTop = param.series.priceToCoordinate(w.top);
                  const yBot = param.series.priceToCoordinate(w.bottom);
                  if (xRaw === null || yTop === null || yBot === null) continue;

                  const x1 = Math.max(0, Math.min(mediaSize.width, xRaw));
                  const x2 = mediaSize.width;
                  const topY = Math.min(yTop, yBot);
                  const boxH = Math.max(2, Math.abs(yBot - yTop));

                  if (x2 <= x1) continue;

                  context.save();
                  context.fillStyle = w.isRising
                    ? 'rgba(34, 197, 94, 0.14)'
                    : 'rgba(239, 68, 68, 0.14)';
                  context.fillRect(x1, topY, x2 - x1, boxH);

                  context.strokeStyle = w.isRising ? '#22C55E' : '#EF4444';
                  context.lineWidth = 1;
                  context.setLineDash([4, 3]);
                  context.beginPath();
                  context.moveTo(x1, topY);
                  context.lineTo(x2, topY);
                  context.moveTo(x1, topY + boxH);
                  context.lineTo(x2, topY + boxH);
                  context.stroke();

                  context.setLineDash([]);
                  context.font = '600 10px "DM Sans", sans-serif';
                  context.fillStyle = w.isRising ? '#4ADE80' : '#F87171';
                  const labelX = Math.max(6, xRaw + 6);
                  if (labelX < mediaSize.width - 110 && topY > 12) {
                    context.fillText(
                      w.isRising ? 'Rising Window Sup' : 'Falling Window Res',
                      labelX,
                      topY - 4
                    );
                  }
                  context.restore();
                }
              });
            },
          };
        },
      },
    ];
  }
}

export const CandlestickChart: React.FC<CandlestickChartProps> = ({
  analysis,
  replayCursor,
  selectedSignalId,
  onSelectSignal,
  chartStyle,
  onChangeChartStyle,
  subchartMode,
  onChangeSubchartMode,
  overlays,
  isLiveStreaming = false,
  pairId,
}) => {
  const fmtPrice = (v: number) => fmtPairPrice(v, pairId);

  const chartHostRef = useRef<HTMLDivElement>(null);
  const chartApiRef = useRef<IChartApi | null>(null);
  const candleSeriesRef = useRef<ISeriesApi<'Candlestick'> | null>(null);
  const markersPluginRef = useRef<ISeriesMarkersPluginApi<Time> | null>(null);
  const windowPrimitiveRef = useRef<NisonWindowZonesPrimitive | null>(null);

  const sma5SeriesRef = useRef<ISeriesApi<'Line'> | null>(null);
  const ema9SeriesRef = useRef<ISeriesApi<'Line'> | null>(null);
  const sma30SeriesRef = useRef<ISeriesApi<'Line'> | null>(null);

  const trendlineSeriesPoolRef = useRef<ISeriesApi<'Line'>[]>([]);
  const mainPriceLinesRef = useRef<IPriceLine[]>([]);

  // Subchart pane (paneIndex = 1) series refs
  const subHistSeriesRef = useRef<ISeriesApi<'Histogram'> | null>(null);
  const subLineASeriesRef = useRef<ISeriesApi<'Line'> | null>(null);
  const subLineBSeriesRef = useRef<ISeriesApi<'Line'> | null>(null);
  const subPriceLinesRef = useRef<IPriceLine[]>([]);

  // Lookup refs for click & crosshair handlers
  const timeToIdxRef = useRef<Map<number, number>>(new Map());
  const signalsByBarRef = useRef<Map<number, BotSignal[]>>(new Map());
  const onSelectSignalRef = useRef(onSelectSignal);
  onSelectSignalRef.current = onSelectSignal;

  // Track dataset identity to only fitContent when switching pairs/timeframes/datasets
  const prevFirstBarKeyRef = useRef<string>('');
  const prevVisibleLenRef = useRef<number>(0);

  const [hoverIdx, setHoverIdx] = useState<number | null>(null);

  const visibleCount = Math.max(1, Math.min(replayCursor + 1, analysis.candles.length));
  const visibleCandles = useMemo(
    () => analysis.candles.slice(0, visibleCount),
    [analysis.candles, visibleCount]
  );

  const timestamps = useMemo(
    () => buildMonotonicTimestamps(visibleCandles),
    [visibleCandles]
  );

  const visibleSignals = useMemo(
    () => analysis.signals.filter((s) => s.candleIndex <= replayCursor),
    [analysis.signals, replayCursor]
  );

  const visibleWindows = useMemo(
    () =>
      analysis.windows.filter(
        (w) =>
          w.createdAtIndex <= replayCursor &&
          (w.voidedAtIndex === undefined || w.voidedAtIndex > replayCursor)
      ),
    [analysis.windows, replayCursor]
  );

  const visibleSR = useMemo(
    () =>
      analysis.srZones
        .filter(
          (z) =>
            z.sourceIndex <= replayCursor &&
            (z.active || (z.brokenAtIndex !== undefined && z.brokenAtIndex > replayCursor))
        )
        .slice(-6),
    [analysis.srZones, replayCursor]
  );

  const signalsByBar = useMemo(() => {
    const map = new Map<number, BotSignal[]>();
    for (const s of visibleSignals) {
      const arr = map.get(s.candleIndex) ?? [];
      arr.push(s);
      map.set(s.candleIndex, arr);
    }
    return map;
  }, [visibleSignals]);

  signalsByBarRef.current = signalsByBar;

  useEffect(() => {
    const map = new Map<number, number>();
    for (let i = 0; i < timestamps.length; i++) {
      map.set(Number(timestamps[i]), i);
    }
    timeToIdxRef.current = map;
  }, [timestamps]);

  // Initialize TradingView lightweight-charts instance once
  useEffect(() => {
    const el = chartHostRef.current;
    if (!el) return;

    const initialW = Math.max(320, el.clientWidth || 900);
    const chart = createChart(el, {
      width: initialW,
      height: 520,
      layout: {
        background: { type: ColorType.Solid, color: '#131722' },
        textColor: '#94A3B8',
        fontFamily: '"DM Sans", system-ui, sans-serif',
        fontSize: 11,
        panes: {
          separatorColor: '#2A2E39',
          separatorHoverColor: '#475569',
          enableResize: true,
        },
      },
      grid: {
        vertLines: { color: '#1E222D' },
        horzLines: { color: '#1E222D' },
      },
      crosshair: {
        mode: CrosshairMode.Normal,
        vertLine: {
          color: '#64748B',
          width: 1,
          style: LineStyle.Dashed,
          labelBackgroundColor: '#1E293B',
        },
        horzLine: {
          color: '#64748B',
          width: 1,
          style: LineStyle.Dashed,
          labelBackgroundColor: '#1E293B',
        },
      },
      rightPriceScale: {
        borderColor: '#2A2E39',
        scaleMargins: { top: 0.08, bottom: 0.08 },
      },
      timeScale: {
        borderColor: '#2A2E39',
        timeVisible: true,
        secondsVisible: false,
        rightOffset: 6,
        barSpacing: 8,
        minBarSpacing: 3,
      },
      handleScroll: {
        mouseWheel: true,
        pressedMouseMove: true,
        horzTouchDrag: true,
        vertTouchDrag: true,
      },
      handleScale: {
        axisPressedMouseMove: true,
        mouseWheel: true,
        pinch: true,
      },
    });

    // Main Candlestick Series on Pane 0
    const candleSeries = chart.addSeries(
      CandlestickSeries,
      {
        upColor: '#131722',
        downColor: '#94A3B8',
        borderUpColor: '#F8FAFC',
        borderDownColor: '#94A3B8',
        wickUpColor: '#F8FAFC',
        wickDownColor: '#94A3B8',
        priceLineVisible: true,
        lastValueVisible: true,
      },
      0
    );

    const windowPrim = new NisonWindowZonesPrimitive();
    candleSeries.attachPrimitive(windowPrim);

    const markersPlugin = createSeriesMarkers(candleSeries, []);

    // Moving Average Lines on Pane 0
    const sma30 = chart.addSeries(
      LineSeries,
      {
        color: '#94A3B8',
        lineWidth: 2,
        lineStyle: LineStyle.Dashed,
        priceLineVisible: false,
        lastValueVisible: false,
        crosshairMarkerVisible: false,
      },
      0
    );
    const ema9 = chart.addSeries(
      LineSeries,
      {
        color: '#60A5FA',
        lineWidth: 2,
        priceLineVisible: false,
        lastValueVisible: false,
        crosshairMarkerVisible: false,
      },
      0
    );
    const sma5 = chart.addSeries(
      LineSeries,
      {
        color: '#FBBF24',
        lineWidth: 1,
        priceLineVisible: false,
        lastValueVisible: false,
        crosshairMarkerVisible: false,
      },
      0
    );

    // Pre-allocate Subchart Pane (Pane 1) series
    const subHist = chart.addSeries(
      HistogramSeries,
      {
        priceLineVisible: false,
        lastValueVisible: false,
      },
      1
    );
    const subLineA = chart.addSeries(
      LineSeries,
      {
        color: '#E2E8F0',
        lineWidth: 2,
        priceLineVisible: false,
        lastValueVisible: true,
      },
      1
    );
    const subLineB = chart.addSeries(
      LineSeries,
      {
        color: '#FB923C',
        lineWidth: 2,
        priceLineVisible: false,
        lastValueVisible: true,
      },
      1
    );

    const panes = chart.panes();
    if (panes[0]) panes[0].setStretchFactor(0.74);
    if (panes[1]) panes[1].setStretchFactor(0.26);

    chartApiRef.current = chart;
    candleSeriesRef.current = candleSeries;
    markersPluginRef.current = markersPlugin;
    windowPrimitiveRef.current = windowPrim;
    sma5SeriesRef.current = sma5;
    ema9SeriesRef.current = ema9;
    sma30SeriesRef.current = sma30;
    subHistSeriesRef.current = subHist;
    subLineASeriesRef.current = subLineA;
    subLineBSeriesRef.current = subLineB;

    const handleCrosshair = (param: MouseEventParams<Time>) => {
      if (!param.time) {
        setHoverIdx(null);
        return;
      }
      const idx = timeToIdxRef.current.get(Number(param.time));
      setHoverIdx(idx !== undefined ? idx : null);
    };
    chart.subscribeCrosshairMove(handleCrosshair);

    const handleClick = (param: MouseEventParams<Time>) => {
      if (!param.time) return;
      const idx = timeToIdxRef.current.get(Number(param.time));
      if (idx === undefined) return;
      const map = signalsByBarRef.current;
      // Direct match or nearest signal within +-1 bar for easy clicking
      const candidateBars = [idx, idx - 1, idx + 1];
      for (const b of candidateBars) {
        const sigs = map.get(b);
        if (sigs && sigs.length > 0) {
          onSelectSignalRef.current(sigs[sigs.length - 1]);
          return;
        }
      }
    };
    chart.subscribeClick(handleClick);

    const ro = new ResizeObserver((entries) => {
      for (const entry of entries) {
        const w = Math.round(entry.contentRect.width);
        if (w > 120) {
          const targetH = Math.max(460, Math.min(560, Math.round(w * 0.54)));
          chart.applyOptions({ width: w, height: targetH });
        }
      }
    });
    ro.observe(el);

    return () => {
      ro.disconnect();
      chart.unsubscribeCrosshairMove(handleCrosshair);
      chart.unsubscribeClick(handleClick);
      chart.remove();
      chartApiRef.current = null;
      candleSeriesRef.current = null;
      markersPluginRef.current = null;
      windowPrimitiveRef.current = null;
      sma5SeriesRef.current = null;
      ema9SeriesRef.current = null;
      sma30SeriesRef.current = null;
      subHistSeriesRef.current = null;
      subLineASeriesRef.current = null;
      subLineBSeriesRef.current = null;
      trendlineSeriesPoolRef.current = [];
      mainPriceLinesRef.current = [];
      subPriceLinesRef.current = [];
    };
  }, []);

  // Update Candles, Style, Precision & Moving Averages
  useEffect(() => {
    const chart = chartApiRef.current;
    const candleSeries = candleSeriesRef.current;
    const sma5 = sma5SeriesRef.current;
    const ema9 = ema9SeriesRef.current;
    const sma30 = sma30SeriesRef.current;
    if (!chart || !candleSeries || !sma5 || !ema9 || !sma30) return;

    const lastCandle = visibleCandles[visibleCandles.length - 1];
    const samplePrice = lastCandle?.close ?? 100;
    const { precision, minMove } = resolvePricePrecision(pairId, samplePrice);

    const isBullLast = lastCandle ? lastCandle.close >= lastCandle.open : true;
    const liveLineColor = isLiveStreaming
      ? isBullLast
        ? '#22C55E'
        : '#EF4444'
      : '#64748B';

    candleSeries.applyOptions({
      priceFormat: { type: 'price', precision, minMove },
      priceLineColor: liveLineColor,
      ...(chartStyle === 'classic'
        ? {
            upColor: '#131722',
            downColor: '#94A3B8',
            borderUpColor: '#F8FAFC',
            borderDownColor: '#94A3B8',
            wickUpColor: '#F8FAFC',
            wickDownColor: '#94A3B8',
          }
        : {
            upColor: '#26A69A',
            downColor: '#EF5350',
            borderUpColor: '#26A69A',
            borderDownColor: '#EF5350',
            wickUpColor: '#26A69A',
            wickDownColor: '#EF5350',
          }),
    });

    const lastIdx = visibleCandles.length - 1;
    const datasetId = `${pairId ?? 'custom'}:${visibleCandles.length > 1 ? timestamps[1] - timestamps[0] : 0}`;
    const lenDiff = Math.abs(visibleCandles.length - prevVisibleLenRef.current);
    const prevFirstTs = Number(prevFirstBarKeyRef.current.split('::')[1] || 0);
    const curFirstTs = Number(timestamps[0] || 0);
    const prevDatasetId = prevFirstBarKeyRef.current.split('::')[0] || '';

    const canIncrementalUpdate =
      prevDatasetId === datasetId &&
      curFirstTs === prevFirstTs &&
      (lenDiff === 0 || (visibleCandles.length - prevVisibleLenRef.current === 1)) &&
      lastCandle !== undefined;

    if (canIncrementalUpdate && lastCandle) {
      candleSeries.update({
        time: timestamps[lastIdx],
        open: lastCandle.open,
        high: lastCandle.high,
        low: lastCandle.low,
        close: lastCandle.close,
      });
      if (visibleCandles.length - prevVisibleLenRef.current === 1 && isLiveStreaming) {
        chart.timeScale().scrollToRealTime();
      }
    } else {
      candleSeries.setData(
        visibleCandles.map((c, i) => ({
          time: timestamps[i],
          open: c.open,
          high: c.high,
          low: c.low,
          close: c.close,
        }))
      );
      if (prevDatasetId !== datasetId || lenDiff > 3) {
        chart.timeScale().fitContent();
      } else if (isLiveStreaming) {
        chart.timeScale().scrollToRealTime();
      }
    }

    // Moving Averages (Ch. 13)
    if (overlays.showMAs) {
      const sma5Data = [];
      const ema9Data = [];
      const sma30Data = [];
      for (let i = 0; i < visibleCandles.length; i++) {
        const t = timestamps[i];
        const v5 = analysis.indicators.sma5[i];
        const v9 = analysis.indicators.ema9[i];
        const v30 = analysis.indicators.sma30[i];
        if (v5 !== null && Number.isFinite(v5)) sma5Data.push({ time: t, value: v5 });
        if (v9 !== null && Number.isFinite(v9)) ema9Data.push({ time: t, value: v9 });
        if (v30 !== null && Number.isFinite(v30)) sma30Data.push({ time: t, value: v30 });
      }
      sma5.setData(sma5Data);
      ema9.setData(ema9Data);
      sma30.setData(sma30Data);
      sma5.applyOptions({ visible: true });
      ema9.applyOptions({ visible: true });
      sma30.applyOptions({ visible: true });
    } else {
      sma5.applyOptions({ visible: false });
      ema9.applyOptions({ visible: false });
      sma30.applyOptions({ visible: false });
    }

    prevFirstBarKeyRef.current = `${datasetId}::${curFirstTs}`;
    prevVisibleLenRef.current = visibleCandles.length;
  }, [
    visibleCandles,
    timestamps,
    analysis.indicators.sma5,
    analysis.indicators.ema9,
    analysis.indicators.sma30,
    overlays.showMAs,
    chartStyle,
    isLiveStreaming,
    pairId,
  ]);

  // Update Window Bands, Polarity S/R & Fibonacci Price Lines, Trendlines, and Signal Markers
  useEffect(() => {
    const chart = chartApiRef.current;
    const candleSeries = candleSeriesRef.current;
    const markersPlugin = markersPluginRef.current;
    const windowPrim = windowPrimitiveRef.current;
    if (!chart || !candleSeries || !markersPlugin || !windowPrim) return;

    // 1. Shaded Rising/Falling Windows (Ch. 7)
    if (overlays.showWindows) {
      windowPrim.setWindows(
        visibleWindows.map((w) => ({
          id: w.id,
          startLogical: w.createdAtIndex,
          top: w.top,
          bottom: w.bottom,
          isRising: w.type === 'rising_window',
        }))
      );
    } else {
      windowPrim.setWindows([]);
    }

    // 2. Price Lines: S/R Zones (Ch. 10 & 11) + Fibonacci Retracements (Ch. 12)
    for (const pl of mainPriceLinesRef.current) {
      candleSeries.removePriceLine(pl);
    }
    mainPriceLinesRef.current = [];

    if (overlays.showSRZones) {
      for (const z of visibleSR) {
        const isSup = z.type === 'support';
        const line = candleSeries.createPriceLine({
          price: z.midpoint,
          color: isSup ? '#2DD4BF' : '#FB7185',
          lineWidth: z.polarityFlipped ? 2 : 1,
          lineStyle: z.polarityFlipped ? LineStyle.Dashed : LineStyle.Dotted,
          axisLabelVisible: true,
          title: z.polarityFlipped
            ? `Polarity ${isSup ? 'Sup' : 'Res'}`
            : isSup
            ? 'Sup'
            : 'Res',
        });
        mainPriceLinesRef.current.push(line);
      }
    }

    if (
      overlays.showFibs &&
      analysis.latestRetracement &&
      analysis.latestRetracement.swingEndIndex <= replayCursor
    ) {
      const fibs = [
        { label: 'Fib 38.2%', price: analysis.latestRetracement.level382 },
        { label: 'Fib 50.0%', price: analysis.latestRetracement.level500 },
        { label: 'Fib 61.8%', price: analysis.latestRetracement.level618 },
      ];
      for (const f of fibs) {
        const line = candleSeries.createPriceLine({
          price: f.price,
          color: '#818CF8',
          lineWidth: 1,
          lineStyle: LineStyle.SparseDotted,
          axisLabelVisible: true,
          title: f.label,
        });
        mainPriceLinesRef.current.push(line);
      }
    }

    // 3. Trendlines (Ch. 11) via LineSeries segments
    for (const tlSeries of trendlineSeriesPoolRef.current) {
      chart.removeSeries(tlSeries);
    }
    trendlineSeriesPoolRef.current = [];

    if (overlays.showTrendlines) {
      const activeTrendlines = analysis.trendlines.filter(
        (tl) => tl.startIndex <= replayCursor && tl.startIndex < visibleCandles.length
      );
      for (const tl of activeTrendlines) {
        const endI = Math.min(tl.endIndex, replayCursor, visibleCandles.length - 1);
        if (endI <= tl.startIndex) continue;
        const t1 = timestamps[tl.startIndex];
        const t2 = timestamps[endI];
        if (t1 === undefined || t2 === undefined || t2 <= t1) continue;

        const endPrice = tl.startPrice + tl.slope * (endI - tl.startIndex);
        const tlSeries = chart.addSeries(
          LineSeries,
          {
            color: tl.type.includes('support') ? '#38BDF8' : '#FB923C',
            lineWidth: 2,
            priceLineVisible: false,
            lastValueVisible: false,
            crosshairMarkerVisible: false,
          },
          0
        );
        tlSeries.setData([
          { time: t1, value: tl.startPrice },
          { time: t2, value: endPrice },
        ]);
        trendlineSeriesPoolRef.current.push(tlSeries);
      }
    }

    // 4. Signal Markers (B, S, W, X)
    if (overlays.showSignals) {
      const markers: SeriesMarker<Time>[] = [];
      const sortedBars = Array.from(signalsByBar.keys()).sort((a, b) => a - b);
      for (const barIdx of sortedBars) {
        const sigs = signalsByBar.get(barIdx);
        const t = timestamps[barIdx];
        if (!sigs || sigs.length === 0 || t === undefined) continue;
        const primary = sigs[sigs.length - 1];
        const isSelected = sigs.some((s) => s.id === selectedSignalId);
        const isBull = primary.bias === 'bullish';

        let color = '#64748B';
        let text = 'C';
        let shape: SeriesMarker<Time>['shape'] = isBull ? 'arrowUp' : 'arrowDown';
        if (primary.action === 'BUY') {
          color = '#22C55E';
          text = 'B';
          shape = 'arrowUp';
        } else if (primary.action === 'SELL') {
          color = '#EF4444';
          text = 'S';
          shape = 'arrowDown';
        } else if (primary.action === 'WAIT_CONFIRMATION') {
          color = '#F59E0B';
          text = 'W';
          shape = 'circle';
        } else if (primary.action === 'EXIT_LONG' || primary.action === 'EXIT_SHORT') {
          color = '#FB923C';
          text = 'X';
          shape = 'square';
        }

        markers.push({
          id: primary.id,
          time: t,
          position: isBull ? 'belowBar' : 'aboveBar',
          color: isSelected ? '#F8FAFC' : color,
          shape,
          text: isSelected ? `[${text}]` : text,
          size: isSelected ? 1.4 : 1,
        });
      }
      markersPlugin.setMarkers(markers);
    } else {
      markersPlugin.setMarkers([]);
    }
  }, [
    overlays.showWindows,
    overlays.showSRZones,
    overlays.showFibs,
    overlays.showTrendlines,
    overlays.showSignals,
    visibleWindows,
    visibleSR,
    visibleCandles.length,
    timestamps,
    analysis.latestRetracement,
    analysis.trendlines,
    replayCursor,
    signalsByBar,
    selectedSignalId,
  ]);

  // Update Subchart Pane (Pane 1): Volume / RSI 14 / Slow Stoch / MACD / 5-13 MA Osc
  useEffect(() => {
    const subHist = subHistSeriesRef.current;
    const subLineA = subLineASeriesRef.current;
    const subLineB = subLineBSeriesRef.current;
    if (!subHist || !subLineA || !subLineB) return;

    // Clear previous subchart price lines
    for (const pl of subPriceLinesRef.current) {
      subLineA.removePriceLine(pl);
    }
    subPriceLinesRef.current = [];

    if (subchartMode === 'volume') {
      subHist.applyOptions({
        visible: true,
        priceFormat: { type: 'volume' },
      });
      subLineA.applyOptions({ visible: false });
      subLineB.applyOptions({ visible: false });

      subHist.setData(
        visibleCandles.map((c, i) => ({
          time: timestamps[i],
          value: c.volume,
          color: c.close >= c.open ? 'rgba(34, 197, 94, 0.55)' : 'rgba(239, 68, 68, 0.55)',
        }))
      );
      subLineA.setData([]);
      subLineB.setData([]);
      return;
    }

    if (subchartMode === 'rsi') {
      subHist.applyOptions({ visible: false });
      subLineA.applyOptions({
        visible: true,
        color: '#E2E8F0',
        lineWidth: 2,
        priceFormat: { type: 'price', precision: 1, minMove: 0.1 },
      });
      subLineB.applyOptions({ visible: false });

      const rsiData = [];
      for (let i = 0; i < visibleCandles.length; i++) {
        const v = analysis.indicators.rsi14[i];
        if (v !== null && Number.isFinite(v)) {
          rsiData.push({ time: timestamps[i], value: v });
        }
      }
      subHist.setData([]);
      subLineA.setData(rsiData);
      subLineB.setData([]);

      for (const lvl of [70, 50, 30]) {
        subPriceLinesRef.current.push(
          subLineA.createPriceLine({
            price: lvl,
            color: lvl === 50 ? '#334155' : '#64748B',
            lineWidth: 1,
            lineStyle: LineStyle.Dashed,
            axisLabelVisible: true,
            title: lvl === 70 ? 'OB' : lvl === 30 ? 'OS' : '',
          })
        );
      }
      return;
    }

    if (subchartMode === 'stoch') {
      subHist.applyOptions({ visible: false });
      subLineA.applyOptions({
        visible: true,
        color: '#60A5FA',
        lineWidth: 2,
        priceFormat: { type: 'price', precision: 1, minMove: 0.1 },
      });
      subLineB.applyOptions({
        visible: true,
        color: '#F87171',
        lineWidth: 2,
        priceFormat: { type: 'price', precision: 1, minMove: 0.1 },
      });

      const kData = [];
      const dData = [];
      for (let i = 0; i < visibleCandles.length; i++) {
        const vk = analysis.indicators.stochK[i];
        const vd = analysis.indicators.stochD[i];
        if (vk !== null && Number.isFinite(vk)) kData.push({ time: timestamps[i], value: vk });
        if (vd !== null && Number.isFinite(vd)) dData.push({ time: timestamps[i], value: vd });
      }
      subHist.setData([]);
      subLineA.setData(kData);
      subLineB.setData(dData);

      for (const lvl of [80, 50, 20]) {
        subPriceLinesRef.current.push(
          subLineA.createPriceLine({
            price: lvl,
            color: lvl === 50 ? '#334155' : '#64748B',
            lineWidth: 1,
            lineStyle: LineStyle.Dashed,
            axisLabelVisible: true,
            title: lvl === 80 ? 'OB' : lvl === 20 ? 'OS' : '',
          })
        );
      }
      return;
    }

    if (subchartMode === 'macd') {
      const subPrec = Math.min(5, Math.max(2, resolvePricePrecision(pairId, visibleCandles[visibleCandles.length - 1]?.close ?? 100).precision));
      const subMinMove = Number(Math.pow(10, -subPrec).toFixed(subPrec));

      subHist.applyOptions({
        visible: true,
        priceFormat: { type: 'price', precision: subPrec, minMove: subMinMove },
      });
      subLineA.applyOptions({
        visible: true,
        color: '#E2E8F0',
        lineWidth: 2,
        priceFormat: { type: 'price', precision: subPrec, minMove: subMinMove },
      });
      subLineB.applyOptions({
        visible: true,
        color: '#FB923C',
        lineWidth: 2,
        priceFormat: { type: 'price', precision: subPrec, minMove: subMinMove },
      });

      const histData = [];
      const macdData = [];
      const sigData = [];
      for (let i = 0; i < visibleCandles.length; i++) {
        const t = timestamps[i];
        const h = analysis.indicators.macdHist[i];
        const m = analysis.indicators.macdLine[i];
        const s = analysis.indicators.macdSignal[i];
        if (h !== null && Number.isFinite(h)) {
          histData.push({
            time: t,
            value: h,
            color: h >= 0 ? 'rgba(34, 197, 94, 0.55)' : 'rgba(239, 68, 68, 0.55)',
          });
        }
        if (m !== null && Number.isFinite(m)) macdData.push({ time: t, value: m });
        if (s !== null && Number.isFinite(s)) sigData.push({ time: t, value: s });
      }
      subHist.setData(histData);
      subLineA.setData(macdData);
      subLineB.setData(sigData);

      subPriceLinesRef.current.push(
        subLineA.createPriceLine({
          price: 0,
          color: '#334155',
          lineWidth: 1,
          lineStyle: LineStyle.Dashed,
          axisLabelVisible: false,
          title: '',
        })
      );
      return;
    }

    // subchartMode === 'maOsc' (5 SMA - 13 SMA Oscillator)
    const oscPrec = Math.min(5, Math.max(2, resolvePricePrecision(pairId, visibleCandles[visibleCandles.length - 1]?.close ?? 100).precision));
    const oscMinMove = Number(Math.pow(10, -oscPrec).toFixed(oscPrec));
    subHist.applyOptions({
      visible: true,
      priceFormat: { type: 'price', precision: oscPrec, minMove: oscMinMove },
    });
    subLineA.applyOptions({ visible: false });
    subLineB.applyOptions({ visible: false });

    const oscData = [];
    for (let i = 0; i < visibleCandles.length; i++) {
      const v = analysis.indicators.maOsc[i];
      if (v !== null && Number.isFinite(v)) {
        oscData.push({
          time: timestamps[i],
          value: v,
          color: v >= 0 ? 'rgba(96, 165, 250, 0.72)' : 'rgba(239, 68, 68, 0.72)',
        });
      }
    }
    subHist.setData(oscData);
    subLineA.setData([]);
    subLineB.setData([]);
  }, [subchartMode, visibleCandles, timestamps, analysis.indicators, pairId]);

  const activeHoverIdx =
    hoverIdx !== null && hoverIdx >= 0 && hoverIdx < visibleCandles.length
      ? hoverIdx
      : visibleCandles.length - 1;
  const hoverCandle = visibleCandles[activeHoverIdx];
  const hoverAnatomy = analysis.anatomies[activeHoverIdx];

  const subchartLabel =
    subchartMode === 'volume'
      ? 'Volume (Ch. 15)'
      : subchartMode === 'rsi'
      ? 'RSI (14) — Ch. 14'
      : subchartMode === 'stoch'
      ? 'Slow Stochastics (14,3,3) — Ch. 14'
      : subchartMode === 'macd'
      ? 'MACD (12,26,9) — Ch. 14'
      : 'MA Oscillator (5 SMA - 13 SMA)';

  return (
    <div className="rounded-lg border border-slate-800 bg-[#131722] overflow-hidden">
      {/* TradingView Chart Toolbar */}
      <div className="border-b border-slate-800 px-4 py-2.5 flex flex-wrap items-center justify-between gap-3 bg-[#111827]">
        {/* Hover OHLCV & Candle Anatomy Readout */}
        <div className="flex flex-wrap items-center gap-x-3 gap-y-1 text-xs font-mono tabular-nums text-slate-300">
          {hoverCandle ? (
            <>
              <span className="font-semibold text-slate-100">{hoverCandle.time}</span>
              <span>O {fmtPrice(hoverCandle.open)}</span>
              <span>H {fmtPrice(hoverCandle.high)}</span>
              <span>L {fmtPrice(hoverCandle.low)}</span>
              <span
                className={`font-semibold ${
                  hoverCandle.close >= hoverCandle.open ? 'text-emerald-400' : 'text-red-400'
                }`}
              >
                C {fmtPrice(hoverCandle.close)}
              </span>
              <span className="text-slate-400">
                Vol {hoverCandle.volume.toLocaleString(undefined, { maximumFractionDigits: 2 })} (
                {(analysis.indicators.relVolume[activeHoverIdx] ?? 1).toFixed(1)}x)
              </span>
              <span className="font-sans text-[11.5px] font-medium text-slate-400">
                · {describeAnatomy(hoverAnatomy)}
              </span>
            </>
          ) : (
            <span>Loading TradingView chart...</span>
          )}
        </div>

        {/* Style, Subchart & TradingView Viewport Controls */}
        <div className="flex flex-wrap items-center gap-2">
          <div className="inline-flex rounded border border-slate-700 bg-[#0B0F19] p-0.5">
            <button
              type="button"
              onClick={() => onChangeChartStyle('classic')}
              className={`rounded-sm px-2 py-1 text-[11px] font-medium whitespace-nowrap cursor-pointer ${
                chartStyle === 'classic'
                  ? 'bg-slate-200 text-slate-950'
                  : 'text-slate-400 hover:text-slate-200'
              }`}
            >
              Classic Nison
            </button>
            <button
              type="button"
              onClick={() => onChangeChartStyle('modern')}
              className={`rounded-sm px-2 py-1 text-[11px] font-medium whitespace-nowrap cursor-pointer ${
                chartStyle === 'modern'
                  ? 'bg-slate-200 text-slate-950'
                  : 'text-slate-400 hover:text-slate-200'
              }`}
            >
              Modern
            </button>
          </div>

          <div className="inline-flex rounded border border-slate-700 bg-[#0B0F19] p-0.5">
            {(
              [
                { id: 'volume', label: 'Vol' },
                { id: 'rsi', label: 'RSI 14' },
                { id: 'stoch', label: 'Slow Stoch' },
                { id: 'macd', label: 'MACD' },
                { id: 'maOsc', label: '5-13 Osc' },
              ] as { id: SubchartMode; label: string }[]
            ).map((item) => (
              <button
                key={item.id}
                type="button"
                onClick={() => onChangeSubchartMode(item.id)}
                className={`rounded-sm px-2 py-1 text-[11px] font-medium whitespace-nowrap cursor-pointer ${
                  subchartMode === item.id
                    ? 'bg-slate-200 text-slate-950'
                    : 'text-slate-400 hover:text-slate-200'
                }`}
              >
                {item.label}
              </button>
            ))}
          </div>

          <button
            type="button"
            onClick={() => chartApiRef.current?.timeScale().fitContent()}
            className="inline-flex items-center gap-1 rounded border border-slate-700 bg-[#0B0F19] px-2 py-1 text-[11px] font-medium text-slate-300 hover:bg-slate-800 cursor-pointer"
            title="Fit all candles to TradingView canvas"
          >
            <Maximize2 className="w-3 h-3" />
            <span>Fit</span>
          </button>

          {isLiveStreaming && (
            <button
              type="button"
              onClick={() => chartApiRef.current?.timeScale().scrollToRealTime()}
              className="inline-flex items-center gap-1 rounded border border-emerald-600/60 bg-emerald-500/15 px-2 py-1 text-[11px] font-medium text-emerald-300 hover:bg-emerald-500/25 cursor-pointer"
              title="Scroll to real-time candle"
            >
              <Radio className="w-3 h-3" />
              <span>Live</span>
            </button>
          )}
        </div>
      </div>

      {/* TradingView Lightweight-Charts Canvas Host */}
      <div className="relative w-full bg-[#131722]">
        <div ref={chartHostRef} className="w-full" />
        <div className="pointer-events-none absolute bottom-[27%] left-3 z-10 rounded bg-[#131722]/85 px-1.5 py-0.5 text-[10.5px] font-medium text-slate-400">
          {subchartLabel}
        </div>
      </div>

      {/* Compact Legend Footer */}
      <div className="border-t border-slate-800 bg-[#111827] px-4 py-2 flex flex-wrap items-center justify-between gap-2 text-[11px] text-slate-400">
        <div className="flex flex-wrap items-center gap-x-4 gap-y-1">
          <span>
            <strong className="text-amber-400">—</strong> 5 SMA
          </span>
          <span>
            <strong className="text-blue-400">—</strong> 9 EMA
          </span>
          <span>
            <strong className="text-slate-400">- -</strong> 30 SMA
          </span>
          <span>
            Markers (click bar): <strong className="text-emerald-400">B</strong> Buy ·{' '}
            <strong className="text-red-400">S</strong> Sell ·{' '}
            <strong className="text-amber-400">W</strong> Wait Close ·{' '}
            <strong className="text-orange-400">X</strong> Exit/Warn
          </span>
        </div>
        <div className="font-mono tabular-nums text-slate-400">
          TradingView Canvas · {visibleSignals.length} signal{visibleSignals.length === 1 ? '' : 's'} through Bar #{visibleCount}
        </div>
      </div>
    </div>
  );
};
