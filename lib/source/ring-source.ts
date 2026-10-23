import { DeviceSource, DeviceInfo, DeviceStatus, RingEventHistoryItem } from './types'
import { getAccessToken } from '@/lib/auth'

const API_BASE = 'https://api.amazonvision.com'

export class RingSource implements DeviceSource {
  readonly mode = 'ring' as const

  async getDevices(): Promise<DeviceInfo[]> {
    const token = await getAccessToken()
    const configuredDeviceId = process.env.NEXT_PUBLIC_RING_DEVICE_ID
    const configuredDeviceName = process.env.NEXT_PUBLIC_RING_DEVICE_NAME || 'Playground Device'

    const res = await fetch(`${API_BASE}/v1/devices`, {
      headers: { Authorization: `Bearer ${token}` },
    })

    if (!res.ok) {
      if (res.status === 401) {
        throw new Error(
          'Ring Playground access token has expired (~30 min limit). Return to developer.amazon.com/ring/console/playground to generate a fresh token, or switch to Simulator mode.'
        )
      }
      const errorText = await res.text()
      throw new Error(`Failed to fetch Ring devices: ${res.status} ${errorText}`)
    }

    const data = await res.json()
    const rawDevices = data?.data || []

    const devices = await Promise.all(
      rawDevices.map(async (d: any) => {
        let isOnline = true
        try {
          const status = await this.getDeviceStatus(d.id)
          isOnline = status.online
        } catch {
          isOnline = true
        }
        return {
          id: d.id,
          name: d.attributes?.name || d.attributes?.description || configuredDeviceName,
          online: isOnline,
          capabilities: d.attributes?.capabilities || { motionDetection: true, liveStream: true },
        }
      })
    )

    return devices
  }

  async getDeviceStatus(deviceId: string): Promise<DeviceStatus> {
    const token = await getAccessToken()
    const res = await fetch(`${API_BASE}/v1/devices/${deviceId}/status`, {
      headers: { Authorization: `Bearer ${token}` },
    })

    if (!res.ok) {
      if (res.status === 401) {
        throw new Error('Ring Playground access token has expired.')
      }
      const errorText = await res.text()
      throw new Error(`Failed to get device status: ${res.status} ${errorText}`)
    }

    const json = await res.json()
    const attrs = json?.data?.attributes || {}
    return {
      id: deviceId,
      online: attrs.online ?? true,
      battery: attrs.battery_level ?? null,
      lastUpdated: attrs.reported_at || attrs.last_updated || new Date().toISOString(),
    }
  }

  async getEventHistory(deviceId: string, limit: number = 20): Promise<RingEventHistoryItem[]> {
    const token = await getAccessToken()
    const url = new URL(`${API_BASE}/v1/history/devices/${deviceId}/events`)
    if (limit) {
      url.searchParams.set('limit', String(limit))
    }

    const res = await fetch(url.toString(), {
      headers: { Authorization: `Bearer ${token}` },
    })

    if (!res.ok) {
      if (res.status === 401) {
        throw new Error('Ring Playground access token has expired.')
      }
      const errorText = await res.text()
      throw new Error(`Failed to get event history: ${res.status} ${errorText}`)
    }

    const json = await res.json()
    const events = json?.data || []

    return events.map((item: any) => ({
      id: item.id || `evt_${Math.random().toString(36).substring(2, 9)}`,
      eventType: item.attributes?.event_type || item.type || 'unknown',
      timestamp: item.attributes?.start
        ? new Date(item.attributes.start).toISOString()
        : item.attributes?.timestamp || new Date().toISOString(),
      deviceId: item.relationships?.source?.data?.id || item.attributes?.device_id || deviceId,
      raw: item,
    }))
  }
}
