import { VideoProcessor, ProcessorResult, BoundingBox } from './types'
import { processorRegistry } from './registry'

export interface DropZoneRect {
  x: number // 0..1 normalized
  y: number
  width: number
  height: number
}

export interface PackageWatchState {
  dropZone: DropZoneRect
  sensitivity: number // threshold 10..60 (default 25)
  isCalibrated: boolean
  currentDiff: number
  status: 'Expected' | 'Delivered' | 'Removed'
  personInDropZone: boolean
  lastPersonOverlapTime: number | null
  lastStatusChangeTime: number
  onStatusChange?: (newStatus: 'Expected' | 'Delivered' | 'Removed', snapshotUrl?: string) => void
  onAlertTriggered?: (alertMessage: string) => void
}

export class PackageWatchProcessor implements VideoProcessor {
  id = 'package-watch'
  name = 'Package Watch & Drop Zone'
  description = 'Drop-zone differencing, baseline calibration, and person proximity detection'
  enabled = true

  // Default drop zone covering the porch steps where parcels are placed
  private dropZone: DropZoneRect = {
    x: 0.22,
    y: 0.40,
    width: 0.45,
    height: 0.38,
  }

  private sensitivity = 26
  private baselineGrid: number[] | null = null
  private calibrationFrames = 0
  private isAutoCalibrating = true
  private status: 'Expected' | 'Delivered' | 'Removed' = 'Delivered'
  private isRingMode = true
  private isMotionStreamOnly = false

  private lastPersonOverlapTime: number | null = null
  private personOverlapAlertFired = false
  private deliveredTimestamp: number | null = Date.now()
  private personOverlapFrames = 0
  private sustainedDiffCount = 0
  private lastAlertTime = 0

  private cocoModel: any = null
  private isLoadingModel = false
  private frameCounter = 0

  // Callbacks
  private onStatusChangeHandler?: (status: 'Expected' | 'Delivered' | 'Removed', snapshot?: string) => void
  private onAlertHandler?: (message: string) => void

  setCallbacks(
    onStatusChange?: (status: 'Expected' | 'Delivered' | 'Removed', snapshot?: string) => void,
    onAlert?: (message: string) => void
  ) {
    this.onStatusChangeHandler = onStatusChange
    this.onAlertHandler = onAlert
  }

  setMode(sourceMode: 'ring' | 'simulator', isMotionStream = false) {
    this.isRingMode = sourceMode === 'ring'
    this.isMotionStreamOnly = isMotionStream
    if (this.isRingMode) {
      this.status = 'Delivered'
    } else {
      this.status = 'Expected'
    }
  }

  setDropZone(rect: DropZoneRect) {
    this.dropZone = { ...rect }
    this.calibrateBaseline()
  }

  getDropZone(): DropZoneRect {
    return { ...this.dropZone }
  }

  setSensitivity(val: number) {
    this.sensitivity = Math.max(10, Math.min(60, val))
  }

  getSensitivity(): number {
    return this.sensitivity
  }

  calibrateBaseline() {
    this.baselineGrid = null
    this.calibrationFrames = 0
    this.isAutoCalibrating = true
  }

  resetState(initialStatus: 'Expected' | 'Delivered' | 'Removed' = 'Expected') {
    this.status = initialStatus
    this.baselineGrid = null
    this.calibrationFrames = 0
    this.isAutoCalibrating = true
    this.lastPersonOverlapTime = null
    this.personOverlapAlertFired = false
    this.personOverlapFrames = 0
    this.deliveredTimestamp = initialStatus === 'Delivered' ? Date.now() : null
    this.sustainedDiffCount = 0
  }

  async init(): Promise<void> {
    if (typeof window === 'undefined') return
    this.loadCocoSsd()
  }

  private async loadCocoSsd() {
    if (this.cocoModel || this.isLoadingModel || typeof window === 'undefined') return
    this.isLoadingModel = true
    try {
      const win = window as any
      if (!win.tf) {
        await new Promise<void>((resolve, reject) => {
          const s = document.createElement('script')
          s.src = 'https://cdn.jsdelivr.net/npm/@tensorflow/tfjs@4.17.0/dist/tf.min.js'
          s.onload = () => resolve()
          s.onerror = (e) => reject(e)
          document.head.appendChild(s)
        })
      }
      if (!win.cocoSsd) {
        await new Promise<void>((resolve, reject) => {
          const s = document.createElement('script')
          s.src = 'https://cdn.jsdelivr.net/npm/@tensorflow-models/coco-ssd@2.2.3/dist/coco-ssd.min.js'
          s.onload = () => resolve()
          s.onerror = (e) => reject(e)
          document.head.appendChild(s)
        })
      }
      if (win.cocoSsd) {
        this.cocoModel = await win.cocoSsd.load({ base: 'lite_mobilenet_v2' })
        console.log('[COCO-SSD] Model loaded for Package Watch')
      }
    } catch (e) {
      console.warn('[COCO-SSD] Failed to load model, using motion detection fallback:', e)
    } finally {
      this.isLoadingModel = false
    }
  }

  async process(
    frame: ImageData,
    canvas: HTMLCanvasElement,
    video: HTMLVideoElement
  ): Promise<ProcessorResult | null> {
    const { width, height, data } = frame
    this.frameCounter++

    // 1. Calculate pixel bounds for drop zone, excluding corner margins
    const marginX = Math.floor(width * 0.06)
    const marginY = Math.floor(height * 0.08)

    const rawX = Math.floor(this.dropZone.x * width)
    const rawY = Math.floor(this.dropZone.y * height)
    const rawW = Math.floor(this.dropZone.width * width)
    const rawH = Math.floor(this.dropZone.height * height)

    // Clamp drop zone inside active bounds (excluding edge margin with timestamps/devices)
    const dzX = Math.max(marginX, Math.min(width - marginX - 20, rawX))
    const dzY = Math.max(marginY, Math.min(height - marginY - 20, rawY))
    const dzW = Math.max(20, Math.min(width - marginX - dzX, rawW))
    const dzH = Math.max(20, Math.min(height - marginY - dzY, rawH))

    // 2. Sample 16x16 grid inside drop zone for robust differencing
    const GRID_SIZE = 16
    const currentGrid: number[] = new Array(GRID_SIZE * GRID_SIZE).fill(0)
    const stepX = dzW / GRID_SIZE
    const stepY = dzH / GRID_SIZE

    for (let gy = 0; gy < GRID_SIZE; gy++) {
      for (let gx = 0; gx < GRID_SIZE; gx++) {
        const px = Math.floor(dzX + gx * stepX + stepX / 2)
        const py = Math.floor(dzY + gy * stepY + stepY / 2)
        const idx = (py * width + px) * 4
        // Grayscale value
        const val = (data[idx] * 0.299 + data[idx + 1] * 0.587 + data[idx + 2] * 0.114)
        currentGrid[gy * GRID_SIZE + gx] = val
      }
    }

    // 3. Baseline auto-calibration (averages over 30 frames ~ 3 seconds)
    if (!this.baselineGrid || this.isAutoCalibrating) {
      if (!this.baselineGrid) {
        this.baselineGrid = [...currentGrid]
        this.calibrationFrames = 1
      } else {
        for (let i = 0; i < currentGrid.length; i++) {
          this.baselineGrid[i] =
            (this.baselineGrid[i] * this.calibrationFrames + currentGrid[i]) /
            (this.calibrationFrames + 1)
        }
        this.calibrationFrames++
        if (this.calibrationFrames >= 30) {
          this.isAutoCalibrating = false
        }
      }
    }

    // 4. Compute drop zone delta against baseline
    let totalDelta = 0
    if (this.baselineGrid && !this.isAutoCalibrating) {
      for (let i = 0; i < currentGrid.length; i++) {
        totalDelta += Math.abs(currentGrid[i] - this.baselineGrid[i])
      }
      totalDelta = totalDelta / currentGrid.length
    }

    // 5. Person / Object Detection
    const boundingBoxes: BoundingBox[] = []
    let personDetectedInDropZone = false

    // Drop zone bounding box overlay
    boundingBoxes.push({
      x: dzX,
      y: dzY,
      width: dzW,
      height: dzH,
      label: this.isAutoCalibrating
        ? `Drop Zone (Calibrating ${Math.round((this.calibrationFrames / 30) * 100)}%)`
        : `Drop Zone (Diff: ${Math.round(totalDelta)} / Thresh: ${this.sensitivity})`,
      color: totalDelta > this.sensitivity ? '#F59E0B' : '#06B6D4',
    })

    // Run COCO-SSD object detection every 3 frames (~3 times per sec)
    if (this.cocoModel && this.frameCounter % 3 === 0) {
      try {
        const predictions = await this.cocoModel.detect(video)
        for (const pred of predictions) {
          const [bx, by, bw, bh] = pred.bbox
          const isPerson = pred.class === 'person'
          const label = this.isMotionStreamOnly
            ? 'object / motion'
            : isPerson
            ? 'person'
            : pred.class

          // If in motion-only stream, strictly never label as person
          if (this.isMotionStreamOnly && isPerson) continue

          const boxColor = isPerson ? '#EC4899' : '#10B981'
          boundingBoxes.push({
            x: bx,
            y: by,
            width: bw,
            height: bh,
            label: `${label} (${Math.round(pred.score * 100)}%)`,
            color: boxColor,
          })

          // Check intersection with drop zone
          if (isPerson && !this.isMotionStreamOnly) {
            const overlapX = Math.max(0, Math.min(bx + bw, dzX + dzW) - Math.max(bx, dzX))
            const overlapY = Math.max(0, Math.min(by + bh, dzY + dzH) - Math.max(by, dzY))
            const overlapArea = overlapX * overlapY
            if (overlapArea > 800) {
              personDetectedInDropZone = true
              this.lastPersonOverlapTime = Date.now()
            }
          }
        }
      } catch (err) {
        // Fallback or frame skip
      }
    }

    // 6. Suspicious Activity Alert Rule (Feature 3)
    // Grace period: ignore people for the first ~10s after status=Delivered
    // Duration: require a person to overlap the drop zone for ~2-3s (20+ frames)
    const now = Date.now()
    const inGracePeriod = this.deliveredTimestamp !== null && now - this.deliveredTimestamp < 10000

    if (personDetectedInDropZone && this.status === 'Delivered' && !inGracePeriod) {
      this.personOverlapFrames++
    } else {
      this.personOverlapFrames = Math.max(0, this.personOverlapFrames - 1)
    }

    if (
      this.personOverlapFrames >= 20 &&
      this.status === 'Delivered' &&
      !this.personOverlapAlertFired &&
      now - this.lastAlertTime > 12000
    ) {
      this.personOverlapAlertFired = true
      this.lastAlertTime = now
      this.personOverlapFrames = 0
      const timeStr = new Date().toLocaleTimeString([], { hour: '2-digit', minute: '2-digit' })
      const alertMsg = `Possible risk: a person approached the package at ${timeStr}.`
      if (this.onAlertHandler) {
        this.onAlertHandler(alertMsg)
      }
    }

    // 7. State Machine: Expected -> Delivered -> Removed
    if (!this.isAutoCalibrating && this.baselineGrid) {
      const isSignificantDiff = totalDelta > this.sensitivity

      if (isSignificantDiff) {
        this.sustainedDiffCount++
      } else {
        this.sustainedDiffCount = Math.max(0, this.sustainedDiffCount - 1)
      }

      // In Simulator Mode: Expected -> Delivered (package placed)
      if (this.status === 'Expected' && this.sustainedDiffCount >= 15) {
        this.status = 'Delivered'
        this.deliveredTimestamp = Date.now()
        this.sustainedDiffCount = 0
        const snapshot = this.captureVisibleFrame(video, canvas)
        if (this.onStatusChangeHandler) {
          this.onStatusChangeHandler('Delivered', snapshot)
        }
      }

      // Delivered -> Removed (box removed after person overlap)
      const personWasRecentlyNear =
        this.lastPersonOverlapTime !== null && now - this.lastPersonOverlapTime < 15000

      if (
        this.status === 'Delivered' &&
        this.sustainedDiffCount >= 18 &&
        personWasRecentlyNear
      ) {
        this.status = 'Removed'
        this.sustainedDiffCount = 0
        const snapshot = this.captureVisibleFrame(video, canvas)
        if (this.onStatusChangeHandler) {
          this.onStatusChangeHandler('Removed', snapshot)
        }
      }
    }

    return {
      id: `pw_${Date.now()}`,
      processorId: this.id,
      timestamp: Date.now(),
      boundingBoxes,
      data: {
        status: this.status,
        dropZone: this.dropZone,
        sensitivity: this.sensitivity,
        currentDiff: Math.round(totalDelta),
        isCalibrated: !this.isAutoCalibrating,
        personInDropZone: personDetectedInDropZone,
      },
    }
  }

  private captureVisibleFrame(video: HTMLVideoElement, overlay: HTMLCanvasElement): string {
    try {
      const snapCanvas = document.createElement('canvas')
      snapCanvas.width = video.videoWidth || 640
      snapCanvas.height = video.videoHeight || 360
      const ctx = snapCanvas.getContext('2d')
      if (ctx) {
        if (video.readyState >= 2) {
          ctx.drawImage(video, 0, 0, snapCanvas.width, snapCanvas.height)
        }
        ctx.drawImage(overlay, 0, 0, snapCanvas.width, snapCanvas.height)
        return snapCanvas.toDataURL('image/jpeg', 0.85)
      }
    } catch (e) {
      console.warn('Snapshot capture error:', e)
    }
    return ''
  }

  destroy(): Promise<void> {
    this.baselineGrid = null
    this.cocoModel = null
    return Promise.resolve()
  }
}

export const packageWatchProcessor = new PackageWatchProcessor()
processorRegistry.register(packageWatchProcessor)
