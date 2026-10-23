import { NextRequest, NextResponse } from 'next/server'
import { z } from 'zod'
import { SimulatorSource } from '@/lib/source/simulator-source'
import { broadcastEvent } from '@/lib/sse-broadcast'
import { addTimelineEntry } from '@/lib/store'

const eventSchema = z.object({
  eventType: z.enum(['ding', 'motion.human', 'package_detected', 'package_removed']),
  deviceId: z.string().optional(),
})

export async function POST(request: NextRequest) {
  try {
    const body = await request.json().catch(() => ({}))
    const parsed = eventSchema.safeParse(body)
    if (!parsed.success) {
      return NextResponse.json({ error: 'Invalid event type', details: parsed.error.issues }, { status: 400 })
    }

    const { eventType, deviceId = 'sim-cam-frontdoor' } = parsed.data
    const simulated = SimulatorSource.recordSimulatedEvent(eventType, deviceId)

    // Broadcast through existing SSE pipeline so useEventStream picks it up
    broadcastEvent({
      event_id: simulated.id,
      event_type: simulated.eventType,
      timestamp: simulated.timestamp,
      device_id: simulated.deviceId,
      confidence: 0.98,
      metadata: { simulated: true },
    })

    // Log to active delivery session timeline
    let title = 'Doorbell Pressed'
    let description = 'Ring doorbell ding received.'
    let timelineType: 'doorbell' | 'package_status' = 'doorbell'

    if (eventType === 'motion.human') {
      title = 'Person Detected'
      description = 'Motion detected at the front door.'
    } else if (eventType === 'package_detected') {
      title = 'Package Detected'
      description = 'Package spotted in drop zone.'
      timelineType = 'package_status'
    } else if (eventType === 'package_removed') {
      title = 'Package Removed'
      description = 'Package removed from drop zone.'
      timelineType = 'package_status'
    }

    const session = await addTimelineEntry({
      type: timelineType,
      title,
      description,
      timestamp: simulated.timestamp,
    })

    return NextResponse.json({
      success: true,
      event: simulated,
      session,
    })
  } catch (err: any) {
    console.error('Simulate event error:', err)
    return NextResponse.json({ error: err.message || 'Simulation failed' }, { status: 500 })
  }
}
