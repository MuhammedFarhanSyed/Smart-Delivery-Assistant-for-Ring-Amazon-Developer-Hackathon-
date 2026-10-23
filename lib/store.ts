import fs from 'fs'
import path from 'path'
import { SourceMode } from './source/types'

export type PackageStatus = 'Expected' | 'Delivered' | 'Removed' | 'Picked up by resident'

export interface DeliveryInstructions {
  location: string
  action: 'left' | 'hold' | 'handed_over'
  needs_signature: boolean
  notes: string
  raw_transcript: string
  timestamp: string
  method?: 'bedrock' | 'keyword'
}

export type AlertLevel = 'info' | 'warning' | 'risk'

export interface TimelineItem {
  id: string
  type:
    | 'doorbell'
    | 'greeting'
    | 'courier_reply'
    | 'instructions_extracted'
    | 'resident_reply'
    | 'package_status'
    | 'alert'
    | 'verification'
  level?: AlertLevel
  title: string
  description: string
  timestamp: string
  meta?: Record<string, any>
}

export interface SnapshotItem {
  id: string
  url: string
  timestamp: string
  label: string
}

export interface AlertItem {
  id: string
  level: AlertLevel
  message: string
  timestamp: string
  dismissed?: boolean
}

export interface DeliverySession {
  id: string
  sourceMode: SourceMode
  deviceId: string
  createdAt: string
  updatedAt: string
  packageStatus: PackageStatus
  instructions?: DeliveryInstructions | null
  timeline: TimelineItem[]
  latestSnapshot?: string | null
  snapshots: SnapshotItem[]
  alerts: AlertItem[]
}

const DATA_DIR = path.join(process.cwd(), 'data')
const SESSIONS_FILE = path.join(DATA_DIR, 'delivery_sessions.json')

function ensureDirExists() {
  if (!fs.existsSync(DATA_DIR)) {
    fs.mkdirSync(DATA_DIR, { recursive: true })
  }
}

function createDefaultSession(sourceMode: SourceMode = 'simulator', deviceId: string = 'sim-cam-frontdoor'): DeliverySession {
  const now = new Date().toISOString()
  return {
    id: `session_${Date.now()}`,
    sourceMode,
    deviceId,
    createdAt: now,
    updatedAt: now,
    packageStatus: sourceMode === 'ring' ? 'Delivered' : 'Expected',
    instructions: null,
    timeline: [
      {
        id: `tl_init_${Date.now()}`,
        type: 'package_status',
        level: 'info',
        title: 'Delivery Session Initialized',
        description: sourceMode === 'ring'
          ? 'Ring stream baseline active. Package present on porch steps.'
          : 'Waiting for courier arrival or doorbell event.',
        timestamp: now,
      },
    ],
    latestSnapshot: null,
    snapshots: [],
    alerts: [],
  }
}

export async function readSessions(): Promise<DeliverySession[]> {
  try {
    ensureDirExists()
    if (!fs.existsSync(SESSIONS_FILE)) {
      const initial = [createDefaultSession()]
      await fs.promises.writeFile(SESSIONS_FILE, JSON.stringify(initial, null, 2), 'utf-8')
      return initial
    }
    const raw = await fs.promises.readFile(SESSIONS_FILE, 'utf-8')
    return JSON.parse(raw) as DeliverySession[]
  } catch (error) {
    console.error('Error reading delivery sessions:', error)
    return [createDefaultSession()]
  }
}

export async function writeSessions(sessions: DeliverySession[]): Promise<void> {
  ensureDirExists()
  await fs.promises.writeFile(SESSIONS_FILE, JSON.stringify(sessions, null, 2), 'utf-8')
}

export async function getActiveSession(): Promise<DeliverySession> {
  const sessions = await readSessions()
  if (sessions.length === 0) {
    const fresh = createDefaultSession()
    await writeSessions([fresh])
    return fresh
  }
  return sessions[0]
}

export async function updateActiveSession(
  updater: (current: DeliverySession) => DeliverySession
): Promise<DeliverySession> {
  const sessions = await readSessions()
  let active = sessions[0] || createDefaultSession()
  active = updater(active)
  active.updatedAt = new Date().toISOString()
  sessions[0] = active
  await writeSessions(sessions)
  return active
}

export async function addTimelineEntry(
  item: Omit<TimelineItem, 'id' | 'timestamp'> & { timestamp?: string }
): Promise<DeliverySession> {
  return updateActiveSession((current) => {
    const newItem: TimelineItem = {
      id: `tl_${Date.now()}_${Math.random().toString(36).substring(2, 6)}`,
      timestamp: item.timestamp || new Date().toISOString(),
      ...item,
    }
    return {
      ...current,
      timeline: [newItem, ...current.timeline],
    }
  })
}

export async function resetActiveSession(sourceMode: SourceMode = 'simulator', deviceId: string = 'sim-cam-frontdoor'): Promise<DeliverySession> {
  const fresh = createDefaultSession(sourceMode, deviceId)
  await writeSessions([fresh])
  return fresh
}
