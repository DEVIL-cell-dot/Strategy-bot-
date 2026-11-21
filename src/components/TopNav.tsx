import React from 'react';
import { Upload } from 'lucide-react';

export type WorkspaceTab = 'terminal' | 'ledger' | 'codex' | 'discipline';

interface TopNavProps {
  activeTab: WorkspaceTab;
  onSelectTab: (tab: WorkspaceTab) => void;
  onOpenImport: () => void;
}

const NAV_ITEMS: { id: WorkspaceTab; label: string }[] = [
  { id: 'terminal', label: 'Signal Terminal' },
  { id: 'ledger', label: 'Signals & Ledger' },
  { id: 'codex', label: 'Book Codex' },
  { id: 'discipline', label: 'Targets & Discipline' },
];

export const TopNav: React.FC<TopNavProps> = ({
  activeTab,
  onSelectTab,
  onOpenImport,
}) => {
  return (
    <header className="h-14 border-b border-slate-800 bg-[#111827] px-4 lg:px-6 flex items-center justify-between gap-4 lg:gap-8 shrink-0">
      {/* Zone 1: Brand Wordmark only */}
      <div className="flex items-center gap-2.5 shrink-0">
        <svg
          width="22"
          height="22"
          viewBox="0 0 24 24"
          fill="none"
          aria-hidden="true"
          className="shrink-0"
        >
          <line x1="8" y1="3" x2="8" y2="21" stroke="#F8FAFC" strokeWidth="1.75" />
          <rect x="5" y="7" width="6" height="10" fill="#111827" stroke="#F8FAFC" strokeWidth="1.75" />
          <line x1="16" y1="4" x2="16" y2="20" stroke="#94A3B8" strokeWidth="1.75" />
          <rect x="13" y="6" width="6" height="8" fill="#64748B" stroke="#94A3B8" strokeWidth="1.75" />
        </svg>
        <span className="font-display text-[17px] font-bold tracking-tight text-slate-100 whitespace-nowrap">
          Nison CandleBot
        </span>
      </div>

      {/* Zone 2: Navigation links */}
      <nav aria-label="Primary sections" className="flex items-center gap-1 sm:gap-5 overflow-x-auto no-scrollbar">
        {NAV_ITEMS.map((item) => {
          const isActive = activeTab === item.id;
          return (
            <button
              key={item.id}
              type="button"
              onClick={() => onSelectTab(item.id)}
              className={`relative h-14 px-2.5 text-[13.5px] font-medium whitespace-nowrap shrink-0 transition-colors cursor-pointer ${
                isActive
                  ? 'text-white'
                  : 'text-slate-400 hover:text-slate-200'
              }`}
            >
              {item.label}
              {isActive && (
                <span className="absolute inset-x-1 bottom-0 h-[2px] bg-emerald-400" />
              )}
            </button>
          );
        })}
      </nav>

      {/* Zone 3: Single Primary Action */}
      <div className="shrink-0">
        <button
          type="button"
          onClick={onOpenImport}
          className="inline-flex items-center gap-2 rounded-md bg-slate-100 px-3.5 py-2 text-[13px] font-semibold text-slate-950 hover:bg-white transition-colors whitespace-nowrap shrink-0 cursor-pointer"
        >
          <Upload className="w-3.5 h-3.5" />
          <span>Import OHLCV</span>
        </button>
      </div>
    </header>
  );
};
