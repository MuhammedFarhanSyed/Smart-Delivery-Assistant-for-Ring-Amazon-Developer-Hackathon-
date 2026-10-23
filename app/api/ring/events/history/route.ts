import { NextRequest, NextResponse } from 'next/server'
import { getAccessToken } from '@/lib/auth'

const API_BASE = 'https://api.amazonvision.com'

export async function GET(request: NextRequest) {
  try {
    const deviceId =
      request.nextUrl.searchParams.get('deviceId') || process.env.NEXT_PUBLIC_RING_DEVICE_ID

    if (!deviceId) {
      return NextResponse.json(
        { error: 'Missing deviceId parameter or NEXT_PUBLIC_RING_DEVICE_ID', events: [] },
        { status: 400 }
      )
    }

    const token = await getAccessToken()
    const limit = request.nextUrl.searchParams.get('limit') || '20'
    const eventTypes = request.nextUrl.searchParams.get('event_types')

    const url = new URL(`${API_BASE}/v1/history/devices/${deviceId}/events`)
    url.searchParams.set('limit', limit)
    if (eventTypes) {
      url.searchParams.set('event_types', eventTypes)
    }

    const res = await fetch(url.toString(), {
      headers: {
        Authorization: `Bearer ${token}`,
      },
    })

    if (!res.ok) {
      const errorText = await res.text()
      return NextResponse.json(
        { error: `Ring API error ${res.status}: ${errorText}`, events: [] },
        { status: res.status }
      )
    }

    const data = await res.json()
    const rawEvents = data?.data || []

    const events = rawEvents.map((e: any) => ({
      id: e.id,
      eventType: e.attributes?.event_type || 'unknown',
      timestamp: e.attributes?.start || e.attributes?.timestamp || new Date().toISOString(),
      deviceId: e.attributes?.device_id || deviceId,
      cvSummary: e.attributes?.cv_summary || null,
      raw: e,
    }))

    return NextResponse.json({
      deviceId,
      count: events.length,
      events,
    })
  } catch (err: any) {
    console.error('Ring event history error:', err)
    return NextResponse.json(
      { error: err.message || 'Failed to fetch Ring event history', events: [] },
      { status: 500 }
    )
  }
}
