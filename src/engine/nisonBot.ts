import {
  computeAllIndicators,
  computeLatestRetracement,
  computeTrendlines,
  detectOscillatorDivergence,
  findSwingPoints,
} from './indicators';
import {
  BotAnalysisResult,
  BotConfig,
  BotSignal,
  Candle,
  CandleAnatomy,
  ConfidenceTier,
  ConfirmationStatus,
  DetectedPattern,
  PaperTrade,
  SignalAction,
  SupportResistanceZone,
  TrendContext,
  TrendDirection,
  WindowZone,
} from './types';

export const DEFAULT_BOT_CONFIG: BotConfig = {
  strictCloseConfirmation: true,
  respectWindowDominance: true,
  respectMajorTrendRule: true,
  requireConfirmationForHangingManAndInvHammer: true,
  suppressMiddleBoxDoji: true,
  minRiskRewardForEntry: 1.25,
};

function fmtP(v: number): string {
  if (!Number.isFinite(v)) return '—';
  return Math.abs(v) < 10 ? v.toFixed(5) : v.toFixed(2);
}

function analyzeCandleAnatomy(candles: Candle[], index: number): CandleAnatomy {
  const c = candles[index];
  const body = Math.abs(c.close - c.open);
  const range = Math.max(c.high - c.low, 1e-9);
  const bodyTop = Math.max(c.open, c.close);
  const bodyBottom = Math.min(c.open, c.close);
  const upperShadow = Math.max(0, c.high - bodyTop);
  const lowerShadow = Math.max(0, bodyBottom - c.low);
  const bodyRatio = body / range;

  const lookbackStart = Math.max(0, index - 14);
  const recent = candles.slice(lookbackStart, index);
  const avgBody =
    recent.length > 0
      ? recent.reduce((sum, item) => sum + Math.abs(item.close - item.open), 0) / recent.length
      : body;
  const avgRange =
    recent.length > 0
      ? recent.reduce((sum, item) => sum + Math.max(item.high - item.low, 1e-9), 0) / recent.length
      : range;

  // Ch. 8 p. 156: Doji when open & close are equal or within tiny fraction of range/avgBody
  const isDoji = body <= range * 0.06 || (avgBody > 0 && body <= avgBody * 0.08 && bodyRatio <= 0.12);

  // Count how many of the last 5 candles were doji/near-doji
  let recentDojiCount = 0;
  for (let j = Math.max(0, index - 5); j < index; j++) {
    const r = candles[j];
    const rBody = Math.abs(r.close - r.open);
    const rRange = Math.max(r.high - r.low, 1e-9);
    if (rBody <= rRange * 0.08) recentDojiCount++;
  }
  const isMeaningfulDoji = isDoji && recentDojiCount <= 1;

  const color = isDoji ? 'doji' : c.close > c.open ? 'white' : 'black';
  const isLongBody =
    !isDoji &&
    body >= Math.max(avgBody * 1.2, range * 0.55) &&
    range >= avgRange * 0.8;
  const isSmallBody = !isDoji && (body <= avgBody * 0.58 || bodyRatio <= 0.28);

  const isShavenHead = upperShadow <= range * 0.06;
  const isShavenBottom = lowerShadow <= range * 0.06;

  const isLongLeggedDoji = isDoji && upperShadow >= range * 0.3 && lowerShadow >= range * 0.3;
  const isGravestoneDoji = isDoji && lowerShadow <= range * 0.1 && upperShadow >= range * 0.65;
  const isDragonflyDoji = isDoji && upperShadow <= range * 0.1 && lowerShadow >= range * 0.65;
  const isHighWave =
    !isDoji && isSmallBody && upperShadow >= range * 0.3 && lowerShadow >= range * 0.3;

  return {
    color,
    body,
    range,
    upperShadow,
    lowerShadow,
    bodyTop,
    bodyBottom,
    bodyRatio,
    isLongBody,
    isSmallBody,
    isDoji,
    isMeaningfulDoji,
    isShavenHead,
    isShavenBottom,
    isHighWave,
    isLongLeggedDoji,
    isGravestoneDoji,
    isDragonflyDoji,
  };
}

function evaluateTrendContext(
  candles: Candle[],
  index: number,
  sma30: (number | null)[],
  rsi14: (number | null)[]
): TrendContext {
  const c = candles[index];
  const windowLen = Math.min(8, index);
  let shortTerm: TrendDirection = 'box_range';

  if (index >= 5) {
    const startCandle = candles[index - windowLen];
    const slice = candles.slice(index - windowLen, index + 1);
    const maxH = Math.max(...slice.map((s) => s.high));
    const minL = Math.min(...slice.map((s) => s.low));
    const span = Math.max(maxH - minL, 1e-9);
    const netMove = c.close - startCandle.close;

    // Detect Box Range ("wa", Ch. 16 p. 250) when recent 10-16 bars oscillate laterally
    const boxLookback = Math.min(14, index);
    const boxSlice = candles.slice(index - boxLookback, index + 1);
    const boxHigh = Math.max(...boxSlice.map((s) => s.high));
    const boxLow = Math.min(...boxSlice.map((s) => s.low));
    const boxMid = (boxHigh + boxLow) / 2;
    const boxHeightPct = (boxHigh - boxLow) / Math.max(boxMid, 1e-9);

    if (Math.abs(netMove) / span < 0.24 && boxHeightPct < 0.08 && index >= 10) {
      shortTerm = 'box_range';
    } else if (netMove > 0 && c.close >= slice[Math.floor(slice.length / 2)].close * 0.995) {
      shortTerm = 'uptrend';
    } else if (netMove < 0 && c.close <= slice[Math.floor(slice.length / 2)].close * 1.005) {
      shortTerm = 'downtrend';
    } else {
      shortTerm = netMove >= 0 ? 'uptrend' : 'downtrend';
    }
  }

  let majorTrend: TrendDirection = shortTerm;
  const ma30Val = sma30[index];
  const ma30Prev = index >= 5 ? sma30[index - 5] : null;
  if (ma30Val !== null && ma30Prev !== null) {
    if (c.close > ma30Val && ma30Val >= ma30Prev * 0.998) {
      majorTrend = 'uptrend';
    } else if (c.close < ma30Val && ma30Val <= ma30Prev * 1.002) {
      majorTrend = 'downtrend';
    } else {
      majorTrend = 'box_range';
    }
  }

  // Detect clear horizontal Box Range (last 12 bars excluding current breakout bar)
  let boxRange: TrendContext['boxRange'] = null;
  if (index >= 12) {
    const prevSlice = candles.slice(index - 12, index);
    const top = Math.max(...prevSlice.map((s) => s.high));
    const bottom = Math.min(...prevSlice.map((s) => s.low));
    const mid = (top + bottom) / 2;
    const widthPct = (top - bottom) / Math.max(mid, 1e-9);
    // Check that at least 2 touches near top and 2 near bottom
    const topTouches = prevSlice.filter((s) => s.high >= top - (top - bottom) * 0.15).length;
    const botTouches = prevSlice.filter((s) => s.low <= bottom + (top - bottom) * 0.15).length;
    if (widthPct > 0.008 && widthPct < 0.14 && topTouches >= 2 && botTouches >= 2) {
      boxRange = {
        active: c.close <= top && c.close >= bottom,
        top,
        bottom,
        startIndex: index - 12,
      };
    }
  }

  const rsi = rsi14[index];
  const isOverextendedUp = rsi !== null ? rsi >= 68 : false;
  const isOverextendedDown = rsi !== null ? rsi <= 32 : false;

  return {
    shortTerm,
    majorTrend,
    isOverextendedUp,
    isOverextendedDown,
    boxRange,
  };
}

function detectPatternsAtBar(
  candles: Candle[],
  anatomies: CandleAnatomy[],
  trend: TrendContext,
  relVolume: number[],
  i: number
): DetectedPattern[] {
  const found: DetectedPattern[] = [];
  const c = candles[i];
  const a = anatomies[i];

  // Prior short-term trend excluding current reversal candle(s)
  const prevTrendUp =
    i >= 4 &&
    candles[i - 1].close > candles[Math.max(0, i - 5)].close &&
    candles[i - 1].high >= candles[Math.max(0, i - 3)].high * 0.995;
  const prevTrendDown =
    i >= 4 &&
    candles[i - 1].close < candles[Math.max(0, i - 5)].close &&
    candles[i - 1].low <= candles[Math.max(0, i - 3)].low * 1.005;

  const isUptrendContext = trend.shortTerm === 'uptrend' || prevTrendUp;
  const isDowntrendContext = trend.shortTerm === 'downtrend' || prevTrendDown;

  // --- 1. CHAPTER 7: WINDOWS (STRICTLY NO SHADOW OVERLAP, p. 127) ---
  if (i >= 1) {
    const prev = candles[i - 1];
    if (c.low > prev.high) {
      found.push({
        id: 'rising_window',
        name: 'Rising Window',
        bias: 'bullish',
        category: 'continuation',
        startIndex: i - 1,
        endIndex: i,
        requiresConfirmation: false,
        isIdeal: true,
        supportLevel: prev.high,
        chapterRef: 'Ch. 7: Continuation Patterns',
        pageRef: 'pp. 126–134',
        notes: `Gap between ${prev.high.toFixed(2)} and ${c.low.toFixed(2)}. Entire window is support; critical bottom at ${prev.high.toFixed(2)}.`,
      });
    } else if (c.high < prev.low) {
      found.push({
        id: 'falling_window',
        name: 'Falling Window',
        bias: 'bearish',
        category: 'continuation',
        startIndex: i - 1,
        endIndex: i,
        requiresConfirmation: false,
        isIdeal: true,
        resistanceLevel: prev.low,
        chapterRef: 'Ch. 7: Continuation Patterns',
        pageRef: 'pp. 126–134',
        notes: `Gap between ${c.high.toFixed(2)} and ${prev.low.toFixed(2)}. Entire window is resistance; critical top at ${prev.low.toFixed(2)}.`,
      });
    }
  }

  // --- 2. CHAPTER 4: UMBRELLA LINES (HAMMER & HANGING MAN, pp. 32-41) ---
  const isUmbrella =
    !a.isDoji &&
    a.lowerShadow >= Math.max(a.body * 2.0, a.range * 0.52) &&
    a.upperShadow <= a.range * 0.14 &&
    a.bodyBottom >= c.low + a.range * 0.55;

  if (isUmbrella) {
    if (isDowntrendContext && c.low <= Math.min(...candles.slice(Math.max(0, i - 5), i + 1).map((x) => x.low)) * 1.005) {
      found.push({
        id: 'hammer',
        name: 'Hammer',
        japaneseName: 'Takuri',
        bias: 'bullish',
        category: 'umbrella',
        startIndex: i,
        endIndex: i,
        requiresConfirmation: false,
        isIdeal: a.lowerShadow >= a.body * 2.5 && a.upperShadow <= a.range * 0.06,
        supportLevel: c.low,
        chapterRef: 'Ch. 4: Reversal Patterns',
        pageRef: 'pp. 34–38',
        notes: `Long lower shadow (${(a.lowerShadow / Math.max(a.body, 1e-6)).toFixed(1)}x body) after decline. Low ${c.low.toFixed(2)} is support.`,
      });
    } else if (isUptrendContext && c.high >= Math.max(...candles.slice(Math.max(0, i - 5), i + 1).map((x) => x.high)) * 0.995) {
      found.push({
        id: 'hanging_man',
        name: 'Hanging Man',
        bias: 'bearish',
        category: 'umbrella',
        startIndex: i,
        endIndex: i,
        requiresConfirmation: true,
        isIdeal: a.lowerShadow >= a.body * 2.5 && a.upperShadow <= a.range * 0.06,
        resistanceLevel: c.high,
        chapterRef: 'Ch. 4: Reversal Patterns',
        pageRef: 'pp. 38–41',
        notes: 'Umbrella line after rally. Bearish confirmation required: close beneath hanging man real body.',
      });
    }
  }

  // --- 3. CHAPTER 5: SHOOTING STAR & INVERTED HAMMER (pp. 74-79) ---
  const isShootingShape =
    !a.isDoji &&
    a.upperShadow >= Math.max(a.body * 2.0, a.range * 0.52) &&
    a.lowerShadow <= a.range * 0.14 &&
    a.bodyTop <= c.high - a.range * 0.55;

  if (isShootingShape) {
    if (isUptrendContext && c.high >= Math.max(...candles.slice(Math.max(0, i - 5), i + 1).map((x) => x.high)) * 0.995) {
      const hasBodyGap = i >= 1 && a.bodyBottom > anatomies[i - 1].bodyTop;
      found.push({
        id: 'shooting_star',
        name: 'Shooting Star',
        bias: 'bearish',
        category: 'star',
        startIndex: i,
        endIndex: i,
        requiresConfirmation: false,
        isIdeal: hasBodyGap,
        resistanceLevel: c.high,
        chapterRef: 'Ch. 5: Stars',
        pageRef: 'pp. 74–77',
        notes: hasBodyGap
          ? 'Gapped shooting star showing trouble overhead.'
          : 'Non-gapped shooting star: less bullish/caution overhead (p. 74).',
      });
    } else if (isDowntrendContext && c.low <= Math.min(...candles.slice(Math.max(0, i - 5), i + 1).map((x) => x.low)) * 1.005) {
      found.push({
        id: 'inverted_hammer',
        name: 'Inverted Hammer',
        bias: 'bullish',
        category: 'star',
        startIndex: i,
        endIndex: i,
        requiresConfirmation: true,
        isIdeal: a.upperShadow >= a.body * 2.5,
        supportLevel: c.low,
        chapterRef: 'Ch. 5: Stars',
        pageRef: 'pp. 77–79',
        notes: 'Requires bullish confirmation next session (open and close above real body).',
      });
    }
  }

  // --- 4. CHAPTER 6: BELT-HOLD LINES (pp. 93-95) ---
  if (a.isLongBody) {
    if (a.color === 'white' && a.isShavenBottom && a.upperShadow <= a.range * 0.15 && isDowntrendContext) {
      found.push({
        id: 'bullish_belt_hold',
        name: 'Bullish Belt-Hold',
        japaneseName: 'Yorikiri',
        bias: 'bullish',
        category: 'reversal_dual',
        startIndex: i,
        endIndex: i,
        requiresConfirmation: false,
        isIdeal: true,
        supportLevel: c.low,
        chapterRef: 'Ch. 6: More Reversal Patterns',
        pageRef: 'pp. 93–95',
        notes: 'White opening shaven bottom in low-price area; close under low voids bullishness.',
      });
    } else if (a.color === 'black' && a.isShavenHead && a.lowerShadow <= a.range * 0.15 && isUptrendContext) {
      found.push({
        id: 'bearish_belt_hold',
        name: 'Bearish Belt-Hold',
        japaneseName: 'Yorikiri',
        bias: 'bearish',
        category: 'reversal_dual',
        startIndex: i,
        endIndex: i,
        requiresConfirmation: false,
        isIdeal: true,
        resistanceLevel: c.high,
        chapterRef: 'Ch. 6: More Reversal Patterns',
        pageRef: 'pp. 93–95',
        notes: 'Black opening shaven head at high price area; close above high resumes uptrend.',
      });
    }
  }

  // --- 5. CHAPTER 8: DOJI VARIATIONS (pp. 155-171) ---
  if (a.isGravestoneDoji && isUptrendContext) {
    found.push({
      id: 'gravestone_doji',
      name: 'Gravestone Doji',
      bias: 'bearish',
      category: 'doji',
      startIndex: i,
      endIndex: i,
      requiresConfirmation: false,
      isIdeal: true,
      resistanceLevel: c.high,
      chapterRef: 'Ch. 8: The Magic Doji',
      pageRef: 'pp. 162–164',
      notes: 'Ultimate shooting star; open, low, close at session low with extended upper shadow.',
    });
  } else if (a.isDragonflyDoji && isDowntrendContext) {
    found.push({
      id: 'dragonfly_doji',
      name: 'Dragonfly Doji',
      bias: 'bullish',
      category: 'doji',
      startIndex: i,
      endIndex: i,
      requiresConfirmation: false,
      isIdeal: true,
      supportLevel: c.low,
      chapterRef: 'Ch. 8: The Magic Doji',
      pageRef: 'pp. 162, 165',
      notes: 'Open, high, close at session high with long lower shadow; confirms support.',
    });
  } else if (a.isLongLeggedDoji && (isUptrendContext || isDowntrendContext)) {
    found.push({
      id: 'long_legged_doji',
      name: 'Long-Legged Doji',
      japaneseName: 'Rickshaw Man',
      bias: 'neutral_warning',
      category: 'doji',
      startIndex: i,
      endIndex: i,
      requiresConfirmation: true,
      isIdeal: true,
      resistanceLevel: isUptrendContext && i >= 1 ? Math.max(c.high, candles[i - 1].high) : undefined,
      chapterRef: 'Ch. 8: The Magic Doji',
      pageRef: 'pp. 161–165',
      notes: '"The market has lost its sense of direction." Transition warning.',
    });
  } else if (a.isMeaningfulDoji) {
    if (isUptrendContext) {
      const prevA = i >= 1 ? anatomies[i - 1] : null;
      const afterTallWhite = prevA && prevA.color === 'white' && prevA.isLongBody;
      found.push({
        id: 'northern_doji',
        name: afterTallWhite ? 'Northern Doji after Tall White Candle' : 'Northern Doji',
        bias: 'neutral_warning',
        category: 'doji',
        startIndex: i,
        endIndex: i,
        requiresConfirmation: true,
        isIdeal: Boolean(afterTallWhite),
        resistanceLevel: afterTallWhite ? Math.max(c.high, candles[i - 1].high) : c.high,
        chapterRef: 'Ch. 8: The Magic Doji',
        pageRef: 'pp. 158–161, 170',
        notes: afterTallWhite
          ? `Resistance based on close at ${Math.max(c.high, candles[i - 1].high).toFixed(2)} (p. 160). Wait for close below doji if at new high close.`
          : 'Market is "tired" — shifts trend from Up to Up/Neutral.',
      });
    } else if (isDowntrendContext) {
      found.push({
        id: 'southern_doji',
        name: 'Southern Doji',
        bias: 'neutral_warning',
        category: 'doji',
        startIndex: i,
        endIndex: i,
        requiresConfirmation: true,
        isIdeal: relVolume[i] >= 1.5,
        chapterRef: 'Ch. 8: The Magic Doji',
        pageRef: 'pp. 157, 166–169',
        notes: 'Southern doji during decline; requires support or high-volume confirmation (p. 157, 245).',
      });
    }
  }

  // --- DUAL-CANDLE PATTERNS (i >= 1) ---
  if (i >= 1) {
    const p1 = candles[i - 1];
    const a1 = anatomies[i - 1];

    // 6. ENGULFING PATTERNS (Ch. 4 pp. 42-49)
    const engulfsBody = a.bodyTop >= a1.bodyTop && a.bodyBottom <= a1.bodyBottom && a.body > a1.body * 1.1;
    if (engulfsBody && !a.isDoji) {
      if (a.color === 'white' && (a1.color === 'black' || a1.isDoji) && isDowntrendContext) {
        found.push({
          id: 'bullish_engulfing',
          name: 'Bullish Engulfing Pattern',
          japaneseName: 'Hugging Line',
          bias: 'bullish',
          category: 'reversal_dual',
          startIndex: i - 1,
          endIndex: i,
          requiresConfirmation: false,
          isIdeal: a1.isSmallBody && a.isLongBody,
          supportLevel: Math.min(p1.low, c.low),
          chapterRef: 'Ch. 4: Reversal Patterns',
          pageRef: 'pp. 42–48',
          notes: `White real body engulfed prior real body. Lowest low ${Math.min(p1.low, c.low).toFixed(2)} becomes support.`,
        });
      } else if (a.color === 'black' && (a1.color === 'white' || a1.isDoji) && isUptrendContext) {
        found.push({
          id: 'bearish_engulfing',
          name: 'Bearish Engulfing Pattern',
          japaneseName: 'Hugging Line',
          bias: 'bearish',
          category: 'reversal_dual',
          startIndex: i - 1,
          endIndex: i,
          requiresConfirmation: false,
          isIdeal: a1.isSmallBody && a.isLongBody,
          resistanceLevel: Math.max(p1.high, c.high),
          chapterRef: 'Ch. 4: Reversal Patterns',
          pageRef: 'pp. 42–49',
          notes: `Black real body engulfed prior real body. Highest high ${Math.max(p1.high, c.high).toFixed(2)} becomes resistance.`,
        });
      }
    }

    // 7. DARK-CLOUD COVER (Ch. 4 pp. 49-54)
    if (
      isUptrendContext &&
      a1.color === 'white' &&
      a1.isLongBody &&
      a.color === 'black' &&
      c.open > p1.close &&
      c.close < p1.close &&
      c.close > p1.open
    ) {
      const penetration = (p1.close - c.close) / Math.max(a1.body, 1e-9);
      const idealOpen = c.open > p1.high;
      found.push({
        id: 'dark_cloud_cover',
        name: 'Dark-Cloud Cover',
        bias: 'bearish',
        category: 'reversal_dual',
        startIndex: i - 1,
        endIndex: i,
        requiresConfirmation: penetration < 0.5,
        isIdeal: idealOpen && penetration >= 0.5,
        resistanceLevel: Math.max(p1.high, c.high),
        chapterRef: 'Ch. 4: Reversal Patterns',
        pageRef: 'pp. 49–54',
        notes: `${(penetration * 100).toFixed(0)}% penetration into white body${idealOpen ? ' (opened above prior high)' : ' (opened above prior close)'}. Resistance at ${Math.max(p1.high, c.high).toFixed(2)}.`,
      });
    }

    // 8. PIERCING / ON-NECK / IN-NECK / THRUSTING (Ch. 4 pp. 55-59)
    if (isDowntrendContext && a1.color === 'black' && a1.isLongBody && a.color === 'white' && c.open < p1.close) {
      const penetration = (c.close - p1.close) / Math.max(a1.body, 1e-9);
      const idealOpen = c.open < p1.low;
      if (c.close > p1.close && c.close < p1.open) {
        if (penetration > 0.5) {
          found.push({
            id: 'piercing_pattern',
            name: 'Piercing Pattern',
            bias: 'bullish',
            category: 'reversal_dual',
            startIndex: i - 1,
            endIndex: i,
            requiresConfirmation: false,
            isIdeal: idealOpen && penetration >= 0.55,
            supportLevel: Math.min(p1.low, c.low),
            chapterRef: 'Ch. 4: Reversal Patterns',
            pageRef: 'pp. 55–59',
            notes: `White candle penetrated ${(penetration * 100).toFixed(0)}% (>50%) into prior black body. Low ${Math.min(p1.low, c.low).toFixed(2)} is support.`,
          });
        } else if (penetration >= 0.22) {
          found.push({
            id: 'thrusting_pattern',
            name: 'Thrusting Pattern',
            bias: 'bearish',
            category: 'reversal_dual',
            startIndex: i - 1,
            endIndex: i,
            requiresConfirmation: true,
            isIdeal: true,
            chapterRef: 'Ch. 4: Reversal Patterns',
            pageRef: 'pp. 55–59',
            notes: `Closed only ${(penetration * 100).toFixed(0)}% into black body (<50%). Bearish unless confirmed by higher close next bar (p. 59).`,
          });
        } else {
          found.push({
            id: 'in_neck',
            name: 'In-Neck Line',
            bias: 'bearish',
            category: 'reversal_dual',
            startIndex: i - 1,
            endIndex: i,
            requiresConfirmation: false,
            isIdeal: true,
            chapterRef: 'Ch. 4: Reversal Patterns',
            pageRef: 'pp. 55–56',
            notes: 'Small white candle closed slightly above prior close; bearish continuation if low breaks.',
          });
        }
      } else if (Math.abs(c.close - p1.low) <= a1.range * 0.08 && a.isSmallBody) {
        found.push({
          id: 'on_neck',
          name: 'On-Neck Line',
          bias: 'bearish',
          category: 'reversal_dual',
          startIndex: i - 1,
          endIndex: i,
          requiresConfirmation: false,
          isIdeal: true,
          chapterRef: 'Ch. 4: Reversal Patterns',
          pageRef: 'pp. 55–56',
          notes: 'Small white candle closed near prior session low; bearish continuation.',
        });
      }
    }

    // 9. COUNTERATTACK LINES (Ch. 6 pp. 109-113)
    const closeTol = Math.max(a1.range * 0.06, c.close * 0.0018);
    if (
      isDowntrendContext &&
      a1.color === 'black' &&
      a1.isLongBody &&
      a.color === 'white' &&
      c.open < p1.close - a1.body * 0.25 &&
      Math.abs(c.close - p1.close) <= closeTol
    ) {
      found.push({
        id: 'bullish_counterattack',
        name: 'Bullish Counterattack Line',
        bias: 'bullish',
        category: 'reversal_dual',
        startIndex: i - 1,
        endIndex: i,
        requiresConfirmation: true,
        isIdeal: true,
        supportLevel: Math.min(p1.low, c.low),
        chapterRef: 'Ch. 6: More Reversal Patterns',
        pageRef: 'pp. 109–113',
        notes: 'Gapped sharply lower then rebounded to prior close. Weaker than piercing pattern.',
      });
    } else if (
      isUptrendContext &&
      a1.color === 'white' &&
      a1.isLongBody &&
      a.color === 'black' &&
      c.open > p1.close + a1.body * 0.25 &&
      Math.abs(c.close - p1.close) <= closeTol
    ) {
      found.push({
        id: 'bearish_counterattack',
        name: 'Bearish Counterattack Line',
        bias: 'bearish',
        category: 'reversal_dual',
        startIndex: i - 1,
        endIndex: i,
        requiresConfirmation: true,
        isIdeal: true,
        resistanceLevel: Math.max(p1.high, c.high),
        chapterRef: 'Ch. 6: More Reversal Patterns',
        pageRef: 'pp. 109–112',
        notes: 'Gapped sharply higher then sold off to prior close. Early warning of top.',
      });
    }

    // 10. SEPARATING LINES (Ch. 7 pp. 150-153)
    const openTol = Math.max(a1.range * 0.05, c.open * 0.0015);
    if (
      isUptrendContext &&
      a1.color === 'black' &&
      a.color === 'white' &&
      a.isLongBody &&
      Math.abs(c.open - p1.open) <= openTol
    ) {
      found.push({
        id: 'bullish_separating_line',
        name: 'Bullish Separating Line',
        bias: 'bullish',
        category: 'continuation',
        startIndex: i - 1,
        endIndex: i,
        requiresConfirmation: false,
        isIdeal: a.isShavenBottom,
        supportLevel: c.open,
        chapterRef: 'Ch. 7: Continuation Patterns',
        pageRef: 'pp. 150–153',
        notes: 'Opened at prior black candle’s open and rallied; bullish continuation.',
      });
    } else if (
      isDowntrendContext &&
      a1.color === 'white' &&
      a.color === 'black' &&
      a.isLongBody &&
      Math.abs(c.open - p1.open) <= openTol
    ) {
      found.push({
        id: 'bearish_separating_line',
        name: 'Bearish Separating Line',
        bias: 'bearish',
        category: 'continuation',
        startIndex: i - 1,
        endIndex: i,
        requiresConfirmation: false,
        isIdeal: a.isShavenHead,
        resistanceLevel: c.open,
        chapterRef: 'Ch. 7: Continuation Patterns',
        pageRef: 'pp. 150–152',
        notes: 'Opened at prior white candle’s open and sold off; bearish continuation.',
      });
    }

    // 11. HARAMI & HARAMI CROSS (Ch. 6 pp. 82-87)
    const bodyInside = a.bodyTop < a1.bodyTop && a.bodyBottom > a1.bodyBottom;
    if (a1.isLongBody && (a.isSmallBody || a.isDoji) && bodyInside) {
      if (a1.color === 'white' && isUptrendContext) {
        if (a.isDoji) {
          found.push({
            id: 'harami_cross_bearish',
            name: 'Bearish Harami Cross',
            japaneseName: 'Petrifying Pattern',
            bias: 'bearish',
            category: 'reversal_dual',
            startIndex: i - 1,
            endIndex: i,
            requiresConfirmation: false,
            isIdeal: true,
            resistanceLevel: Math.max(p1.high, c.high),
            chapterRef: 'Ch. 6: More Reversal Patterns',
            pageRef: 'pp. 83–87',
            notes: 'Doji inside tall white real body; potent top reversal warning ("petrifying pattern").',
          });
        } else {
          found.push({
            id: 'harami_bearish',
            name: 'Bearish Harami',
            japaneseName: 'Pregnant',
            bias: 'neutral_warning',
            category: 'reversal_dual',
            startIndex: i - 1,
            endIndex: i,
            requiresConfirmation: true,
            isIdeal: true,
            resistanceLevel: Math.max(p1.high, c.high),
            chapterRef: 'Ch. 6: More Reversal Patterns',
            pageRef: 'pp. 82–87',
            notes: 'Market "losing its breath" — uptrend shifting to neutral/cautionary.',
          });
        }
      } else if (a1.color === 'black' && isDowntrendContext) {
        if (a.isDoji) {
          found.push({
            id: 'harami_cross_bullish',
            name: 'Bullish Harami Cross',
            japaneseName: 'Petrifying Pattern',
            bias: 'bullish',
            category: 'reversal_dual',
            startIndex: i - 1,
            endIndex: i,
            requiresConfirmation: false,
            isIdeal: true,
            supportLevel: Math.min(p1.low, c.low),
            chapterRef: 'Ch. 6: More Reversal Patterns',
            pageRef: 'pp. 83–87',
            notes: 'Doji inside tall black real body; bears losing downward momentum.',
          });
        } else {
          found.push({
            id: 'harami_bullish',
            name: 'Bullish Harami',
            japaneseName: 'Pregnant',
            bias: 'neutral_warning',
            category: 'reversal_dual',
            startIndex: i - 1,
            endIndex: i,
            requiresConfirmation: true,
            isIdeal: true,
            supportLevel: Math.min(p1.low, c.low),
            chapterRef: 'Ch. 6: More Reversal Patterns',
            pageRef: 'pp. 82–87',
            notes: 'Diminishing bearish force; look for confirmation or support convergence.',
          });
        }
      }
    }

    // 12. TWEEZERS TOP & BOTTOM (Ch. 6 pp. 87-92)
    // Must pair with another candle criterion on daily/intraday (p. 88)
    const matchTol = Math.max(a1.range * 0.04, c.close * 0.0012);
    const hasSupportingSignal = found.length > 0 || (a1.isLongBody && (a.isSmallBody || a.isDoji));
    if (hasSupportingSignal) {
      if (isUptrendContext && Math.abs(c.high - p1.high) <= matchTol) {
        found.push({
          id: 'tweezers_top',
          name: 'Tweezers Top',
          bias: 'bearish',
          category: 'reversal_dual',
          startIndex: i - 1,
          endIndex: i,
          requiresConfirmation: false,
          isIdeal: found.length > 0,
          resistanceLevel: Math.max(p1.high, c.high),
          chapterRef: 'Ch. 6: More Reversal Patterns',
          pageRef: 'pp. 87–92',
          notes: `Consecutive matching highs near ${c.high.toFixed(2)} reinforcing candle reversal signal.`,
        });
      } else if (isDowntrendContext && Math.abs(c.low - p1.low) <= matchTol) {
        found.push({
          id: 'tweezers_bottom',
          name: 'Tweezers Bottom',
          bias: 'bullish',
          category: 'reversal_dual',
          startIndex: i - 1,
          endIndex: i,
          requiresConfirmation: false,
          isIdeal: found.length > 0,
          supportLevel: Math.min(p1.low, c.low),
          chapterRef: 'Ch. 6: More Reversal Patterns',
          pageRef: 'pp. 87–92',
          notes: `Consecutive matching lows near ${c.low.toFixed(2)} confirming bottom support.`,
        });
      }
    }
  }

  // --- 3-CANDLE PATTERNS (i >= 2) ---
  if (i >= 2) {
    const c0 = candles[i - 2];
    const c1 = candles[i - 1];
    const c2 = c;
    const a0 = anatomies[i - 2];
    const a1 = anatomies[i - 1];
    const a2 = a;
    const priorTrendDown3 =
      i >= 5 && candles[i - 2].close < candles[Math.max(0, i - 6)].close;
    const priorTrendUp3 =
      i >= 5 && candles[i - 2].close > candles[Math.max(0, i - 6)].close;

    // 13. MORNING STAR / MORNING DOJI STAR / ABANDONED BABY BOTTOM (Ch. 5 pp. 62-74)
    if (
      priorTrendDown3 &&
      a0.color === 'black' &&
      a0.isLongBody &&
      (a1.isSmallBody || a1.isDoji) &&
      a1.bodyTop <= a0.bodyBottom * 1.002 &&
      a2.color === 'white' &&
      a2.isLongBody &&
      c2.close > (c0.open + c0.close) / 2
    ) {
      const gapBothShadows = a1.isDoji && c1.high < c0.low && c1.high < c2.low;
      const sup = Math.min(c0.low, c1.low, c2.low);
      if (gapBothShadows) {
        found.push({
          id: 'abandoned_baby_bottom',
          name: 'Abandoned Baby Bottom',
          bias: 'bullish',
          category: 'star',
          startIndex: i - 2,
          endIndex: i,
          requiresConfirmation: false,
          isIdeal: true,
          supportLevel: sup,
          chapterRef: 'Ch. 5: Stars',
          pageRef: 'pp. 70–74',
          notes: `Extremely rare Island Bottom with isolated Doji. Support at ${sup.toFixed(2)}.`,
        });
      } else if (a1.isDoji) {
        found.push({
          id: 'morning_doji_star',
          name: 'Morning Doji Star',
          bias: 'bullish',
          category: 'star',
          startIndex: i - 2,
          endIndex: i,
          requiresConfirmation: false,
          isIdeal: a1.bodyTop < a0.bodyBottom && a1.bodyTop < a2.bodyBottom,
          supportLevel: sup,
          chapterRef: 'Ch. 5: Stars',
          pageRef: 'pp. 70–74',
          notes: `Doji star bottom reversal. Lowest low ${sup.toFixed(2)} is support.`,
        });
      } else {
        found.push({
          id: 'morning_star',
          name: 'Morning Star',
          japaneseName: 'Three-River Morning Star',
          bias: 'bullish',
          category: 'star',
          startIndex: i - 2,
          endIndex: i,
          requiresConfirmation: false,
          isIdeal: a1.bodyTop < a0.bodyBottom && a1.bodyTop < a2.bodyBottom,
          supportLevel: sup,
          chapterRef: 'Ch. 5: Stars',
          pageRef: 'pp. 62–66',
          notes: `Three-candle bottom reversal; lowest low ${sup.toFixed(2)} acts as support.`,
        });
      }
    }

    // 14. EVENING STAR / EVENING DOJI STAR / ABANDONED BABY TOP (Ch. 5 pp. 66-74)
    if (
      priorTrendUp3 &&
      a0.color === 'white' &&
      a0.isLongBody &&
      (a1.isSmallBody || a1.isDoji) &&
      a1.bodyBottom >= a0.bodyTop * 0.998 &&
      a2.color === 'black' &&
      a2.isLongBody &&
      c2.close < (c0.open + c0.close) / 2
    ) {
      const gapBothShadows = a1.isDoji && c1.low > c0.high && c1.low > c2.high;
      const res = Math.max(c0.high, c1.high, c2.high);
      if (gapBothShadows) {
        found.push({
          id: 'abandoned_baby_top',
          name: 'Abandoned Baby Top',
          bias: 'bearish',
          category: 'star',
          startIndex: i - 2,
          endIndex: i,
          requiresConfirmation: false,
          isIdeal: true,
          resistanceLevel: res,
          chapterRef: 'Ch. 5: Stars',
          pageRef: 'pp. 70–73',
          notes: `Extremely rare Island Top with isolated Doji. Resistance at ${res.toFixed(2)}.`,
        });
      } else if (a1.isDoji) {
        found.push({
          id: 'evening_doji_star',
          name: 'Evening Doji Star',
          bias: 'bearish',
          category: 'star',
          startIndex: i - 2,
          endIndex: i,
          requiresConfirmation: false,
          isIdeal: a1.bodyBottom > a0.bodyTop && a1.bodyBottom > a2.bodyTop,
          resistanceLevel: res,
          chapterRef: 'Ch. 5: Stars',
          pageRef: 'pp. 70–74',
          notes: `Doji star top reversal. Highest high ${res.toFixed(2)} becomes resistance.`,
        });
      } else {
        found.push({
          id: 'evening_star',
          name: 'Evening Star',
          japaneseName: 'Three-River Evening Star',
          bias: 'bearish',
          category: 'star',
          startIndex: i - 2,
          endIndex: i,
          requiresConfirmation: false,
          isIdeal: a1.bodyBottom > a0.bodyTop && a1.bodyBottom > a2.bodyTop,
          resistanceLevel: res,
          chapterRef: 'Ch. 5: Stars',
          pageRef: 'pp. 66–70',
          notes: `Three-candle top reversal; highest high ${res.toFixed(2)} becomes resistance.`,
        });
      }
    }

    // 15. UPSIDE-GAP TWO CROWS (Ch. 6 pp. 95-97)
    if (
      priorTrendUp3 &&
      a0.color === 'white' &&
      a0.isLongBody &&
      a1.color === 'black' &&
      a1.bodyBottom > a0.bodyTop &&
      a2.color === 'black' &&
      c2.open > c1.open &&
      c2.close < c1.close &&
      c2.close > c0.close
    ) {
      found.push({
        id: 'upside_gap_two_crows',
        name: 'Upside-Gap Two Crows',
        bias: 'bearish',
        category: 'reversal_multi',
        startIndex: i - 2,
        endIndex: i,
        requiresConfirmation: false,
        isIdeal: true,
        resistanceLevel: Math.max(c1.high, c2.high),
        chapterRef: 'Ch. 6: More Reversal Patterns',
        pageRef: 'pp. 95–97',
        notes: 'Rare top reversal: two black crows gapped above tall white candle.',
      });
    }

    // 16. THREE BLACK CROWS (Ch. 6 pp. 97-98)
    if (
      priorTrendUp3 &&
      a0.color === 'black' &&
      a1.color === 'black' &&
      a2.color === 'black' &&
      a0.bodyRatio >= 0.45 &&
      a1.bodyRatio >= 0.45 &&
      a2.bodyRatio >= 0.45 &&
      c1.close < c0.close &&
      c2.close < c1.close &&
      a0.lowerShadow <= a0.range * 0.2 &&
      a1.lowerShadow <= a1.range * 0.2 &&
      a2.lowerShadow <= a2.range * 0.2
    ) {
      found.push({
        id: 'three_black_crows',
        name: 'Three Black Crows',
        bias: 'bearish',
        category: 'reversal_multi',
        startIndex: i - 2,
        endIndex: i,
        requiresConfirmation: false,
        isIdeal: c1.open <= c0.open && c1.open >= c0.close && c2.open <= c1.open && c2.open >= c1.close,
        resistanceLevel: c0.high,
        chapterRef: 'Ch. 6: More Reversal Patterns',
        pageRef: 'pp. 97–98',
        notes: 'Three consecutive declining black candles closing near lows at top of advance.',
      });
    }

    // 17. THREE ADVANCING WHITE SOLDIERS / ADVANCE BLOCK / STALLED PATTERN (Ch. 6 pp. 99-103)
    if (
      a0.color === 'white' &&
      a1.color === 'white' &&
      a2.color === 'white' &&
      c1.close > c0.close &&
      c2.close > c1.close &&
      c1.open >= c0.open &&
      c2.open >= c1.open
    ) {
      const strongCloses =
        a0.upperShadow <= a0.range * 0.22 &&
        a1.upperShadow <= a1.range * 0.22 &&
        a2.upperShadow <= a2.range * 0.22 &&
        a0.bodyRatio >= 0.5 &&
        a1.bodyRatio >= 0.5 &&
        a2.bodyRatio >= 0.5;

      const weakeningShadows = a1.upperShadow > a1.body * 0.6 || a2.upperShadow > a2.body * 0.6;
      const shrinkingBodies = a0.isLongBody && a1.body < a0.body * 0.75 && a2.body < a1.body * 0.85;
      const stalledThird = a0.isLongBody && a1.isLongBody && a2.isSmallBody;

      if (priorTrendUp3 && stalledThird) {
        found.push({
          id: 'stalled_pattern',
          name: 'Stalled (Deliberation) Pattern',
          bias: 'neutral_warning',
          category: 'reversal_multi',
          startIndex: i - 2,
          endIndex: i,
          requiresConfirmation: false,
          isIdeal: true,
          resistanceLevel: c2.high,
          chapterRef: 'Ch. 6: More Reversal Patterns',
          pageRef: 'pp. 99–100',
          notes: 'Small white candle after two tall white candles; protect/liquidate longs (do not short).',
        });
      } else if (priorTrendUp3 && (weakeningShadows || shrinkingBodies)) {
        found.push({
          id: 'advance_block',
          name: 'Advance Block',
          bias: 'neutral_warning',
          category: 'reversal_multi',
          startIndex: i - 2,
          endIndex: i,
          requiresConfirmation: false,
          isIdeal: true,
          resistanceLevel: c2.high,
          chapterRef: 'Ch. 6: More Reversal Patterns',
          pageRef: 'pp. 99–102',
          notes: 'White soldiers showing upper shadows / shrinking bodies; protect longs (do not short).',
        });
      } else if (!priorTrendUp3 && strongCloses) {
        found.push({
          id: 'three_white_soldiers',
          name: 'Three Advancing White Soldiers',
          bias: 'bullish',
          category: 'reversal_multi',
          startIndex: i - 2,
          endIndex: i,
          requiresConfirmation: false,
          isIdeal: true,
          supportLevel: c0.low,
          chapterRef: 'Ch. 6: More Reversal Patterns',
          pageRef: 'pp. 99–103',
          notes: 'Three strong consecutive white candles closing near highs from low/stable base.',
        });
      }
    }

    // 18. TRI-STAR TOP / BOTTOM (Ch. 8 pp. 170-171)
    if (a0.isDoji && a1.isDoji && a2.isDoji) {
      if (priorTrendUp3 && a1.bodyBottom > a0.bodyTop && a1.bodyBottom > a2.bodyTop) {
        found.push({
          id: 'tri_star_top',
          name: 'Tri-Star Top',
          bias: 'bearish',
          category: 'doji',
          startIndex: i - 2,
          endIndex: i,
          requiresConfirmation: false,
          isIdeal: true,
          resistanceLevel: Math.max(c0.high, c1.high, c2.high),
          chapterRef: 'Ch. 8: The Magic Doji',
          pageRef: 'pp. 170–171',
          notes: 'Rare three-doji top with middle doji above neighbors.',
        });
      } else if (priorTrendDown3 && a1.bodyTop < a0.bodyBottom && a1.bodyTop < a2.bodyBottom) {
        found.push({
          id: 'tri_star_bottom',
          name: 'Tri-Star Bottom',
          bias: 'bullish',
          category: 'doji',
          startIndex: i - 2,
          endIndex: i,
          requiresConfirmation: false,
          isIdeal: true,
          supportLevel: Math.min(c0.low, c1.low, c2.low),
          chapterRef: 'Ch. 8: The Magic Doji',
          pageRef: 'pp. 170–171',
          notes: 'Rare three-doji bottom with middle doji below neighbors.',
        });
      }
    }
  }

  // --- MULTI-CANDLE PATTERNS (4 to 7 candles) ---
  // 19. RISING & FALLING THREE METHODS (Ch. 7 pp. 142-150)
  for (const pauseCount of [2, 3, 4]) {
    const startIdx = i - pauseCount - 1;
    if (startIdx < 0) continue;
    const first = candles[startIdx];
    const firstA = anatomies[startIdx];
    const last = c;
    const lastA = a;
    if (!firstA.isLongBody || !lastA.isLongBody) continue;

    const middles = anatomies.slice(startIdx + 1, i);
    const allSmall = middles.every((m) => m.isSmallBody || m.isDoji);
    const allInsideRange = candles
      .slice(startIdx + 1, i)
      .every((m) => m.high <= first.high * 1.003 && m.low >= first.low * 0.997);

    if (
      allSmall &&
      allInsideRange &&
      firstA.color === 'white' &&
      lastA.color === 'white' &&
      last.close > first.close
    ) {
      found.push({
        id: 'rising_three_methods',
        name: 'Rising Three Methods',
        bias: 'bullish',
        category: 'continuation',
        startIndex: startIdx,
        endIndex: i,
        requiresConfirmation: false,
        isIdeal: pauseCount === 3 && middles.every((m) => m.color === 'black'),
        supportLevel: first.low,
        chapterRef: 'Ch. 7: Continuation Patterns',
        pageRef: 'pp. 142–148',
        notes: `${pauseCount} small pause candles held within tall white candle range; strong white breakout close.`,
      });
      break;
    }

    if (
      allSmall &&
      allInsideRange &&
      firstA.color === 'black' &&
      lastA.color === 'black' &&
      last.close < first.close
    ) {
      found.push({
        id: 'falling_three_methods',
        name: 'Falling Three Methods',
        bias: 'bearish',
        category: 'continuation',
        startIndex: startIdx,
        endIndex: i,
        requiresConfirmation: false,
        isIdeal: pauseCount === 3 && middles.every((m) => m.color === 'white'),
        resistanceLevel: first.high,
        chapterRef: 'Ch. 7: Continuation Patterns',
        pageRef: 'pp. 142–150',
        notes: `${pauseCount} small pause candles held within tall black candle range; strong black breakdown close.`,
      });
      break;
    }
  }

  // 20. HIGH-PRICE & LOW-PRICE GAPPING PLAYS (Ch. 7 pp. 136-139)
  if (i >= 4) {
    const hasRisingWin = found.some((p) => p.id === 'rising_window');
    const hasFallingWin = found.some((p) => p.id === 'falling_window');
    const recent3Small = anatomies.slice(i - 3, i).every((m) => m.isSmallBody || m.isDoji);

    if (hasRisingWin && recent3Small && anatomies[i - 4].color === 'white' && anatomies[i - 4].isLongBody) {
      found.push({
        id: 'high_price_gapping_play',
        name: 'High-Price Gapping Play',
        bias: 'bullish',
        category: 'continuation',
        startIndex: i - 4,
        endIndex: i,
        requiresConfirmation: false,
        isIdeal: true,
        supportLevel: candles[i - 1].high,
        chapterRef: 'Ch. 7: Continuation Patterns',
        pageRef: 'pp. 136–139',
        notes: 'High-level consolidation of small bodies resolved upward by a Rising Window.',
      });
    } else if (
      hasFallingWin &&
      recent3Small &&
      anatomies[i - 4].color === 'black' &&
      anatomies[i - 4].isLongBody
    ) {
      found.push({
        id: 'low_price_gapping_play',
        name: 'Low-Price Gapping Play',
        bias: 'bearish',
        category: 'continuation',
        startIndex: i - 4,
        endIndex: i,
        requiresConfirmation: false,
        isIdeal: true,
        resistanceLevel: candles[i - 1].low,
        chapterRef: 'Ch. 7: Continuation Patterns',
        pageRef: 'pp. 136–139',
        notes: 'Low-level consolidation of small bodies resolved downward by a Falling Window.',
      });
    }
  }

  // 21. DUMPLING TOP & FRYPAN BOTTOM (Ch. 6 pp. 114-119)
  if (i >= 6) {
    const hasRisingWin = found.some((p) => p.id === 'rising_window');
    const hasFallingWin = found.some((p) => p.id === 'falling_window');
    const midSmall = anatomies.slice(i - 5, i).filter((m) => m.isSmallBody || m.isDoji).length >= 4;
    if (hasFallingWin && midSmall) {
      const highs = candles.slice(i - 5, i).map((x) => x.high);
      if (highs[2] >= highs[0] && highs[2] >= highs[4]) {
        found.push({
          id: 'dumpling_top',
          name: 'Dumpling Top',
          bias: 'bearish',
          category: 'reversal_multi',
          startIndex: i - 5,
          endIndex: i,
          requiresConfirmation: false,
          isIdeal: true,
          resistanceLevel: candles[i - 1].low,
          chapterRef: 'Ch. 6: More Reversal Patterns',
          pageRef: 'pp. 114–118',
          notes: 'Convex small-body top confirmed by Falling Window.',
        });
      }
    } else if (hasRisingWin && midSmall) {
      const lows = candles.slice(i - 5, i).map((x) => x.low);
      if (lows[2] <= lows[0] && lows[2] <= lows[4]) {
        found.push({
          id: 'frypan_bottom',
          name: 'Frypan Bottom',
          bias: 'bullish',
          category: 'reversal_multi',
          startIndex: i - 5,
          endIndex: i,
          requiresConfirmation: false,
          isIdeal: true,
          supportLevel: candles[i - 1].high,
          chapterRef: 'Ch. 6: More Reversal Patterns',
          pageRef: 'pp. 114–119',
          notes: 'Concave small-body bottom confirmed by Rising Window.',
        });
      }
    }
  }

  // 22. TOWER TOP & TOWER BOTTOM (Ch. 6 pp. 119-124)
  if (i >= 4 && a.isLongBody) {
    const midSlice = anatomies.slice(i - 3, i);
    const hasCongestion = midSlice.filter((m) => m.isSmallBody || m.isDoji).length >= 2;
    const leftTower = anatomies[i - 4];
    if (hasCongestion && leftTower.isLongBody) {
      if (leftTower.color === 'white' && a.color === 'black' && c.close < candles[i - 3].low) {
        found.push({
          id: 'tower_top',
          name: 'Tower Top',
          bias: 'bearish',
          category: 'reversal_multi',
          startIndex: i - 4,
          endIndex: i,
          requiresConfirmation: false,
          isIdeal: true,
          resistanceLevel: Math.max(...candles.slice(i - 4, i + 1).map((x) => x.high)),
          chapterRef: 'Ch. 6: More Reversal Patterns',
          pageRef: 'pp. 119–122',
          notes: 'Tall white left tower, small-body lull, tall black right tower.',
        });
      } else if (leftTower.color === 'black' && a.color === 'white' && c.close > candles[i - 3].high) {
        found.push({
          id: 'tower_bottom',
          name: 'Tower Bottom',
          bias: 'bullish',
          category: 'reversal_multi',
          startIndex: i - 4,
          endIndex: i,
          requiresConfirmation: false,
          isIdeal: true,
          supportLevel: Math.min(...candles.slice(i - 4, i + 1).map((x) => x.low)),
          chapterRef: 'Ch. 6: More Reversal Patterns',
          pageRef: 'pp. 119–124',
          notes: 'Tall black left tower, small-body base, tall white right tower.',
        });
      }
    }
  }

  return found;
}

const PATTERN_PRIORITY: Record<string, number> = {
  abandoned_baby_top: 100,
  abandoned_baby_bottom: 100,
  morning_doji_star: 95,
  evening_doji_star: 95,
  morning_star: 92,
  evening_star: 92,
  rising_three_methods: 90,
  falling_three_methods: 90,
  frypan_bottom: 89,
  dumpling_top: 89,
  high_price_gapping_play: 88,
  low_price_gapping_play: 88,
  bullish_engulfing: 86,
  bearish_engulfing: 86,
  dark_cloud_cover: 84,
  piercing_pattern: 84,
  tower_top: 82,
  tower_bottom: 82,
  three_black_crows: 81,
  three_white_soldiers: 81,
  rising_window: 80,
  falling_window: 80,
  harami_cross_bearish: 78,
  harami_cross_bullish: 78,
  gravestone_doji: 76,
  dragonfly_doji: 76,
  hammer: 75,
  hanging_man: 74,
  shooting_star: 74,
  inverted_hammer: 73,
  bullish_belt_hold: 72,
  bearish_belt_hold: 72,
  tweezers_top: 70,
  tweezers_bottom: 70,
  northern_doji: 66,
  long_legged_doji: 65,
  harami_bearish: 64,
  harami_bullish: 64,
  advance_block: 62,
  stalled_pattern: 62,
};

export function runNisonBot(candles: Candle[], config: BotConfig = DEFAULT_BOT_CONFIG): BotAnalysisResult {
  if (candles.length === 0) {
    return {
      candles: [],
      anatomies: [],
      indicators: computeAllIndicators([]),
      patterns: [],
      windows: [],
      srZones: [],
      trendlines: [],
      latestRetracement: null,
      signals: [],
      trades: [],
      currentTrend: {
        shortTerm: 'box_range',
        majorTrend: 'box_range',
        isOverextendedUp: false,
        isOverextendedDown: false,
        boxRange: null,
      },
      latestActionableSignal: null,
    };
  }

  const indicators = computeAllIndicators(candles);
  const anatomies: CandleAnatomy[] = [];
  const allPatterns: DetectedPattern[] = [];
  const windows: WindowZone[] = [];
  const srZones: SupportResistanceZone[] = [];
  const signals: BotSignal[] = [];
  const trades: PaperTrade[] = [];

  let openTrade: PaperTrade | null = null;

  // Pending single-session confirmations (Hanging Man / Inverted Hammer / shallow Dark-Cloud / Doji at new high)
  let pendingHangingMan: { index: number; bodyBottom: number; pattern: DetectedPattern } | null = null;
  let pendingInvHammer: { index: number; bodyTop: number; pattern: DetectedPattern } | null = null;

  let currentTrend: TrendContext = {
    shortTerm: 'box_range',
    majorTrend: 'box_range',
    isOverextendedUp: false,
    isOverextendedDown: false,
    boxRange: null,
  };

  for (let i = 0; i < candles.length; i++) {
    const c = candles[i];
    const anatomy = analyzeCandleAnatomy(candles, i);
    anatomies.push(anatomy);

    currentTrend = evaluateTrendContext(candles, i, indicators.sma30, indicators.rsi14);

    // --- A. UPDATE EXISTING WINDOWS ON CLOSE (Ch. 7 p. 126, 132) ---
    for (const w of windows) {
      if (!w.active) continue;
      if (w.type === 'rising_window' && c.close < w.bottom) {
        w.active = false;
        w.voidedAtIndex = i;
      } else if (w.type === 'falling_window' && c.close > w.top) {
        w.active = false;
        w.voidedAtIndex = i;
      }
    }

    // --- B. UPDATE S/R ZONES & CHANGE OF POLARITY (Ch. 11 pp. 205-211) ---
    for (const z of srZones) {
      if (!z.active) continue;
      if (z.type === 'support') {
        if (c.low <= z.priceTop * 1.003 && c.close >= z.priceBottom * 0.998) {
          z.testCount++;
        }
        if (c.close < z.priceBottom * 0.996) {
          if (z.testCount >= 2 && !z.polarityFlipped) {
            // Change of Polarity: broken multitested support -> new resistance (p. 206, 210)
            z.type = 'resistance';
            z.polarityFlipped = true;
            z.brokenAtIndex = i;
            z.sourceLabel = `Flipped Resistance (ex-${z.sourceLabel})`;
          } else {
            z.active = false;
            z.brokenAtIndex = i;
          }
        }
      } else {
        if (c.high >= z.priceBottom * 0.997 && c.close <= z.priceTop * 1.002) {
          z.testCount++;
        }
        if (c.close > z.priceTop * 1.004) {
          if (z.testCount >= 2 && !z.polarityFlipped) {
            // Change of Polarity: broken multitested resistance -> new support (p. 210)
            z.type = 'support';
            z.polarityFlipped = true;
            z.brokenAtIndex = i;
            z.sourceLabel = `Flipped Support (ex-${z.sourceLabel})`;
          } else {
            z.active = false;
            z.brokenAtIndex = i;
          }
        }
      }
    }

    // --- C. UPDATE OPEN PAPER TRADE ON CLOSE / INTRADAY STOP (Ch. 4 p. 50) ---
    if (openTrade && openTrade.status === 'OPEN') {
      if (openTrade.direction === 'LONG') {
        if (c.close < openTrade.stopLoss) {
          openTrade.status = 'CLOSED_STOP';
          openTrade.exitIndex = i;
          openTrade.exitTime = c.time;
          openTrade.exitPrice = c.close;
          openTrade.exitReason = 'Closed below protective pattern support stop (Ch. 4, p. 50)';
          openTrade.pnlPercent = ((c.close - openTrade.entryPrice) / openTrade.entryPrice) * 100;
          trades.push({ ...openTrade });
          openTrade = null;
        } else if (openTrade.targetPrice && c.high >= openTrade.targetPrice) {
          openTrade.status = 'CLOSED_TARGET';
          openTrade.exitIndex = i;
          openTrade.exitTime = c.time;
          openTrade.exitPrice = openTrade.targetPrice;
          openTrade.exitReason = 'Reached Western measured-move price objective (Ch. 16, p. 250)';
          openTrade.pnlPercent = ((openTrade.targetPrice - openTrade.entryPrice) / openTrade.entryPrice) * 100;
          trades.push({ ...openTrade });
          openTrade = null;
        }
      } else {
        if (c.close > openTrade.stopLoss) {
          openTrade.status = 'CLOSED_STOP';
          openTrade.exitIndex = i;
          openTrade.exitTime = c.time;
          openTrade.exitPrice = c.close;
          openTrade.exitReason = 'Closed above protective pattern resistance stop (Ch. 4, p. 50)';
          openTrade.pnlPercent = ((openTrade.entryPrice - c.close) / openTrade.entryPrice) * 100;
          trades.push({ ...openTrade });
          openTrade = null;
        } else if (openTrade.targetPrice && c.low <= openTrade.targetPrice) {
          openTrade.status = 'CLOSED_TARGET';
          openTrade.exitIndex = i;
          openTrade.exitTime = c.time;
          openTrade.exitPrice = openTrade.targetPrice;
          openTrade.exitReason = 'Reached Western measured-move downside target (Ch. 16, p. 250)';
          openTrade.pnlPercent = ((openTrade.entryPrice - openTrade.targetPrice) / openTrade.entryPrice) * 100;
          trades.push({ ...openTrade });
          openTrade = null;
        }
      }
    }

    // --- D. DETECT CANDLE PATTERNS AT BAR i ---
    const barPatterns = detectPatternsAtBar(
      candles,
      anatomies,
      currentTrend,
      indicators.relVolume,
      i
    );

    // Register Windows & Pattern S/R Zones
    for (const p of barPatterns) {
      allPatterns.push(p);

      if (p.id === 'rising_window' && i >= 1) {
        windows.push({
          id: `win-r-${i}`,
          type: 'rising_window',
          createdAtIndex: i,
          bottom: candles[i - 1].high,
          top: c.low,
          highVolume: indicators.relVolume[i] >= 1.5,
          active: true,
        });
      } else if (p.id === 'falling_window' && i >= 1) {
        windows.push({
          id: `win-f-${i}`,
          type: 'falling_window',
          createdAtIndex: i,
          bottom: c.high,
          top: candles[i - 1].low,
          highVolume: indicators.relVolume[i] >= 1.5,
          active: true,
        });
      }

      if (p.supportLevel !== undefined) {
        srZones.push({
          id: `sr-sup-${i}-${p.id}`,
          type: 'support',
          priceBottom: p.supportLevel,
          priceTop: p.supportLevel * 1.004,
          midpoint: p.supportLevel,
          sourceLabel: p.name,
          sourceIndex: i,
          chapterRef: `${p.chapterRef} (${p.pageRef})`,
          active: true,
          testCount: 1,
          polarityFlipped: false,
        });
      }
      if (p.resistanceLevel !== undefined) {
        srZones.push({
          id: `sr-res-${i}-${p.id}`,
          type: 'resistance',
          priceBottom: p.resistanceLevel * 0.996,
          priceTop: p.resistanceLevel,
          midpoint: p.resistanceLevel,
          sourceLabel: p.name,
          sourceIndex: i,
          chapterRef: `${p.chapterRef} (${p.pageRef})`,
          active: true,
          testCount: 1,
          polarityFlipped: false,
        });
      }
    }

    // --- E. CHECK PENDING CONFIRMATIONS FROM BAR i-1 ---
    let confirmedHangingMan: DetectedPattern | null = null;
    if (pendingHangingMan && i === pendingHangingMan.index + 1) {
      if (c.close < pendingHangingMan.bodyBottom) {
        confirmedHangingMan = {
          ...pendingHangingMan.pattern,
          requiresConfirmation: false,
          notes: `Hanging Man CONFIRMED: session closed at ${c.close.toFixed(2)} below hanging man body (${pendingHangingMan.bodyBottom.toFixed(2)}) (Ch. 4, p. 38).`,
        };
      }
      pendingHangingMan = null;
    } else if (pendingHangingMan && i > pendingHangingMan.index + 1) {
      pendingHangingMan = null;
    }

    let confirmedInvHammer: DetectedPattern | null = null;
    if (pendingInvHammer && i === pendingInvHammer.index + 1) {
      if (c.close > pendingInvHammer.bodyTop) {
        confirmedInvHammer = {
          ...pendingInvHammer.pattern,
          requiresConfirmation: false,
          notes: `Inverted Hammer CONFIRMED: session closed at ${c.close.toFixed(2)} above inverted hammer body (${pendingInvHammer.bodyTop.toFixed(2)}) (Ch. 5, p. 78).`,
        };
      }
      pendingInvHammer = null;
    } else if (pendingInvHammer && i > pendingInvHammer.index + 1) {
      pendingInvHammer = null;
    }

    // Track new pending patterns on bar i
    const hm = barPatterns.find((p) => p.id === 'hanging_man');
    if (hm) {
      pendingHangingMan = { index: i, bodyBottom: anatomy.bodyBottom, pattern: hm };
    }
    const ih = barPatterns.find((p) => p.id === 'inverted_hammer');
    if (ih) {
      pendingInvHammer = { index: i, bodyTop: anatomy.bodyTop, pattern: ih };
    }

    // --- F. CHECK WYCKOFF SPRINGS & UPTHRUSTS (Ch. 11 pp. 199-205) ---
    const activeSupports = srZones.filter((z) => z.active && z.type === 'support' && z.sourceIndex < i);
    const activeResistances = srZones.filter((z) => z.active && z.type === 'resistance' && z.sourceIndex < i);

    let springZone: SupportResistanceZone | null = null;
    for (const sup of activeSupports) {
      if (c.low < sup.priceBottom && c.close > sup.priceBottom) {
        springZone = sup;
        break;
      }
    }

    let upthrustZone: SupportResistanceZone | null = null;
    for (const res of activeResistances) {
      if (c.high > res.priceTop && c.close < res.priceTop) {
        upthrustZone = res;
        break;
      }
    }

    // --- G. FILTER & CONVERGENCE ENGINE ---
    const candidatePatterns = [...barPatterns];
    if (confirmedHangingMan) candidatePatterns.push(confirmedHangingMan);
    if (confirmedInvHammer) candidatePatterns.push(confirmedInvHammer);

    if (candidatePatterns.length === 0 && !springZone && !upthrustZone) {
      continue;
    }

    // Suppress standalone Doji inside middle of a Box Range (Ch. 8 p. 165)
    const filteredCandidates = candidatePatterns.filter((p) => {
      if (
        config.suppressMiddleBoxDoji &&
        (p.id === 'northern_doji' || p.id === 'southern_doji' || p.id === 'long_legged_doji') &&
        currentTrend.boxRange?.active
      ) {
        const boxMid = (currentTrend.boxRange.top + currentTrend.boxRange.bottom) / 2;
        const boxSpan = currentTrend.boxRange.top - currentTrend.boxRange.bottom;
        if (Math.abs(c.close - boxMid) < boxSpan * 0.28) {
          return false;
        }
      }
      return true;
    });

    if (filteredCandidates.length === 0 && !springZone && !upthrustZone) {
      continue;
    }

    // Pick highest priority pattern at bar i
    filteredCandidates.sort((aP, bP) => (PATTERN_PRIORITY[bP.id] ?? 50) - (PATTERN_PRIORITY[aP.id] ?? 50));

    let primaryPattern: DetectedPattern;
    if (filteredCandidates.length > 0) {
      primaryPattern = filteredCandidates[0];
    } else if (springZone) {
      primaryPattern = {
        id: 'hammer',
        name: 'Wyckoff Spring (False Downside Break)',
        bias: 'bullish',
        category: 'umbrella',
        startIndex: i,
        endIndex: i,
        requiresConfirmation: false,
        isIdeal: true,
        supportLevel: c.low,
        chapterRef: 'Ch. 11: Candles with Trend Lines',
        pageRef: 'pp. 199–205',
        notes: `Broke support (${springZone.priceBottom.toFixed(2)}) intraday and closed back above it.`,
      };
    } else {
      primaryPattern = {
        id: 'shooting_star',
        name: 'Wyckoff Upthrust (False Upside Break)',
        bias: 'bearish',
        category: 'star',
        startIndex: i,
        endIndex: i,
        requiresConfirmation: false,
        isIdeal: true,
        resistanceLevel: c.high,
        chapterRef: 'Ch. 11: Candles with Trend Lines',
        pageRef: 'pp. 200–205',
        notes: `Broke resistance (${upthrustZone!.priceTop.toFixed(2)}) intraday and failed back below it.`,
      };
    }

    const convergingFactors: string[] = [];
    const warningFlags: string[] = [];
    const reasoningChain: string[] = [];

    reasoningChain.push(
      `Detected ${primaryPattern.name} (${primaryPattern.chapterRef}, ${primaryPattern.pageRef}).`
    );

    // 1. Candle Cluster (Ch. 10 pp. 187-191)
    const nearbyRecentPatterns = allPatterns.filter(
      (p) =>
        p.endIndex >= i - 6 &&
        p.endIndex < i &&
        p.bias === primaryPattern.bias &&
        Math.abs(candles[p.endIndex].close - c.close) / c.close <= 0.025
    );
    if (filteredCandidates.length > 1 || nearbyRecentPatterns.length > 0) {
      const clusterNames = [
        ...filteredCandidates.slice(1).map((p) => p.name),
        ...nearbyRecentPatterns.map((p) => p.name),
      ];
      convergingFactors.push(
        `Cluster of Candles: ${[...new Set(clusterNames)].slice(0, 3).join(', ')} (Ch. 10, p. 187)`
      );
    }

    // 2. Prior S/R Zone or Change of Polarity (Ch. 11 p. 205)
    if (primaryPattern.bias === 'bullish') {
      const touchedSup = activeSupports.find(
        (z) => c.low <= z.priceTop * 1.006 && c.close >= z.priceBottom * 0.995
      );
      if (touchedSup) {
        convergingFactors.push(
          touchedSup.polarityFlipped
            ? `Change of Polarity Support near ${fmtP(touchedSup.midpoint)} (Ch. 11, p. 206)`
            : `Confirmed prior Support zone (${touchedSup.sourceLabel}) near ${fmtP(touchedSup.midpoint)} (Ch. 10, p. 188)`
        );
      }
      if (springZone) {
        convergingFactors.push(
          `Wyckoff Spring at ${fmtP(springZone.priceBottom)} (Ch. 11, p. 199)`
        );
      }
    } else if (primaryPattern.bias === 'bearish') {
      const touchedRes = activeResistances.find(
        (z) => c.high >= z.priceBottom * 0.994 && c.close <= z.priceTop * 1.005
      );
      if (touchedRes) {
        convergingFactors.push(
          touchedRes.polarityFlipped
            ? `Change of Polarity Resistance near ${fmtP(touchedRes.midpoint)} (Ch. 11, p. 206)`
            : `Confirmed prior Resistance zone (${touchedRes.sourceLabel}) near ${fmtP(touchedRes.midpoint)} (Ch. 10, p. 190)`
        );
      }
      if (upthrustZone) {
        convergingFactors.push(
          `Wyckoff Upthrust at ${fmtP(upthrustZone.priceTop)} (Ch. 11, p. 200)`
        );
      }
    }

    // 3. Trendlines (Ch. 11 pp. 193-198)
    const trendlines = computeTrendlines(candles, i);
    for (const tl of trendlines) {
      const proj = tl.startPrice + tl.slope * (i - tl.startIndex);
      if (
        primaryPattern.bias === 'bullish' &&
        (tl.type === 'rising_support' || tl.type === 'falling_support') &&
        Math.abs(c.low - proj) / c.close <= 0.01
      ) {
        convergingFactors.push(
          `Tested ${tl.type === 'rising_support' ? 'Rising' : 'Falling'} Support Trendline at ${fmtP(proj)} (Ch. 11, p. 193)`
        );
      }
      if (
        primaryPattern.bias === 'bearish' &&
        (tl.type === 'rising_resistance' || tl.type === 'falling_resistance') &&
        Math.abs(c.high - proj) / c.close <= 0.01
      ) {
        convergingFactors.push(
          `Tested ${tl.type === 'rising_resistance' ? 'Rising' : 'Falling'} Resistance Trendline at ${fmtP(proj)} (Ch. 11, p. 197)`
        );
      }
    }

    // 4. Fibonacci Retracements 38.2%, 50%, 61.8% (Ch. 12 pp. 213-216)
    const ret = computeLatestRetracement(candles, i);
    if (ret) {
      const levels = [
        { label: '38.2%', val: ret.level382 },
        { label: '50.0%', val: ret.level500 },
        { label: '61.8%', val: ret.level618 },
      ];
      for (const lv of levels) {
        if (
          (primaryPattern.bias === 'bullish' &&
            ret.direction === 'up_swing' &&
            Math.abs(c.low - lv.val) / c.close <= 0.008) ||
          (primaryPattern.bias === 'bearish' &&
            ret.direction === 'down_swing' &&
            Math.abs(c.high - lv.val) / c.close <= 0.008)
        ) {
          convergingFactors.push(
            `Confirmed ${lv.label} Fibonacci Retracement at ${fmtP(lv.val)} (Ch. 12, p. 214)`
          );
          break;
        }
      }
    }

    // 5. Moving Averages (Ch. 13 pp. 217-224)
    const sma5 = indicators.sma5[i];
    const ema9 = indicators.ema9[i];
    const sma30 = indicators.sma30[i];
    if (sma30 !== null) {
      if (primaryPattern.bias === 'bullish' && c.low <= sma30 * 1.006 && c.close >= sma30 * 0.996) {
        convergingFactors.push(`30-period SMA dynamic Support at ${fmtP(sma30)} (Ch. 13, p. 221)`);
      } else if (primaryPattern.bias === 'bearish' && c.high >= sma30 * 0.994 && c.close <= sma30 * 1.004) {
        convergingFactors.push(`30-period SMA dynamic Resistance at ${fmtP(sma30)} (Ch. 13, p. 222)`);
      }
    }
    if (ema9 !== null && sma30 !== null && i >= 1) {
      const prevEma9 = indicators.ema9[i - 1];
      const prevSma30 = indicators.sma30[i - 1];
      if (prevEma9 !== null && prevSma30 !== null) {
        if (primaryPattern.bias === 'bullish' && prevEma9 <= prevSma30 && ema9 > sma30) {
          convergingFactors.push('Golden Cross (9 EMA crossed above 30 SMA) (Ch. 13, p. 220)');
        } else if (primaryPattern.bias === 'bearish' && prevEma9 >= prevSma30 && ema9 < sma30) {
          convergingFactors.push('Dead Cross (9 EMA crossed under 30 SMA) (Ch. 13, p. 220)');
        }
      }
    }
    if (sma5 !== null && primaryPattern.bias === 'bullish' && c.close < sma5 * 0.985 && sma5 > c.close) {
      warningFlags.push(`5-period SMA overhead at ${fmtP(sma5)} — wait for close above if acting as resistance (Ch. 13, p. 222)`);
    }

    // 6. Oscillators: RSI, Slow Stochastics, MACD (Ch. 14 pp. 225-239)
    const rsi = indicators.rsi14[i];
    if (rsi !== null) {
      if (primaryPattern.bias === 'bullish' && rsi <= 30) {
        convergingFactors.push(`RSI(14) Oversold (${rsi.toFixed(1)} <= 30) (Ch. 14, p. 227)`);
      } else if (primaryPattern.bias === 'bearish' && rsi >= 70) {
        convergingFactors.push(`RSI(14) Overbought (${rsi.toFixed(1)} >= 70) (Ch. 14, p. 227)`);
      }
      const rsiDiv = detectOscillatorDivergence(candles, indicators.rsi14, i);
      if (primaryPattern.bias === 'bullish' && rsiDiv.bullish) {
        convergingFactors.push(`RSI Positive Divergence (${rsiDiv.detail}) (Ch. 14, p. 227)`);
      } else if (primaryPattern.bias === 'bearish' && rsiDiv.bearish) {
        convergingFactors.push(`RSI Negative Divergence (${rsiDiv.detail}) (Ch. 14, p. 227)`);
      }
    }

    const stK = indicators.stochK[i];
    const stD = indicators.stochD[i];
    if (stK !== null && stD !== null) {
      if (primaryPattern.bias === 'bullish' && stD <= 22 && stK > stD) {
        convergingFactors.push(`Slow Stochastics Oversold Bullish Crossover (%K ${stK.toFixed(0)} > %D ${stD.toFixed(0)}) (Ch. 14, p. 235)`);
      } else if (primaryPattern.bias === 'bearish' && stD >= 78 && stK < stD) {
        convergingFactors.push(`Slow Stochastics Overbought Bearish Crossover (%K ${stK.toFixed(0)} < %D ${stD.toFixed(0)}) (Ch. 14, p. 235)`);
      }
    }

    const macd = indicators.macdLine[i];
    const macdSig = indicators.macdSignal[i];
    if (macd !== null && macdSig !== null && i >= 1) {
      const pMacd = indicators.macdLine[i - 1];
      const pSig = indicators.macdSignal[i - 1];
      if (pMacd !== null && pSig !== null) {
        if (primaryPattern.bias === 'bullish' && pMacd <= pSig && macd > macdSig) {
          convergingFactors.push('MACD Bullish Crossover (Ch. 14, p. 237)');
        } else if (primaryPattern.bias === 'bearish' && pMacd >= pSig && macd < macdSig) {
          convergingFactors.push('MACD Bearish Crossover (Ch. 14, p. 237)');
        }
      }
      const macdDiv = detectOscillatorDivergence(candles, indicators.macdLine, i);
      if (primaryPattern.bias === 'bearish' && macdDiv.bearish) {
        convergingFactors.push(`MACD Bearish Divergence (${macdDiv.detail}) (Ch. 14, p. 237)`);
      } else if (primaryPattern.bias === 'bullish' && macdDiv.bullish) {
        convergingFactors.push(`MACD Bullish Divergence (${macdDiv.detail}) (Ch. 14, p. 237)`);
      }
    }

    // 7. Volume Confirmation (Ch. 15 pp. 241-248)
    const rVol = indicators.relVolume[i];
    if (rVol >= 1.5 && c.volume > 0) {
      convergingFactors.push(`High Relative Volume (${rVol.toFixed(2)}x avg) confirming move (Ch. 15, p. 242)`);
    }
    if (
      (primaryPattern.id === 'bullish_engulfing' ||
        primaryPattern.id === 'piercing_pattern' ||
        primaryPattern.id === 'bearish_engulfing') &&
      i >= 1 &&
      candles[i - 1].volume > 0 &&
      c.volume > candles[i - 1].volume * 1.25
    ) {
      convergingFactors.push('Lighter volume on Candle 1 & heavier volume on Candle 2 (Ch. 15, p. 244)');
    }

    // --- H. CHECK WINDOW DOMINANCE RULE (Ch. 7 p. 141) ---
    let voidedByWindow = false;
    if (config.respectWindowDominance) {
      if (primaryPattern.bias === 'bullish') {
        const blockingFallingWindow = windows.find(
          (w) => w.active && w.type === 'falling_window' && c.close <= w.top && w.createdAtIndex <= i
        );
        if (blockingFallingWindow && primaryPattern.id !== 'rising_window') {
          voidedByWindow = true;
          warningFlags.push(
            `Blocked by active Falling Window resistance (${fmtP(blockingFallingWindow.bottom)}–${fmtP(blockingFallingWindow.top)}). Book rule: "Between the window and another pattern, go with the window" until a close above ${fmtP(blockingFallingWindow.top)} (Ch. 7, p. 141).`
          );
          reasoningChain.push(
            `Window Dominance Rule triggered: Falling Window top ${fmtP(blockingFallingWindow.top)} overrides ${primaryPattern.name}.`
          );
        }
      } else if (primaryPattern.bias === 'bearish') {
        const blockingRisingWindow = windows.find(
          (w) => w.active && w.type === 'rising_window' && c.close >= w.bottom && w.createdAtIndex <= i
        );
        if (blockingRisingWindow && primaryPattern.id !== 'falling_window') {
          voidedByWindow = true;
          warningFlags.push(
            `Blocked by active Rising Window support (${fmtP(blockingRisingWindow.bottom)}–${fmtP(blockingRisingWindow.top)}). Wait for close under ${fmtP(blockingRisingWindow.bottom)} (Ch. 7, p. 132, 141).`
          );
          reasoningChain.push(
            `Window Dominance Rule triggered: Rising Window bottom ${fmtP(blockingRisingWindow.bottom)} overrides ${primaryPattern.name}.`
          );
        }
      }
    }

    // --- I. DETERMINE ACTION, CONFIRMATION STATUS, STOP & TARGET ---
    let action: SignalAction = 'CAUTION';
    let confirmationStatus: ConfirmationStatus = 'CONFIRMED';

    if (voidedByWindow) {
      action = 'WAIT_CONFIRMATION';
      confirmationStatus = 'VOIDED_BY_WINDOW';
    } else if (
      config.requireConfirmationForHangingManAndInvHammer &&
      primaryPattern.requiresConfirmation
    ) {
      action = 'WAIT_CONFIRMATION';
      confirmationStatus = 'PENDING_CONFIRMATION';
      reasoningChain.push(`Confirmation required per book rule (${primaryPattern.pageRef}).`);
    } else if (primaryPattern.bias === 'neutral_warning') {
      action = openTrade?.direction === 'LONG' ? 'EXIT_LONG' : 'CAUTION';
      confirmationStatus = 'CONFIRMED';
      reasoningChain.push('Trend-pause warning (Harami/Doji/Advance Block): tighten stops or protect gains.');
    } else if (primaryPattern.bias === 'bullish') {
      const counterMajor =
        config.respectMajorTrendRule &&
        currentTrend.majorTrend === 'downtrend' &&
        convergingFactors.length < 2 &&
        primaryPattern.id !== 'rising_window';
      if (counterMajor) {
        action = openTrade?.direction === 'SHORT' ? 'EXIT_SHORT' : 'CAUTION';
        confirmationStatus = 'COUNTER_TREND_EXIT_ONLY';
        warningFlags.push(
          'Major Trend Rule (Ch. 4, p. 32; Conclusion, p. 268): Bullish candle in major downtrend without >=2 converging Western confirmations is used to cover shorts, not initiate aggressive longs.'
        );
        reasoningChain.push('Major downtrend intact; signal restricted to short exit / caution.');
      } else {
        action = 'BUY';
        confirmationStatus = 'CONFIRMED';
      }
    } else if (primaryPattern.bias === 'bearish') {
      const counterMajor =
        config.respectMajorTrendRule &&
        currentTrend.majorTrend === 'uptrend' &&
        convergingFactors.length < 2 &&
        primaryPattern.id !== 'falling_window';
      if (counterMajor) {
        action = openTrade?.direction === 'LONG' ? 'EXIT_LONG' : 'CAUTION';
        confirmationStatus = 'COUNTER_TREND_EXIT_ONLY';
        warningFlags.push(
          'Major Trend Rule (Ch. 4, p. 32; Conclusion, p. 268): Bearish reversal in major uptrend without >=2 converging Western confirmations signals liquidating longs rather than initiating shorts.'
        );
        reasoningChain.push('Major uptrend intact; signal restricted to long exit / caution.');
      } else {
        action = 'SELL';
        confirmationStatus = 'CONFIRMED';
      }
    }

    // --- J. PROTECTIVE STOP & CHAPTER 16 MEASURED TARGETS ---
    let stopLoss: number | null = null;
    let stopRule = 'Place protective stop at pattern invalidation close (Ch. 4, p. 50).';
    let targetPrice: number | null = null;
    let targetRule = 'No candle price target; use nearest Western S/R or swing target (Ch. 16, p. 249).';

    const swings = findSwingPoints(candles, i, 2);
    const swingHighs = swings.filter((s) => s.type === 'high');
    const swingLows = swings.filter((s) => s.type === 'low');

    if (primaryPattern.bias === 'bullish') {
      const patternLow =
        primaryPattern.supportLevel ??
        Math.min(...candles.slice(primaryPattern.startIndex, i + 1).map((x) => x.low));
      stopLoss = patternLow * 0.997;
      stopRule = `Close below ${fmtP(patternLow)} (${primaryPattern.name} support invalidation, ${primaryPattern.pageRef})`;

      // Ch. 16 Target: Box breakout -> Swing target -> Nearest overhead resistance
      if (currentTrend.boxRange && c.close > currentTrend.boxRange.top) {
        const boxH = currentTrend.boxRange.top - currentTrend.boxRange.bottom;
        targetPrice = currentTrend.boxRange.top + boxH;
        targetRule = `Box Range Breakout target: Top ${fmtP(currentTrend.boxRange.top)} + Height ${fmtP(boxH)} (Ch. 16, p. 250)`;
      } else if (swingHighs.length >= 1) {
        const nearestHigh = swingHighs[swingHighs.length - 1].price;
        if (nearestHigh > c.close * 1.01) {
          targetPrice = nearestHigh;
          targetRule = `Prior swing resistance objective at ${fmtP(nearestHigh)} (Ch. 11/16)`;
        } else if (swingLows.length >= 1) {
          const swingAmp = Math.max(nearestHigh - swingLows[swingLows.length - 1].price, c.close * 0.03);
          targetPrice = c.close + swingAmp;
          targetRule = `Swing Target projection (+${fmtP(swingAmp)}) (Ch. 16, p. 255)`;
        }
      } else {
        targetPrice = c.close + (c.close - stopLoss) * 2.2;
        targetRule = `2.2R structural swing projection (Ch. 16)`;
      }
    } else if (primaryPattern.bias === 'bearish') {
      const patternHigh =
        primaryPattern.resistanceLevel ??
        Math.max(...candles.slice(primaryPattern.startIndex, i + 1).map((x) => x.high));
      stopLoss = patternHigh * 1.003;
      stopRule = `Close above ${fmtP(patternHigh)} (${primaryPattern.name} resistance invalidation, ${primaryPattern.pageRef})`;

      if (currentTrend.boxRange && c.close < currentTrend.boxRange.bottom) {
        const boxH = currentTrend.boxRange.top - currentTrend.boxRange.bottom;
        targetPrice = currentTrend.boxRange.bottom - boxH;
        targetRule = `Box Range Breakdown target: Bottom ${fmtP(currentTrend.boxRange.bottom)} - Height ${fmtP(boxH)} (Ch. 16, p. 250)`;
      } else if (swingLows.length >= 1) {
        const nearestLow = swingLows[swingLows.length - 1].price;
        if (nearestLow < c.close * 0.99) {
          targetPrice = nearestLow;
          targetRule = `Prior swing support objective at ${fmtP(nearestLow)} (Ch. 11/16)`;
        } else if (swingHighs.length >= 1) {
          const swingAmp = Math.max(swingHighs[swingHighs.length - 1].price - nearestLow, c.close * 0.03);
          targetPrice = Math.max(c.close * 0.1, c.close - swingAmp);
          targetRule = `Downside Swing Target projection (-${fmtP(swingAmp)}) (Ch. 16, p. 255)`;
        }
      } else {
        targetPrice = Math.max(c.close * 0.1, c.close - (stopLoss - c.close) * 2.2);
        targetRule = `2.2R downside swing projection (Ch. 16)`;
      }
    }

    // Risk / Reward calculation (Ch. 4 p. 36, Ch. 5 p. 64)
    let riskRewardRatio: number | null = null;
    if (stopLoss !== null && targetPrice !== null) {
      const risk = Math.abs(c.close - stopLoss);
      const reward = Math.abs(targetPrice - c.close);
      if (risk > 0) {
        riskRewardRatio = reward / risk;
        if ((action === 'BUY' || action === 'SELL') && riskRewardRatio < config.minRiskRewardForEntry) {
          warningFlags.push(
            `Low Risk/Reward (${riskRewardRatio.toFixed(2)}:1 < ${config.minRiskRewardForEntry}:1): Market moved too far from pattern support/resistance. Book advises waiting for a pullback toward ${fmtP(stopLoss)} before entry (Ch. 4, p. 36; Ch. 5, p. 64).`
          );
        }
      }
    }

    // Confidence Tier strictly by convergence count & confirmation
    let confidenceTier: ConfidenceTier = 'PRELIMINARY_WARNING';
    if (confirmationStatus === 'CONFIRMED' && convergingFactors.length >= 2) {
      confidenceTier = 'HIGH_CONVERGENCE';
    } else if (confirmationStatus === 'CONFIRMED' && (action === 'BUY' || action === 'SELL')) {
      confidenceTier = 'CONFIRMED_SIGNAL';
    }

    const signal: BotSignal = {
      id: `sig-${i}-${primaryPattern.id}`,
      candleIndex: i,
      time: c.time,
      action,
      bias: primaryPattern.bias,
      confidenceTier,
      confirmationStatus,
      primaryPattern,
      clusterPatterns: filteredCandidates.slice(1),
      entryPrice: c.close,
      stopLoss,
      stopRule,
      targetPrice,
      targetRule,
      riskRewardRatio,
      convergingFactors,
      warningFlags,
      reasoningChain,
      bookReference: {
        chapter: primaryPattern.chapterRef,
        pages: primaryPattern.pageRef,
        principle: primaryPattern.notes,
      },
    };
    signals.push(signal);

    // --- K. PAPER TRADE EXECUTION (STRICTLY BOOK RULES) ---
    if (action === 'EXIT_LONG' && openTrade?.direction === 'LONG') {
      openTrade.status = 'CLOSED_REVERSAL';
      openTrade.exitIndex = i;
      openTrade.exitTime = c.time;
      openTrade.exitPrice = c.close;
      openTrade.exitReason = `Exited on ${primaryPattern.name} (${primaryPattern.pageRef})`;
      openTrade.pnlPercent = ((c.close - openTrade.entryPrice) / openTrade.entryPrice) * 100;
      trades.push({ ...openTrade });
      openTrade = null;
    } else if (action === 'EXIT_SHORT' && openTrade?.direction === 'SHORT') {
      openTrade.status = 'CLOSED_REVERSAL';
      openTrade.exitIndex = i;
      openTrade.exitTime = c.time;
      openTrade.exitPrice = c.close;
      openTrade.exitReason = `Covered short on ${primaryPattern.name} (${primaryPattern.pageRef})`;
      openTrade.pnlPercent = ((openTrade.entryPrice - c.close) / openTrade.entryPrice) * 100;
      trades.push({ ...openTrade });
      openTrade = null;
    }

    if (action === 'BUY') {
      if (openTrade?.direction === 'SHORT') {
        openTrade.status = 'CLOSED_REVERSAL';
        openTrade.exitIndex = i;
        openTrade.exitTime = c.time;
        openTrade.exitPrice = c.close;
        openTrade.exitReason = `Reversed on ${primaryPattern.name}`;
        openTrade.pnlPercent = ((openTrade.entryPrice - c.close) / openTrade.entryPrice) * 100;
        trades.push({ ...openTrade });
        openTrade = null;
      }
      if (!openTrade && stopLoss !== null) {
        openTrade = {
          id: `tr-${i}`,
          direction: 'LONG',
          entryIndex: i,
          entryTime: c.time,
          entryPrice: c.close,
          stopLoss,
          targetPrice,
          entrySignalId: signal.id,
          entryPatternName: primaryPattern.name,
          status: 'OPEN',
          pnlPercent: 0,
        };
      }
    } else if (action === 'SELL') {
      if (openTrade?.direction === 'LONG') {
        openTrade.status = 'CLOSED_REVERSAL';
        openTrade.exitIndex = i;
        openTrade.exitTime = c.time;
        openTrade.exitPrice = c.close;
        openTrade.exitReason = `Reversed on ${primaryPattern.name}`;
        openTrade.pnlPercent = ((c.close - openTrade.entryPrice) / openTrade.entryPrice) * 100;
        trades.push({ ...openTrade });
        openTrade = null;
      }
      if (!openTrade && stopLoss !== null) {
        openTrade = {
          id: `tr-${i}`,
          direction: 'SHORT',
          entryIndex: i,
          entryTime: c.time,
          entryPrice: c.close,
          stopLoss,
          targetPrice,
          entrySignalId: signal.id,
          entryPatternName: primaryPattern.name,
          status: 'OPEN',
          pnlPercent: 0,
        };
      }
    }
  }

  if (openTrade) {
    const lastClose = candles[candles.length - 1].close;
    openTrade.pnlPercent =
      openTrade.direction === 'LONG'
        ? ((lastClose - openTrade.entryPrice) / openTrade.entryPrice) * 100
        : ((openTrade.entryPrice - lastClose) / openTrade.entryPrice) * 100;
    trades.push(openTrade);
  }

  const trendlines = computeTrendlines(candles, candles.length - 1);
  const latestRetracement = computeLatestRetracement(candles, candles.length - 1);
  const latestActionableSignal =
    [...signals].reverse().find((s) => s.action === 'BUY' || s.action === 'SELL' || s.action === 'WAIT_CONFIRMATION') ??
    (signals.length > 0 ? signals[signals.length - 1] : null);

  return {
    candles,
    anatomies,
    indicators,
    patterns: allPatterns,
    windows,
    srZones,
    trendlines,
    latestRetracement,
    signals,
    trades,
    currentTrend,
    latestActionableSignal,
  };
}
