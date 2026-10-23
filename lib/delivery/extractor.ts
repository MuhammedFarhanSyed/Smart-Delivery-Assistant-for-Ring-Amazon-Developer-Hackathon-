import { DeliveryInstructions } from '../store'
import { extractWithBedrock } from '../aws/bedrock'

/**
 * Keyword-based extractor for courier voice transcripts.
 * Correctly distinguishes between requests for signatures and explicit statements that no signature is needed.
 */
export function extractWithKeywords(transcript: string): DeliveryInstructions {
  const text = transcript.trim()
  const lower = text.toLowerCase()
  const now = new Date().toISOString()

  // 1. Determine Action: 'left' | 'hold' | 'handed_over'
  let action: 'left' | 'hold' | 'handed_over' = 'left'
  if (
    lower.includes('hand') ||
    lower.includes('gave it to') ||
    lower.includes('handed over') ||
    lower.includes('gave to resident') ||
    lower.includes('given to')
  ) {
    action = 'handed_over'
  } else if (
    lower.includes('hold') ||
    lower.includes('come back') ||
    lower.includes('will return') ||
    lower.includes('cannot leave') ||
    lower.includes('take back') ||
    lower.includes('pick up later') ||
    lower.includes('nobody home') ||
    lower.includes('reschedule')
  ) {
    action = 'hold'
  } else {
    action = 'left'
  }

  // 2. Determine Location
  let location = 'Front door'
  const locationPatterns = [
    { pattern: /behind (?:the )?(?:large |small )?(?:plant|planter|pot|bush|tree)/i, label: 'Behind planter by front door' },
    { pattern: /behind (?:the )?(?:pillar|column)/i, label: 'Behind pillar' },
    { pattern: /(?:in|by|near) (?:the )?garage/i, label: 'By the garage' },
    { pattern: /(?:back|rear) (?:door|porch|patio)/i, label: 'Back door / porch' },
    { pattern: /(?:side|back) gate/i, label: 'Side gate' },
    { pattern: /(?:under|on) (?:the )?(?:bench|chair|table)/i, label: 'On/under porch furniture' },
    { pattern: /(?:package |parcel )?(?:drop\s?box|locker|bin)/i, label: 'Delivery box / locker' },
    { pattern: /(?:in|at) (?:the )?mailbox/i, label: 'Mailbox' },
    { pattern: /(?:under|by) (?:the )?(?:doormat|mat)/i, label: 'By doormat' },
    { pattern: /(?:front )?porch/i, label: 'Front porch' },
    { pattern: /(?:front )?door(?:step)?/i, label: 'Front door' },
    { pattern: /with (?:the )?neighbor/i, label: 'Left with neighbor' },
  ]

  for (const { pattern, label } of locationPatterns) {
    if (pattern.test(lower)) {
      location = label
      break
    }
  }

  // 3. Determine if signature is required (explicit negative check takes precedence)
  const negativeSignaturePatterns = [
    'no signature',
    'no sign needed',
    'no signature needed',
    'no signature required',
    'does not need signature',
    "doesn't need a signature",
    "doesn't need signature",
    'no need to sign',
    'without signature',
    'not need a signature',
  ]

  const isExplicitlyNoSignature = negativeSignaturePatterns.some((pattern) =>
    lower.includes(pattern)
  )

  let needs_signature = false
  if (!isExplicitlyNoSignature) {
    const positiveSignatureKeywords = [
      'need a signature',
      'needs a signature',
      'needs signature',
      'require a signature',
      'requires a signature',
      'must sign',
      'please sign',
      'gotta sign',
      'have to sign',
      'signature required',
    ]
    needs_signature = positiveSignatureKeywords.some((kw) => lower.includes(kw))
  }

  // 4. Extract helpful notes
  const notesParts: string[] = []
  if (lower.includes('rain') || lower.includes('wet')) notesParts.push('Protected from rain')
  if (lower.includes('fragile') || lower.includes('careful')) notesParts.push('Fragile item')
  if (lower.includes('heavy')) notesParts.push('Heavy package')
  if (needs_signature) notesParts.push('Recipient signature required')

  const notes = notesParts.length > 0 ? notesParts.join('. ') : 'Standard delivery'

  return {
    location,
    action,
    needs_signature,
    notes,
    raw_transcript: text,
    timestamp: now,
    method: 'keyword',
  }
}

/**
 * Main instruction extraction function.
 * When LLM_EXTRACTION=on, calls Amazon Bedrock (Amazon Nova) first,
 * falling back to the keyword extractor if Bedrock returns null.
 */
export async function extractInstructions(transcript: string): Promise<DeliveryInstructions> {
  const isLlmEnabled = process.env.LLM_EXTRACTION === 'on'

  if (isLlmEnabled) {
    const bedrockResult = await extractWithBedrock(transcript)
    if (bedrockResult) {
      return {
        ...bedrockResult,
        method: 'bedrock',
      }
    }
  }

  // Fallback to keyword extractor
  return extractWithKeywords(transcript)
}
