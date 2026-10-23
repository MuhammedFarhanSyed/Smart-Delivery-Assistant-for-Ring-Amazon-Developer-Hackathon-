'use client'

import { useState, useEffect } from 'react'

export function RingDataPanel() {
  const [loading, setLoading] = useState(true)
  const [devices, setDevices] = useState<any[]>([])
  const [deviceStatus, setDeviceStatus] = useState<any>(null)
  const [historyEvents, setHistoryEvents] = useState<any[]>([])
  const [error, setError] = useState<string | null>(null)
  const [isTokenExpired, setIsTokenExpired] = useState(false)

  const fetchRingData = async () => {
    setLoading(true)
    setError(null)
    setIsTokenExpired(false)
    try {
      // 1. Devices list (GET /v1/devices)
      const devRes = await fetch('/api/source/devices')
      const devData = await devRes.json()

      if (devData.tokenExpired || (devData.error && devData.error.includes('expired'))) {
        setIsTokenExpired(true)
        setError(devData.error)
        setDevices([])
        return
      }

      if (devData.error) {
        throw new Error(devData.error)
      }

      setDevices(devData.devices || [])

      const primaryId = devData.devices?.[0]?.id
      if (primaryId) {
        // 2. Device status (GET /v1/devices/{id}/status)
        const statusRes = await fetch(`/api/source/devices/${primaryId}/status`)
        const statusData = await statusRes.json()
        setDeviceStatus(statusData.status || null)

        // 3. Event history (GET /v1/history/devices/{id}/events)
        const histRes = await fetch(`/api/source/devices/${primaryId}/history?limit=10`)
        const histData = await histRes.json()
        setHistoryEvents(histData.events || [])
      }
    } catch (err: any) {
      console.error('RingDataPanel error:', err)
      const msg = err.message || 'Failed to load Ring API data'
      setError(msg)
      if (msg.includes('expired') || msg.includes('401')) {
        setIsTokenExpired(true)
      }
    } finally {
      setLoading(false)
    }
  }

  useEffect(() => {
    fetchRingData()
  }, [])

  return (
    <div className="bg-dash-panel border border-cyan-800/60 rounded-xl p-4 space-y-3">
      <div className="flex items-center justify-between border-b border-slate-700/80 pb-2">
        <div className="flex items-center gap-2">
          <span className="text-cyan-400 font-bold">Ring Partner API Data</span>
          <span className="text-[10px] bg-cyan-950 text-cyan-300 border border-cyan-800 px-2 py-0.5 rounded-full font-mono">
            api.amazonvision.com/v1
          </span>
        </div>
        <button
          onClick={fetchRingData}
          disabled={loading}
          className="text-xs text-slate-400 hover:text-cyan-300 transition"
        >
          {loading ? 'Refreshing...' : '🔄 Refresh'}
        </button>
      </div>

      {isTokenExpired ? (
        <div className="bg-amber-950/40 border border-amber-600/70 rounded-lg p-3 text-xs space-y-2">
          <div className="flex items-center gap-2 text-amber-300 font-semibold">
            <span>⏳</span>
            <span>Ring Playground Token Expired</span>
          </div>
          <p className="text-slate-300 text-[11px] leading-relaxed">
            Ring Developer Playground access tokens are short-lived (valid for ~30 minutes). When expired, the Ring API returns <code>401 Unauthorized</code>.
          </p>
          <div className="pt-1 flex flex-wrap gap-2 text-[11px]">
            <a
              href="https://developer.amazon.com/ring/console/playground"
              target="_blank"
              rel="noreferrer"
              className="px-2.5 py-1 bg-dash-cyan hover:bg-cyan-300 text-black font-semibold rounded transition"
            >
              Get Fresh Token →
            </a>
            <span className="text-slate-400 self-center text-[10px]">
              Paste in <code>.env.local</code> & restart
            </span>
          </div>
        </div>
      ) : error ? (
        <div className="text-xs text-red-400 bg-red-950/40 p-2.5 rounded-lg border border-red-800">
          {error}
        </div>
      ) : (
        <div className="space-y-3 text-xs">
          {/* Devices info */}
          <div>
            <span className="text-[10px] uppercase text-slate-400 font-semibold block mb-1">
              Connected Devices ({devices.length})
            </span>
            {devices.map((d) => (
              <div
                key={d.id}
                className="bg-slate-900/80 p-2 rounded-lg border border-slate-800 flex items-center justify-between"
              >
                <div>
                  <div className="font-semibold text-slate-200">{d.name}</div>
                  <div className="text-[10px] text-slate-500 font-mono truncate max-w-[200px]">
                    {d.id}
                  </div>
                </div>
                <div className="text-right">
                  <span
                    className={`inline-block text-[10px] px-1.5 py-0.5 rounded font-semibold ${
                      d.online
                        ? 'bg-emerald-950 text-emerald-300 border border-emerald-800'
                        : 'bg-slate-800 text-slate-400'
                    }`}
                  >
                    {d.online ? '● Online' : '○ Offline'}
                  </span>
                  {deviceStatus?.battery !== null && deviceStatus?.battery !== undefined && (
                    <span className="block text-[10px] text-slate-400 mt-0.5">
                      🔋 {deviceStatus.battery}%
                    </span>
                  )}
                </div>
              </div>
            ))}
          </div>

          {/* Recent Event History */}
          <div>
            <span className="text-[10px] uppercase text-slate-400 font-semibold block mb-1">
              Recent Event History ({historyEvents.length})
            </span>
            {historyEvents.length === 0 ? (
              <div className="text-slate-500 italic text-[11px] bg-slate-900/40 p-2 rounded">
                No history events returned.
              </div>
            ) : (
              <div className="space-y-1.5 max-h-36 overflow-y-auto pr-1">
                {historyEvents.map((evt) => (
                  <div
                    key={evt.id}
                    className="p-1.5 bg-slate-900/60 rounded border border-slate-800/80 flex items-center justify-between text-[11px]"
                  >
                    <span className="font-mono text-cyan-300">{evt.eventType}</span>
                    <span className="text-slate-500 text-[10px]">
                      {new Date(evt.timestamp).toLocaleTimeString([], {
                        hour: '2-digit',
                        minute: '2-digit',
                        second: '2-digit',
                      })}
                    </span>
                  </div>
                ))}
              </div>
            )}
          </div>
        </div>
      )}
    </div>
  )
}
