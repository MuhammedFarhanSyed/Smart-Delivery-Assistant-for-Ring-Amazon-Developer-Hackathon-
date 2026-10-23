'use client'

import { useState } from 'react'
import { packageWatchProcessor } from '@/lib/video-processors/package-watch-processor'

interface DropZoneControlsProps {
  currentDiff?: number
  isCalibrated?: boolean
}

export function DropZoneControls({
  currentDiff = 0,
  isCalibrated = true,
}: DropZoneControlsProps) {
  const [sensitivity, setSensitivity] = useState(packageWatchProcessor.getSensitivity())
  const [calibrating, setCalibrating] = useState(false)

  const handleSensitivityChange = (val: number) => {
    setSensitivity(val)
    packageWatchProcessor.setSensitivity(val)
  }

  const handleCalibrate = () => {
    setCalibrating(true)
    packageWatchProcessor.calibrateBaseline()
    setTimeout(() => setCalibrating(false), 2500)
  }

  return (
    <div className="space-y-2 text-xs">
      <div className="grid grid-cols-2 gap-2">
        <div className="bg-slate-900/80 p-2.5 rounded-lg border border-slate-800 flex flex-col justify-between">
          <span className="text-[10px] text-slate-400 uppercase font-semibold">Frame Difference</span>
          <div className="flex items-baseline gap-1.5 mt-1">
            <span className="text-base font-mono font-bold text-cyan-300">{currentDiff}</span>
            <span className="text-[10px] text-slate-500">/ Threshold {sensitivity}</span>
          </div>
          <div className="w-full bg-slate-800 rounded-full h-1 mt-1 overflow-hidden">
            <div
              className={`h-full transition-all duration-200 ${
                currentDiff > sensitivity ? 'bg-amber-400' : 'bg-dash-cyan'
              }`}
              style={{ width: `${Math.min(100, (currentDiff / (sensitivity * 1.5)) * 100)}%` }}
            />
          </div>
        </div>

        <div className="bg-slate-900/80 p-2.5 rounded-lg border border-slate-800 flex flex-col justify-between">
          <span className="text-[10px] text-slate-400 uppercase font-semibold">Baseline Calibration</span>
          <div className="text-[11px] mt-0.5 font-mono text-slate-300">
            {calibrating ? (
              <span className="text-amber-400 animate-pulse">● Calibrating...</span>
            ) : isCalibrated ? (
              <span className="text-emerald-400">✓ Calibrated</span>
            ) : (
              <span className="text-slate-400">Uncalibrated</span>
            )}
          </div>
          <button
            onClick={handleCalibrate}
            disabled={calibrating}
            className="mt-1 w-full px-2 py-1 bg-slate-800 hover:bg-slate-700 text-slate-200 border border-slate-600 rounded text-[10px] font-medium transition disabled:opacity-50"
          >
            {calibrating ? 'Calibrating...' : '🎯 Calibrate Baseline'}
          </button>
        </div>
      </div>

      {/* Sensitivity Threshold Slider */}
      <div className="bg-slate-900/80 p-2.5 rounded-lg border border-slate-800 space-y-1">
        <div className="flex items-center justify-between text-[11px]">
          <span className="text-slate-400">Differencing Sensitivity Threshold</span>
          <span className="font-mono text-cyan-300">{sensitivity}</span>
        </div>
        <input
          type="range"
          min={10}
          max={60}
          value={sensitivity}
          onChange={(e) => handleSensitivityChange(parseInt(e.target.value, 10))}
          className="w-full accent-dash-cyan h-1.5 bg-slate-800 rounded-lg cursor-pointer"
        />
        <div className="flex justify-between text-[9px] text-slate-500">
          <span>High sensitivity (10)</span>
          <span>Balanced (26)</span>
          <span>Low sensitivity (60)</span>
        </div>
      </div>
    </div>
  )
}
