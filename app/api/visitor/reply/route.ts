import { NextRequest, NextResponse } from 'next/server'
import { z } from 'zod'
import { generateVisitorReply, VisitorChatMessage } from '@/lib/aws/bedrock'

const chatMessageSchema = z.object({
  sender: z.enum(['assistant', 'visitor']),
  text: z.string(),
  timestamp: z.string().optional(),
})

const visitorReplyRequestSchema = z.object({
  ownerInstructions: z.string().default(''),
  visitorMessage: z.string().min(1, 'Visitor message must not be empty'),
  history: z.array(chatMessageSchema).default([]),
})

/**
 * Optional Telegram Bot notification for emergency alerts.
 * Runs only if TELEGRAM_BOT_TOKEN and TELEGRAM_CHAT_ID are configured in env.
 * Skips silently otherwise without throwing.
 */
async function sendTelegramEmergencyAlert(visitorText: string, summary: string) {
  const botToken = process.env.TELEGRAM_BOT_TOKEN
  const chatId = process.env.TELEGRAM_CHAT_ID

  if (!botToken || !chatId) {
    return
  }

  try {
    const text = `🚨 *URGENT DOORBELL EMERGENCY* 🚨\n\n*Time:* ${new Date().toLocaleTimeString()}\n*Visitor said:* "${visitorText}"\n*Summary:* ${summary}\n\n_If anyone is in danger, emergency services have been advised._`

    await fetch(`https://api.telegram.org/bot${botToken}/sendMessage`, {
      method: 'POST',
      headers: { 'Content-Type': 'application/json' },
      body: JSON.stringify({
        chat_id: chatId,
        text,
        parse_mode: 'Markdown',
      }),
      signal: AbortSignal.timeout(4000),
    })
  } catch (err) {
    // Non-blocking: skip silently on network error
    console.warn('[Telegram Alert] Failed to dispatch notification:', err)
  }
}

export async function POST(request: NextRequest) {
  try {
    const body = await request.json()
    const parsed = visitorReplyRequestSchema.safeParse(body)

    if (!parsed.success) {
      return NextResponse.json(
        { error: 'Invalid request body', details: parsed.error.issues },
        { status: 400 }
      )
    }

    const { ownerInstructions, history, visitorMessage } = parsed.data

    const result = await generateVisitorReply(
      ownerInstructions,
      history as VisitorChatMessage[],
      visitorMessage
    )

    // Trigger optional Telegram escalation if emergency
    if (result.intent === 'emergency') {
      // Fire-and-forget
      sendTelegramEmergencyAlert(visitorMessage, result.summary).catch(() => {})
    }

    return NextResponse.json(result)
  } catch (err: any) {
    console.error('Visitor reply error:', err)
    return NextResponse.json(
      {
        reply: "I've alerted the owner right now. If anyone is in danger, please call 112.",
        intent: 'emergency',
        summary: 'Emergency response fallback',
        method: 'fallback',
      },
      { status: 200 }
    )
  }
}
