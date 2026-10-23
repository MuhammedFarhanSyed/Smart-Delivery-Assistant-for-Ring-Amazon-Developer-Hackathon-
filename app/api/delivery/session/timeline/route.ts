import { NextRequest, NextResponse } from 'next/server'
import { z } from 'zod'
import { addTimelineEntry } from '@/lib/store'

const timelineSchema = z.object({
  type: z.enum([
    'doorbell',
    'greeting',
    'courier_reply',
    'instructions_extracted',
    'resident_reply',
    'package_status',
    'alert',
  ]),
  title: z.string().min(1),
  description: z.string().min(1),
  timestamp: z.string().optional(),
  meta: z.record(z.string(), z.any()).optional(),
})

export async function POST(request: NextRequest) {
  try {
    const body = await request.json()
    const parsed = timelineSchema.safeParse(body)
    if (!parsed.success) {
      return NextResponse.json({ error: 'Invalid timeline item', details: parsed.error.issues }, { status: 400 })
    }

    const updated = await addTimelineEntry(parsed.data)
    return NextResponse.json({ session: updated })
  } catch (err: any) {
    return NextResponse.json({ error: err.message || 'Failed to add timeline item' }, { status: 500 })
  }
}
