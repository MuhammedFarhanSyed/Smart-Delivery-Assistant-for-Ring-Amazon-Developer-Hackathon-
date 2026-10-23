'use client'

import { TimelineItem } from '@/lib/store'

interface DeliveryTimelineProps {
  timeline: TimelineItem[]
}

export function DeliveryTimeline({ timeline }: DeliveryTimelineProps) {
  if (!timeline || timeline.length === 0) {
    return (
      <div className="p-4 text-center text-slate-500 text-xs italic">
        No delivery activity recorded yet. Press the doorbell to begin.
      </div>
    )
  }

  const getBadgeStyle = (item: TimelineItem) => {
    if (item.level === 'risk') {
      return {
        icon: '⚠️',
        badgeColor: 'bg-rose-950 text-rose-300 border-rose-700',
        label: 'Risk notice',
      }
    }
    if (item.level === 'warning') {
      return {
        icon: '⚠️',
        badgeColor: 'bg-amber-950 text-amber-300 border-amber-700',
        label: 'Verification warning',
      }
    }
    if (item.type === 'verification' || item.level === 'info') {
      return {
        icon: '✓',
        badgeColor: 'bg-cyan-950 text-cyan-300 border-cyan-700',
        label: 'Verification confirmed',
      }
    }

    const typeConfig: Record<string, { icon: string; badgeColor: string; label: string }> = {
      doorbell: { icon: '🔔', badgeColor: 'bg-amber-950 text-amber-300 border-amber-800', label: 'Doorbell pressed' },
      greeting: { icon: '🗣️', badgeColor: 'bg-blue-950 text-blue-300 border-blue-800', label: 'Greeting spoken' },
      courier_reply: { icon: '🎤', badgeColor: 'bg-cyan-950 text-cyan-300 border-cyan-800', label: 'Courier replied' },
      instructions_extracted: { icon: '📋', badgeColor: 'bg-emerald-950 text-emerald-300 border-emerald-800', label: 'Instructions saved' },
      resident_reply: { icon: '💬', badgeColor: 'bg-purple-950 text-purple-300 border-purple-800', label: 'Resident update' },
      package_status: { icon: '📦', badgeColor: 'bg-indigo-950 text-indigo-300 border-indigo-800', label: 'Package status' },
      alert: { icon: '⚠️', badgeColor: 'bg-rose-950 text-rose-300 border-rose-800', label: 'Activity alert' },
    }

    return typeConfig[item.type] || {
      icon: '•',
      badgeColor: 'bg-slate-800 text-slate-300 border-slate-700',
      label: item.type,
    }
  }

  return (
    <div className="relative pl-5 space-y-3 before:absolute before:left-2 before:top-2 before:bottom-2 before:w-0.5 before:bg-slate-700">
      {timeline.map((item) => {
        const config = getBadgeStyle(item)
        const timeStr = item.timestamp
          ? new Date(item.timestamp).toLocaleTimeString([], { hour: '2-digit', minute: '2-digit', second: '2-digit' })
          : ''

        return (
          <div key={item.id} className="relative flex flex-col group">
            {/* Timeline node icon */}
            <span className="absolute -left-5 top-0.5 flex h-4 w-4 items-center justify-center rounded-full bg-slate-900 border border-slate-600 text-[10px]">
              {config.icon}
            </span>

            <div className="bg-dash-card/90 border border-slate-700/80 rounded-lg p-2.5 text-xs shadow-sm hover:border-slate-500 transition">
              <div className="flex items-center justify-between gap-2 mb-0.5">
                <span className={`inline-block px-1.5 py-0.5 text-[9px] font-semibold rounded border ${config.badgeColor}`}>
                  {config.label}
                </span>
                <span className="text-[10px] text-slate-400 font-mono">{timeStr}</span>
              </div>
              <div className="font-semibold text-slate-200 text-xs">{item.title}</div>
              <div className="text-slate-300 text-[11px] mt-0.5 leading-snug break-words">{item.description}</div>
            </div>
          </div>
        )
      })}
    </div>
  )
}
