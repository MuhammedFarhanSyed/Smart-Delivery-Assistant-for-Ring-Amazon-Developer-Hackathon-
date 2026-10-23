export type SourceMode = 'ring' | 'simulator'

export interface DeviceInfo {
  id: string
  name: string
  online: boolean
  capabilities?: Record<string, any>
}

export interface DeviceStatus {
  id: string
  online: boolean
  battery?: number | null
  lastUpdated?: string
}

export interface RingEventHistoryItem {
  id: string
  eventType: string
  timestamp: string
  deviceId: string
  raw?: any
}

export interface DeviceSource {
  mode: SourceMode
  getDevices(): Promise<DeviceInfo[]>
  getDeviceStatus(deviceId: string): Promise<DeviceStatus>
  getEventHistory(deviceId: string, limit?: number): Promise<RingEventHistoryItem[]>
}
