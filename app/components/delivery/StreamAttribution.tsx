'use client'

export function StreamAttribution() {
  return (
    <div className="bg-slate-900/90 border border-slate-800 rounded-lg p-2 text-[10px] text-slate-400 space-y-1">
      <div className="flex items-center gap-1.5 text-slate-300 font-semibold">
        <span>ℹ️</span>
        <span>Stream Credits & Attributions (CC BY 4.0)</span>
      </div>
      <p className="leading-tight">
        Ring Playground test streams are licensed under Creative Commons Attribution 4.0:
      </p>
      <ul className="list-disc pl-4 space-y-0.5 text-slate-400">
        <li>
          <span className="text-slate-300 font-medium">"Thief stealing our package"</span> by YouTube user{' '}
          <span className="text-cyan-400 font-mono">frollard</span> (Porch & Package stream)
        </li>
        <li>
          <span className="text-slate-300 font-medium">"Birds on Feeders"</span> by Vimeo user{' '}
          <span className="text-cyan-400 font-mono">Michael Black</span> (Motion stream)
        </li>
      </ul>
      <p className="text-[9px] text-slate-500 italic pt-0.5">
        Proximity alerts are automated heuristics based on motion difference, not identification.
      </p>
    </div>
  )
}
