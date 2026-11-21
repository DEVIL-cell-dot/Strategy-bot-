import React, { useState } from 'react';
import { X, Globe, FileText, AlertCircle } from 'lucide-react';
import { Candle } from '../engine/types';
import {
  BINARY_TIMEFRAMES,
  BINARY_TRADING_PAIRS,
  fetchBinanceKlines,
  parseOHLCVText,
  SAMPLE_CSV_TEMPLATE,
} from '../engine/dataParser';

interface DataImportModalProps {
  isOpen: boolean;
  onClose: () => void;
  onApplyCandles: (candles: Candle[], label: string, timeframe: string) => void;
}

export const DataImportModal: React.FC<DataImportModalProps> = ({
  isOpen,
  onClose,
  onApplyCandles,
}) => {
  const [mode, setMode] = useState<'paste' | 'binance'>('paste');
  const [rawText, setRawText] = useState('');
  const [customLabel, setCustomLabel] = useState('CUSTOM-OHLCV');
  const [symbol, setSymbol] = useState('EURUSDT');
  const [interval, setInterval] = useState('5m');
  const [loading, setLoading] = useState(false);
  const [error, setError] = useState<string | null>(null);

  if (!isOpen) return null;

  const handleFileUpload = (e: React.ChangeEvent<HTMLInputElement>) => {
    const file = e.target.files?.[0];
    if (!file) return;
    setError(null);
    const reader = new FileReader();
    reader.onload = () => {
      const content = typeof reader.result === 'string' ? reader.result : '';
      setRawText(content);
      const baseName = file.name.replace(/\.[^.]+$/, '').toUpperCase();
      if (baseName) setCustomLabel(baseName);
    };
    reader.readAsText(file);
  };

  const handleParseSubmit = (e: React.FormEvent) => {
    e.preventDefault();
    setError(null);
    const res = parseOHLCVText(rawText);
    if (res.error) {
      setError(res.error);
      return;
    }
    onApplyCandles(res.candles, customLabel.trim() || 'CUSTOM-OHLCV', 'Custom');
    onClose();
  };

  const handleBinanceFetch = async () => {
    setError(null);
    setLoading(true);
    try {
      const candles = await fetchBinanceKlines(symbol, interval, 120);
      onApplyCandles(candles, symbol.trim().toUpperCase(), interval.toUpperCase());
      onClose();
    } catch (err) {
      setError(
        err instanceof Error
          ? `${err.message} Check network access or paste CSV/JSON OHLCV directly.`
          : 'Failed to load Binance klines.'
      );
    } finally {
      setLoading(false);
    }
  };

  const binancePairs = BINARY_TRADING_PAIRS.filter((p) => p.provider === 'binance');

  return (
    <div
      className="fixed inset-0 z-50 flex items-center justify-center bg-black/70 backdrop-blur-[2px] p-4"
      role="dialog"
      aria-modal="true"
      aria-labelledby="import-modal-title"
    >
      <div className="w-full max-w-2xl rounded-lg border border-slate-700 bg-[#111827] shadow-2xl overflow-hidden">
        {/* Header */}
        <div className="flex items-center justify-between border-b border-slate-800 px-5 py-3.5">
          <div>
            <h2 id="import-modal-title" className="font-display text-base font-bold text-slate-100">
              Import Market OHLCV Data
            </h2>
            <p className="text-xs text-slate-400">
              Bot evaluates raw Open, High, Low, Close, and Volume strictly using Steve Nison’s 2nd Edition rules.
            </p>
          </div>
          <button
            type="button"
            onClick={onClose}
            className="rounded-md p-1.5 text-slate-400 hover:bg-slate-800 hover:text-slate-100 cursor-pointer"
            aria-label="Close modal"
          >
            <X className="w-4 h-4" />
          </button>
        </div>

        {/* Mode Switcher */}
        <div className="flex border-b border-slate-800 bg-[#0B0F19] px-5 pt-2.5 gap-4">
          <button
            type="button"
            onClick={() => {
              setMode('paste');
              setError(null);
            }}
            className={`pb-2.5 text-xs font-semibold flex items-center gap-1.5 border-b-2 transition-colors whitespace-nowrap shrink-0 cursor-pointer ${
              mode === 'paste'
                ? 'border-emerald-400 text-slate-100'
                : 'border-transparent text-slate-400 hover:text-slate-200'
            }`}
          >
            <FileText className="w-3.5 h-3.5" />
            <span>CSV / JSON Upload or Paste</span>
          </button>
          <button
            type="button"
            onClick={() => {
              setMode('binance');
              setError(null);
            }}
            className={`pb-2.5 text-xs font-semibold flex items-center gap-1.5 border-b-2 transition-colors whitespace-nowrap shrink-0 cursor-pointer ${
              mode === 'binance'
                ? 'border-emerald-400 text-slate-100'
                : 'border-transparent text-slate-400 hover:text-slate-200'
            }`}
          >
            <Globe className="w-3.5 h-3.5" />
            <span>Binance Spot Snapshot</span>
          </button>
        </div>

        <div className="p-5">
          {error && (
            <div className="mb-4 flex items-start gap-2 rounded-md border border-red-500/40 bg-red-500/10 px-3 py-2.5 text-xs text-red-300">
              <AlertCircle className="w-4 h-4 shrink-0 mt-0.5" />
              <span>{error}</span>
            </div>
          )}

          {mode === 'paste' ? (
            <form onSubmit={handleParseSubmit} className="space-y-4">
              <div className="grid grid-cols-1 sm:grid-cols-2 gap-3">
                <div>
                  <label className="block text-xs font-medium text-slate-300 mb-1">
                    Instrument Label
                  </label>
                  <input
                    type="text"
                    value={customLabel}
                    onChange={(e) => setCustomLabel(e.target.value)}
                    placeholder="e.g. EURUSD, AAPL, XAUUSD"
                    className="w-full rounded-md border border-slate-700 bg-[#0B0F19] px-3 py-1.5 text-sm text-slate-100 focus:border-emerald-400 focus:outline-none"
                  />
                </div>
                <div>
                  <label className="block text-xs font-medium text-slate-300 mb-1">
                    Upload .CSV or .JSON File
                  </label>
                  <input
                    type="file"
                    accept=".csv,.txt,.json"
                    onChange={handleFileUpload}
                    className="block w-full text-xs text-slate-400 file:mr-3 file:rounded-md file:border file:border-slate-700 file:bg-slate-800 file:px-3 file:py-1.5 file:text-xs file:font-medium file:text-slate-200 hover:file:bg-slate-700 cursor-pointer"
                  />
                </div>
              </div>

              <div>
                <div className="flex items-center justify-between mb-1">
                  <label className="text-xs font-medium text-slate-300">
                    OHLCV Rows (Date, Open, High, Low, Close, Volume)
                  </label>
                  <button
                    type="button"
                    onClick={() => {
                      setRawText(SAMPLE_CSV_TEMPLATE);
                      setCustomLabel('SAMPLE-CSV');
                      setError(null);
                    }}
                    className="text-xs font-medium text-emerald-400 underline hover:text-emerald-300 cursor-pointer"
                  >
                    Load Sample Template
                  </button>
                </div>
                <textarea
                  rows={8}
                  value={rawText}
                  onChange={(e) => setRawText(e.target.value)}
                  placeholder={`Date,Open,High,Low,Close,Volume\n2025-01-01,100.0,102.5,99.5,102.1,15000\n... (minimum 15 bars)`}
                  className="w-full rounded-md border border-slate-700 bg-[#0B0F19] p-3 font-mono text-xs text-slate-100 placeholder:text-slate-500 focus:border-emerald-400 focus:outline-none"
                />
              </div>

              <div className="flex items-center justify-end gap-2.5 pt-1">
                <button
                  type="button"
                  onClick={onClose}
                  className="rounded-md border border-slate-700 bg-slate-800 px-3.5 py-2 text-xs font-medium text-slate-300 hover:bg-slate-700 cursor-pointer"
                >
                  Cancel
                </button>
                <button
                  type="submit"
                  className="rounded-md bg-emerald-600 px-4 py-2 text-xs font-semibold text-white hover:bg-emerald-500 cursor-pointer"
                >
                  Run Nison Bot on Data
                </button>
              </div>
            </form>
          ) : (
            <div className="space-y-4">
              <div className="grid grid-cols-1 sm:grid-cols-2 gap-4">
                <div>
                  <label className="block text-xs font-medium text-slate-300 mb-1.5">
                    Binance Spot Pair
                  </label>
                  <input
                    type="text"
                    value={symbol}
                    onChange={(e) => setSymbol(e.target.value.toUpperCase())}
                    className="w-full rounded-md border border-slate-700 bg-[#0B0F19] px-3 py-2 font-mono text-sm text-slate-100 focus:border-emerald-400 focus:outline-none mb-2"
                    placeholder="EURUSDT"
                  />
                  <div className="flex flex-wrap gap-1.5">
                    {binancePairs.map((pair) => (
                      <button
                        key={pair.id}
                        type="button"
                        onClick={() => setSymbol(pair.providerSymbol)}
                        className={`rounded px-2 py-1 font-mono text-[11px] font-medium border cursor-pointer ${
                          symbol === pair.providerSymbol
                            ? 'border-emerald-500 bg-emerald-600 text-white'
                            : 'border-slate-700 bg-slate-800 text-slate-300 hover:bg-slate-700'
                        }`}
                      >
                        {pair.providerSymbol}
                      </button>
                    ))}
                  </div>
                </div>

                <div>
                  <label className="block text-xs font-medium text-slate-300 mb-1.5">
                    Candle Timeframe (120 bars)
                  </label>
                  <div className="grid grid-cols-4 gap-1.5">
                    {BINARY_TIMEFRAMES.map((tf) => (
                      <button
                        key={tf}
                        type="button"
                        onClick={() => setInterval(tf)}
                        className={`rounded py-2 font-mono text-xs font-semibold border cursor-pointer ${
                          interval === tf
                            ? 'border-emerald-500 bg-emerald-600 text-white'
                            : 'border-slate-700 bg-slate-800 text-slate-300 hover:bg-slate-700'
                        }`}
                      >
                        {tf}
                      </button>
                    ))}
                  </div>
                  <p className="mt-2.5 text-[11.5px] leading-relaxed text-slate-400">
                    Fetches 120 spot OHLCV bars directly from Binance public market data without API keys.
                  </p>
                </div>
              </div>

              <div className="flex items-center justify-end gap-2.5 pt-2 border-t border-slate-800">
                <button
                  type="button"
                  onClick={onClose}
                  className="rounded-md border border-slate-700 bg-slate-800 px-3.5 py-2 text-xs font-medium text-slate-300 hover:bg-slate-700 cursor-pointer"
                >
                  Cancel
                </button>
                <button
                  type="button"
                  disabled={loading}
                  onClick={handleBinanceFetch}
                  className="rounded-md bg-emerald-600 px-4 py-2 text-xs font-semibold text-white hover:bg-emerald-500 disabled:opacity-50 cursor-pointer"
                >
                  {loading ? 'Fetching Live Klines...' : `Load ${symbol} (${interval})`}
                </button>
              </div>
            </div>
          )}
        </div>
      </div>
    </div>
  );
};
