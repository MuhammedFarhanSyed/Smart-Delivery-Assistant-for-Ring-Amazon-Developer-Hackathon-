import { NextRequest, NextResponse } from 'next/server'
import { z } from 'zod'
import { extractInstructions } from '@/lib/delivery/extractor'
import { updateActiveSession } from '@/lib/store'

const extractSchema = z.object({
  transcript: z.string().min(1, 'Transcript must not be empty'),
})

export async function POST(request: NextRequest) {
  try {
    const body = await request.json()
    const parsed = extractSchema.safeParse(body)
    if (!parsed.success) {
      return NextResponse.json({ error: 'Invalid input', details: parsed.error.issues }, { status: 400 })
    }

    const { transcript } = parsed.data
    const instructions = await extractInstructions(transcript)

    const updatedSession = await updateActiveSession((current) => {
      const now = new Date().toISOString()
      return {
        ...current,
        instructions,
        timeline: [
          {
            id: `tl_instr_${Date.now()}`,
            type: 'instructions_extracted',
            title: `Drop Location: ${instructions.location}`,
            description: `Action: ${instructions.action} | Signature: ${instructions.needs_signature ? 'Yes' : 'No'} | Notes: ${instructions.notes}`,
            timestamp: now,
            meta: instructions as any,
          },
          {
            id: `tl_reply_${Date.now() - 100}`,
            type: 'courier_reply',
            title: 'Courier Spoke',
            description: `"${instructions.raw_transcript}"`,
            timestamp: now,
          },
          ...current.timeline,
        ],
      }
    })

    return NextResponse.json({
      instructions,
      session: updatedSession,
    })
  } catch (err: any) {
    console.error('Extract error:', err)
    return NextResponse.json({ error: err.message || 'Failed to extract instructions' }, { status: 500 })
  }
}
