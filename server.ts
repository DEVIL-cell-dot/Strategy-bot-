import express from 'express';
import path from 'path';
import { fileURLToPath } from 'url';

const __filename = fileURLToPath(import.meta.url);
const __dirname = path.dirname(__filename);

const PORT = Number(process.env.PORT || 3000);

interface RawCandle {
  index: number;
  time: string;
  open: number;
  high: number;
  low: number;
  close: number;
  volume: number;
}

const YAHOO_SYMBOL_MAP: Record<string, string> = {
  'EUR/USD': 'EURUSD=X',
  'GBP/USD': 'GBPUSD=X',
  'USD/JPY': 'USDJPY=X',
  'AUD/USD': 'AUDUSD=X',
  'USD/CAD': 'USDCAD=X',
  'USD/CHF': 'USDCHF=X',
  'EUR/GBP': 'EURGBP=X',
  'EUR/JPY': 'EURJPY=X',
  'GBP/JPY': 'GBPJPY=X',
  'AUD/JPY': 'AUDJPY=X',
  'XAU/USD': 'GC=F',
  'XAG/USD': 'SI=F',
};

const KRAKEN_SYMBOL_MAP: Record<string, string> = {
  'EUR/USD': 'EURUSD',
  'GBP/USD': 'GBPUSD',
  'USD/JPY': 'USDJPY',
  'AUD/USD': 'AUDUSD',
  'USD/CAD': 'USDCAD',
  'USD/CHF': 'USDCHF',
  'EUR/GBP': 'EURGBP',
  'EUR/JPY': 'EURJPY',
};

const BINANCE_SYMBOL_MAP: Record<string, string> = {
  'BTC/USD': 'BTCUSDT',
  'ETH/USD': 'ETHUSDT',
  'EUR/USDT': 'EURUSDT',
  'SOL/USD': 'SOLUSDT',
  'XRP/USD': 'XRPUSDT',
  'BNB/USD': 'BNBUSDT',
  'XAU/USD': 'PAXGUSDT',
};

const KRAKEN_WS_SYMBOLS = [
  'EUR/USD',
  'GBP/USD',
  'USD/JPY',
  'AUD/USD',
  'USD/CAD',
  'USD/CHF',
  'EUR/GBP',
  'EUR/JPY',
];

const responseCache = new Map<string, { ts: number; candles: RawCandle[]; source: string }>();

function intervalToSeconds(tf: string): number {
  switch (tf.toLowerCase()) {
    case '1m':
      return 60;
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

function formatTimeUtc(ms: number, interval: string): string {
  const d = new Date(ms);
  if (interval === '1d') {
    return d.toISOString().slice(0, 10);
  }
  return d.toISOString().slice(0, 16).replace('T', ' ');
}

function mapKrakenInterval(interval: string): number {
  switch (interval.toLowerCase()) {
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

function mapYahooParams(interval: string): { yahooInterval: string; range: string; aggregateHours: number } {
  switch (interval.toLowerCase()) {
    case '1m':
      return { yahooInterval: '1m', range: '1d', aggregateHours: 1 };
    case '5m':
      return { yahooInterval: '5m', range: '5d', aggregateHours: 1 };
    case '15m':
      return { yahooInterval: '15m', range: '5d', aggregateHours: 1 };
    case '30m':
      return { yahooInterval: '30m', range: '1mo', aggregateHours: 1 };
    case '1h':
      return { yahooInterval: '60m', range: '1mo', aggregateHours: 1 };
    case '4h':
      return { yahooInterval: '60m', range: '3mo', aggregateHours: 4 };
    case '1d':
      return { yahooInterval: '1d', range: '1y', aggregateHours: 1 };
    default:
      return { yahooInterval: '1m', range: '1d', aggregateHours: 1 };
  }
}

async function fetchBinanceRestKlines(symbol: string, interval: string, limit: number): Promise<RawCandle[]> {
  const cleanInterval = interval.toLowerCase();
  let lastErr: Error | null = null;
  for (const base of ['https://data-api.binance.vision', 'https://api.binance.com']) {
    try {
      const url = `${base}/api/v3/klines?symbol=${encodeURIComponent(symbol)}&interval=${encodeURIComponent(
        cleanInterval
      )}&limit=${limit}`;
      const res = await fetch(url);
      if (!res.ok) throw new Error(`Binance HTTP ${res.status}`);
      const data = (await res.json()) as Array<Array<string | number>>;
      if (!Array.isArray(data) || data.length === 0) throw new Error('Empty Binance response');
      return data.map((row, idx) => ({
        index: idx,
        time: formatTimeUtc(Number(row[0]), cleanInterval),
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
  throw lastErr ?? new Error(`Failed Binance lookup for ${symbol}`);
}

async function fetchKrakenRestKlines(krakenPair: string, interval: string, limit: number): Promise<RawCandle[]> {
  const kInterval = mapKrakenInterval(interval);
  const res = await fetch(
    `https://api.kraken.com/0/public/OHLC?pair=${encodeURIComponent(krakenPair)}&interval=${kInterval}`
  );
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
    throw new Error(`No Kraken rows for ${krakenPair}`);
  }
  return result[pairKey].slice(-limit).map((r, idx) => ({
    index: idx,
    time: formatTimeUtc(Number(r[0]) * 1000, interval),
    open: Number(r[1]),
    high: Number(r[2]),
    low: Number(r[3]),
    close: Number(r[4]),
    volume: Number(r[6] ?? 0),
  }));
}

async function fetchYahooKlines(pairId: string, interval: string, limit: number): Promise<RawCandle[]> {
  const yahooSymbol = YAHOO_SYMBOL_MAP[pairId] || pairId;
  const { yahooInterval, range, aggregateHours } = mapYahooParams(interval);

  let lastErr: Error | null = null;
  for (const host of ['query2.finance.yahoo.com', 'query1.finance.yahoo.com']) {
    try {
      const url = `https://${host}/v8/finance/chart/${encodeURIComponent(
        yahooSymbol
      )}?interval=${encodeURIComponent(yahooInterval)}&range=${encodeURIComponent(range)}&includePrePost=true`;

      const response = await fetch(url, {
        headers: {
          'User-Agent': 'Mozilla/5.0 (Windows NT 10.0; Win64; x64) AppleWebKit/537.36',
          Accept: 'application/json',
        },
      });

      if (!response.ok) {
        throw new Error(`Yahoo Finance returned HTTP ${response.status} for ${yahooSymbol}`);
      }

      const payload = (await response.json()) as {
        chart?: {
          error?: { description?: string };
          result?: Array<{
            meta?: { regularMarketPrice?: number };
            timestamp?: number[];
            indicators?: {
              quote?: Array<{
                open?: Array<number | null>;
                high?: Array<number | null>;
                low?: Array<number | null>;
                close?: Array<number | null>;
                volume?: Array<number | null>;
              }>;
            };
          }>;
        };
      };

      if (payload?.chart?.error) {
        throw new Error(payload.chart.error.description || 'Yahoo chart error');
      }

      const res = payload?.chart?.result?.[0];
      const timestamps = res?.timestamp ?? [];
      const quote = res?.indicators?.quote?.[0];
      if (!quote || timestamps.length === 0) {
        throw new Error(`No candles returned for ${pairId}`);
      }

      const baseBars: Array<{ ts: number; open: number; high: number; low: number; close: number; volume: number }> = [];
      for (let i = 0; i < timestamps.length; i++) {
        const o = quote.open?.[i];
        const h = quote.high?.[i];
        const l = quote.low?.[i];
        const c = quote.close?.[i];
        const v = quote.volume?.[i] ?? 0;
        if (
          typeof o === 'number' &&
          typeof h === 'number' &&
          typeof l === 'number' &&
          typeof c === 'number' &&
          Number.isFinite(o) &&
          Number.isFinite(h) &&
          Number.isFinite(l) &&
          Number.isFinite(c)
        ) {
          baseBars.push({
            ts: timestamps[i],
            open: o,
            high: Math.max(h, o, c),
            low: Math.min(l, o, c),
            close: c,
            volume: typeof v === 'number' && Number.isFinite(v) ? v : 0,
          });
        }
      }

      const regPrice = res?.meta?.regularMarketPrice;
      if (typeof regPrice === 'number' && Number.isFinite(regPrice) && baseBars.length > 0) {
        const last = baseBars[baseBars.length - 1];
        last.close = regPrice;
        last.high = Math.max(last.high, regPrice);
        last.low = Math.min(last.low, regPrice);
      }

      let finalBars = baseBars;
      if (aggregateHours > 1) {
        const bucketSec = aggregateHours * 3600;
        const grouped: typeof baseBars = [];
        let currentBucket = -1;
        for (const bar of baseBars) {
          const b = Math.floor(bar.ts / bucketSec) * bucketSec;
          if (b !== currentBucket || grouped.length === 0) {
            currentBucket = b;
            grouped.push({ ...bar, ts: b });
          } else {
            const last = grouped[grouped.length - 1];
            last.high = Math.max(last.high, bar.high);
            last.low = Math.min(last.low, bar.low);
            last.close = bar.close;
            last.volume += bar.volume;
          }
        }
        finalBars = grouped;
      }

      return finalBars.slice(-limit).map((b, idx) => ({
        index: idx,
        time: formatTimeUtc(b.ts * 1000, interval),
        open: b.open,
        high: b.high,
        low: b.low,
        close: b.close,
        volume: b.volume,
      }));
    } catch (err) {
      lastErr = err instanceof Error ? err : new Error(String(err));
    }
  }

  throw lastErr ?? new Error(`Failed Yahoo Finance lookup for ${pairId}`);
}

async function synthesizeCrossFromKraken(
  legAPair: string,
  legBPair: string,
  interval: string,
  limit: number
): Promise<RawCandle[]> {
  const [barsA, barsB] = await Promise.all([
    fetchKrakenRestKlines(legAPair, interval, limit),
    fetchKrakenRestKlines(legBPair, interval, limit),
  ]);
  const mapB = new Map(barsB.map((b) => [b.time, b]));
  let lastB = barsB[barsB.length - 1];
  const merged: RawCandle[] = [];
  for (const a of barsA) {
    const b = mapB.get(a.time) ?? lastB;
    if (!b) continue;
    lastB = b;
    const o = a.open * b.open;
    const c = a.close * b.close;
    const h = Math.max(a.high * b.high, o, c);
    const l = Math.min(a.low * b.low, o, c);
    merged.push({
      index: merged.length,
      time: a.time,
      open: Number(o.toFixed(3)),
      high: Number(h.toFixed(3)),
      low: Number(l.toFixed(3)),
      close: Number(c.toFixed(3)),
      volume: a.volume + b.volume,
    });
  }
  return merged.slice(-limit);
}

async function resolveLiveKlines(
  pairId: string,
  interval: string,
  limit: number
): Promise<{ candles: RawCandle[]; source: string }> {
  const cacheKey = `${pairId}:${interval}:${limit}`;
  const cached = responseCache.get(cacheKey);
  if (cached && Date.now() - cached.ts < 1500) {
    return { candles: cached.candles, source: cached.source };
  }

  let candles: RawCandle[] = [];
  let source = 'kraken';

  if (BINANCE_SYMBOL_MAP[pairId]) {
    candles = await fetchBinanceRestKlines(BINANCE_SYMBOL_MAP[pairId], interval, limit);
    source = 'binance';
  } else if (KRAKEN_SYMBOL_MAP[pairId]) {
    try {
      candles = await fetchKrakenRestKlines(KRAKEN_SYMBOL_MAP[pairId], interval, limit);
      source = 'kraken';
      if (candles.length < 30) {
        const yBars = await fetchYahooKlines(pairId, interval, limit).catch(() => []);
        if (yBars.length > candles.length) {
          candles = yBars;
          source = 'yahoo';
        }
      }
    } catch {
      candles = await fetchYahooKlines(pairId, interval, limit);
      source = 'yahoo';
    }
  } else if (pairId === 'GBP/JPY' || pairId === 'AUD/JPY') {
    try {
      candles = await fetchYahooKlines(pairId, interval, limit);
      source = 'yahoo';
    } catch {
      candles = await synthesizeCrossFromKraken(
        pairId === 'GBP/JPY' ? 'GBPUSD' : 'AUDUSD',
        'USDJPY',
        interval,
        limit
      );
      source = 'kraken-cross';
    }
  } else {
    candles = await fetchYahooKlines(pairId, interval, limit);
    source = 'yahoo';
  }

  responseCache.set(cacheKey, { ts: Date.now(), candles, source });
  return { candles, source };
}

// --- Shared Real-Time Quote Hub (Kraken WS v2 Ticker + Binance WS Kline) ---
const latestQuotes = new Map<string, number>();
const quoteListeners = new Set<(pairId: string, price: number, volume?: number) => void>();

let krakenWs: WebSocket | null = null;
let krakenReconnectTimer: ReturnType<typeof setTimeout> | null = null;

function ensureKrakenQuoteStream() {
  if (krakenWs && (krakenWs.readyState === WebSocket.OPEN || krakenWs.readyState === WebSocket.CONNECTING)) {
    return;
  }
  try {
    const ws = new WebSocket('wss://ws.kraken.com/v2');
    krakenWs = ws;

    ws.onopen = () => {
      ws.send(
        JSON.stringify({
          method: 'subscribe',
          params: {
            channel: 'ticker',
            symbol: KRAKEN_WS_SYMBOLS,
          },
        })
      );
    };

    ws.onmessage = (evt) => {
      try {
        const msg = JSON.parse(String(evt.data)) as {
          channel?: string;
          data?: Array<{
            symbol?: string;
            bid?: number;
            ask?: number;
            last?: number;
          }>;
        };
        if (msg.channel === 'ticker' && Array.isArray(msg.data)) {
          for (const d of msg.data) {
            if (!d.symbol) continue;
            const bid = Number(d.bid);
            const ask = Number(d.ask);
            const last = Number(d.last);
            const price =
              Number.isFinite(bid) && Number.isFinite(ask) && bid > 0 && ask > 0
                ? (bid + ask) / 2
                : Number.isFinite(last)
                ? last
                : NaN;
            if (!Number.isFinite(price)) continue;

            latestQuotes.set(d.symbol, price);
            for (const cb of quoteListeners) {
              cb(d.symbol, price);
            }

            // Synthesize live GBP/JPY and AUD/JPY ticks every quote update
            const usdJpy = latestQuotes.get('USD/JPY');
            if (usdJpy && (d.symbol === 'GBP/USD' || d.symbol === 'USD/JPY')) {
              const gbpUsd = latestQuotes.get('GBP/USD');
              if (gbpUsd) {
                const cross = Number((gbpUsd * usdJpy).toFixed(3));
                latestQuotes.set('GBP/JPY', cross);
                for (const cb of quoteListeners) cb('GBP/JPY', cross);
              }
            }
            if (usdJpy && (d.symbol === 'AUD/USD' || d.symbol === 'USD/JPY')) {
              const audUsd = latestQuotes.get('AUD/USD');
              if (audUsd) {
                const cross = Number((audUsd * usdJpy).toFixed(3));
                latestQuotes.set('AUD/JPY', cross);
                for (const cb of quoteListeners) cb('AUD/JPY', cross);
              }
            }
          }
        }
      } catch {
        // ignore noise
      }
    };

    ws.onclose = () => {
      krakenWs = null;
      if (quoteListeners.size > 0) {
        if (krakenReconnectTimer) clearTimeout(krakenReconnectTimer);
        krakenReconnectTimer = setTimeout(ensureKrakenQuoteStream, 3000);
      }
    };

    ws.onerror = () => {
      ws.close();
    };
  } catch {
    // retry via timer
  }
}

async function startServer() {
  const app = express();

  app.get('/api/health', (_req, res) => {
    res.json({ ok: true });
  });

  app.get('/api/live-klines', async (req, res) => {
    const pair = String(req.query.pair || 'EUR/USD');
    const interval = String(req.query.interval || '1m');
    const limit = Math.max(20, Math.min(200, Number(req.query.limit || 120)));

    try {
      const { candles, source } = await resolveLiveKlines(pair, interval, limit);
      res.setHeader('Cache-Control', 'no-store');
      res.json({ pair, interval, source, candles });
    } catch (err) {
      res.status(502).json({
        error: err instanceof Error ? err.message : 'Unable to fetch live market feed.',
      });
    }
  });

  // Same-origin Server-Sent Events live stream (works cleanly across all networks & iframes)
  app.get('/api/live-stream', async (req, res) => {
    const pair = String(req.query.pair || 'EUR/USD');
    const interval = String(req.query.interval || '1m');

    res.setHeader('Content-Type', 'text/event-stream');
    res.setHeader('Cache-Control', 'no-cache, no-transform');
    res.setHeader('Connection', 'keep-alive');
    res.setHeader('X-Accel-Buffering', 'no');
    res.flushHeaders();

    let closed = false;
    const sendEvent = (event: string, data: unknown) => {
      if (closed) return;
      try {
        res.write(`event: ${event}\ndata: ${JSON.stringify(data)}\n\n`);
      } catch {
        closed = true;
      }
    };

    const bucketSec = intervalToSeconds(interval);
    let currentBar: Omit<RawCandle, 'index'> | null = null;
    let binanceWs: WebSocket | null = null;
    let pollTimer: ReturnType<typeof setInterval> | null = null;

    const pingTimer = setInterval(() => {
      if (!closed) {
        try {
          res.write(': ping\n\n');
        } catch {
          closed = true;
        }
      }
    }, 15000);

    try {
      const { candles } = await resolveLiveKlines(pair, interval, 120);
      if (closed) return;
      if (candles.length > 0) {
        const last = candles[candles.length - 1];
        currentBar = {
          time: last.time,
          open: last.open,
          high: last.high,
          low: last.low,
          close: last.close,
          volume: last.volume,
        };
      }
      sendEvent('history', { pair, interval, candles });
    } catch (err) {
      sendEvent('feed_error', {
        message: err instanceof Error ? err.message : `Unable to load initial bars for ${pair}`,
      });
    }

    const onQuoteUpdate = (sym: string, price: number) => {
      if (closed || sym !== pair) return;
      const nowBucketMs = Math.floor(Date.now() / (bucketSec * 1000)) * (bucketSec * 1000);
      const bucketTime = formatTimeUtc(nowBucketMs, interval);

      if (!currentBar || currentBar.time !== bucketTime) {
        const openPrice = currentBar ? currentBar.close : price;
        currentBar = {
          time: bucketTime,
          open: openPrice,
          high: Math.max(openPrice, price),
          low: Math.min(openPrice, price),
          close: price,
          volume: 0,
        };
      } else {
        currentBar = {
          ...currentBar,
          high: Math.max(currentBar.high, price),
          low: Math.min(currentBar.low, price),
          close: price,
        };
      }
      sendEvent('tick', { candle: currentBar });
    };

    const binanceSym = BINANCE_SYMBOL_MAP[pair];
    if (binanceSym) {
      // Connect upstream Binance Spot WS for sub-second Crypto & PAXG Gold ticks
      const connectBinanceWs = () => {
        if (closed) return;
        const url = `wss://data-stream.binance.vision/ws/${binanceSym.toLowerCase()}@kline_${interval.toLowerCase()}`;
        const ws = new WebSocket(url);
        binanceWs = ws;

        ws.onmessage = (evt) => {
          if (closed) return;
          try {
            const payload = JSON.parse(String(evt.data)) as {
              k?: { t: number; o: string; h: string; l: string; c: string; v: string };
            };
            const k = payload?.k;
            if (!k) return;
            const bar: Omit<RawCandle, 'index'> = {
              time: formatTimeUtc(k.t, interval),
              open: Number(k.o),
              high: Number(k.h),
              low: Number(k.l),
              close: Number(k.c),
              volume: Number(k.v),
            };
            if ([bar.open, bar.high, bar.low, bar.close].every(Number.isFinite)) {
              currentBar = bar;
              sendEvent('tick', { candle: bar });
            }
          } catch {
            // ignore
          }
        };

        ws.onerror = () => ws.close();
      };
      connectBinanceWs();
    } else if (KRAKEN_WS_SYMBOLS.includes(pair) || pair === 'GBP/JPY' || pair === 'AUD/JPY') {
      ensureKrakenQuoteStream();
      quoteListeners.add(onQuoteUpdate);
      const existingPrice = latestQuotes.get(pair);
      if (existingPrice !== undefined) {
        onQuoteUpdate(pair, existingPrice);
      }
    }

    // Periodic REST candle reconciliation (keeps OHLC & volume accurate even across minute closes)
    pollTimer = setInterval(async () => {
      if (closed) return;
      try {
        const { candles } = await resolveLiveKlines(pair, interval, 120);
        if (closed || candles.length === 0) return;
        const last = candles[candles.length - 1];
        // Only overwrite if newer or if no live WS quotes drove this bar
        if (!currentBar || last.time > currentBar.time || (!binanceSym && !KRAKEN_WS_SYMBOLS.includes(pair))) {
          currentBar = {
            time: last.time,
            open: last.open,
            high: last.high,
            low: last.low,
            close: last.close,
            volume: last.volume,
          };
          sendEvent('tick', { candle: currentBar });
        } else if (last.time === currentBar.time) {
          currentBar = {
            ...currentBar,
            high: Math.max(currentBar.high, last.high),
            low: Math.min(currentBar.low, last.low),
            volume: Math.max(currentBar.volume, last.volume),
          };
          sendEvent('tick', { candle: currentBar });
        }
      } catch {
        // ignore transient poll errors
      }
    }, 3000);

    req.on('close', () => {
      closed = true;
      clearInterval(pingTimer);
      if (pollTimer) clearInterval(pollTimer);
      quoteListeners.delete(onQuoteUpdate);
      if (binanceWs && (binanceWs.readyState === WebSocket.OPEN || binanceWs.readyState === WebSocket.CONNECTING)) {
        binanceWs.close();
      }
    });
  });

  if (process.env.NODE_ENV !== 'production') {
    const { createServer: createViteServer } = await import('vite');
    const vite = await createViteServer({
      server: { middlewareMode: true },
      appType: 'spa',
    });
    app.use(vite.middlewares);
  } else {
    const distDir = path.resolve(__dirname, 'dist');
    app.use(express.static(distDir));
    app.get('*', (_req, res) => {
      res.sendFile(path.join(distDir, 'index.html'));
    });
  }

  app.listen(PORT, '0.0.0.0', () => {
    console.log(`Nison CandleBot server listening on http://0.0.0.0:${PORT}`);
  });
}

startServer().catch((err) => {
  console.error('Failed to start server:', err);
  process.exit(1);
});
