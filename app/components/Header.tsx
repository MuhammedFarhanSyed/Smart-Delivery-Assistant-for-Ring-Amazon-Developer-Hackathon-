'use client'

import { SourceMode } from '@/lib/source/types'

interface HeaderProps {
  connected: boolean
  enabledCount: number
  simpleMode?: boolean
  sourceMode?: SourceMode
}

export function Header({ connected, enabledCount, simpleMode, sourceMode = 'simulator' }: HeaderProps) {
  const isRing = sourceMode === 'ring'

  return (
    <header className="bg-dash-panel border-b border-slate-700/80 px-4 py-2.5 flex items-center justify-between shrink-0">
      <div className="flex items-center gap-3">
        <span className="text-2xl">📦</span>
        <div>
          <h1 className="text-base font-bold text-white leading-tight">Smart Delivery Assistant for Ring</h1>
          <p className="text-xs text-slate-300 font-normal">
            Talks to the courier, remembers the delivery instructions, and warns you if someone approaches your package.
          </p>
        </div>
      </div>

      <div className="flex items-center gap-3">
        {/* Simplified Plain Mode Badge */}
        <div
          className={`flex items-center gap-2 px-3 py-1 rounded-full text-xs font-semibold border ${
            isRing
              ? 'bg-cyan-950 text-cyan-300 border-cyan-500 shadow-[0_0_10px_rgba(6,182,212,0.2)]'
              : 'bg-amber-950 text-amber-300 border-amber-500 shadow-[0_0_10px_rgba(245,158,11,0.2)]'
          }`}
        >
          <span className="inline-block w-2 h-2 rounded-full animate-pulse bg-current" />
          <span>{isRing ? 'Ring API' : 'Test footage (Simulator)'}</span>
        </div>

        {!simpleMode && (
          <span
            className={`text-xs px-2.5 py-0.5 rounded-full ${
              connected
                ? 'bg-green-900/60 text-green-300 border border-green-700'
                : 'bg-slate-800 text-slate-400 border border-slate-700'
            }`}
          >
            {connected ? '● Stream Live' : '○ Standby'}
          </span>
        )}
      </div>
    </header>
  )
}
