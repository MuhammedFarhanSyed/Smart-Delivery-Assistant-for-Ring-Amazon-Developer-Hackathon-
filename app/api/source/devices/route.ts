import { NextResponse } from 'next/server'
import { getDeviceSource } from '@/lib/source'

export async function GET() {
  try {
    const source = getDeviceSource()
    const devices = await source.getDevices()
    return NextResponse.json({
      mode: source.mode,
      devices,
    })
  } catch (err: any) {
    const message = err.message || 'Failed to fetch devices'
    const tokenExpired = message.includes('expired') || message.includes('401')
    return NextResponse.json(
      {
        error: message,
        tokenExpired,
        devices: [],
      },
      { status: 200 }
    )
  }
}
