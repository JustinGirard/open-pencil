import type { RouteRecordRaw } from 'vue-router'

import { ApplicationMessaging } from '@/app/plugins/application-state/ApplicationMessaging'
import { ApplicationState } from '@/app/plugins/application-state/ApplicationState'
import { BasePlugin } from '@/app/plugins/base/BasePlugin'
import { FragmintViewportSettings } from '@/app/plugins/application-state/FragmintViewportSettings'
import { BaseData } from '@/app/plugins/base/BaseData'
import { toast } from '@/app/shell/ui'
import type {
  CenterViewContribution,
  LeftPanelSectionContribution,
  PluginEvent
  , SettingsAreaContribution
  , WorkspaceVisibilityContext
} from '@/app/plugins/base/pluginTypes'
import { requestFragmintCenterDeactivate } from '@/app/plugins/fragmint/state/centerMode'
import FragmintCenterView from '@/app/plugins/fragmint/views/FragmintCenterView.vue'
import FragmintLeftSection from '@/app/plugins/fragmint/views/FragmintLeftSection.vue'
import FragmintPluginView from '@/app/plugins/fragmint/views/FragmintPluginView.vue'
import FragmintSettingsPanel from '@/app/plugins/fragmint/views/FragmintSettingsPanel.vue'
import { useFollowingEditorStore } from '@/app/editor/active-store'
import { FragmintViewport } from '@/app/plugins/fragmint/FragmintViewport'

const OPENPENCIL_TEST_MESSAGE_URL = 'openpencil/test_message'
const OPENPENCIL_CLIPBOARD_COPY_URL = 'openpencil/clipboard_copy'
const OPENPENCIL_UNITY_VIEWPORT_READY_URL = 'openpencil/unity_viewport_ready'
const OPENPENCIL_SET_UNITY_VIEWPORT_URL = 'openpencil/set_unity_viewport'
const MESSAGING_PUMP_INTERVAL_MS = 250
let didRegisterOpenPencilMessagingHandler = false
let messagingPumpTimer: ReturnType<typeof setInterval> | null = null
let stopViewportOutboundSync: (() => void) | null = null

let lastUnityViewportSendAt = Number.NEGATIVE_INFINITY
let unityViewportSendTimer: ReturnType<typeof setTimeout> | null = null

const viewportSettingsState = ApplicationState.Instance(
  'fragmint_viewport_settings',
  new FragmintViewportSettings({})
)

function nextViewportMessageId(): string {
  return `openpencil-unity-set-viewport:${Date.now()}:${Math.random().toString(16).slice(2)}`
}

function setCanvasViewportFromUnity(panX: number, panY: number, zoom: number): void {
  const viewport = new FragmintViewport({
    pan_x: panX,
    pan_y: panY,
    zoom
  })

  const store = useFollowingEditorStore()
  const size = store.getViewportSize()

  const canvas = viewport.toCanvasKitParameters(
    size.width,
    size.height
  )

  FragmintViewport.current = viewport

  store.state.zoom = canvas.zoom
  store.state.panX = canvas.panX
  store.state.panY = canvas.panY
  store.requestRepaint()
}

function sendLatestUnityViewport(): void {
  const current = FragmintViewport.current
  if (current === null)
    throw new Error('FragmintViewport.current is not initialized.')

  const store = useFollowingEditorStore()
  const size = store.getViewportSize()

  const next = current.fromCanvasKitParameters(
    store.state.panX,
    store.state.panY,
    store.state.zoom,
    size.width,
    size.height
  )

  if (
    Math.abs(next.pan_x - current.pan_x) < 0.01 &&
    Math.abs(next.pan_y - current.pan_y) < 0.01 &&
    Math.abs(next.zoom - current.zoom) < 0.0001
  ) return

  const graphState = ApplicationState.Instance('graph_file_state')
  const rawGraphId = graphState['selected_graph_id']

  if (typeof rawGraphId !== 'string')
    throw new Error('graph_file_state.selected_graph_id must be string.')

  const selectedGraphId = rawGraphId.trim()

  if (selectedGraphId.length === 0)
    throw new Error('graph_file_state.selected_graph_id must be non-empty.')

  current.pan_x = next.pan_x
  current.pan_y = next.pan_y
  current.zoom = next.zoom

  const panX = current.pan_x
  const panY = current.pan_y
  const zoom = current.zoom

  ApplicationMessaging.Instance().SendMessage(
    OPENPENCIL_SET_UNITY_VIEWPORT_URL,
    {
      selected_graph_id: selectedGraphId,
      graph_id: selectedGraphId,
      pan_x: panX,
      pan_y: panY,
      zoom
    },
    { sender: 'openpencil', event: 'set_unity_viewport' },
    nextViewportMessageId(),
    15000,
    () => {},
    response => console.error(
      '[Fragmint set_unity_viewport] failed',
      {
        selectedGraphId,
        panX,
        panY,
        zoom,
        response
      }
    )
  )
  lastUnityViewportSendAt = performance.now()
}

function scheduleUnityViewportSend(): void {
  // One outstanding timer represents the pending trailing send.
  if (unityViewportSendTimer !== null)
    return

  const throttleMs = viewportSettingsState['message_interval_ms'] as number

  const elapsed = performance.now() - lastUnityViewportSendAt

  // First update, or first update after an idle period.
  if (elapsed >= throttleMs) {
    sendLatestUnityViewport()
    return
  }

  // Additional changes: send latest state at the next interval.
  unityViewportSendTimer = setTimeout(() => {
    unityViewportSendTimer = null

    // A graph switch resets this reference to null.
    // There is no old viewport to send in that case.
    if (FragmintViewport.current === null)
      return

    sendLatestUnityViewport()
  }, throttleMs - elapsed)
}

function ensureViewportOutboundSync(): void {
  if (stopViewportOutboundSync !== null) return
  const store = useFollowingEditorStore()
  stopViewportOutboundSync = store.onEditorEvent('viewport:changed', () => {
    scheduleUnityViewportSend()
  })
}

class UnityViewportReadyPayloadSpec extends BaseData.define({
  selected_graph_id: 'string',
  graph_id: 'string',
  pan_x: 'number',
  pan_y: 'number',
  zoom: 'number'
}) {}

function ensureMessagingBridge(): void {
  if (!didRegisterOpenPencilMessagingHandler) {
    ApplicationMessaging.Instance().RegisterHandler(
      OPENPENCIL_TEST_MESSAGE_URL,
      (message, onSuccess) => {
        const payload = message.payload as { title: string; description: string }
        toast.info(`${payload.title}: ${payload.description}`)
        onSuccess({ ok: true })
      }
    )
    ApplicationMessaging.Instance().RegisterHandler(
      OPENPENCIL_UNITY_VIEWPORT_READY_URL,
      (message, onSuccess, onFailure) => {
        try {
          const payload = new UnityViewportReadyPayloadSpec(
            message.payload as Record<string, unknown>
          )
          const selectedGraphId = payload.selected_graph_id.trim()
          const graphId = payload.graph_id.trim()
          const panX = payload.pan_x
          const panY = payload.pan_y
          const zoom = payload.zoom
          const messageId = message.id

          if (selectedGraphId.length === 0)
            throw new Error('payload.selected_graph_id must be non-empty.')
          if (graphId.length === 0)
            throw new Error('payload.graph_id must be non-empty.')
          if (!Number.isFinite(panX))
            throw new Error('payload.pan_x must be a finite number.')
          if (!Number.isFinite(panY))
            throw new Error('payload.pan_y must be a finite number.')
          if (!Number.isFinite(zoom) || zoom <= 0)
            throw new Error('payload.zoom must be a finite positive number.')
          setCanvasViewportFromUnity(panX, panY, zoom)

          console.info('[Fragmint unity_viewport_ready] received', {
            messageId,
            graphId,
            selectedGraphId,
            panX,
            panY,
            zoom
          })
          onSuccess({ ok: true })
        } catch (error) {
          const reason = error instanceof Error ? `${error.name}: ${error.message}` : String(error)
          console.error('[Fragmint unity_viewport_ready] invalid payload', { messageId: message.id, error: reason, payload: message.payload })
          onFailure({ error: 'invalid_unity_viewport_ready_payload', message: reason })
        }
      })
    ApplicationMessaging.Instance().RegisterHandler(
      OPENPENCIL_CLIPBOARD_COPY_URL,
      (message, onSuccess, onFailure) => {
        try {
          if (
            typeof navigator === 'undefined' ||
            !navigator.clipboard ||
            typeof navigator.clipboard.writeText !== 'function'
          ) {
            onFailure({
              error: 'clipboard_copy_unavailable',
              message: 'navigator.clipboard.writeText unavailable'
            })
            return
          }

          const payload = message.payload as { text: string }
          navigator.clipboard.writeText(payload.text).then(
            () => {
              toast.info('Copied')
              onSuccess({ ok: true })
            },
            error => {
              const reason =
                error instanceof Error ? `${error.name}: ${error.message}` : String(error)
              onFailure({ error: 'clipboard_copy_failed', message: reason })
            }
          )
        } catch (error) {
          const reason =
            error instanceof Error ? `${error.name}: ${error.message}` : String(error)
          onFailure({ error: 'clipboard_copy_failed', message: reason })
        }
      }
    )
    didRegisterOpenPencilMessagingHandler = true
    ensureViewportOutboundSync()

  }
  if (messagingPumpTimer === null) {
    messagingPumpTimer = setInterval(() => {
      ApplicationMessaging.Instance().Pump()
    }, MESSAGING_PUMP_INTERVAL_MS)
  }
}

function readSingleQueryValue(value: unknown): string {
  if (Array.isArray(value)) return String(value[0] ?? '')
  return typeof value === 'string' ? value : ''
}

export class FragmintPlugin extends BasePlugin {
  readonly id = 'fragmint'
  readonly routes: RouteRecordRaw[] = [{ path: '/plugins/fragmint', component: FragmintPluginView }]
  readonly leftSections: readonly LeftPanelSectionContribution[] = [
    { id: 'fragmint.graphs', component: FragmintLeftSection }
  ]
  readonly centerViews: readonly CenterViewContribution[] = [
    {
      id: 'fragmint.center',
      component: FragmintCenterView,
      match: ({ route }) => readSingleQueryValue(route.query.center_plugin) === 'fragmint'
    }
  ]
  readonly workspaceVisibility = ({ route }: WorkspaceVisibilityContext) =>
    readSingleQueryValue(route.query.center_plugin) === 'fragmint'
      ? { hidePagesAndLayers: true, hideRightPanel: true }
      : null
  readonly settingsAreas: readonly SettingsAreaContribution[] = [
    { id: 'fragmint', label: 'Fragmint', component: FragmintSettingsPanel }
  ]

  constructor() {
    super()
    ApplicationState.Instance('debug_mode')
    ensureMessagingBridge()
  }

  onEvent(event: PluginEvent): void | Promise<void> {
    if (event.type !== 'asset:selected') return
    const payload = event.payload as { kind?: string } | undefined
    if (payload?.kind !== 'page') return
    requestFragmintCenterDeactivate()
  }
}
