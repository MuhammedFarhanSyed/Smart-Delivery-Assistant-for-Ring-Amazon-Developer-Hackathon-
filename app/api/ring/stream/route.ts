import { NextRequest, NextResponse } from 'next/server'
import { getAccessToken } from '@/lib/auth'

const API_BASE = 'https://api.amazonvision.com'

export async function POST(request: NextRequest) {
  try {
    const { sdpOffer, deviceId } = await request.json()

    if (!sdpOffer) {
      return NextResponse.json({ error: 'Missing sdpOffer' }, { status: 400 })
    }

    const token = await getAccessToken()

    // Use deviceId from request body, fall back to env var, or auto-discover
    let resolvedDeviceId = deviceId || process.env.NEXT_PUBLIC_RING_DEVICE_ID
    if (!resolvedDeviceId) {
      try {
        const devRes = await fetch(`${API_BASE}/v1/devices`, {
          headers: { Authorization: `Bearer ${token}` },
        })
        if (devRes.ok) {
          const devData = await devRes.json()
          if (devData.data && devData.data.length > 0) {
            resolvedDeviceId = devData.data[0].id
          }
        }
      } catch (err) {
        console.warn('Auto-discovery for WHEP stream failed:', err)
      }
    }

    if (!resolvedDeviceId) {
      return NextResponse.json(
        { error: 'No device ID provided. Pass deviceId in request body or set NEXT_PUBLIC_RING_DEVICE_ID.' },
        { status: 400 }
      )
    }

    const whepUrl = `${API_BASE}/v1/devices/${resolvedDeviceId}/media/streaming/whep/sessions`

    const response = await fetch(whepUrl, {
      method: 'POST',
      headers: {
        Authorization: `Bearer ${token}`,
        'Content-Type': 'application/sdp',
      },
      body: sdpOffer,
    })

    if (!response.ok) {
      if (response.status === 401) {
        return NextResponse.json(
          {
            error:
              'Ring Playground token expired (~30m limit). Please copy a fresh token from developer.amazon.com/ring/console/playground into .env.local and restart.',
          },
          { status: 401 }
        )
      }
      const error = await response.text()
      return NextResponse.json(
        { error: `WHEP failed: ${response.status} - ${error}` },
        { status: response.status }
      )
    }

    const sdpAnswer = await response.text()
    const sessionUrl = response.headers.get('Location')

    return NextResponse.json({ sdpAnswer, sessionUrl })
  } catch (error) {
    console.error('Stream error:', error)
    return NextResponse.json(
      { error: error instanceof Error ? error.message : 'Stream failed' },
      { status: 500 }
    )
  }
}

export async function DELETE(request: NextRequest) {
  try {
    const { sessionUrl } = await request.json()
    if (!sessionUrl) {
      return NextResponse.json({ error: 'Missing sessionUrl' }, { status: 400 })
    }

    const token = await getAccessToken()
    await fetch(sessionUrl, {
      method: 'DELETE',
      headers: { Authorization: `Bearer ${token}` },
    })

    return NextResponse.json({ success: true })
  } catch (error) {
    return NextResponse.json({ error: 'Failed to close session' }, { status: 500 })
  }
}
