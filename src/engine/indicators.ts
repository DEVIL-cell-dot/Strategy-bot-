import { Candle, IndicatorSeries, RetracementSet, TrendlineSegment } from './types';

export function computeSMA(values: number[], period: number): (number | null)[] {
  const result: (number | null)[] = new Array(values.length).fill(null);
  if (period <= 0) return result;
  let sum = 0;
  for (let i = 0; i < values.length; i++) {
    sum += values[i];
    if (i >= period) {
      sum -= values[i - period];
    }
    if (i >= period - 1) {
      result[i] = sum / period;
    }
  }
  return result;
}

export function computeEMA(values: number[], period: number): (number | null)[] {
  const result: (number | null)[] = new Array(values.length).fill(null);
  if (values.length < period || period <= 0) return result;
  const k = 2 / (period + 1);
  let sum = 0;
  for (let i = 0; i < period; i++) {
    sum += values[i];
  }
  let prevEma = sum / period;
  result[period - 1] = prevEma;
  for (let i = period; i < values.length; i++) {
    prevEma = (values[i] - prevEma) * k + prevEma;
    result[i] = prevEma;
  }
  return result;
}

/**
 * Ch. 14 p. 226-227: RSI = 100 - (100 / (1 + RS))
 * where RS = average up points for period / average down points for period
 */
export function computeRSI(closes: number[], period = 14): (number | null)[] {
  const result: (number | null)[] = new Array(closes.length).fill(null);
  if (closes.length <= period) return result;

  for (let i = period; i < closes.length; i++) {
    let gainSum = 0;
    let lossSum = 0;
    for (let j = i - period + 1; j <= i; j++) {
      const diff = closes[j] - closes[j - 1];
      if (diff > 0) gainSum += diff;
      else lossSum += Math.abs(diff);
    }
    const avgGain = gainSum / period;
    const avgLoss = lossSum / period;
    if (avgLoss === 0) {
      result[i] = avgGain === 0 ? 50 : 100;
    } else {
      const rs = avgGain / avgLoss;
      result[i] = 100 - 100 / (1 + rs);
    }
  }
  return result;
}

/**
 * Ch. 14 p. 234: Slow Stochastics
 * Fast %K = ((Close - Low of N) / (High of N - Low of N)) * 100
 * Slow %K = 3-period SMA of Fast %K
 * Slow %D = 3-period SMA of Slow %K
 */
export function computeSlowStochastic(
  candles: Candle[],
  period = 14,
  smoothK = 3,
  smoothD = 3
): { stochK: (number | null)[]; stochD: (number | null)[] } {
  const rawK: (number | null)[] = new Array(candles.length).fill(null);
  for (let i = period - 1; i < candles.length; i++) {
    let lowN = Infinity;
    let highN = -Infinity;
    for (let j = i - period + 1; j <= i; j++) {
      if (candles[j].low < lowN) lowN = candles[j].low;
      if (candles[j].high > highN) highN = candles[j].high;
    }
    const denom = highN - lowN;
    rawK[i] = denom === 0 ? 50 : ((candles[i].close - lowN) / denom) * 100;
  }

  const stochK: (number | null)[] = new Array(candles.length).fill(null);
  for (let i = period - 1 + smoothK - 1; i < candles.length; i++) {
    let sum = 0;
    let valid = true;
    for (let j = i - smoothK + 1; j <= i; j++) {
      const val = rawK[j];
      if (val === null) {
        valid = false;
        break;
      }
      sum += val;
    }
    if (valid) stochK[i] = sum / smoothK;
  }

  const stochD: (number | null)[] = new Array(candles.length).fill(null);
  for (let i = period - 1 + smoothK - 1 + smoothD - 1; i < candles.length; i++) {
    let sum = 0;
    let valid = true;
    for (let j = i - smoothD + 1; j <= i; j++) {
      const val = stochK[j];
      if (val === null) {
        valid = false;
        break;
      }
      sum += val;
    }
    if (valid) stochD[i] = sum / smoothD;
  }

  return { stochK, stochD };
}

/**
 * Ch. 14 p. 237: MACD = EMA(12) - EMA(26), Signal = EMA(9) of MACD
 */
export function computeMACD(closes: number[]): {
  macdLine: (number | null)[];
  macdSignal: (number | null)[];
  macdHist: (number | null)[];
} {
  const ema12 = computeEMA(closes, 12);
  const ema26 = computeEMA(closes, 26);
  const macdLine: (number | null)[] = closes.map((_, i) => {
    const a = ema12[i];
    const b = ema26[i];
    return a !== null && b !== null ? a - b : null;
  });

  const macdSignal: (number | null)[] = new Array(closes.length).fill(null);
  const validIndices: number[] = [];
  const validValues: number[] = [];
  macdLine.forEach((v, idx) => {
    if (v !== null) {
      validIndices.push(idx);
      validValues.push(v);
    }
  });

  const sigOnValid = computeEMA(validValues, 9);
  sigOnValid.forEach((val, idx) => {
    if (val !== null) {
      macdSignal[validIndices[idx]] = val;
    }
  });

  const macdHist: (number | null)[] = closes.map((_, i) => {
    const m = macdLine[i];
    const s = macdSignal[i];
    return m !== null && s !== null ? m - s : null;
  });

  return { macdLine, macdSignal, macdHist };
}

/**
 * Ch. 15 p. 242: Relative volume compared to trailing 20 sessions
 */
export function computeRelativeVolume(candles: Candle[], lookback = 20): number[] {
  return candles.map((c, i) => {
    if (c.volume <= 0) return 1;
    const start = Math.max(0, i - lookback);
    const slice = candles.slice(start, i);
    if (slice.length === 0) return 1;
    const avg = slice.reduce((acc, item) => acc + item.volume, 0) / slice.length;
    return avg > 0 ? c.volume / avg : 1;
  });
}

export function computeAllIndicators(candles: Candle[]): IndicatorSeries {
  const closes = candles.map((c) => c.close);
  const sma5 = computeSMA(closes, 5);
  const ema9 = computeEMA(closes, 9);
  const sma13 = computeSMA(closes, 13);
  const sma30 = computeSMA(closes, 30);
  const sma65 = computeSMA(closes, 65);
  const rsi14 = computeRSI(closes, 14);
  const maOsc = closes.map((_, i) =>
    sma5[i] !== null && sma13[i] !== null ? sma5[i]! - sma13[i]! : null
  );
  const { stochK, stochD } = computeSlowStochastic(candles, 14, 3, 3);
  const { macdLine, macdSignal, macdHist } = computeMACD(closes);
  const relVolume = computeRelativeVolume(candles, 20);

  return {
    sma5,
    ema9,
    sma13,
    sma30,
    sma65,
    rsi14,
    maOsc,
    stochK,
    stochD,
    macdLine,
    macdSignal,
    macdHist,
    relVolume,
  };
}

export interface SwingPoint {
  index: number;
  price: number;
  type: 'high' | 'low';
}

export function findSwingPoints(candles: Candle[], upToIndex: number, leftRight = 3): SwingPoint[] {
  const points: SwingPoint[] = [];
  const maxIdx = Math.min(upToIndex - leftRight, candles.length - 1 - leftRight);
  for (let i = leftRight; i <= maxIdx; i++) {
    let isHigh = true;
    let isLow = true;
    for (let j = i - leftRight; j <= i + leftRight; j++) {
      if (j === i) continue;
      if (candles[j].high >= candles[i].high) isHigh = false;
      if (candles[j].low <= candles[i].low) isLow = false;
    }
    if (isHigh) points.push({ index: i, price: candles[i].high, type: 'high' });
    if (isLow) points.push({ index: i, price: candles[i].low, type: 'low' });
  }
  return points;
}

/**
 * Ch. 12 p. 213-214: 38.2%, 50%, 61.8% Retracements of prior significant swing
 */
export function computeLatestRetracement(candles: Candle[], upToIndex: number): RetracementSet | null {
  if (upToIndex < 12) return null;
  const swings = findSwingPoints(candles, upToIndex, 3);
  const highs = swings.filter((s) => s.type === 'high');
  const lows = swings.filter((s) => s.type === 'low');
  if (highs.length === 0 || lows.length === 0) return null;

  const lastHigh = highs[highs.length - 1];
  const lastLow = lows[lows.length - 1];

  if (lastHigh.index > lastLow.index) {
    // Up swing A (low) -> B (high), retracing downward
    const span = lastHigh.price - lastLow.price;
    if (span <= 0) return null;
    return {
      direction: 'up_swing',
      swingStartPrice: lastLow.price,
      swingEndPrice: lastHigh.price,
      swingStartIndex: lastLow.index,
      swingEndIndex: lastHigh.index,
      level382: lastHigh.price - span * 0.382,
      level500: lastHigh.price - span * 0.5,
      level618: lastHigh.price - span * 0.618,
    };
  } else {
    // Down swing A (high) -> B (low), retracing upward
    const span = lastHigh.price - lastLow.price;
    if (span <= 0) return null;
    return {
      direction: 'down_swing',
      swingStartPrice: lastHigh.price,
      swingEndPrice: lastLow.price,
      swingStartIndex: lastHigh.index,
      swingEndIndex: lastLow.index,
      level382: lastLow.price + span * 0.382,
      level500: lastLow.price + span * 0.5,
      level618: lastLow.price + span * 0.618,
    };
  }
}

/**
 * Ch. 11 p. 193-198: Rising/Falling Support & Resistance lines using shadow extremes
 */
export function computeTrendlines(candles: Candle[], upToIndex: number): TrendlineSegment[] {
  const swings = findSwingPoints(candles, upToIndex, 3);
  const lows = swings.filter((s) => s.type === 'low').slice(-4);
  const highs = swings.filter((s) => s.type === 'high').slice(-4);
  const lines: TrendlineSegment[] = [];

  if (lows.length >= 2) {
    const p1 = lows[lows.length - 2];
    const p2 = lows[lows.length - 1];
    const slope = (p2.price - p1.price) / Math.max(1, p2.index - p1.index);
    lines.push({
      id: `tl-sup-${p1.index}-${p2.index}`,
      type: slope >= 0 ? 'rising_support' : 'falling_support',
      startIndex: p1.index,
      startPrice: p1.price,
      endIndex: upToIndex,
      endPrice: p1.price + slope * (upToIndex - p1.index),
      slope,
    });
  }

  if (highs.length >= 2) {
    const p1 = highs[highs.length - 2];
    const p2 = highs[highs.length - 1];
    const slope = (p2.price - p1.price) / Math.max(1, p2.index - p1.index);
    lines.push({
      id: `tl-res-${p1.index}-${p2.index}`,
      type: slope >= 0 ? 'rising_resistance' : 'falling_resistance',
      startIndex: p1.index,
      startPrice: p1.price,
      endIndex: upToIndex,
      endPrice: p1.price + slope * (upToIndex - p1.index),
      slope,
    });
  }

  return lines;
}

/**
 * Ch. 14 p. 225: Positive (Bullish) and Negative (Bearish) Divergence
 * Checked causally up to index i
 */
export function detectOscillatorDivergence(
  candles: Candle[],
  oscillator: (number | null)[],
  index: number
): { bullish: boolean; bearish: boolean; detail: string | null } {
  if (index < 18) return { bullish: false, bearish: false, detail: null };
  const swings = findSwingPoints(candles, index - 1, 2);
  const recentLows = swings.filter((s) => s.type === 'low').slice(-2);
  const recentHighs = swings.filter((s) => s.type === 'high').slice(-2);

  const curOsc = oscillator[index];
  if (curOsc === null) return { bullish: false, bearish: false, detail: null };

  // Bullish divergence: current low <= prior swing low, while oscillator is meaningfully higher
  if (recentLows.length >= 1) {
    const prevLow = recentLows[recentLows.length - 1];
    const prevOsc = oscillator[prevLow.index];
    if (
      prevOsc !== null &&
      index - prevLow.index >= 4 &&
      index - prevLow.index <= 24 &&
      candles[index].low <= prevLow.price * 1.004 &&
      curOsc > prevOsc + 2
    ) {
      return {
        bullish: true,
        bearish: false,
        detail: `Bullish divergence vs bar #${prevLow.index + 1}`,
      };
    }
  }

  // Bearish divergence: current high >= prior swing high, while oscillator makes a lower high
  if (recentHighs.length >= 1) {
    const prevHigh = recentHighs[recentHighs.length - 1];
    const prevOsc = oscillator[prevHigh.index];
    if (
      prevOsc !== null &&
      index - prevHigh.index >= 4 &&
      index - prevHigh.index <= 24 &&
      candles[index].high >= prevHigh.price * 0.996 &&
      curOsc < prevOsc - 2
    ) {
      return {
        bullish: false,
        bearish: true,
        detail: `Bearish divergence vs bar #${prevHigh.index + 1}`,
      };
    }
  }

  return { bullish: false, bearish: false, detail: null };
}
