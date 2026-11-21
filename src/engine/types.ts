export interface Candle {
  index: number;
  time: string;
  open: number;
  high: number;
  low: number;
  close: number;
  volume: number;
}

export type CandleColor = 'white' | 'black' | 'doji';

export interface CandleAnatomy {
  color: CandleColor;
  body: number;
  range: number;
  upperShadow: number;
  lowerShadow: number;
  bodyTop: number;
  bodyBottom: number;
  bodyRatio: number;
  isLongBody: boolean;
  isSmallBody: boolean; // Spinning top
  isDoji: boolean;
  isMeaningfulDoji: boolean; // Ch. 8 p. 156: meaningful relative to recent tall candles
  isShavenHead: boolean; // No upper shadow
  isShavenBottom: boolean; // No lower shadow
  isHighWave: boolean; // Small real body + very long upper & lower shadows
  isLongLeggedDoji: boolean; // Rickshaw man
  isGravestoneDoji: boolean; // Open/close/low at session low + long upper shadow
  isDragonflyDoji: boolean; // Open/close/high at session high + long lower shadow
}

export type TrendDirection = 'uptrend' | 'downtrend' | 'box_range';

export interface TrendContext {
  shortTerm: TrendDirection;
  majorTrend: TrendDirection;
  isOverextendedUp: boolean;
  isOverextendedDown: boolean;
  boxRange: {
    active: boolean;
    top: number;
    bottom: number;
    startIndex: number;
  } | null;
}

export type PatternBias = 'bullish' | 'bearish' | 'neutral_warning';

export type PatternCategory =
  | 'umbrella'
  | 'reversal_dual'
  | 'star'
  | 'reversal_multi'
  | 'continuation'
  | 'doji';

export type PatternId =
  | 'hammer'
  | 'hanging_man'
  | 'bullish_engulfing'
  | 'bearish_engulfing'
  | 'dark_cloud_cover'
  | 'piercing_pattern'
  | 'on_neck'
  | 'in_neck'
  | 'thrusting_pattern'
  | 'morning_star'
  | 'morning_doji_star'
  | 'evening_star'
  | 'evening_doji_star'
  | 'abandoned_baby_top'
  | 'abandoned_baby_bottom'
  | 'shooting_star'
  | 'inverted_hammer'
  | 'harami_bullish'
  | 'harami_bearish'
  | 'harami_cross_bullish'
  | 'harami_cross_bearish'
  | 'tweezers_top'
  | 'tweezers_bottom'
  | 'bullish_belt_hold'
  | 'bearish_belt_hold'
  | 'upside_gap_two_crows'
  | 'three_black_crows'
  | 'three_white_soldiers'
  | 'advance_block'
  | 'stalled_pattern'
  | 'three_mountain_top'
  | 'three_buddha_top'
  | 'three_river_bottom'
  | 'inverted_three_buddha'
  | 'bullish_counterattack'
  | 'bearish_counterattack'
  | 'dumpling_top'
  | 'frypan_bottom'
  | 'tower_top'
  | 'tower_bottom'
  | 'rising_window'
  | 'falling_window'
  | 'upward_gapping_tasuki'
  | 'downward_gapping_tasuki'
  | 'high_price_gapping_play'
  | 'low_price_gapping_play'
  | 'upgap_side_by_side_white'
  | 'downgap_side_by_side_white'
  | 'rising_three_methods'
  | 'falling_three_methods'
  | 'bullish_separating_line'
  | 'bearish_separating_line'
  | 'northern_doji'
  | 'southern_doji'
  | 'long_legged_doji'
  | 'gravestone_doji'
  | 'dragonfly_doji'
  | 'tri_star_top'
  | 'tri_star_bottom';

export interface DetectedPattern {
  id: PatternId;
  name: string;
  japaneseName?: string;
  bias: PatternBias;
  category: PatternCategory;
  startIndex: number;
  endIndex: number;
  requiresConfirmation: boolean;
  isIdeal: boolean;
  supportLevel?: number;
  resistanceLevel?: number;
  chapterRef: string;
  pageRef: string;
  notes: string;
}

export interface WindowZone {
  id: string;
  type: 'rising_window' | 'falling_window';
  createdAtIndex: number;
  top: number;
  bottom: number;
  highVolume: boolean;
  active: boolean;
  voidedAtIndex?: number;
}

export interface SupportResistanceZone {
  id: string;
  type: 'support' | 'resistance';
  priceTop: number;
  priceBottom: number;
  midpoint: number;
  sourceLabel: string;
  sourceIndex: number;
  chapterRef: string;
  active: boolean;
  testCount: number;
  polarityFlipped: boolean;
  brokenAtIndex?: number;
}

export interface TrendlineSegment {
  id: string;
  type: 'rising_support' | 'falling_support' | 'rising_resistance' | 'falling_resistance';
  startIndex: number;
  startPrice: number;
  endIndex: number;
  endPrice: number;
  slope: number;
}

export interface RetracementSet {
  direction: 'up_swing' | 'down_swing';
  swingStartPrice: number;
  swingEndPrice: number;
  swingStartIndex: number;
  swingEndIndex: number;
  level382: number;
  level500: number;
  level618: number;
}

export interface IndicatorSeries {
  sma5: (number | null)[];
  ema9: (number | null)[];
  sma13: (number | null)[];
  sma30: (number | null)[];
  sma65: (number | null)[];
  rsi14: (number | null)[];
  maOsc: (number | null)[];
  stochK: (number | null)[];
  stochD: (number | null)[];
  macdLine: (number | null)[];
  macdSignal: (number | null)[];
  macdHist: (number | null)[];
  relVolume: number[];
}

export type SignalAction =
  | 'BUY'
  | 'SELL'
  | 'EXIT_LONG'
  | 'EXIT_SHORT'
  | 'WAIT_CONFIRMATION'
  | 'CAUTION';

export type ConfirmationStatus =
  | 'CONFIRMED'
  | 'PENDING_CONFIRMATION'
  | 'VOIDED_BY_WINDOW'
  | 'COUNTER_TREND_EXIT_ONLY';

export type ConfidenceTier =
  | 'HIGH_CONVERGENCE'
  | 'CONFIRMED_SIGNAL'
  | 'PRELIMINARY_WARNING';

export interface MeasuredTarget {
  price: number;
  method: string;
  chapterRef: string;
}

export interface BotSignal {
  id: string;
  candleIndex: number;
  time: string;
  action: SignalAction;
  bias: PatternBias;
  confidenceTier: ConfidenceTier;
  confirmationStatus: ConfirmationStatus;
  primaryPattern: DetectedPattern;
  clusterPatterns: DetectedPattern[];
  entryPrice: number;
  stopLoss: number | null;
  stopRule: string;
  targetPrice: number | null;
  targetRule: string;
  riskRewardRatio: number | null;
  convergingFactors: string[];
  warningFlags: string[];
  reasoningChain: string[];
  bookReference: {
    chapter: string;
    pages: string;
    principle: string;
  };
}

export interface PaperTrade {
  id: string;
  direction: 'LONG' | 'SHORT';
  entryIndex: number;
  entryTime: string;
  entryPrice: number;
  stopLoss: number;
  targetPrice: number | null;
  entrySignalId: string;
  entryPatternName: string;
  exitIndex?: number;
  exitTime?: string;
  exitPrice?: number;
  exitReason?: string;
  status: 'OPEN' | 'CLOSED_TARGET' | 'CLOSED_STOP' | 'CLOSED_REVERSAL';
  pnlPercent: number;
}

export interface BotConfig {
  strictCloseConfirmation: boolean;
  respectWindowDominance: boolean;
  respectMajorTrendRule: boolean;
  requireConfirmationForHangingManAndInvHammer: boolean;
  suppressMiddleBoxDoji: boolean;
  minRiskRewardForEntry: number; // e.g. 1.2 or 1.5 per Ch. 4 p. 36
}

export interface BotAnalysisResult {
  candles: Candle[];
  anatomies: CandleAnatomy[];
  indicators: IndicatorSeries;
  patterns: DetectedPattern[];
  windows: WindowZone[];
  srZones: SupportResistanceZone[];
  trendlines: TrendlineSegment[];
  latestRetracement: RetracementSet | null;
  signals: BotSignal[];
  trades: PaperTrade[];
  currentTrend: TrendContext;
  latestActionableSignal: BotSignal | null;
}
