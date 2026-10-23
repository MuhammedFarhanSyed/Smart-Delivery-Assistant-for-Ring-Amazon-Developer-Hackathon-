import { DeviceSource, DeviceInfo, DeviceStatus, RingEventHistoryItem } from './types'

export class SimulatorSource implements DeviceSource {
  readonly mode = 'simulator' as const

  private static simulatedEvents: RingEventHistoryItem[] = [
    {
      id: 'sim_evt_01',
      eventType: 'ding',
      timestamp: new Date(Date.now() - 1000 * 60 * 30).toISOString(),
      deviceId: 'sim-cam-frontdoor',
    },
    {
      id: 'sim_evt_02',
      eventType: 'motion.human',
      timestamp: new Date(Date.now() - 1000 * 60 * 15).toISOString(),
      deviceId: 'sim-cam-frontdoor',
    },
  ]

  async getDevices(): Promise<DeviceInfo[]> {
    return [
      {
        id: 'sim-cam-frontdoor',
        name: 'Front Doorbell (Simulator Camera)',
        online: true,
        capabilities: {
          motionDetection: true,
          liveStream: true,
          twoWayAudio: true,
          simulatorMode: true,
        },
      },
    ]
  }

  async getDeviceStatus(deviceId: string): Promise<DeviceStatus> {
    return {
      id: deviceId,
      online: true,
      battery: 98,
      lastUpdated: new Date().toISOString(),
    }
  }

  async getEventHistory(_deviceId: string, limit: number = 20): Promise<RingEventHistoryItem[]> {
    return SimulatorSource.simulatedEvents.slice(0, limit)
  }

  static recordSimulatedEvent(eventType: string, deviceId: string = 'sim-cam-frontdoor') {
    const newEvent: RingEventHistoryItem = {
      id: `sim_evt_${Date.now()}`,
      eventType,
      timestamp: new Date().toISOString(),
      deviceId,
    }
    SimulatorSource.simulatedEvents.unshift(newEvent)
    if (SimulatorSource.simulatedEvents.length > 50) {
      SimulatorSource.simulatedEvents.pop()
    }
    return newEvent
  }
}
