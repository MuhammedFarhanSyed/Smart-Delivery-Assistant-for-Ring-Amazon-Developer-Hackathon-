import { NextRequest, NextResponse } from 'next/server'
import { getDeviceSource } from '@/lib/source'

export async function GET(
  request: NextRequest,
  context: { params: Promise<{ id: string }> }
) {
  try {
    const { id: deviceId } = await context.params
    const limitParam = request.nextUrl.searchParams.get('limit')
    const limit = limitParam ? parseInt(limitParam, 10) : 20

    const source = getDeviceSource()
    const events = await source.getEventHistory(deviceId, limit)
    return NextResponse.json({
      mode: source.mode,
      deviceId,
      events,
    })
  } catch (err: any) {
    const message = err.message || 'Failed to fetch event history'
    return NextResponse.json(
      {
        error: message,
        tokenExpired: message.includes('expired') || message.includes('401'),
        events: [],
      },
      { status: 200 }
    )
  }
}
