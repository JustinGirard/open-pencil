<script setup lang="ts">
import { onMounted, onUnmounted, ref } from 'vue'
import { activeStorageProviderID } from '@/app/integrations/storage'
import { emitStorageWorkspaceEvent } from '@/app/storage/workspace/events'

import { resolveFragmintBridgeConfig, type FragmintBridgeConfig } from '@/app/plugins/fragmint/unity/bridgeConfig'
import {
  buildStartupApplicationEnvPayload,
  sendBridgeMessage
} from '@/app/plugins/fragmint/unity/bridgePayloads'
import { fetchUnityManifest } from '@/app/plugins/fragmint/unity/manifest'
import FragmintCanvasKitOverlay from '@/app/plugins/fragmint/views/FragmintCanvasKitOverlay.vue'

type UnityInstance = { Quit?: () => Promise<void>; SendMessage?: (o: string, m: string, p?: string) => void }

const props = withDefaults(
  defineProps<{
    enableCanvasKitOverlay?: boolean
  }>(),
  { enableCanvasKitOverlay: false }
)

const bridgeConfig = ref<FragmintBridgeConfig | null>(null)
const manifestUrl = ref('')
const canvasId = ref('')
const canvasRef = ref<HTMLCanvasElement | null>(null)
const progress = ref(0)
const error = ref('')
const ready = ref(false)
const lastRegistrationPayload = ref('')
const lastGraphPayload = ref('')
let unity: UnityInstance | null = null
let active = false

type KeyboardListenerType = 'keydown' | 'keyup' | 'keypress'
type KeyboardRegistrationTarget = 'window' | 'unity-canvas'

type WrappedKeyboardListenerEntry = {
  target: EventTarget
  type: KeyboardListenerType
  capture: boolean
  wrapped: EventListenerOrEventListenerObject
}

let wrappedKeyboardListeners = new WeakMap<
  EventTarget,
  Map<KeyboardListenerType, WeakMap<object, Map<boolean, EventListenerOrEventListenerObject>>>
>()
const wrappedKeyboardListenerEntries: WrappedKeyboardListenerEntry[] = []
let keyboardProbeOriginalRemoveEventListener: typeof EventTarget.prototype.removeEventListener | null = null
let keyboardProbeRemovePatchInstalled = false

function getCaptureFlag(options: boolean | AddEventListenerOptions | undefined): boolean {
  if (typeof options === 'boolean') return options
  return options?.capture === true
}

function getWrappedKeyboardListener(
  target: EventTarget,
  type: KeyboardListenerType,
  listener: object,
  capture: boolean
): EventListenerOrEventListenerObject | undefined {
  const byType = wrappedKeyboardListeners.get(target)
  if (!byType) return undefined
  const byListener = byType.get(type)
  if (!byListener) return undefined
  const byCapture = byListener.get(listener)
  if (!byCapture) return undefined
  return byCapture.get(capture)
}

function setWrappedKeyboardListener(
  target: EventTarget,
  type: KeyboardListenerType,
  listener: object,
  capture: boolean,
  wrapped: EventListenerOrEventListenerObject
): void {
  let byType = wrappedKeyboardListeners.get(target)
  if (!byType) {
    byType = new Map()
    wrappedKeyboardListeners.set(target, byType)
  }
  let byListener = byType.get(type)
  if (!byListener) {
    byListener = new WeakMap()
    byType.set(type, byListener)
  }
  let byCapture = byListener.get(listener)
  if (!byCapture) {
    byCapture = new Map()
    byListener.set(listener, byCapture)
  }
  byCapture.set(capture, wrapped)
}

function installKeyboardProbeRemovePatch(): void {
  if (keyboardProbeRemovePatchInstalled) return
  keyboardProbeRemovePatchInstalled = true
  keyboardProbeOriginalRemoveEventListener = EventTarget.prototype.removeEventListener

  EventTarget.prototype.removeEventListener = function (
    ...args: Parameters<typeof EventTarget.prototype.removeEventListener>
  ) {
    const [type, listener, options] = args
    if ((type !== 'keydown' && type !== 'keyup' && type !== 'keypress') || !listener)
      return keyboardProbeOriginalRemoveEventListener!.apply(this, args)

    const capture = getCaptureFlag(options as boolean | AddEventListenerOptions | undefined)
    const wrapped = getWrappedKeyboardListener(
      this,
      type as KeyboardListenerType,
      listener as object,
      capture
    )
    return keyboardProbeOriginalRemoveEventListener!.call(
      this,
      type,
      (wrapped ?? listener) as EventListenerOrEventListenerObject,
      options
    )
  }
}

function clearKeyboardProbeWrappedListeners(): void {
  if (!keyboardProbeOriginalRemoveEventListener) return
  for (const entry of wrappedKeyboardListenerEntries)
    keyboardProbeOriginalRemoveEventListener.call(entry.target, entry.type, entry.wrapped, entry.capture)
  wrappedKeyboardListenerEntries.length = 0
  wrappedKeyboardListeners = new WeakMap()
}

function uninstallKeyboardProbeRemovePatch(): void {
  if (!keyboardProbeRemovePatchInstalled || !keyboardProbeOriginalRemoveEventListener) return
  EventTarget.prototype.removeEventListener = keyboardProbeOriginalRemoveEventListener
  keyboardProbeOriginalRemoveEventListener = null
  keyboardProbeRemovePatchInstalled = false
}

function loadScriptOnce(src: string): Promise<void> {
  return new Promise((resolve, reject) => {
    const prior = document.querySelector<HTMLScriptElement>(`script[data-fragmint-unity-loader="${src}"]`)
    if (prior?.dataset.loaded === '1') return resolve()
    if (prior?.dataset.failed === '1') return reject(new Error(`[fragmint-plugin] loader failed: ${src}`))
    if (prior) {
      prior.addEventListener('load', () => resolve(), { once: true })
      prior.addEventListener('error', () => reject(new Error(`[fragmint-plugin] loader failed: ${src}`)), {
        once: true
      })
      return
    }
    const s = document.createElement('script')
    s.src = src
    s.async = true
    s.dataset.fragmintUnityLoader = src
    s.addEventListener(
      'load',
      () => {
        s.dataset.loaded = '1'
        resolve()
      },
      { once: true }
    )
    s.addEventListener(
      'error',
      () => {
        s.dataset.failed = '1'
        reject(new Error(`[fragmint-plugin] loader failed: ${src}`))
      },
      { once: true }
    )
    document.body.appendChild(s)
  })
}

async function start() {
  error.value = ''
  ready.value = false
  progress.value = 0

  bridgeConfig.value = await resolveFragmintBridgeConfig()
  manifestUrl.value = bridgeConfig.value.manifestUrl
  canvasId.value = bridgeConfig.value.canvasId

  const manifest = await fetchUnityManifest(manifestUrl.value)
  await loadScriptOnce(new URL(manifest.loaderUrl, window.location.href).toString())

  const createUnityInstance = (window as Window & { createUnityInstance?: Function }).createUnityInstance
  if (typeof createUnityInstance !== 'function')
    throw new Error('[fragmint-plugin] createUnityInstance not available')
  if (!canvasRef.value) throw new Error('[fragmint-plugin] missing canvas')

  const originalAddEventListener = EventTarget.prototype.addEventListener
  const registrationCanvasTarget = canvasRef.value
  EventTarget.prototype.addEventListener = function (...args: Parameters<typeof originalAddEventListener>) {
    const [type, listener, options] = args
    if ((type !== 'keydown' && type !== 'keyup' && type !== 'keypress') || !listener)
      return originalAddEventListener.apply(this, args)

    let registrationTarget: KeyboardRegistrationTarget | null = null
    if (this === window) registrationTarget = 'window'
    else if (this === registrationCanvasTarget) registrationTarget = 'unity-canvas'
    if (!registrationTarget)
      return originalAddEventListener.apply(this, args)

    const registrationStack = new Error().stack ?? ''
    // console.info('[FRAGMINT_KEYBOARD_LISTENER_REG]', {
    //   target: registrationTarget,
    //   type,
    //   options,
    //   stack: registrationStack
    // })
    if (!registrationStack.includes('FragmintWeb.framework.js'))
      return originalAddEventListener.apply(this, args)

    const capture = getCaptureFlag(options as boolean | AddEventListenerOptions | undefined)
    const existing = getWrappedKeyboardListener(
      this,
      type as KeyboardListenerType,
      listener as object,
      capture
    )
    if (existing)
      return originalAddEventListener.call(this, type, existing, options)

    const wrapped: EventListenerOrEventListenerObject = typeof listener === 'function'
      ? function (this: EventTarget, event: Event): unknown {
          const keyboardEvent = event as KeyboardEvent
          if (keyboardEvent.code === 'Space' || keyboardEvent.code === 'KeyF') {
            // console.info('[FRAGMINT_UNITY_KEYBOARD_CALLBACK]', {
            //   target: registrationTarget,
            //   browserEventType: keyboardEvent.type,
            //   browserKey: keyboardEvent.key,
            //   browserCharCode: keyboardEvent.charCode ?? null,
            //   browserKeyCodePoint: keyboardEvent.key.length > 0 ? keyboardEvent.key.codePointAt(0) : null,
            //   browserCode: keyboardEvent.code,
            //   browserKeyCode: keyboardEvent.keyCode ?? null,
            //   browserWhich: keyboardEvent.which ?? null,
            //   browserDefaultPrevented: keyboardEvent.defaultPrevented,
            //   cancelBubble: keyboardEvent.cancelBubble,
            //   activeElement: document.activeElement
            // })
          }
          return listener.call(this, event)
        }
      : {
          handleEvent(event: Event): unknown {
            const keyboardEvent = event as KeyboardEvent
            if (keyboardEvent.code === 'Space' || keyboardEvent.code === 'KeyF') {
              // console.info('[FRAGMINT_UNITY_KEYBOARD_CALLBACK]', {
              //   target: registrationTarget,
              //   browserEventType: keyboardEvent.type,
              //   browserKey: keyboardEvent.key,
              //   browserCharCode: keyboardEvent.charCode ?? null,
              //   browserKeyCodePoint: keyboardEvent.key.length > 0 ? keyboardEvent.key.codePointAt(0) : null,
              //   browserCode: keyboardEvent.code,
              //   browserKeyCode: keyboardEvent.keyCode ?? null,
              //   browserWhich: keyboardEvent.which ?? null,
              //   browserDefaultPrevented: keyboardEvent.defaultPrevented,
              //   cancelBubble: keyboardEvent.cancelBubble,
              //   activeElement: document.activeElement
              // })
            }
            return listener.handleEvent.call(listener, event)
          }
        }

    setWrappedKeyboardListener(this, type as KeyboardListenerType, listener as object, capture, wrapped)
    wrappedKeyboardListenerEntries.push({
      target: this,
      type: type as KeyboardListenerType,
      capture,
      wrapped
    })
    installKeyboardProbeRemovePatch()
    return originalAddEventListener.call(this, type, wrapped, options)
  }

  let initSucceeded = false
  try {
    unity = (await createUnityInstance(
      canvasRef.value,
      {
        dataUrl: manifest.dataUrl,
        frameworkUrl: manifest.frameworkUrl,
        codeUrl: manifest.codeUrl,
        streamingAssetsUrl: manifest.streamingAssetsUrl || 'StreamingAssets',
        companyName: manifest.companyName || 'Fragmint',
        productName: manifest.productName || 'Fragmint',
        productVersion: manifest.productVersion || 'dev',
        matchWebGLToCanvasSize: manifest.matchWebGLToCanvasSize !== false
      },
      (v: number) => {
        if (!active) return
        progress.value = Math.max(0, Math.min(100, Math.round(v * 100)))
      }
    )) as UnityInstance
    initSucceeded = true
  } finally {
    EventTarget.prototype.addEventListener = originalAddEventListener
    if (!initSucceeded) {
      clearKeyboardProbeWrappedListeners()
      uninstallKeyboardProbeRemovePatch()
    }
  }

  if (!active) {
    const current = unity
    unity = null
    if (current?.Quit) await current.Quit().catch(() => {})
    return
  }

  ready.value = true
  progress.value = 100
  injectBridgePayloads()
}

function injectBridgePayloads() {
  if (!unity) return
  if (!bridgeConfig.value) throw new Error('[fragmint-plugin] bridge config not resolved')

  const startupEnv = buildStartupApplicationEnvPayload(bridgeConfig.value)
  if (startupEnv) {
    const payload = JSON.stringify(startupEnv)
    if (payload !== lastRegistrationPayload.value) {
      const sentRegistration = sendBridgeMessage(unity, 'UpsertAndSelectServerRegistration', payload)
      if (sentRegistration) {
        lastRegistrationPayload.value = payload
        activeStorageProviderID.value = 'fragmint'
        emitStorageWorkspaceEvent({ providerId: 'fragmint', kind: 'changed' })
      }
      console.info('[Fragmint server registration]', {
        sentRegistration,
        activeStorageProviderId: activeStorageProviderID.value
      })

    }
    const graphPath = typeof startupEnv.graph_path === 'string' ? startupEnv.graph_path.trim() : ''
    if (graphPath) {
      const graphPayload = JSON.stringify({ graph_path: graphPath })
      if (graphPayload !== lastGraphPayload.value) {
        if (sendBridgeMessage(unity, 'ConfigureSingleGraphViewer', graphPayload))
          lastGraphPayload.value = graphPayload
      }
    }
  }
}

function focusUnityCanvas(): void {
  canvasRef.value?.focus()
}

function logSpaceEvent(source: string, event: Event): void {
  let codePoint: number | null = null
  let key: string | null = null
  let charCode: number | null = null
  let keyCode: number | null = null
  let which: number | null = null

  if (event instanceof KeyboardEvent) {
    key = event.key
    const lower = key.toLowerCase()
    codePoint = key.length > 0 ? key.codePointAt(0) ?? null : null
    charCode = event.charCode ?? null
    keyCode = event.keyCode ?? null
    which = event.which ?? null
    if (event.code !== 'Space' && event.code !== 'KeyF') return
  } else if (event instanceof InputEvent) {
    key = event.data ?? null
    const lower = (key ?? '').toLowerCase()
    codePoint = key && key.length > 0 ? key.codePointAt(0) ?? null : null
    const lowerCodePoint = lower.length > 0 ? lower.codePointAt(0) ?? null : null
    if (codePoint !== 32 && lowerCodePoint !== 102) return
  } else {
    return
  }

  // console.info('[FRAGMINT_SPACE_EVENT]', {
  //   source,
  //   type: event.type,
  //   phase: event.eventPhase,
  //   target: event.target,
  //   key,
  //   codePoint,
  //   charCode,
  //   keyCode,
  //   which,
  //   inputType: event instanceof InputEvent ? event.inputType : null,
  //   activeElement: document.activeElement,
  //   defaultPrevented: event.defaultPrevented,
  //   cancelBubble: event.cancelBubble,
  //   repeat: event.repeat
  // })
}

function onWindowSpace(event: KeyboardEvent): void {
  logSpaceEvent('window-capture', event)
}

function onWindowBeforeInput(event: InputEvent): void {
  logSpaceEvent('window-beforeinput-capture', event)
}

function logSpaceOnCanvas(event: KeyboardEvent): void {
  logSpaceEvent('unity-canvas', event)
}

function logBeforeInputOnCanvas(event: InputEvent): void {
  logSpaceEvent('unity-canvas-beforeinput', event)
}

onMounted(() => {
  active = true
  window.addEventListener('keydown', onWindowSpace, true)
  window.addEventListener('keypress', onWindowSpace, true)
  window.addEventListener('keyup', onWindowSpace, true)
  window.addEventListener('beforeinput', onWindowBeforeInput, true)
  void start().catch((e: unknown) => {
    if (!active) return
    const err = e instanceof Error ? e : new Error(String(e))
    const stackText = typeof err.stack === 'string' && err.stack.length > 0 ? err.stack : err.message
    console.error('[fragmint-plugin][start_failed]', {
      message: err.message,
      stack: err.stack ?? null,
      error: err
    })
    error.value = stackText
  })
})

onUnmounted(() => {
  active = false
  const current = unity
  unity = null
  window.removeEventListener('keydown', onWindowSpace, true)
  window.removeEventListener('keypress', onWindowSpace, true)
  window.removeEventListener('keyup', onWindowSpace, true)
  window.removeEventListener('beforeinput', onWindowBeforeInput, true)
  const cleanupKeyboardProbe = () => {
    clearKeyboardProbeWrappedListeners()
    uninstallKeyboardProbeRemovePatch()
  }
  if (current?.Quit) void current.Quit().catch(() => {}).finally(cleanupKeyboardProbe)
  else cleanupKeyboardProbe()
})
</script>

<template>
  <div class="relative h-full min-h-0 w-full overflow-hidden bg-black">
    <canvas
      :id="canvasId"
      ref="canvasRef"
      tabindex="0"
      data-fragmint-unity-canvas="1"
      class="relative z-0 h-full w-full"
      @pointerdown="focusUnityCanvas"
      @keydown="logSpaceOnCanvas"
      @keypress="logSpaceOnCanvas"
      @keyup="logSpaceOnCanvas"
      @beforeinput="logBeforeInputOnCanvas"
    />
    <FragmintCanvasKitOverlay
      v-if="props.enableCanvasKitOverlay"
      :input-canvas-ref="canvasRef"
    />
    <div
      v-if="!ready && !error"
      class="absolute inset-0 flex items-center justify-center text-xs text-white/90"
    >
      Loading Unity {{ progress }}%
    </div>
    <div
      v-if="error"
      class="absolute inset-0 flex items-center justify-center p-4 text-xs text-red-200 whitespace-pre-wrap text-left overflow-auto"
    >
      {{ error }}
    </div>
  </div>
</template>

<style scoped>
/* Keep Unity keyboard focus without the browser's visible focus ring. */
canvas[data-fragmint-unity-canvas='1']:focus,
canvas[data-fragmint-unity-canvas='1']:focus-visible {
  outline: none;
}
</style>
