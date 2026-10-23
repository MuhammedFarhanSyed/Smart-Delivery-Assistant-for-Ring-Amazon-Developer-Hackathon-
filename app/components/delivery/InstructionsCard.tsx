'use client'

import { DeliveryInstructions } from '@/lib/store'

interface InstructionsCardProps {
  instructions: DeliveryInstructions | null | undefined
  bedrockActive?: boolean
}

export function InstructionsCard({
  instructions,
  bedrockActive = false,
}: InstructionsCardProps) {
  const isBedrockOn =
    instructions?.method === 'bedrock' || (bedrockActive && instructions?.method !== 'keyword')

  // Format action in plain English
  const formatAction = (act?: string) => {
    if (!act) return 'Left on porch'
    if (act === 'handed_over') return 'Handed to resident'
    if (act === 'hold') return 'Held for redelivery'
    return 'Left on porch'
  }

  return (
    <div className="bg-dash-panel border border-slate-700/80 rounded-xl p-3.5 space-y-3">
      <div className="flex items-center justify-between">
        <h3 className="text-xs font-bold text-slate-100 flex items-center gap-1.5 uppercase tracking-wider">
          <span>📋</span> Delivery Instructions
        </h3>
        {/* Compact Bedrock Indicator */}
        <div className="flex items-center gap-1.5 text-[10px]">
          <span className="text-slate-400">AWS Bedrock:</span>
          {isBedrockOn ? (
            <span className="inline-flex items-center gap-1 px-1.5 py-0.5 rounded bg-emerald-950 text-emerald-300 border border-emerald-700 font-medium">
              <span className="w-1.5 h-1.5 rounded-full bg-emerald-400 animate-pulse" />
              on
            </span>
          ) : (
            <span className="inline-flex items-center gap-1 px-1.5 py-0.5 rounded bg-slate-800 text-slate-300 border border-slate-700 font-medium">
              <span className="w-1.5 h-1.5 rounded-full bg-amber-400" />
              fallback
            </span>
          )}
        </div>
      </div>

      {instructions ? (
        <div className="grid grid-cols-3 gap-2.5 text-xs">
          {/* 1. Where */}
          <div className="bg-slate-900/80 p-2.5 rounded-lg border border-slate-800">
            <span className="text-slate-400 block text-[10px] uppercase font-semibold">Where</span>
            <span className="font-bold text-cyan-300 text-sm mt-0.5 block truncate">
              {instructions.location || 'Front door'}
            </span>
          </div>

          {/* 2. Action */}
          <div className="bg-slate-900/80 p-2.5 rounded-lg border border-slate-800">
            <span className="text-slate-400 block text-[10px] uppercase font-semibold">Action</span>
            <span className="font-bold text-emerald-300 text-sm mt-0.5 block truncate">
              {formatAction(instructions.action)}
            </span>
          </div>

          {/* 3. Signature Needed */}
          <div className="bg-slate-900/80 p-2.5 rounded-lg border border-slate-800">
            <span className="text-slate-400 block text-[10px] uppercase font-semibold">Signature Needed</span>
            <span
              className={`font-bold text-sm mt-0.5 block ${
                instructions.needs_signature ? 'text-rose-400' : 'text-slate-300'
              }`}
            >
              {instructions.needs_signature ? 'Yes ⚠️' : 'No'}
            </span>
          </div>
        </div>
      ) : (
        <div className="py-2.5 text-center text-xs text-slate-500 italic bg-slate-900/40 rounded-lg">
          Waiting for courier instructions...
        </div>
      )}
    </div>
  )
}
