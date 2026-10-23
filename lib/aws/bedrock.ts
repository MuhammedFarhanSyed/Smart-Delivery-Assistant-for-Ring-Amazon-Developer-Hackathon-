import { DeliveryInstructions } from '../store'

export interface BedrockExtractionResult {
  location: string
  action: 'left' | 'hold' | 'handed_over'
  needs_signature: boolean
  notes: string
  raw_transcript: string
  timestamp: string
  method: 'bedrock'
}

/**
 * Calls Amazon Bedrock Converse REST endpoint using fetch (no AWS SDK).
 * Uses AWS_BEARER_TOKEN_BEDROCK, AWS_REGION, and BEDROCK_MODEL_ID.
 * Never logs keys or transcripts. Returns null on any failure.
 */
export async function extractWithBedrock(
  transcript: string
): Promise<DeliveryInstructions | null> {
  const token = process.env.AWS_BEARER_TOKEN_BEDROCK
  const region = process.env.AWS_REGION || 'us-east-1'
  const modelId = process.env.BEDROCK_MODEL_ID || 'amazon.nova-micro-v1:0'

  if (!token) {
    return null
  }

  const endpoint = `https://bedrock-runtime.${region}.amazonaws.com/model/${encodeURIComponent(modelId)}/converse`

  const prompt = `You are a courier speech analyzer for a smart doorbell. Extract structured delivery instructions from this transcript:
"${transcript}"

Return ONLY a single valid JSON object with these exact keys:
{
  "location": "concise description of where package was left (e.g. 'Behind planter by front door', 'Front porch', 'Side gate', 'Front door')",
  "action": "left" | "hold" | "handed_over",
  "needs_signature": boolean (false if courier says 'no signature needed' or 'no signature', true only if signature requested),
  "notes": "brief summary note (e.g. 'Placed out of rain', 'Standard delivery')"
}`

  const requestBody = {
    messages: [
      {
        role: 'user',
        content: [
          {
            text: prompt,
          },
        ],
      },
    ],
    inferenceConfig: {
      temperature: 0.1,
      maxTokens: 300,
    },
  }

  try {
    const controller = new AbortController()
    const timeout = setTimeout(() => controller.abort(), 7000)

    const res = await fetch(endpoint, {
      method: 'POST',
      headers: {
        'Content-Type': 'application/json',
        Authorization: `Bearer ${token}`,
      },
      body: JSON.stringify(requestBody),
      signal: controller.signal,
    })

    clearTimeout(timeout)

    if (!res.ok) {
      // Do not log token or body
      return null
    }

    const data = await res.json()
    const responseText =
      data?.output?.message?.content?.[0]?.text?.trim() || ''

    if (!responseText) {
      return null
    }

    const cleaned = responseText.replace(/^```json\s*/i, '').replace(/\s*```$/i, '').trim()
    const parsed = JSON.parse(cleaned)

    const validActions = ['left', 'hold', 'handed_over']
    const action = validActions.includes(parsed.action) ? parsed.action : 'left'

    return {
      location: typeof parsed.location === 'string' && parsed.location.trim() ? parsed.location.trim() : 'Front Door',
      action: action as 'left' | 'hold' | 'handed_over',
      needs_signature: Boolean(parsed.needs_signature),
      notes: typeof parsed.notes === 'string' && parsed.notes.trim() ? parsed.notes.trim() : 'Analyzed by Amazon Nova',
      raw_transcript: transcript,
      timestamp: new Date().toISOString(),
    }
  } catch {
    // Return null silently on any timeout, network error, or parse failure
    return null
  }
}
