'use client'

import { SnapshotItem } from '@/lib/store'

interface SnapshotGalleryProps {
  snapshots?: SnapshotItem[]
  latestSnapshot?: string | null
}

export function SnapshotGallery({ snapshots = [], latestSnapshot }: SnapshotGalleryProps) {
  const allSnapshots: SnapshotItem[] = [...snapshots]

  if (latestSnapshot && !allSnapshots.some((s) => s.url === latestSnapshot)) {
    allSnapshots.unshift({
      id: 'snap_latest',
      url: latestSnapshot,
      timestamp: new Date().toISOString(),
      label: 'Latest Event Snapshot',
    })
  }

  if (allSnapshots.length === 0) {
    return null
  }

  return (
    <div className="bg-dash-panel border border-slate-700 rounded-xl p-4 space-y-2.5">
      <div className="flex items-center justify-between">
        <h3 className="text-xs font-bold text-slate-200 flex items-center gap-1.5">
          <span>📸</span> Event Snapshots ({allSnapshots.length})
        </h3>
        <span className="text-[10px] text-slate-500">Stored Locally (No Cloud Upload)</span>
      </div>

      <div className="grid grid-cols-2 gap-2">
        {allSnapshots.slice(0, 4).map((snap) => (
          <div
            key={snap.id}
            className="group relative bg-black rounded-lg overflow-hidden border border-slate-800"
          >
            {/* eslint-disable-next-line @next/next/no-img-element */}
            <img
              src={snap.url}
              alt={snap.label}
              className="w-full h-24 object-cover group-hover:scale-105 transition duration-200"
            />
            <div className="absolute inset-x-0 bottom-0 bg-gradient-to-t from-black/90 to-transparent p-1.5 text-[9px]">
              <span className="text-slate-200 font-semibold block truncate">{snap.label}</span>
              <span className="text-slate-400 font-mono">
                {new Date(snap.timestamp).toLocaleTimeString([], {
                  hour: '2-digit',
                  minute: '2-digit',
                  second: '2-digit',
                })}
              </span>
            </div>
          </div>
        ))}
      </div>
    </div>
  )
}
