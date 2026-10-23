'use client'

import { AlertItem } from '@/lib/store'

interface AlertBannerProps {
  alerts: AlertItem[]
  onConfirmResident?: (alertId: string) => void
  onDismiss?: (alertId: string) => void
}

export function AlertBanner({ alerts, onConfirmResident, onDismiss }: AlertBannerProps) {
  if (!alerts || alerts.length === 0) return null

  const activeAlert = alerts[0]
  const level = activeAlert.level || 'risk'

  const levelConfig = {
    info: {
      border: 'border-cyan-500',
      bg: 'from-cyan-950/95 to-slate-900/95',
      badge: 'bg-cyan-900 text-cyan-200 border-cyan-700',
      icon: 'ℹ️',
      title: 'Delivery Confirmed',
    },
    warning: {
      border: 'border-amber-500',
      bg: 'from-amber-950/95 to-slate-900/95',
      badge: 'bg-amber-900 text-amber-200 border-amber-700',
      icon: '⚠️',
      title: 'Verification Notice',
    },
    risk: {
      border: 'border-rose-500',
      bg: 'from-rose-950/95 to-slate-900/95',
      badge: 'bg-rose-900 text-rose-200 border-rose-700',
      icon: '⚠️',
      title: 'Activity Notice',
    },
  }[level]

  return (
    <div
      className={`bg-gradient-to-r ${levelConfig.bg} border-2 ${levelConfig.border} rounded-xl p-3.5 shadow-lg space-y-2 animate-fadeIn`}
    >
      <div className="flex items-center justify-between">
        <div className="flex items-center gap-2">
          <span className="text-xl">{levelConfig.icon}</span>
          <span className={`text-xs font-bold uppercase tracking-wider px-2 py-0.5 rounded border ${levelConfig.badge}`}>
            {levelConfig.title}
          </span>
        </div>
        <span className="text-[11px] text-slate-400 font-mono">
          {new Date(activeAlert.timestamp).toLocaleTimeString([], {
            hour: '2-digit',
            minute: '2-digit',
            second: '2-digit',
          })}
        </span>
      </div>

      <div className="flex items-center justify-between gap-3">
        <p className="text-sm font-semibold text-white">
          {activeAlert.message}
        </p>

        {/* "It's me" button: resident self-declaration */}
        <div className="flex items-center gap-2 shrink-0">
          {onConfirmResident && level === 'risk' && (
            <button
              onClick={() => onConfirmResident(activeAlert.id)}
              className="px-3 py-1 bg-emerald-600 hover:bg-emerald-500 text-white font-bold rounded-lg text-xs shadow transition"
              title="Declare you picked up the package yourself"
            >
              🙋 It's me
            </button>
          )}

          {onDismiss && (
            <button
              onClick={() => onDismiss(activeAlert.id)}
              className="px-2 py-1 bg-slate-800 hover:bg-slate-700 text-slate-300 rounded text-xs transition"
            >
              Dismiss
            </button>
          )}
        </div>
      </div>

      {/* Single short disclaimer */}
      {level === 'risk' && (
        <p className="text-[10px] text-slate-300 border-t border-slate-700/60 pt-1.5 leading-tight">
          Heuristic alert, not proof of intent. No facial recognition or identity tracking.
        </p>
      )}
    </div>
  )
}
