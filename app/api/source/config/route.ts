import { NextResponse } from 'next/server'
import { getSourceMode } from '@/lib/source'

export async function GET() {
  const mode = getSourceMode()
  const isBedrockActive =
    process.env.LLM_EXTRACTION === 'on' && Boolean(process.env.AWS_BEARER_TOKEN_BEDROCK)

  return NextResponse.json({
    mode,
    deviceId: process.env.NEXT_PUBLIC_RING_DEVICE_ID || (mode === 'ring' ? null : 'sim-cam-frontdoor'),
    deviceName: process.env.NEXT_PUBLIC_RING_DEVICE_NAME || (mode === 'ring' ? 'Ring Camera' : 'Simulator Camera'),
    hasRingToken: Boolean(process.env.RING_ACCESS_TOKEN || process.env.RING_REFRESH_TOKEN),
    bedrockEnabled: isBedrockActive,
  })
}
