/**
 * Video Processor Plugin System
 */

export * from './types'
export { processorRegistry } from './registry'
export { packageWatchProcessor, PackageWatchProcessor } from './package-watch-processor'

// Register built-in example processors
import { motionHeatmapProcessor } from './examples/motion-heatmap'
import { brightnessAnalyzerProcessor } from './examples/brightness-analyzer'
import { amazonLogoGame } from './examples/amazon-logo-game'
import { packageWatchProcessor } from './package-watch-processor'
import { processorRegistry } from './registry'

// Auto-register processors
processorRegistry.register(packageWatchProcessor)
processorRegistry.register(motionHeatmapProcessor)
processorRegistry.register(brightnessAnalyzerProcessor)
processorRegistry.register(amazonLogoGame)
