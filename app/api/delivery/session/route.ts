import { NextRequest, NextResponse } from 'next/server'
import { z } from 'zod'
import {
  getActiveSession,
  resetActiveSession,
  updateActiveSession,
  PackageStatus,
  AlertItem,
} from '@/lib/store'
import { getSourceMode } from '@/lib/source'

const patchSessionSchema = z.object({
  packageStatus: z.enum(['Expected', 'Delivered', 'Removed', 'Picked up by resident']).optional(),
  latestSnapshot: z.string().optional().nullable(),
  snapshotLabel: z.string().optional(),
  dismissAlertId: z.string().optional(),
  alert: z
    .object({
      message: z.string(),
      level: z.enum(['info', 'warning', 'risk']).optional(),
      timestamp: z.string().optional(),
    })
    .optional(),
})

export async function GET() {
  try {
    const session = await getActiveSession()
    return NextResponse.json({ session })
  } catch (err: any) {
    return NextResponse.json({ error: err.message || 'Failed to get session' }, { status: 500 })
  }
}

export async function POST(request: NextRequest) {
  try {
    const body = await request.json().catch(() => ({}))
    const mode = getSourceMode()
    const deviceId = body.deviceId || (mode === 'ring' ? process.env.NEXT_PUBLIC_RING_DEVICE_ID || 'ring-camera' : 'sim-cam-frontdoor')
    const fresh = await resetActiveSession(mode, deviceId)
    return NextResponse.json({ session: fresh })
  } catch (err: any) {
    return NextResponse.json({ error: err.message || 'Failed to reset session' }, { status: 500 })
  }
}

export async function PATCH(request: NextRequest) {
  try {
    const body = await request.json()
    const parsed = patchSessionSchema.safeParse(body)
    if (!parsed.success) {
      return NextResponse.json({ error: 'Validation failed', details: parsed.error.issues }, { status: 400 })
    }

    const { packageStatus, latestSnapshot, snapshotLabel, alert, dismissAlertId } = parsed.data

    const updated = await updateActiveSession((current) => {
      let changed = { ...current }

      if (dismissAlertId) {
        changed.alerts = changed.alerts.filter((a) => a.id !== dismissAlertId)
      }

      if (packageStatus) {
        changed.packageStatus = packageStatus as PackageStatus
        const isResident = packageStatus === 'Picked up by resident'

        changed.timeline = [
          {
            id: `tl_status_${Date.now()}`,
            type: isResident ? 'resident_reply' : 'package_status',
            level: isResident ? 'info' : 'info',
            title: isResident ? 'Picked up by resident' : `Package status: ${packageStatus}`,
            description: isResident
              ? 'Resident confirmed receipt. Activity alert cleared.'
              : `Status changed to ${packageStatus}`,
            timestamp: new Date().toISOString(),
          },
          ...changed.timeline,
        ]

        if (isResident) {
          // Clear active alerts when resident declares "It's me"
          changed.alerts = []
        }
      }

      if (latestSnapshot !== undefined) {
        changed.latestSnapshot = latestSnapshot
        if (latestSnapshot) {
          const newSnap = {
            id: `snap_${Date.now()}`,
            url: latestSnapshot,
            timestamp: new Date().toISOString(),
            label: snapshotLabel || (packageStatus ? `Status: ${packageStatus}` : 'Event Snapshot'),
          }
          changed.snapshots = [newSnap, ...(changed.snapshots || [])]
        }
      }

      if (alert) {
        const newAlert: AlertItem = {
          id: `alt_${Date.now()}`,
          level: alert.level || 'risk',
          message: alert.message,
          timestamp: alert.timestamp || new Date().toISOString(),
        }
        changed.alerts = [newAlert, ...(changed.alerts || [])]
        changed.timeline = [
          {
            id: `tl_alt_${Date.now()}`,
            type: alert.level === 'info' || alert.level === 'warning' ? 'verification' : 'alert',
            level: alert.level || 'risk',
            title:
              alert.level === 'info'
                ? 'Delivery confirmed'
                : alert.level === 'warning'
                ? 'Delivery verification notice'
                : 'Activity notice',
            description: alert.message,
            timestamp: newAlert.timestamp,
          },
          ...changed.timeline,
        ]
      }
      return changed
    })

    return NextResponse.json({ session: updated })
  } catch (err: any) {
    return NextResponse.json({ error: err.message || 'Failed to update session' }, { status: 500 })
  }
}
