<script setup lang="ts">
import { ref, toRef } from 'vue'
import { useCanvas, useCanvasInput } from '@open-pencil/vue'

import { useEditorStore } from '@/app/editor/active-store'

const props = defineProps<{
  inputCanvasRef: HTMLCanvasElement | null
}>()

const inputCanvasRef = toRef(props, 'inputCanvasRef')
const store = useEditorStore()
const overlayCanvasRef = ref<HTMLCanvasElement | null>(null)

const { hitTestSectionTitle, hitTestComponentLabel, hitTestFrameTitle } = useCanvas(
  overlayCanvasRef,
  store,
  {
  layer: 'overlays',
  showRulers: true
}
)

useCanvasInput(
  inputCanvasRef,
  store,
  hitTestSectionTitle,
  hitTestComponentLabel,
  hitTestFrameTitle,
  undefined,
  undefined,
  undefined,
  false
)
</script>

<template>
  <div
    class="pointer-events-none absolute inset-0 z-10 bg-transparent"
    data-test-id="fragmint-canvas-kit-overlay-root"
    aria-hidden="true"
  >
    <canvas
      ref="overlayCanvasRef"
      data-test-id="fragmint-canvas-kit-overlay-canvas"
      class="pointer-events-none absolute inset-0 block size-full bg-transparent"
      aria-hidden="true"
      tabindex="-1"
    />
  </div>
</template>
