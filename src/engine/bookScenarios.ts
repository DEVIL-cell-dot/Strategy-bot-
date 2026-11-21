import { Candle } from './types';

export interface BookScenario {
  id: string;
  title: string;
  subtitle: string;
  chapterRef: string;
  symbol: string;
  timeframe: string;
  bookFocus: string[];
  candles: Candle[];
}

type RawBar = [number, number, number, number, number]; // [open, high, low, close, vol]

function buildSeries(startDate: string, bars: RawBar[]): Candle[] {
  const start = new Date(startDate).getTime();
  const dayMs = 24 * 60 * 60 * 1000;
  return bars.map((b, idx) => {
    const dt = new Date(start + idx * dayMs).toISOString().slice(0, 10);
    const open = b[0];
    const high = Math.max(b[1], b[0], b[3]);
    const low = Math.min(b[2], b[0], b[3]);
    const close = b[3];
    const volume = b[4];
    return {
      index: idx,
      time: dt,
      open: Number(open.toFixed(2)),
      high: Number(high.toFixed(2)),
      low: Number(low.toFixed(2)),
      close: Number(close.toFixed(2)),
      volume,
    };
  });
}

// Helper to create realistic warm-up + structured wave candles while letting signature Nison patterns sit cleanly
function makeBarsFromCloses(
  startPrice: number,
  deltas: number[],
  baseVol = 14000
): RawBar[] {
  const out: RawBar[] = [];
  let prevClose = startPrice;
  deltas.forEach((d, idx) => {
    const open = prevClose + (idx % 3 === 0 ? 0.15 : -0.1);
    const close = Math.max(10, prevClose + d);
    const bodyTop = Math.max(open, close);
    const bodyBot = Math.min(open, close);
    const wickScale = Math.max(Math.abs(d) * 0.35, prevClose * 0.004);
    const high = bodyTop + wickScale * (0.7 + ((idx * 7) % 5) * 0.12);
    const low = bodyBot - wickScale * (0.65 + ((idx * 3) % 5) * 0.12);
    const vol = Math.round(baseVol * (0.85 + ((idx * 11) % 7) * 0.08 + Math.min(0.8, Math.abs(d) / (prevClose * 0.03))));
    out.push([open, high, low, close, vol]);
    prevClose = close;
  });
  return out;
}

// SCENARIO 1: Chapter 17 Convergence Top & Window Recovery (Exhibit 17.1 style)
const scenario1Bars: RawBar[] = [
  // Initial base & rising leg to establish 30-SMA uptrend and swing highs/lows
  ...makeBarsFromCloses(100, [
    -0.8, -1.1, 0.9, 1.4, 1.2, 0.7, -0.6, -0.9, 1.3, 1.7,
    1.5, 1.1, -0.7, 1.8, 2.1, 1.4, -1.1, -0.8, 1.2, 1.9,
    2.2, 1.6, -0.9, 1.4, 2.3, 1.9, -1.2, 1.5, 2.0, 1.8,
  ], 15000),
];
// Append exact signature Nison sequence after bar 30
{
  let last = scenario1Bars[scenario1Bars.length - 1][3];
  const push = (oOff: number, hOff: number, lOff: number, cOff: number, v: number) => {
    const o = last + oOff;
    const c = last + cOff;
    const h = last + hOff;
    const l = last + lOff;
    scenario1Bars.push([o, h, l, c, v]);
    last = c;
  };
  // Push up into overbought peak #1
  push(0.2, 2.8, -0.3, 2.4, 18000);
  push(0.1, 2.5, -0.2, 2.1, 19500);
  push(0.2, 3.6, -0.1, 3.1, 22000);
  // Slight pullback so RSI resets and forms divergence on next push
  push(-0.4, 0.2, -2.1, -1.6, 14500);
  push(-0.2, 0.4, -1.9, -1.3, 13800);
  push(0.1, 1.7, -0.3, 1.4, 15200);
  push(0.2, 2.4, -0.2, 2.1, 16800);
  // Dark-Cloud Cover / Tall White + Northern Doji + Bearish Engulfing Cluster at top
  push(0.3, 4.1, 0.0, 3.8, 24000); // Tall white
  push(4.0 - 3.8 + 0.1, 0.8, -0.5, 0.02, 21000); // Northern Doji after tall white (relative to last close)
  // Actually let's set explicit values relative to prev close
  const peakBase = scenario1Bars[scenario1Bars.length - 1][3];
  scenario1Bars.push([peakBase + 0.1, peakBase + 4.2, peakBase - 0.1, peakBase + 4.0, 25200]); // Tall white mother
  scenario1Bars.push([peakBase + 4.4, peakBase + 4.8, peakBase + 1.2, peakBase + 1.5, 29400]); // Dark-Cloud Cover (>60% penetration)
  scenario1Bars.push([peakBase + 1.6, peakBase + 5.3, peakBase + 1.3, peakBase + 1.7, 27800]); // Shooting Star resistance cluster
  // Sharp Falling Window (gap down with zero shadow overlap)
  scenario1Bars.push([peakBase + 0.4, peakBase + 0.7, peakBase - 2.6, peakBase - 2.2, 31500]); // Falling Window (high < prev low)
  scenario1Bars.push([peakBase - 2.3, peakBase - 1.6, peakBase - 4.4, peakBase - 4.1, 24000]);
  scenario1Bars.push([peakBase - 4.2, peakBase - 3.6, peakBase - 6.2, peakBase - 5.9, 21000]);
  scenario1Bars.push([peakBase - 6.0, peakBase - 5.5, peakBase - 8.1, peakBase - 7.7, 19500]);
  // Hammer INSIDE Falling Window resistance -> Window Dominance blocks BUY!
  scenario1Bars.push([peakBase - 7.8, peakBase - 7.5, peakBase - 11.4, peakBase - 7.6, 26000]);
  // Bounce hits Falling Window ceiling and stalls, then closes above Falling Window top later
  scenario1Bars.push([peakBase - 7.4, peakBase - 4.2, peakBase - 7.7, peakBase - 4.6, 22400]);
  scenario1Bars.push([peakBase - 4.5, peakBase - 1.8, peakBase - 4.8, peakBase - 2.1, 23800]);
  scenario1Bars.push([peakBase - 2.0, peakBase + 1.8, peakBase - 2.3, peakBase + 1.5, 32400]); // Closes above falling window top -> voids resistance
  // Pullback + Hammer / Bullish Engulfing near prior support
  scenario1Bars.push([peakBase + 1.2, peakBase + 1.6, peakBase - 1.1, peakBase - 0.8, 17200]);
  scenario1Bars.push([peakBase - 0.9, peakBase - 0.4, peakBase - 3.4, peakBase - 3.1, 16500]);
  scenario1Bars.push([peakBase - 3.2, peakBase - 2.6, peakBase - 6.4, peakBase - 3.0, 21800]); // Bullish Hammer
  scenario1Bars.push([peakBase - 3.1, peakBase + 0.9, peakBase - 3.2, peakBase + 0.7, 29100]); // Bullish Engulfing
  scenario1Bars.push([peakBase + 0.9, peakBase + 3.4, peakBase + 0.7, peakBase + 3.1, 27400]);
  scenario1Bars.push([peakBase + 3.2, peakBase + 5.8, peakBase + 2.9, peakBase + 5.4, 28600]);
}

// SCENARIO 2: Ch. 10 Candle Cluster & Ch. 6 Frypan Bottom + Morning Star
const scenario2Bars: RawBar[] = [
  ...makeBarsFromCloses(160, [
    -1.2, -1.5, 0.8, -1.8, -2.1, -1.4, 0.9, -1.6, -2.3, -1.9,
    -1.4, 0.7, -1.8, -2.2, -1.6, -1.9, 1.1, -1.7, -2.4, -2.1,
    -1.5, -1.8, 0.6, -2.0, -2.2, -1.7, -1.4, -1.9, -2.1, -1.6,
  ], 16000),
];
{
  const base = scenario2Bars[scenario2Bars.length - 1][3];
  // Morning Doji Star at deep oversold base
  scenario2Bars.push([base, base + 0.4, base - 4.1, base - 3.9, 15400]); // Candle 1: Long black
  scenario2Bars.push([base - 4.4, base - 4.0, base - 6.1, base - 4.42, 24800]); // Candle 2: Doji Star gapped down
  scenario2Bars.push([base - 4.1, base + 0.3, base - 4.2, base - 0.1, 31200]); // Candle 3: Long white piercing deep
  // Secondary pullback testing Morning Star support -> Bullish Engulfing + Hammer cluster
  scenario2Bars.push([base - 0.2, base + 0.4, base - 2.3, base - 2.0, 14200]);
  scenario2Bars.push([base - 2.1, base - 1.7, base - 4.2, base - 3.8, 13600]);
  scenario2Bars.push([base - 3.9, base - 3.6, base - 5.9, base - 4.4, 18900]); // Small black
  scenario2Bars.push([base - 4.6, base - 0.4, base - 4.7, base - 0.6, 29800]); // Bullish Engulfing at support
  // Sideways bowl (Frypan Bottom) culminating in Rising Window
  scenario2Bars.push([base - 0.7, base - 0.3, base - 1.5, base - 1.1, 13400]);
  scenario2Bars.push([base - 1.2, base - 0.8, base - 2.0, base - 1.6, 12800]);
  scenario2Bars.push([base - 1.6, base - 1.2, base - 2.2, base - 1.7, 12100]);
  scenario2Bars.push([base - 1.7, base - 1.1, base - 2.1, base - 1.3, 12500]);
  scenario2Bars.push([base - 1.2, base - 0.4, base - 1.5, base - 0.7, 14600]);
  scenario2Bars.push([base + 0.4, base + 3.8, base + 0.2, base + 3.5, 34500]); // Rising Window! (low > prev high)
  scenario2Bars.push([base + 3.6, base + 5.9, base + 3.2, base + 5.4, 28400]);
  scenario2Bars.push([base + 5.3, base + 7.2, base + 4.9, base + 6.9, 26100]);
  // Pullback into Rising Window support + Dragonfly Doji bounce
  scenario2Bars.push([base + 6.8, base + 7.0, base + 4.1, base + 4.4, 15900]);
  scenario2Bars.push([base + 4.3, base + 4.6, base + 1.9, base + 2.3, 15100]);
  scenario2Bars.push([base + 1.8, base + 1.85, base - 0.2, base + 1.82, 23700]); // Dragonfly Doji inside Rising Window support
  scenario2Bars.push([base + 2.1, base + 5.8, base + 1.9, base + 5.5, 29400]);
  scenario2Bars.push([base + 5.6, base + 8.4, base + 5.3, base + 8.1, 31000]);
}

// SCENARIO 3: Ch. 11–12 Box Range, Wyckoff Spring, Change of Polarity & 50% Fib Retracement
const scenario3Bars: RawBar[] = [
  ...makeBarsFromCloses(82, [
    0.8, 1.1, 0.9, -0.5, 1.2, 1.4, -0.6, 1.1, 1.3, -0.7,
    1.0, 1.2, -0.4, 0.9, 1.1, -0.6, 1.3, 0.8, -0.5, 1.2,
  ], 12000),
];
{
  let b = scenario3Bars[scenario3Bars.length - 1][3];
  // Build clear Box Range (support ~95, resistance ~101)
  const boxWave = [
    [b, b + 1.4, b - 0.5, b + 1.1, 13000],
    [b + 1.0, b + 1.2, b - 2.8, b - 2.3, 12500],
    [b - 2.2, b + 0.9, b - 2.6, b + 0.6, 12100],
    [b + 0.7, b + 1.5, b - 0.4, b + 1.2, 13400],
    [b + 1.1, b + 1.3, b - 2.7, b - 2.4, 11800],
    [b - 2.3, b - 1.1, b - 2.9, b - 1.2, 11000], // Middle box doji test
    [b - 1.2, b - 0.8, b - 1.5, b - 1.18, 9800],  // Middle-box Doji (should be suppressed if enabled!)
    [b - 1.1, b + 1.1, b - 1.6, b + 0.9, 12200],
    [b + 0.9, b + 1.4, b - 0.7, b - 0.3, 11900],
    [b - 0.4, b + 0.1, b - 3.0, b - 2.6, 12400],
    [b - 2.5, b + 1.3, b - 2.7, b + 1.0, 13800],
    [b + 1.0, b + 1.5, b - 0.5, b + 1.2, 14100],
    // Wyckoff Spring below box bottom then snapping back inside box
    [b + 1.1, b + 1.2, b - 3.1, b - 2.5, 13200],
    [b - 2.6, b - 1.9, b - 4.7, b - 1.8, 22600], // Spring + Hammer tail piercing box bottom
    // Breakout above box top -> Change of Polarity (old resistance becomes support)
    [b - 1.6, b + 1.9, b - 1.7, b + 1.7, 24500],
    [b + 1.8, b + 4.4, b + 1.6, b + 4.1, 29800], // Decisive Box Breakout!
    [b + 4.2, b + 6.9, b + 3.9, b + 6.5, 27400],
    [b + 6.6, b + 8.3, b + 6.1, b + 7.8, 23200],
    // Pullback to ~50% Fib & old Box Top (Change of Polarity)
    [b + 7.6, b + 7.8, b + 5.0, b + 5.3, 15800],
    [b + 5.2, b + 5.4, b + 2.8, b + 3.1, 14600],
    [b + 3.0, b + 3.2, b + 1.1, b + 1.4, 14100], // Reaches flipped support / 50% retrace
    [b + 1.2, b + 4.6, b + 1.0, b + 4.4, 28900], // Piercing / Bullish Belt-Hold off flipped support!
    [b + 4.5, b + 7.8, b + 4.3, b + 7.5, 29400],
    [b + 7.6, b + 10.6, b + 7.2, b + 10.2, 30500],
  ] as RawBar[];
  scenario3Bars.push(...boxWave);
}

// SCENARIO 4: Ch. 5 & Ch. 14 Evening Star + Hanging Man Confirmation + Stoch/MACD
const scenario4Bars: RawBar[] = [
  ...makeBarsFromCloses(210, [
    1.1, 1.5, 1.8, -0.6, 1.4, 2.1, 1.6, -0.9, 1.7, 2.2,
    1.9, -0.5, 2.0, 2.4, 1.8, -0.8, 2.3, 2.6, 2.1, -0.4,
    2.5, 2.9, 2.4, 1.9, -0.6, 2.7, 3.1, 2.5, 2.2, 2.8,
  ], 19000),
];
{
  const p = scenario4Bars[scenario4Bars.length - 1][3];
  // Hanging Man at top -> requires bearish close below body next session!
  scenario4Bars.push([p + 0.2, p + 4.2, p - 0.2, p + 3.9, 22000]);
  scenario4Bars.push([p + 4.1, p + 4.3, p + 0.9, p + 3.6, 24500]); // Hanging Man (WAIT_CONFIRMATION)
  scenario4Bars.push([p + 3.5, p + 3.8, p + 1.1, p + 1.4, 26800]); // Bearish close BELOW Hanging Man body -> Confirmed SELL!
  // Bounce into Evening Star
  scenario4Bars.push([p + 1.6, p + 5.2, p + 1.4, p + 4.9, 18500]); // Candle 1: Long white
  scenario4Bars.push([p + 5.4, p + 6.4, p + 5.1, p + 5.6, 19200]); // Candle 2: Small star gapped above
  scenario4Bars.push([p + 5.3, p + 5.5, p + 1.0, p + 1.3, 33400]); // Candle 3: Long black deep into white body
  // Decline leg
  scenario4Bars.push([p + 1.1, p + 1.4, p - 2.9, p - 2.5, 26200]);
  scenario4Bars.push([p - 2.6, p - 2.1, p - 5.8, p - 5.4, 24800]);
  scenario4Bars.push([p - 5.5, p - 5.0, p - 8.4, p - 8.0, 23500]);
  scenario4Bars.push([p - 8.1, p - 7.4, p - 10.9, p - 10.5, 22100]);
  // Inverted Hammer at bottom -> waits for close above body next session
  scenario4Bars.push([p - 10.6, p - 6.8, p - 10.9, p - 10.2, 23900]); // Inverted Hammer (WAIT_CONFIRMATION)
  scenario4Bars.push([p - 9.8, p - 5.9, p - 9.9, p - 6.2, 29700]); // Open & close above Inverted Hammer -> Confirmed!
  scenario4Bars.push([p - 6.0, p - 2.8, p - 6.2, p - 3.1, 28100]);
}

// SCENARIO 5: Ch. 7 Rising Window + Rising Three Methods + High-Volume Continuation
const scenario5Bars: RawBar[] = [
  ...makeBarsFromCloses(50, [
    -0.5, -0.7, 0.4, 0.7, 0.9, -0.3, 0.8, 1.1, 0.6, -0.4,
    0.9, 1.2, 0.8, -0.3, 1.1, 1.3, 0.9, -0.2, 1.0, 1.4,
    1.1, 0.8, -0.3, 1.2, 1.5, 1.1, 0.9, 1.3, 1.4, 1.2,
  ], 14000),
];
{
  const s = scenario5Bars[scenario5Bars.length - 1][3];
  // High-volume Rising Window
  scenario5Bars.push([s + 1.3, s + 3.9, s + 1.1, s + 3.6, 31500]); // Rising window above prev high
  // Rising Three Methods (Long white -> 3 small black inside range on falling vol -> Tall white breakout)
  scenario5Bars.push([s + 3.8, s + 8.1, s + 3.6, s + 7.8, 29400]); // Candle 1: Long white
  scenario5Bars.push([s + 7.5, s + 7.7, s + 6.4, s + 6.7, 11200]); // Pause 1: small black inside
  scenario5Bars.push([s + 6.6, s + 6.9, s + 5.6, s + 5.9, 9800]);  // Pause 2: small black inside
  scenario5Bars.push([s + 5.8, s + 6.1, s + 4.9, s + 5.2, 9100]);  // Pause 3: small black inside
  scenario5Bars.push([s + 5.4, s + 9.8, s + 5.2, s + 9.5, 34200]); // Final: Long white closing above Candle 1
  // Three Advancing White Soldiers continuation
  scenario5Bars.push([s + 9.4, s + 10.1, s + 8.6, s + 9.0, 16000]);
  scenario5Bars.push([s + 9.1, s + 11.8, s + 8.9, s + 11.6, 22400]);
  scenario5Bars.push([s + 11.5, s + 14.3, s + 11.3, s + 14.0, 24800]);
  scenario5Bars.push([s + 13.9, s + 16.9, s + 13.7, s + 16.6, 27600]);
  // Exhaustion Advance Block warning at highs
  scenario5Bars.push([s + 16.5, s + 19.6, s + 16.3, s + 19.3, 25000]);
  scenario5Bars.push([s + 19.2, s + 21.8, s + 19.0, s + 20.4, 21000]); // Long upper shadow weakening
  scenario5Bars.push([s + 20.5, s + 22.9, s + 20.3, s + 21.1, 18500]); // Smaller body + upper shadow -> EXIT_LONG!
}

export const BOOK_SCENARIOS: BookScenario[] = [
  {
    id: 'ch17_convergence',
    title: 'Exhibit 17.1: East+West Convergence Top & Window Rule',
    subtitle: 'Dark-Cloud + Shooting Star + RSI Divergence -> Falling Window blocks premature Hammer',
    chapterRef: 'Ch. 7, Ch. 14 & Ch. 17',
    symbol: 'NISON-EQ1',
    timeframe: '1D',
    bookFocus: ['Window Dominance', 'Candle Cluster', 'Bearish Divergence', 'Pattern S/R'],
    candles: buildSeries('2025-01-02', scenario1Bars),
  },
  {
    id: 'ch10_cluster_frypan',
    title: 'Ch. 5 & 6: Morning Doji Star & Frypan Bottom',
    subtitle: 'Multi-pattern bottom cluster followed by Rising Window + Dragonfly Doji retest',
    chapterRef: 'Ch. 5, Ch. 6 & Ch. 10',
    symbol: 'NISON-EQ2',
    timeframe: '1D',
    bookFocus: ['Morning Doji Star', 'Bullish Engulfing', 'Frypan Bottom', 'Dragonfly Doji'],
    candles: buildSeries('2025-01-02', scenario2Bars),
  },
  {
    id: 'ch11_polarity_spring',
    title: 'Ch. 11 & 12: Box Range, Wyckoff Spring & Change of Polarity',
    subtitle: 'Middle-box Doji filtered -> Spring Hammer -> Old Resistance flips to Support at 50% Fib',
    chapterRef: 'Ch. 8, Ch. 11, Ch. 12 & Ch. 16',
    symbol: 'NISON-EQ3',
    timeframe: '1D',
    bookFocus: ['Wyckoff Spring', 'Change of Polarity', 'Box Target', '50% Retracement'],
    candles: buildSeries('2025-01-02', scenario3Bars),
  },
  {
    id: 'ch4_5_confirmation',
    title: 'Ch. 4 & 5: Hanging Man & Inverted Hammer Confirmation',
    subtitle: 'Demonstrates WAIT_CONFIRMATION until next bar closes beyond pattern real body',
    chapterRef: 'Ch. 4, Ch. 5 & Ch. 14',
    symbol: 'NISON-EQ4',
    timeframe: '1D',
    bookFocus: ['Hanging Man Close Rule', 'Evening Star', 'Inverted Hammer Close Rule', 'Slow Stochastics'],
    candles: buildSeries('2025-01-02', scenario4Bars),
  },
  {
    id: 'ch7_continuation',
    title: 'Ch. 7 & 15: Rising Three Methods & Advance Block Exit',
    subtitle: 'High-volume Rising Window + 3-bar low-volume pause + Advance Block profit protection',
    chapterRef: 'Ch. 6, Ch. 7 & Ch. 15',
    symbol: 'NISON-EQ5',
    timeframe: '1D',
    bookFocus: ['Rising Window', 'Rising Three Methods', 'Volume Decline in Pause', 'Advance Block Warning'],
    candles: buildSeries('2025-01-02', scenario5Bars),
  },
];
