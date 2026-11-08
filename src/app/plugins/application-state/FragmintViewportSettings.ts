import { BaseData } from '@/app/plugins/base/BaseData'

export class FragmintViewportSettings extends BaseData.define({
  message_interval_ms: ['integer', 100],
  smooth_time_seconds: ['number', 0.2],
}) {
  override do_validation(key: string, value: unknown): [unknown, string] {
    if (key === FragmintViewportSettings.keys.message_interval_ms) {
      if (typeof value !== 'number' || !Number.isInteger(value) || value <= 0)
        throw new Error('invalid_message_interval_ms')
    }

    if (key === FragmintViewportSettings.keys.smooth_time_seconds) {
      if (typeof value !== 'number' || !Number.isFinite(value) || value <= 0)
        throw new Error('invalid_smooth_time_seconds')
    }

    return [value, '']
  }
}
