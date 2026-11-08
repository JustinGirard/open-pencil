import { BaseData, type DataRecord } from '@/app/plugins/base/BaseData'
import { ApplicationMessagingState } from './ApplicationMessagingState'
import { DebugMode } from './DebugMode'
import { GraphFileState } from './GraphFileState'
import { FragmintViewportSettings } from './FragmintViewportSettings'
import { StyleSettings } from './StyleSettings'

type DataType = new (input: DataRecord) => BaseData

const registry = new Map<string, DataType>([
  ['debug_mode', DebugMode],
  ['application_messaging_state', ApplicationMessagingState],
  ['graph_file_state', GraphFileState],
  ['fragmint_viewport_settings', FragmintViewportSettings],
  ['style_settings', StyleSettings],
])

const instances = new Map<string, ApplicationStateEntry>()

function isGraphFileStateField(entryKey: string, field: string): boolean {
  return entryKey === 'graph_file_state' && (field === 'selected_graph_id' || field === 'graph_list_dirty_at_ms')
}

export class ApplicationState {
  static _createData(key: string, input: DataRecord): BaseData {
    const DataType = registry.get(key) as DataType
    return new DataType(input)
  }

  static _storageKey(key: string): string {
    return `application_state.${key}`
  }

  static Instance(key: string, initialInput: DataRecord = {}): ApplicationStateEntry {
    if (!registry.has(key)) {
      throw new Error(`unknown_entry_key:${key}`)
    }

    if (!instances.has(key)) {
      const storageKey = ApplicationState._storageKey(key)
      const storageRaw = localStorage.getItem(storageKey)
      if (storageRaw === null) {
        const seeded = ApplicationState._createData(key, initialInput)
        localStorage.setItem(storageKey, JSON.stringify(seeded))
      }
      instances.set(key, new ApplicationStateEntry(key))
    }

    return instances.get(key) as ApplicationStateEntry
  }
}

class ApplicationStateEntry {
  [key: string]: unknown

  private readonly key: string
  private readonly storageKey: string

  constructor(key: string) {
    this.key = key
    this.storageKey = ApplicationState._storageKey(key)

    return new Proxy(this, {
      get: (target, field, receiver) => {
        if (typeof field !== 'string' || field in target) {
          return Reflect.get(target, field, receiver)
        }
        const current = target.readObject()
        return current[field]
      },
      set: (target, field, value) => {
        if (typeof field !== 'string' || field in target) {
          throw new Error(`unknown_entry_field:${String(field)}`)
        }
        target.writeField(field, value)
        return true
      }
    }) as this
  }

  private readObject(): DataRecord {
    const parsed = JSON.parse(localStorage.getItem(this.storageKey) as string) as unknown
    if (parsed === null || typeof parsed !== 'object' || Array.isArray(parsed)) {
      throw new Error('invalid_storage_object')
    }
    return parsed as DataRecord
  }

  private writeField(field: string, value: unknown): void {
    const current = this.readObject()
    const candidate: DataRecord = { ...current, [field]: value }
    const validated = ApplicationState._createData(this.key, candidate)
    localStorage.setItem(this.storageKey, JSON.stringify(validated))
  }
}
