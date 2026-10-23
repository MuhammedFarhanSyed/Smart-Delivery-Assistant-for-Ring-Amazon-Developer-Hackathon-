import { NextRequest, NextResponse } from 'next/server'
import { getDeviceSource } from '@/lib/source'

export async function GET(
  _request: NextRequest,
  context: { params: Promise<{ id: string }> }
) {
  try {
    const { id: deviceId } = await context.params
    const source = getDeviceSource()
    const status = await source.getDeviceStatus(deviceId)
    return NextResponse.json({
      mode: source.mode,
      status,
    })
  } catch (err: any) {
    const message = err.message || 'Failed to fetch device status'
    return NextResponse.json(
      {
        error: message,
        tokenExpired: message.includes('expired') || message.includes('401'),
        status: { id: 'unknown', online: false },
      },
      { status: 200 }
    )
  }
}
