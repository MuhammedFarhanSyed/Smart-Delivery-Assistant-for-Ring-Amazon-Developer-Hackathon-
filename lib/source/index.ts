import { DeviceSource, SourceMode } from './types'
import { RingSource } from './ring-source'
import { SimulatorSource } from './simulator-source'

export * from './types'
export { RingSource } from './ring-source'
export { SimulatorSource } from './simulator-source'

export function getSourceMode(): SourceMode {
  const mode = process.env.SOURCE_MODE || process.env.NEXT_PUBLIC_SOURCE_MODE
  if (mode === 'ring') return 'ring'
  return 'simulator'
}

let ringSourceInstance: RingSource | null = null
let simulatorSourceInstance: SimulatorSource | null = null

export function getDeviceSource(): DeviceSource {
  const mode = getSourceMode()
  if (mode === 'ring') {
    if (!ringSourceInstance) ringSourceInstance = new RingSource()
    return ringSourceInstance
  }
  if (!simulatorSourceInstance) simulatorSourceInstance = new SimulatorSource()
  return simulatorSourceInstance
}
