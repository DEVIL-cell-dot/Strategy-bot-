import { Candle } from './types';

export interface ParseResult {
  candles: Candle[];
  error?: string;
}

export type LiveFeedStatus = 'connecting' | 'live' | 'polling' | 'paused' | 'error';

export type PairCategory = 'forex' | 'commodities' | 'crypto';

export interface TradingPairDef {
  id: string; // Display ID e.g. 'EUR/USD'
  label: string;
  category: PairCategory;
  provider: 'kraken' | 'binance' | 'backend';
  providerSymbol: string; // e.g. 'EURUSD' / 'EUR/USD' / 'BTCUSDT'
  wsSymbol?: string; // e.g. 'EUR/USD' for Kraken WS v2
  decimals: number;
}

export const BINARY_TRADING_PAIRS: TradingPairDef[] = [
  // Forex Majors & Crosses (Live 1s WebSocket via Kraken + Backend Yahoo fallback)
  { id: 'EUR/USD', label: 'EUR/USD', category: 'forex', provider: 'kraken', providerSymbol: 'EURUSD', wsSymbol: 'EUR/USD', decimals: 5 },
  { id: 'GBP/USD', label: 'GBP/USD', category: 'forex', provider: 'kraken', providerSymbol: 'GBPUSD', wsSymbol: 'GBP/USD', decimals: 5 },
  { id: 'USD/JPY', label: 'USD/JPY', category: 'forex', provider: 'kraken', providerSymbol: 'USDJPY', wsSymbol: 'USD/JPY', decimals: 3 },
  { id: 'AUD/USD', label: 'AUD/USD', category: 'forex', provider: 'kraken', providerSymbol: 'AUDUSD', wsSymbol: 'AUD/USD', decimals: 5 },
  { id: 'USD/CAD', label: 'USD/CAD', category: 'forex', provider: 'kraken', providerSymbol: 'USDCAD', wsSymbol: 'USD/CAD', decimals: 5 },
  { id: 'USD/CHF', label: 'USD/CHF', category: 'forex', provider: 'kraken', providerSymbol: 'USDCHF', wsSymbol: 'USD/CHF', decimals: 5 },
  { id: 'EUR/GBP', label: 'EUR/GBP', category: 'forex', provider: 'kraken', providerSymbol: 'EURGBP', wsSymbol: 'EUR/GBP', decimals: 5 },
  { id: 'EUR/JPY', label: 'EUR/JPY', category: 'forex', provider: 'kraken', providerSymbol: 'EURJPY', wsSymbol: 'EUR/JPY', decimals: 3 },
  { id: 'GBP/JPY', label: 'GBP/JPY', category: 'forex', provider: 'backend', providerSymbol: 'GBP/JPY', decimals: 3 },
  { id: 'AUD/JPY', label: 'AUD/JPY', category: 'forex', provider: 'backend', providerSymbol: 'AUD/JPY', decimals: 3 },

  // Gold & Silver (24/7 Spot Gold via Binance WS PAXGUSDT + Silver via Backend)
  { id: 'XAU/USD', label: 'XAU/USD (Gold 24/7)', category: 'commodities', provider: 'binance', providerSymbol: 'PAXGUSDT', decimals: 2 },
  { id: 'XAG/USD', label: 'XAG/USD (Silver)', category: 'commodities', provider: 'backend', providerSymbol: 'XAG/USD', decimals: 3 },

  // 24/7 Crypto Binary Pairs (Sub-second Live WebSocket via Binance)
  { id: 'BTC/USD', label: 'BTC/USD (24/7)', category: 'crypto', provider: 'binance', providerSymbol: 'BTCUSDT', decimals: 2 },
  { id: 'ETH/USD', label: 'ETH/USD (24/7)', category: 'crypto', provider: 'binance', providerSymbol: 'ETHUSDT', decimals: 2 },
  { id: 'EUR/USDT', label: 'EUR/USDT (24/7)', category: 'crypto', provider: 'binance', providerSymbol: 'EURUSDT', decimals: 4 },
  { id: 'SOL/USD', label: 'SOL/USD (24/7)', category: 'crypto', provider: 'binance', providerSymbol: 'SOLUSDT', decimals: 2 },
  { id: 'XRP/USD', label: 'XRP/USD (24/7)', category: 'crypto', provider: 'binance', providerSymbol: 'XRPUSDT', decimals: 4 },
  { id: 'BNB/USD', label: 'BNB/USD (24/7)', category: 'crypto', provider: 'binance', providerSymbol: 'BNBUSDT', decimals: 2 },
];

export const BINARY_TIMEFRAMES = ['1m', '5m', '15m', '30m', '1h', '4h', '1d'] as const;

export function timeframeToSeconds(tf: string): number {
  switch (tf.toLowerCase()) {
    case '1m':
      return 60;
    case '3m':
      return 180;
    case '5m':
      return 300;
    case '15m':
      return 900;
    case '30m':
      return 1800;
    case '1h':
      return 3600;
    case '4h':
      return 14400;
    case '1d':
      return 86400;
    default:
      return 60;
  }
}

export function timeframeToKrakenInterval(tf: string): number {
  switch (tf.toLowerCase()) {
    case '1m':
      return 1;
    case '5m':
      return 5;
    case '15m':
      return 15;
    case '30m':
      return 30;
    case '1h':
      return 60;
    case '4h':
      return 240;
    case '1d':
      return 1440;
    default:
      return 1;
  }
}

export function fmtPairPrice(v: number, pairId?: string): string {
  if (!Number.isFinite(v)) return '—';
  if (pairId) {
    const found = BINARY_TRADING_PAIRS.find(
      (p) => p.id === pairId || p.providerSymbol === pairId
    );
    if (found) return v.toFixed(found.decimals);
    if (pairId.toUpperCase().includes('JPY')) return v.toFixed(3);
  }
  const abs = Math.abs(v);
  if (abs >= 500) return v.toFixed(2);
  if (abs >= 50) return v.toFixed(3);
  if (abs >= 5) return v.toFixed(4);
  return v.toFixed(5);
}

export function formatKlineTime(ms: number, interval: string): string {
  const d = new Date(ms);
  if (interval === '1d' || interval === '3d' || interval === '1w') {
    return d.toISOString().slice(0, 10);
  }
  return d.toISOString().slice(0, 16).replace('T', ' ');
}

export function parseOHLCVText(raw: string): ParseResult {
  const trimmed = raw.trim();
  if (!trimmed) {
    return { candles: [], error: 'Input is empty. Paste CSV or JSON OHLCV rows.' };
  }

  if (trimmed.startsWith('[') || trimmed.startsWith('{')) {
    try {
      const parsed = JSON.parse(trimmed);
      const list = Array.isArray(parsed)
        ? parsed
        : Array.isArray(parsed.candles)
        ? parsed.candles
        : Array.isArray(parsed.data)
        ? parsed.data
        : null;

      if (!list || list.length === 0) {
        return { candles: [], error: 'JSON did not contain a non-empty array of candles.' };
      }

      const rawCandles: Candle[] = [];
      list.forEach((item: unknown, idx: number) => {
        if (Array.isArray(item) && item.length >= 5) {
          const ts = Number(item[0]);
          const time = Number.isFinite(ts) && ts > 1e10
            ? new Date(ts).toISOString().slice(0, 16).replace('T', ' ')
            : String(item[0]);
          const open = Number(item[1]);
          const high = Number(item[2]);
          const low = Number(item[3]);
          const close = Number(item[4]);
          const volume = item[5] !== undefined ? Number(item[5]) : 0;
          if ([open, high, low, close].every(Number.isFinite)) {
            rawCandles.push({
              index: idx,
              time,
              open,
              high: Math.max(high, open, close),
              low: Math.min(low, open, close),
              close,
              volume: Number.isFinite(volume) ? volume : 0,
            });
          }
        } else if (item && typeof item === 'object') {
          const obj = item as Record<string, unknown>;
          const timeRaw = obj.time ?? obj.date ?? obj.timestamp ?? obj.Date ?? obj.Time ?? `#${idx + 1}`;
          const open = Number(obj.open ?? obj.Open ?? obj.o);
          const high = Number(obj.high ?? obj.High ?? obj.h);
          const low = Number(obj.low ?? obj.Low ?? obj.l);
          const close = Number(obj.close ?? obj.Close ?? obj.c);
          const volume = Number(obj.volume ?? obj.Volume ?? obj.v ?? 0);
          if ([open, high, low, close].every(Number.isFinite)) {
            rawCandles.push({
              index: idx,
              time: String(timeRaw),
              open,
              high: Math.max(high, open, close),
              low: Math.min(low, open, close),
              close,
              volume: Number.isFinite(volume) ? volume : 0,
            });
          }
        }
      });

      if (rawCandles.length < 15) {
        return {
          candles: [],
          error: `Parsed only ${rawCandles.length} valid bars. Provide at least 15 OHLC bars for trend & pattern context.`,
        };
      }

      return { candles: normalizeChronology(rawCandles) };
    } catch {
      return { candles: [], error: 'Invalid JSON syntax. Verify brackets, quotes, and numeric OHLC fields.' };
    }
  }

  const lines = trimmed
    .split(/\r?\n/)
    .map((l) => l.trim())
    .filter((l) => l.length > 0);

  if (lines.length < 15) {
    return {
      candles: [],
      error: `Found ${lines.length} rows. Provide at least 15 OHLC bars so trend context and patterns can be computed.`,
    };
  }

  const firstLine = lines[0];
  const delimiter = firstLine.includes('\t') ? '\t' : firstLine.includes(';') ? ';' : ',';
  const headerCells = firstLine.split(delimiter).map((c) => c.trim().toLowerCase().replace(/['"]/g, ''));

  const hasHeader = headerCells.some((c) =>
    ['open', 'high', 'low', 'close', 'o', 'h', 'l', 'c', 'date', 'time', 'timestamp'].includes(c)
  );

  let colTime = 0;
  let colOpen = 1;
  let colHigh = 2;
  let colLow = 3;
  let colClose = 4;
  let colVol = 5;

  if (hasHeader) {
    const findCol = (names: string[], fallback: number) => {
      const idx = headerCells.findIndex((h) => names.some((n) => h === n || h.includes(n)));
      return idx >= 0 ? idx : fallback;
    };
    colTime = findCol(['date', 'time', 'timestamp'], 0);
    colOpen = findCol(['open'], 1);
    colHigh = findCol(['high'], 2);
    colLow = findCol(['low'], 3);
    colClose = findCol(['close', 'adj close'], 4);
    colVol = findCol(['volume', 'vol'], 5);
  }

  const startRow = hasHeader ? 1 : 0;
  const parsedCandles: Candle[] = [];

  for (let r = startRow; r < lines.length; r++) {
    const cols = lines[r].split(delimiter).map((c) => c.trim().replace(/['"]/g, ''));
    if (cols.length < 5) continue;

    const time = cols[colTime] || `Bar ${parsedCandles.length + 1}`;
    const open = Number(cols[colOpen]);
    const high = Number(cols[colHigh]);
    const low = Number(cols[colLow]);
    const close = Number(cols[colClose]);
    const volRaw = colVol < cols.length ? Number(cols[colVol]) : 0;

    if ([open, high, low, close].every(Number.isFinite) && open > 0 && close > 0) {
      parsedCandles.push({
        index: parsedCandles.length,
        time,
        open,
        high: Math.max(high, open, close),
        low: Math.min(low, open, close),
        close,
        volume: Number.isFinite(volRaw) && volRaw >= 0 ? volRaw : 0,
      });
    }
  }

  if (parsedCandles.length < 15) {
    return {
      candles: [],
      error: `Only ${parsedCandles.length} valid OHLC rows extracted. Required columns: Time/Date, Open, High, Low, Close [, Volume].`,
    };
  }

  return { candles: normalizeChronology(parsedCandles) };
}

function normalizeChronology(candles: Candle[]): Candle[] {
  if (candles.length < 2) return candles;
  const firstMs = Date.parse(candles[0].time);
  const lastMs = Date.parse(candles[candles.length - 1].time);
  const ordered =
    Number.isFinite(firstMs) && Number.isFinite(lastMs) && firstMs > lastMs
      ? [...candles].reverse()
      : [...candles];
  return ordered.map((c, idx) => ({ ...c, index: idx }));
}

export const SAMPLE_CSV_TEMPLATE = `Date,Open,High,Low,Close,Volume
2025-01-01,100.00,101.80,99.40,101.40,12000
2025-01-02,101.50,103.10,101.00,102.80,13500
2025-01-03,102.90,104.50,102.30,104.10,14100
2025-01-04,104.20,105.60,103.60,105.20,13200
2025-01-05,105.30,106.90,104.80,106.40,15000
2025-01-06,106.50,108.40,106.10,108.10,16200
2025-01-07,108.20,109.70,107.60,109.20,15800
2025-01-08,109.30,111.20,109.00,110.90,17400
2025-01-09,111.00,112.40,110.60,112.10,16900
2025-01-10,112.20,114.80,111.80,114.40,19200
2025-01-11,114.50,118.20,114.20,114.80,26400
2025-01-12,114.60,115.10,111.40,111.70,28100
2025-01-13,110.80,111.10,108.90,109.20,24500
2025-01-14,109.10,109.60,107.20,107.50,19800
2025-01-15,107.40,107.80,105.40,105.80,18400
2025-01-16,105.70,106.20,103.80,104.10,17600
2025-01-17,104.00,104.60,101.20,104.40,29300
2025-01-18,104.60,107.80,104.50,107.40,25600`;

const REST_BASES = [
  'https://data-api.binance.vision',
  'https://api.binance.com',
];

const BINANCE_WS_BASES = [
  'wss://data-stream.binance.vision/ws',
  'wss://stream.binance.com:9443/ws',
];

const KRAKEN_WS_URL = 'wss://ws.kraken.com/v2';

export interface LiveKlineSubscription {
  close: () => void;
}

export async function fetchBackendLiveKlines(
  pairId: string,
  interval: string,
  limit = 120
): Promise<Candle[]> {
  const url = `/api/live-klines?pair=${encodeURIComponent(pairId)}&interval=${encodeURIComponent(
    interval
  )}&limit=${limit}`;
  const res = await fetch(url);
  if (!res.ok) {
    let msg = `HTTP ${res.status}`;
    try {
      const errBody = (await res.json()) as { error?: string };
      if (errBody?.error) msg = errBody.error;
    } catch {
      // ignore
    }
    throw new Error(msg);
  }
  const data = (await res.json()) as { candles?: Candle[] };
  if (!Array.isArray(data.candles) || data.candles.length === 0) {
    throw new Error(`No live candles returned for ${pairId}`);
  }
  return data.candles;
}

/**
 * Primary Same-Origin Live Market Stream (SSE over /api/live-stream) with /api/live-klines fallback.
 * Streams real-time sub-second Forex, Gold/Silver, and Crypto ticks without CORS or third-party WS blocks.
 */
export function subscribeUnifiedLiveStream(
  pairId: string,
  interval: string,
  streamLive: boolean,
  onHistory: (candles: Candle[]) => void,
  onTick: (candle: Omit<Candle, 'index'>) => void,
  onStatus: (status: LiveFeedStatus, detail?: string) => void
): LiveKlineSubscription {
  let closedByCaller = false;
  let es: EventSource | null = null;
  let fallbackPollTimer: number | null = null;
  let receivedHistory = false;

  const startFallbackPoll = (ms: number) => {
    if (fallbackPollTimer !== null) return;
    fallbackPollTimer = window.setInterval(async () => {
      if (closedByCaller || !streamLive) return;
      try {
        const fresh = await fetchBackendLiveKlines(pairId, interval, 120);
        if (closedByCaller || fresh.length === 0) return;
        if (!receivedHistory) {
          receivedHistory = true;
          onHistory(fresh);
        } else {
          const last = fresh[fresh.length - 1];
          onTick({
            time: last.time,
            open: last.open,
            high: last.high,
            low: last.low,
            close: last.close,
            volume: last.volume,
          });
        }
        onStatus('polling', 'Live Server Sync');
      } catch {
        // retry on next interval
      }
    }, ms);
  };

  const init = async () => {
    onStatus('connecting');

    // Immediate REST history load so chart snaps to live candles within ~200ms
    try {
      const initial = await fetchBackendLiveKlines(pairId, interval, 120);
      if (closedByCaller) return;
      receivedHistory = true;
      onHistory(initial);
      onStatus(streamLive ? 'live' : 'paused');
    } catch {
      // SSE history event or retry will handle
    }

    if (!streamLive) {
      return;
    }

    try {
      const streamUrl = `/api/live-stream?pair=${encodeURIComponent(
        pairId
      )}&interval=${encodeURIComponent(interval)}`;
      es = new EventSource(streamUrl);

      es.addEventListener('history', (evt) => {
        if (closedByCaller) return;
        try {
          const payload = JSON.parse((evt as MessageEvent).data) as { candles?: Candle[] };
          if (Array.isArray(payload.candles) && payload.candles.length > 0) {
            if (!receivedHistory) {
              receivedHistory = true;
              onHistory(payload.candles);
            } else {
              const last = payload.candles[payload.candles.length - 1];
              onTick({
                time: last.time,
                open: last.open,
                high: last.high,
                low: last.low,
                close: last.close,
                volume: last.volume,
              });
            }
            onStatus('live');
          }
        } catch {
          // ignore
        }
      });

      es.addEventListener('tick', (evt) => {
        if (closedByCaller) return;
        try {
          const payload = JSON.parse((evt as MessageEvent).data) as {
            candle?: Omit<Candle, 'index'>;
          };
          if (payload.candle && Number.isFinite(payload.candle.close)) {
            onTick(payload.candle);
            onStatus('live');
          }
        } catch {
          // ignore
        }
      });

      es.addEventListener('feed_error', (evt) => {
        if (closedByCaller) return;
        try {
          const payload = JSON.parse((evt as MessageEvent).data) as { message?: string };
          if (!receivedHistory && payload.message) {
            onStatus('error', payload.message);
          }
        } catch {
          // ignore
        }
      });

      es.onerror = () => {
        if (closedByCaller) return;
        // Start fast REST polling while EventSource auto-reconnects
        startFallbackPoll(2000);
      };
    } catch {
      startFallbackPoll(2000);
    }
  };

  init();

  return {
    close: () => {
      closedByCaller = true;
      if (fallbackPollTimer !== null) window.clearInterval(fallbackPollTimer);
      if (es) {
        es.close();
        es = null;
      }
    },
  };
}

export async function fetchKrakenOHLC(
  krakenRestPair: string,
  interval: string,
  limit = 120
): Promise<Candle[]> {
  const kInterval = timeframeToKrakenInterval(interval);
  const url = `https://api.kraken.com/0/public/OHLC?pair=${encodeURIComponent(
    krakenRestPair
  )}&interval=${kInterval}`;
  const res = await fetch(url);
  if (!res.ok) {
    throw new Error(`Kraken HTTP ${res.status}`);
  }
  const json = (await res.json()) as {
    error?: string[];
    result?: Record<string, Array<Array<string | number>>>;
  };
  if (json.error && json.error.length > 0) {
    throw new Error(json.error[0]);
  }
  const result = json.result ?? {};
  const pairKey = Object.keys(result).find((k) => k !== 'last');
  if (!pairKey || !Array.isArray(result[pairKey])) {
    throw new Error(`No Kraken OHLC rows for ${krakenRestPair}`);
  }
  const rows = result[pairKey].slice(-limit);
  return rows.map((r, idx) => ({
    index: idx,
    time: formatKlineTime(Number(r[0]) * 1000, interval),
    open: Number(r[1]),
    high: Number(r[2]),
    low: Number(r[3]),
    close: Number(r[4]),
    volume: Number(r[6] ?? 0),
  }));
}

/**
 * Live Forex WebSocket (Kraken WS v2) + Kraken REST + Backend Yahoo Fallback
 */
export function subscribeKrakenLiveKlines(
  pairDef: TradingPairDef,
  interval: string,
  onHistory: (candles: Candle[]) => void,
  onTick: (candle: Omit<Candle, 'index'>) => void,
  onStatus: (status: LiveFeedStatus, detail?: string) => void
): LiveKlineSubscription {
  let closedByCaller = false;
  let ws: WebSocket | null = null;
  let pollTimer: number | null = null;
  let reconnectTimer: number | null = null;

  const wsSymbol = pairDef.wsSymbol || pairDef.id;
  const kInterval = timeframeToKrakenInterval(interval);

  const loadInitialHistory = async () => {
    try {
      // Load from Kraken REST first; if sparse or fails, seamlessly fallback to Yahoo backend proxy
      let candles: Candle[] = [];
      try {
        candles = await fetchKrakenOHLC(pairDef.providerSymbol, interval, 120);
      } catch {
        candles = [];
      }
      if (candles.length < 30) {
        try {
          const backendBars = await fetchBackendLiveKlines(pairDef.id, interval, 120);
          if (backendBars.length > candles.length) {
            candles = backendBars;
          }
        } catch {
          // keep kraken bars if backend unavailable
        }
      }
      if (!closedByCaller && candles.length > 0) {
        onHistory(candles);
      }
    } catch (err) {
      if (!closedByCaller) {
        onStatus('error', err instanceof Error ? err.message : 'Unable to load initial Forex history.');
      }
    }
  };

  const startFallbackPoll = (ms: number) => {
    if (pollTimer !== null) window.clearInterval(pollTimer);
    pollTimer = window.setInterval(async () => {
      if (closedByCaller) return;
      try {
        const fresh = await fetchKrakenOHLC(pairDef.providerSymbol, interval, 120);
        if (!closedByCaller && fresh.length > 0) {
          const last = fresh[fresh.length - 1];
          onTick({
            time: last.time,
            open: last.open,
            high: last.high,
            low: last.low,
            close: last.close,
            volume: last.volume,
          });
          if (!ws || ws.readyState !== WebSocket.OPEN) {
            onStatus('polling', 'Live OHLC Sync');
          }
        }
      } catch {
        try {
          const backendBars = await fetchBackendLiveKlines(pairDef.id, interval, 120);
          if (!closedByCaller && backendBars.length > 0) {
            const last = backendBars[backendBars.length - 1];
            onTick({
              time: last.time,
              open: last.open,
              high: last.high,
              low: last.low,
              close: last.close,
              volume: last.volume,
            });
            if (!ws || ws.readyState !== WebSocket.OPEN) {
              onStatus('polling', 'Live Feed Sync');
            }
          }
        } catch {
          // retry next tick
        }
      }
    }, ms);
  };

  const connectWs = () => {
    if (closedByCaller) return;
    onStatus('connecting');
    try {
      ws = new WebSocket(KRAKEN_WS_URL);
    } catch {
      onStatus('polling', 'Live REST poll (2.5s)');
      startFallbackPoll(2500);
      return;
    }

    ws.onopen = () => {
      if (closedByCaller || !ws) return;
      ws.send(
        JSON.stringify({
          method: 'subscribe',
          params: {
            channel: 'ohlc',
            symbol: [wsSymbol],
            interval: kInterval,
          },
        })
      );
      onStatus('live');
      startFallbackPoll(12000);
    };

    ws.onmessage = (evt) => {
      if (closedByCaller) return;
      try {
        const msg = JSON.parse(String(evt.data)) as {
          channel?: string;
          type?: string;
          data?: Array<{
            symbol?: string;
            open?: number;
            high?: number;
            low?: number;
            close?: number;
            volume?: number;
            interval_begin?: string;
          }>;
        };
        if (msg.channel === 'ohlc' && Array.isArray(msg.data) && msg.data.length > 0) {
          const bar = msg.data[msg.data.length - 1];
          if (!bar.interval_begin) return;
          const ms = Date.parse(bar.interval_begin);
          if (!Number.isFinite(ms)) return;
          const o = Number(bar.open);
          const h = Number(bar.high);
          const l = Number(bar.low);
          const c = Number(bar.close);
          const v = Number(bar.volume ?? 0);
          if ([o, h, l, c].every(Number.isFinite)) {
            onTick({
              time: formatKlineTime(ms, interval),
              open: o,
              high: h,
              low: l,
              close: c,
              volume: Number.isFinite(v) ? v : 0,
            });
            onStatus('live');
          }
        }
      } catch {
        // ignore parse noise
      }
    };

    ws.onerror = () => {
      if (closedByCaller) return;
      ws?.close();
    };

    ws.onclose = () => {
      if (closedByCaller) return;
      onStatus('polling', 'Live REST sync (3s)');
      startFallbackPoll(3000);
      reconnectTimer = window.setTimeout(() => {
        if (!closedByCaller) connectWs();
      }, 6000);
    };
  };

  loadInitialHistory();
  connectWs();

  return {
    close: () => {
      closedByCaller = true;
      if (pollTimer !== null) window.clearInterval(pollTimer);
      if (reconnectTimer !== null) window.clearTimeout(reconnectTimer);
      if (ws && (ws.readyState === WebSocket.OPEN || ws.readyState === WebSocket.CONNECTING)) {
        ws.close();
      }
    },
  };
}

/**
 * Live Backend Polling Subscription for Yahoo-backed crosses/metals (GBP/JPY, AUD/JPY, XAG/USD)
 */
export function subscribeBackendLiveKlines(
  pairId: string,
  interval: string,
  onHistory: (candles: Candle[]) => void,
  onTick: (candle: Omit<Candle, 'index'>) => void,
  onStatus: (status: LiveFeedStatus, detail?: string) => void
): LiveKlineSubscription {
  let closedByCaller = false;
  let timer: number | null = null;

  const init = async () => {
    onStatus('connecting');
    try {
      const candles = await fetchBackendLiveKlines(pairId, interval, 120);
      if (closedByCaller) return;
      onHistory(candles);
      onStatus('live');

      timer = window.setInterval(async () => {
        if (closedByCaller) return;
        try {
          const fresh = await fetchBackendLiveKlines(pairId, interval, 120);
          if (!closedByCaller && fresh.length > 0) {
            const last = fresh[fresh.length - 1];
            onTick({
              time: last.time,
              open: last.open,
              high: last.high,
              low: last.low,
              close: last.close,
              volume: last.volume,
            });
            onStatus('live');
          }
        } catch {
          // keep trying cleanly
        }
      }, 2500);
    } catch (err) {
      if (!closedByCaller) {
        onStatus('error', err instanceof Error ? err.message : `Unable to load live bars for ${pairId}`);
      }
    }
  };

  init();

  return {
    close: () => {
      closedByCaller = true;
      if (timer !== null) window.clearInterval(timer);
    },
  };
}

export async function fetchBinanceKlines(
  symbol: string,
  interval: string,
  limit = 120
): Promise<Candle[]> {
  const cleanSymbol = symbol.trim().toUpperCase();
  const cleanInterval = interval.trim().toLowerCase();
  let lastErr: Error | null = null;

  for (const base of REST_BASES) {
    try {
      const url = `${base}/api/v3/klines?symbol=${encodeURIComponent(
        cleanSymbol
      )}&interval=${encodeURIComponent(cleanInterval)}&limit=${limit}`;

      const res = await fetch(url);
      if (!res.ok) {
        let msg = `HTTP ${res.status}`;
        try {
          const body = (await res.json()) as { msg?: string };
          if (body?.msg) msg = body.msg;
        } catch {
          // ignore
        }
        throw new Error(`Binance API error (${msg}) for ${cleanSymbol} ${cleanInterval}`);
      }

      const data = (await res.json()) as Array<Array<string | number>>;
      if (!Array.isArray(data) || data.length === 0) {
        throw new Error(`No kline bars returned for ${cleanSymbol}.`);
      }

      return data.map((row, idx) => ({
        index: idx,
        time: formatKlineTime(Number(row[0]), cleanInterval),
        open: Number(row[1]),
        high: Number(row[2]),
        low: Number(row[3]),
        close: Number(row[4]),
        volume: Number(row[5]),
      }));
    } catch (err) {
      lastErr = err instanceof Error ? err : new Error(String(err));
    }
  }

  throw lastErr ?? new Error(`Failed to fetch live klines for ${cleanSymbol}.`);
}

/**
 * Real-time Binance Spot WebSocket + REST fallback subscription (for 24/7 Crypto, Gold PAXG, EUR/USDT).
 */
export function subscribeBinanceLiveKline(
  symbol: string,
  interval: string,
  onTick: (candle: Omit<Candle, 'index'>, isBarClosed: boolean) => void,
  onPollRefresh: (candles: Candle[]) => void,
  onStatus: (status: LiveFeedStatus, detail?: string) => void
): LiveKlineSubscription {
  const cleanSymbol = symbol.trim().toUpperCase();
  const lowerSymbol = cleanSymbol.toLowerCase();
  const cleanInterval = interval.trim().toLowerCase();

  let closedByCaller = false;
  let ws: WebSocket | null = null;
  let wsEndpointIdx = 0;
  let wsOpenedAtLeastOnce = false;
  let pollTimer: number | null = null;
  let reconnectTimer: number | null = null;

  const startRestPoll = (ms: number) => {
    if (pollTimer !== null) window.clearInterval(pollTimer);
    pollTimer = window.setInterval(async () => {
      if (closedByCaller) return;
      try {
        const fresh = await fetchBinanceKlines(cleanSymbol, cleanInterval, 120);
        if (!closedByCaller) {
          onPollRefresh(fresh);
          if (!ws || ws.readyState !== WebSocket.OPEN) {
            onStatus('polling', 'REST live sync');
          }
        }
      } catch {
        // retry on next interval
      }
    }, ms);
  };

  const connectWs = () => {
    if (closedByCaller) return;
    if (wsEndpointIdx >= BINANCE_WS_BASES.length) {
      onStatus('polling', 'Live REST poll (2.5s)');
      startRestPoll(2500);
      return;
    }

    const base = BINANCE_WS_BASES[wsEndpointIdx];
    const url = `${base}/${lowerSymbol}@kline_${cleanInterval}`;
    onStatus('connecting');

    try {
      ws = new WebSocket(url);
    } catch {
      wsEndpointIdx += 1;
      connectWs();
      return;
    }

    ws.onopen = () => {
      if (closedByCaller) {
        ws?.close();
        return;
      }
      wsOpenedAtLeastOnce = true;
      onStatus('live');
      startRestPoll(20000);
    };

    ws.onmessage = (evt) => {
      if (closedByCaller) return;
      try {
        const payload = JSON.parse(String(evt.data)) as {
          k?: {
            t: number;
            o: string;
            h: string;
            l: string;
            c: string;
            v: string;
            x: boolean;
          };
        };
        const k = payload?.k;
        if (!k) return;
        const bar: Omit<Candle, 'index'> = {
          time: formatKlineTime(k.t, cleanInterval),
          open: Number(k.o),
          high: Number(k.h),
          low: Number(k.l),
          close: Number(k.c),
          volume: Number(k.v),
        };
        if ([bar.open, bar.high, bar.low, bar.close].every(Number.isFinite)) {
          onTick(bar, Boolean(k.x));
        }
      } catch {
        // ignore
      }
    };

    ws.onerror = () => {
      if (closedByCaller) return;
      ws?.close();
    };

    ws.onclose = () => {
      if (closedByCaller) return;
      if (!wsOpenedAtLeastOnce) {
        wsEndpointIdx += 1;
        connectWs();
      } else {
        onStatus('polling', 'Reconnecting stream...');
        startRestPoll(2500);
        reconnectTimer = window.setTimeout(() => {
          if (!closedByCaller) connectWs();
        }, 4000);
      }
    };
  };

  connectWs();

  return {
    close: () => {
      closedByCaller = true;
      if (pollTimer !== null) window.clearInterval(pollTimer);
      if (reconnectTimer !== null) window.clearTimeout(reconnectTimer);
      if (ws && (ws.readyState === WebSocket.OPEN || ws.readyState === WebSocket.CONNECTING)) {
        ws.close();
      }
    },
  };
}
